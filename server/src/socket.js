import jwt from "jsonwebtoken";
import prisma from "./db.js";

// ----- In-memory live auction state -----
// This is intentionally kept server-side and authoritative: the browser never
// decides the bid amount, the timer, or who's winning. It only sends "I bid X".
//
// NOTE: if you outgrow a single free-tier server instance, move this object into
// the database (there's a spot for it) or Redis. For one live auction room at a
// time, in-memory is simple and fine.
let state = {
  seasonId: null,
  playerId: null,
  player: null,
  currentBid: 0,
  leadingTeamId: null,
  leadingTeamName: null,
  bidStep: 100000, // minimum increase per bid; tune per league
  bidHistory: [],
  timerEndsAt: null, // epoch ms
  status: "idle", // idle | live | sold | unsold
};

const TIMER_SECONDS = 90;
const ANTI_SNIPE_WINDOW_SECONDS = 10; // extend the timer when a bid lands near expiry

let timerHandle = null;
let ioRef = null;
let bidInProgress = false;
let startInProgress = false;
let finalizationInProgress = false;
let resetInProgress = false;

class AuctionActionError extends Error {}

export function initSocket(io) {
  ioRef = io;

  io.use((socket, next) => {
    // Auth is optional for viewers (read-only), required for admin/team actions
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        socket.user = jwt.verify(token, process.env.JWT_SECRET);
      } catch {
        socket.user = null;
      }
    }
    next();
  });

  io.on("connection", (socket) => {
    socket.emit("auction:update", state);

    socket.on("admin:startPlayer", (payload) =>
      runSocketAction(socket, async () => {
        if (!isAdmin(socket)) throw new AuctionActionError("Admin only");
        await startPlayer(payload?.playerId, payload?.seasonId);
      })
    );

    socket.on("bid:place", (payload) =>
      runSocketAction(socket, () => handleBid(socket, payload?.amount))
    );

    socket.on("admin:markSold", () =>
      runSocketAction(socket, async () => {
        if (!isAdmin(socket)) throw new AuctionActionError("Admin only");
        await finalizePlayer("SOLD");
      })
    );

    socket.on("admin:markUnsold", () =>
      runSocketAction(socket, async () => {
        if (!isAdmin(socket)) throw new AuctionActionError("Admin only");
        await finalizePlayer("UNSOLD");
      })
    );

    socket.on("admin:resetSeason", (payload) =>
      runSocketAction(socket, async () => {
        if (!isAdmin(socket)) throw new AuctionActionError("Admin only");
        const resetCount = await resetSeason(payload?.seasonId);
        socket.emit("auction:resetComplete", { seasonId: payload.seasonId, resetCount });
      })
    );
  });
}

async function runSocketAction(socket, action) {
  try {
    await action();
  } catch (error) {
    reportActionError(socket, error);
  }
}

function reportActionError(target, error) {
  if (error instanceof AuctionActionError) {
    target.emit("auction:error", error.message);
  } else {
    console.error("Auction action failed:", error);
    target.emit("auction:error", "Auction action failed. Check server logs and try again.");
  }
}

function isAdmin(socket) {
  return socket.user?.role === "ADMIN";
}

async function startPlayer(playerId, seasonId) {
  if (resetInProgress) throw new AuctionActionError("A season reset is in progress. Please try again.");
  if (state.status === "live" || startInProgress) throw new AuctionActionError("Finish the current auction first");
  if (!playerId || !seasonId) throw new AuctionActionError("Player and season are required");

  startInProgress = true;
  try {
    const season = await prisma.season.findUnique({ where: { id: seasonId } });
    if (!season || !season.isActive) throw new AuctionActionError("Select an active season first");

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new AuctionActionError("Player not found");
    const seasonResult = await prisma.auctionResult.findUnique({
      where: { playerId_seasonId: { playerId, seasonId } },
    });
    if (!seasonResult) throw new AuctionActionError("This player is not registered for the selected season");
    if (seasonResult.status === "SOLD") throw new AuctionActionError("This player has already been sold this season");

    await prisma.$transaction([
      prisma.player.update({ where: { id: playerId }, data: { status: "IN_AUCTION" } }),
      prisma.auctionResult.update({
        where: { playerId_seasonId: { playerId, seasonId } },
        data: { status: "IN_AUCTION" },
      }),
    ]);

    state = {
      seasonId,
      playerId,
      player,
      currentBid: player.basePrice,
      leadingTeamId: null,
      leadingTeamName: null,
      bidStep: state.bidStep,
      bidHistory: [],
      timerEndsAt: Date.now() + TIMER_SECONDS * 1000,
      status: "live",
    };

    clearAuctionTimer();
    broadcast();
    armTimer();
  } finally {
    startInProgress = false;
  }
}

