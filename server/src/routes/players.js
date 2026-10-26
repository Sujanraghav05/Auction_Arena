import { Router } from "express";
import prisma from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// Public: list all players (optionally filter by status/season)
router.get("/", async (req, res) => {
  const { status, seasonId } = req.query;
  const resultFilter = {
    ...(seasonId ? { seasonId } : {}),
    ...(status ? { status } : {}),
  };
  const players = await prisma.player.findMany({
    where: seasonId || status ? { results: { some: resultFilter } } : undefined,
    include: seasonId || status ? { results: { where: resultFilter, select: { status: true } } } : undefined,
    orderBy: { name: "asc" },
  });
  res.json(players.map(({ results, ...player }) => ({
    ...player,
    // When filtering by a season, its auction status is the relevant status.
    status: results?.[0]?.status ?? player.status,
  })));
});

// Public: single player profile + full auction-rate history across seasons
router.get("/:id", async (req, res) => {
  const player = await prisma.player.findUnique({
    where: { id: req.params.id },
    include: {
      results: {
        include: { season: true, team: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!player) return res.status(404).json({ error: "Player not found" });
  res.json(player);
});

// Admin: create player
router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { name, role, battingStyle, bowlingStyle, photoUrl, basePrice, stats, seasonId } = req.body;
  if (!name || !role || !seasonId) return res.status(400).json({ error: "name, role, and season are required" });
  if (basePrice !== undefined && (!Number.isSafeInteger(basePrice) || basePrice <= 0)) {
    return res.status(400).json({ error: "Base price must be a positive whole number" });
  }
  if (photoUrl && !/^data:image\/(?:png|jpe?g|webp|gif);base64,|^https?:\/\//i.test(photoUrl)) {
    return res.status(400).json({ error: "Photo must be an image upload or an HTTP(S) URL" });
  }
  if (photoUrl?.length > 4_500_000) return res.status(400).json({ error: "Photo is too large. Choose an image under 3 MB." });

  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season) return res.status(404).json({ error: "Season not found" });

  const player = await prisma.$transaction(async (tx) => {
    const createdPlayer = await tx.player.create({
      data: { name, role, battingStyle, bowlingStyle, photoUrl, basePrice: basePrice ?? 200000, stats },
    });
    await tx.auctionResult.create({
      data: { playerId: createdPlayer.id, seasonId, status: "UNSOLD_POOL" },
    });
    return createdPlayer;
  });
  res.status(201).json(player);
});

// Admin: update player
router.put("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const player = await prisma.player.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json(player);
});

// Admin: delete player
router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  await prisma.player.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
