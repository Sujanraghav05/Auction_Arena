import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api.js";

export default function Dashboard() {
  const [players, setPlayers] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api.get("/api/teams/seasons"),
      api.get(`/api/players${seasonId ? `?seasonId=${seasonId}` : ""}`),
    ])
      .then(([seasonResponse, playerResponse]) => {
        if (active) {
          if (!Array.isArray(seasonResponse.data) || !Array.isArray(playerResponse.data)) {
            throw new Error("Unexpected response from the backend. Check Cloudflare's VITE_API_URL and redeploy the site.");
          }
          setSeasons(seasonResponse.data);
          setPlayers(playerResponse.data);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.response?.data?.error || requestError.message || "Could not load players");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [seasonId]);

  const visible = players.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase())
  );
  const selectedSeason = seasons.find((season) => season.id === seasonId);

  const statusColor = {
    SOLD: "bg-emerald-600",
    UNSOLD: "bg-red-600",
    IN_AUCTION: "bg-amber-500 text-slate-950",
    UNSOLD_POOL: "bg-slate-700",
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-7">
      <section className="relative isolate overflow-hidden rounded-3xl border border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950 p-7 shadow-2xl sm:p-10">
        <div aria-hidden="true" className="absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
        <div aria-hidden="true" className="absolute bottom-[-8rem] right-1/3 -z-10 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_15rem] md:items-end">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-amber-400">
              The season starts here
            </p>
            <h1 className="max-w-2xl text-4xl font-black leading-tight tracking-tight sm:text-5xl">
              Every bid has a story.
              <span className="block text-amber-400">Make yours count.</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              Meet the players, explore their records, and follow every move in a live auction built for your league.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/auction"
                className="rounded-lg bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
              >
                Enter live auction
              </Link>
              <a
                href="#player-pool"
                className="rounded-lg border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-amber-400/70 hover:text-amber-300"
              >
                Explore players
              </a>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-5 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wider text-slate-400">
              {selectedSeason ? "Selected season" : "All seasons"}
            </p>
            <p className="mt-2 text-xl font-bold text-white">
              {selectedSeason?.name || "Player collection"}
            </p>
            <div className="mt-5 flex items-end justify-between border-t border-white/10 pt-4">
              <div>
                <p className="text-3xl font-black text-amber-400">{players.length}</p>
                <p className="text-xs text-slate-400">players in view</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-white">{seasons.length}</p>
                <p className="text-xs text-slate-400">seasons</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="player-pool">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-2xl font-bold">Player Pool</h2>
        <select
          aria-label="Filter players by season"
          value={seasonId}
          onChange={(event) => setSeasonId(event.target.value)}
          className="bg-slate-800 rounded px-3 py-2 text-sm outline-none"
        >
          <option value="">All seasons</option>
          {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
        </select>
        <input
          placeholder="Search players..."
          className="bg-slate-800 rounded px-3 py-2 text-sm outline-none"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {loading && <p className="text-slate-400">Loading players...</p>}
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {!loading && !error && visible.map((p) => (
          <Link
            key={p.id}
            to={`/players/${p.id}`}
            className="bg-slate-900 border border-slate-800 rounded-lg p-4 hover:border-amber-500 transition"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-sm text-slate-400">{p.role}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${statusColor[p.status] || "bg-slate-700"}`}>
                {p.status.replace("_", " ")}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-2">
              Base price: ₹{p.basePrice.toLocaleString("en-IN")}
            </p>
          </Link>
        ))}
        {!loading && !error && visible.length === 0 && (
          <p className="text-slate-500">
            {players.length === 0
              ? "No players have been added yet. An admin can add players from the Admin panel."
              : "No players match your search."}
          </p>
        )}
      </div>
      </section>
    </div>
  );
}
