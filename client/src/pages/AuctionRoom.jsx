import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_URL } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function AuctionRoom() {
  const { user, token } = useAuth();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [bidAmount, setBidAmount] = useState("");
  const [bidPending, setBidPending] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(API_URL, {
      auth: { token },
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (connectError) => {
      setConnected(false);
      setError(`Auction connection failed: ${connectError.message}`);
    });
    socket.on("auction:update", (s) => setState(s));
    socket.on("auction:bidAccepted", () => {
      setBidPending(false);
      setError("");
    });
    socket.on("auction:error", (message) => {
      setBidPending(false);
      setError(message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  // Local countdown ticking, synced to the server's timerEndsAt
  useEffect(() => {
    if (!state?.timerEndsAt) return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.round((state.timerEndsAt - Date.now()) / 1000));
      setSecondsLeft(left);
    }, 250);
    return () => clearInterval(interval);
  }, [state?.timerEndsAt]);

  useEffect(() => {
    if (state?.status === "live") {
      setBidAmount(String(state.currentBid + state.bidStep));
    }
  }, [state?.currentBid, state?.bidStep, state?.status]);

  function placeBid(event) {
    event.preventDefault();
    if (!state || !socketRef.current?.connected) {
      setError("Auction server is not connected. Please retry when connected.");
      return;
    }
    const amount = Number(bidAmount);
    if (!Number.isSafeInteger(amount) || amount < state.currentBid + state.bidStep) {
      setError(`Enter a whole-number bid of at least ₹${(state.currentBid + state.bidStep).toLocaleString("en-IN")}.`);
      return;
    }
    setError("");
    setBidPending(true);
    socketRef.current.emit("bid:place", { amount });
  }

  if (!state) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center">
        {error && <p role="alert" className="bg-red-900/50 border border-red-700 text-red-200 rounded px-3 py-2 mb-4 text-sm">{error}</p>}
        <p className="text-slate-400">{connected ? "Loading auction state..." : "Connecting to auction..."}</p>
      </div>
    );
  }

  if (state.status === "idle" || !state.player) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center text-slate-400 mt-16">
        {error && <p role="alert" className="bg-red-900/50 border border-red-700 text-red-200 rounded px-3 py-2 mb-4 text-sm">{error}</p>}
        {!connected && <p role="alert" className="text-amber-400 mb-4">Auction server disconnected.</p>}
        <p className="text-lg">No player is currently up for auction.</p>
        {user?.role === "ADMIN" && (
          <p className="text-sm mt-2">Start one from the Admin panel.</p>
        )}
      </div>
    );
  }

  const canBid = user?.role === "TEAM" && state.status === "live";
  const playerStats = Object.entries(state.player.stats || {}).filter(([, value]) =>
    value !== null && value !== undefined && value !== "" &&
    (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
  );
  const playerInitials = state.player.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {error && (
        <div role="alert" className="bg-red-900/50 border border-red-700 text-red-200 rounded px-3 py-2 mb-4 text-sm">
          {error}
        </div>
      )}
      {!connected && <p role="alert" className="text-amber-400 mb-4">Auction server disconnected.</p>}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
        <div className="relative mx-auto mb-4 h-36 w-36 overflow-hidden rounded-full border-2 border-amber-500/60 bg-slate-800">
          <div
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center text-4xl font-bold text-amber-400"
          >
            {playerInitials}
          </div>
          {state.player.photoUrl && (
          <img
            src={state.player.photoUrl}
            alt={state.player.name}
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            className="absolute inset-0 h-full w-full object-cover"
          />
          )}
        </div>
        <h1 className="text-2xl font-bold">{state.player.name}</h1>
        <p className="text-slate-400">{state.player.role}</p>
        {(state.player.battingStyle || state.player.bowlingStyle) && (
          <p className="mt-1 text-sm text-slate-400">
            {[state.player.battingStyle, state.player.bowlingStyle].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="mb-5 mt-2 text-sm text-slate-500">
          Base price: ₹{state.player.basePrice.toLocaleString("en-IN")}
        </p>
        {playerStats.length > 0 && (
          <section aria-label="Player career statistics" className="mb-6 text-left">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Player stats</h2>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {playerStats.map(([key, value]) => (
                <div key={key} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                  <dt className="text-xs capitalize text-slate-500">{key.replace(/([A-Z])/g, " $1")}</dt>
                  <dd className="mt-1 font-semibold text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        <p className="text-4xl font-extrabold text-amber-400 mb-1">
          ₹{state.currentBid.toLocaleString("en-IN")}
        </p>
        <p className="text-slate-400 mb-4">
          {state.leadingTeamName ? `Leading: ${state.leadingTeamName}` : "No bids yet"}
        </p>

        {state.status === "live" && (
          <p className="text-lg font-mono mb-4">
            ⏱ {secondsLeft}s
          </p>
        )}
        {state.status === "sold" && <p className="text-emerald-400 font-bold text-lg mb-4">SOLD</p>}
        {state.status === "unsold" && <p className="text-red-400 font-bold text-lg mb-4">UNSOLD</p>}

        {canBid && (
          <form onSubmit={placeBid} className="mx-auto mt-6 max-w-sm text-left">
            <label htmlFor="bid-amount" className="block text-sm text-slate-300 mb-2">
              Your bid (minimum ₹{(state.currentBid + state.bidStep).toLocaleString("en-IN")})
            </label>
            <div className="flex gap-2">
              <input
                id="bid-amount"
                type="number"
                inputMode="numeric"
                min={state.currentBid + state.bidStep}
                step={state.bidStep}
                value={bidAmount}
                onChange={(event) => setBidAmount(event.target.value)}
                disabled={!connected || bidPending}
                required
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-3 text-white outline-none focus:border-amber-500 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!connected || bidPending}
                className="rounded-lg bg-amber-500 px-5 py-3 font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bidPending ? "Submitting..." : "Place bid"}
              </button>
            </div>
          </form>
        )}
        {!user && <p className="text-sm text-slate-500">Log in as a team to place bids.</p>}
        {user?.role === "VIEWER" && <p className="text-sm text-slate-500 mt-4">You can follow the live bids. A team account is required to bid.</p>}
      </div>

      <section
        aria-label="Live bid feed"
        className="flex min-h-72 flex-col rounded-xl border border-slate-800 bg-slate-900"
      >
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="font-semibold">Live bids</h2>
            <p className="text-xs text-slate-500">Shared with everyone in the auction</p>
          </div>
          <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-400">
            {state.bidHistory?.length || 0}
          </span>
        </header>
        <ol aria-live="polite" className="flex-1 space-y-2 overflow-y-auto p-4">
          {state.bidHistory?.length ? (
            [...state.bidHistory].reverse().map((bid) => (
              <li key={bid.id} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm text-slate-300">{bid.teamName}</span>
                  <time className="shrink-0 text-xs text-slate-500" dateTime={new Date(bid.createdAt).toISOString()}>
                    {new Date(bid.createdAt).toLocaleTimeString()}
                  </time>
                </div>
                <p className="mt-1 font-semibold text-amber-400">₹{bid.amount.toLocaleString("en-IN")}</p>
              </li>
            ))
          ) : (
            <li className="py-8 text-center text-sm text-slate-500">
              No bids yet. Accepted bids will appear here for all viewers.
            </li>
          )}
        </ol>
      </section>
      </div>
    </div>
  );
}