async function handleBid(socket, amount) {
  if (resetInProgress) throw new AuctionActionError("A season reset is in progress. Please try again.");
  if (state.status !== "live") throw new AuctionActionError("No live auction right now");
  if (finalizationInProgress) throw new AuctionActionError("Auction result is being saved. Please wait.");
  if (bidInProgress) throw new AuctionActionError("A bid is being processed. Please try again.");
  const teamId = socket.user?.teamId;
  if (socket.user?.role !== "TEAM" || !teamId) {
    throw new AuctionActionError("Only a logged-in team can bid");
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new AuctionActionError("Bid amount is invalid");

  const bidState = {
    playerId: state.playerId,
    seasonId: state.seasonId,
    currentBid: state.currentBid,
    timerEndsAt: state.timerEndsAt,
  };
  const minValid = bidState.currentBid + state.bidStep;
  if (amount < minValid) {
    throw new AuctionActionError(`Bid must be at least ${minValid}`);
  }

  bidInProgress = true;
  try {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.seasonId !== bidState.seasonId) {
      throw new AuctionActionError("Your team is not part of the active season");
    }
    if (team.purseLeft < amount) throw new AuctionActionError("Not enough purse left");
    if (
      state.status !== "live" ||
      finalizationInProgress ||
      state.playerId !== bidState.playerId ||
      state.currentBid !== bidState.currentBid
    ) {
      throw new AuctionActionError("Auction state changed. Please try your bid again.");
    }
    if (Date.now() >= bidState.timerEndsAt) {
      throw new AuctionActionError("Auction timer has expired");
    }

    state.currentBid = amount;
    state.leadingTeamId = team.id;
    state.leadingTeamName = team.name;
    state.bidHistory = [
      ...state.bidHistory,
      { id: `${Date.now()}-${socket.id}`, teamName: team.name, amount, createdAt: Date.now() },
    ].slice(-50);

    // Anti-snipe: if a bid lands near the end, give other teams time to respond.
    const msLeft = state.timerEndsAt - Date.now();
    if (msLeft < ANTI_SNIPE_WINDOW_SECONDS * 1000) {
      state.timerEndsAt = Date.now() + TIMER_SECONDS * 1000;
      armTimer();
    }

    broadcast();
    socket.emit("auction:bidAccepted", { amount });
  } finally {
    bidInProgress = false;
  }
}

function armTimer() {
  clearAuctionTimer();
  const msLeft = Math.max(0, state.timerEndsAt - Date.now());
  timerHandle = setTimeout(handleTimerExpiry, msLeft);
}

async function handleTimerExpiry() {
  if (state.status !== "live") return;
  if (bidInProgress) {
    timerHandle = setTimeout(handleTimerExpiry, 100);
    return;
  }
  const outcome = state.leadingTeamId ? "SOLD" : "UNSOLD";
  try {
    await finalizePlayer(outcome);
  } catch (error) {
    reportActionError(ioRef, error);
  }
}

function clearAuctionTimer() {
  if (timerHandle) clearTimeout(timerHandle);
  timerHandle = null;
}

async function finalizePlayer(outcome) {
  if (resetInProgress) throw new AuctionActionError("A season reset is in progress. Please try again.");
  if (state.status !== "live" || !state.playerId) {
    throw new AuctionActionError("There is no live auction to finalize");
  }
  if (finalizationInProgress) throw new AuctionActionError("Auction result is already being saved");
  finalizationInProgress = true;
  clearAuctionTimer();

  const { playerId, seasonId, currentBid, leadingTeamId } = state;

  try {
    if (outcome === "SOLD" && !leadingTeamId) {
      throw new AuctionActionError("Cannot mark a player sold before a team places a bid");
    }

    await prisma.$transaction(async (tx) => {
      await tx.auctionResult.upsert({
        where: { playerId_seasonId: { playerId, seasonId } },
        create: {
          playerId,
          seasonId,
          teamId: outcome === "SOLD" ? leadingTeamId : null,
          soldPrice: outcome === "SOLD" ? currentBid : null,
          status: outcome,
        },
        update: {
          teamId: outcome === "SOLD" ? leadingTeamId : null,
          soldPrice: outcome === "SOLD" ? currentBid : null,
          status: outcome,
        },
      });

      await tx.player.update({ where: { id: playerId }, data: { status: outcome } });

      if (outcome === "SOLD" && leadingTeamId) {
        const result = await tx.team.updateMany({
          where: { id: leadingTeamId, seasonId, purseLeft: { gte: currentBid } },
          data: { purseLeft: { decrement: currentBid } },
        });
        if (result.count !== 1) {
          throw new AuctionActionError("Team purse changed or is insufficient; auction was not saved");
        }
      }
    });

    state.status = outcome.toLowerCase();
    broadcast();
  } finally {
    finalizationInProgress = false;
  }
}

async function resetSeason(seasonId) {
  if (!seasonId) throw new AuctionActionError("Select a season to reset");
  if (state.status === "live" || startInProgress || bidInProgress || finalizationInProgress) {
    throw new AuctionActionError("Finish the live auction before resetting a season");
  }
  if (resetInProgress) throw new AuctionActionError("A season reset is already in progress");

  resetInProgress = true;
  try {
    const season = await prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) throw new AuctionActionError("Season not found");

    const resetCount = await prisma.$transaction(async (tx) => {
      const results = await tx.auctionResult.findMany({
        where: { seasonId, status: { in: ["SOLD", "UNSOLD"] } },
        select: { playerId: true },
      });
      const playerIds = results.map(({ playerId }) => playerId);

      await tx.auctionResult.updateMany({
        where: { seasonId, status: { in: ["SOLD", "UNSOLD"] } },
        data: { status: "UNSOLD_POOL", teamId: null, soldPrice: null },
      });
      if (playerIds.length > 0) {
        await tx.player.updateMany({
          where: { id: { in: playerIds } },
          data: { status: "UNSOLD_POOL" },
        });
      }

      const teams = await tx.team.findMany({
        where: { seasonId },
        select: { id: true, budget: true },
      });
      await Promise.all(teams.map((team) =>
        tx.team.update({ where: { id: team.id }, data: { purseLeft: team.budget } })
      ));

      return playerIds.length;
    });

    if (state.seasonId === seasonId && state.status !== "live") {
      clearAuctionTimer();
      state = {
        ...state,
        seasonId: null,
        playerId: null,
        player: null,
        currentBid: 0,
        leadingTeamId: null,
        leadingTeamName: null,
        bidHistory: [],
        timerEndsAt: null,
        status: "idle",
      };
      broadcast();
    }

    return resetCount;
  } finally {
    resetInProgress = false;
  }
}

function broadcast() {
  ioRef?.emit("auction:update", state);
}
