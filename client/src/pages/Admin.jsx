import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import api, { API_URL } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Admin() {
  const { token } = useAuth();
  const [seasons, setSeasons] = useState([]);
  const [players, setPlayers] = useState([]);
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [userRoles, setUserRoles] = useState({});
  const [teamBudgets, setTeamBudgets] = useState({});
  const [activeSeason, setActiveSeason] = useState(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [newPlayer, setNewPlayer] = useState({
    name: "",
    role: "Batsman",
    battingStyle: "",
    bowlingStyle: "",
    basePrice: 200000,
    photoUrl: "",
    stats: { matches: "", runs: "", wickets: "", battingAverage: "" },
  });
  const [newSeasonName, setNewSeasonName] = useState("");
  const [newTeam, setNewTeam] = useState({ name: "", shortName: "", budget: "10000000" });
  const [activatingSeasonId, setActivatingSeasonId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const previousAuction = useRef(null);

  useEffect(() => {
    const s = io(API_URL, { auth: { token } });
    setSocket(s);
    s.on("connect", () => setSocketConnected(true));
    s.on("disconnect", () => setSocketConnected(false));
    s.on("connect_error", (connectError) => {
      setSocketConnected(false);
      setError(`Auction connection failed: ${connectError.message}`);
    });
    s.on("auction:error", setError);
    s.on("auction:update", (auction) => {
      const previous = previousAuction.current;
      if (previous && previous.status !== "live" && auction.status === "live") {
        setNotice(`Auction started: ${auction.player.name}`);
      }
      if (previous?.status === "live" && (auction.status === "sold" || auction.status === "unsold")) {
        setNotice(`${auction.player?.name || "Player"} marked ${auction.status.toUpperCase()}.`);
      }
      previousAuction.current = auction;
    });
    return () => {
      s.disconnect();
    };
  }, [token]);

  async function refresh(preferredSeasonId) {
    try {
      const seasonResponse = await api.get("/api/teams/seasons");
      const currentActiveSeason = seasonResponse.data.find((season) => season.isActive) || null;
      const selectedSeason = seasonResponse.data.find((season) =>
        season.id === (preferredSeasonId || selectedSeasonId)
      ) || currentActiveSeason || seasonResponse.data[0] || null;
      const [playerResponse, userResponse, teamResponse] = await Promise.all([
        selectedSeason ? api.get(`/api/players?seasonId=${selectedSeason.id}`) : Promise.resolve({ data: [] }),
        api.get("/api/users"),
        selectedSeason ? api.get(`/api/teams?seasonId=${selectedSeason.id}`) : Promise.resolve({ data: [] }),
      ]);
      setSeasons(seasonResponse.data);
      setActiveSeason(currentActiveSeason);
      setSelectedSeasonId(selectedSeason?.id || "");
      setPlayers(playerResponse.data);
      setUsers(userResponse.data);
      setTeams(teamResponse.data);
      setTeamBudgets(Object.fromEntries(teamResponse.data.map((team) => [
        team.id,
        String(team.budget),
      ])));
      setUserRoles(Object.fromEntries(userResponse.data.map((user) => [
        user.id,
        {
          role: user.role,
          teamId: user.team?.seasonId === selectedSeason?.id ? user.teamId || "" : "",
        },
      ])));
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "Could not load auction data");
    }
  }

  useEffect(() => {
    refresh();
  }, [selectedSeasonId]);

  async function createSeason(e) {
    e.preventDefault();
    setError("");
    try {
      const response = await api.post("/api/teams/seasons", { name: newSeasonName });
      setNewSeasonName("");
      setNotice("Season created.");
      await refresh(response.data.id);
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "Could not create season");
    }
  }

  async function activateSeason(id) {
    if (activatingSeasonId) return;
    setError("");
    setNotice("");
    setActivatingSeasonId(id);
    try {
      await api.post(`/api/teams/seasons/${id}/activate`);
      setNotice("Season activated.");
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "Could not activate season");
    } finally {
      setActivatingSeasonId(null);
    }
  }

  async function createPlayer(e) {
    e.preventDefault();
    setError("");
    try {
      if (!selectedSeasonId) {
        setError("Create a season before adding a player.");
        return;
      }
      const stats = Object.fromEntries(
        Object.entries(newPlayer.stats)
          .filter(([, value]) => value !== "")
          .map(([key, value]) => [key, Number(value)])
      );
      await api.post("/api/players", {
        ...newPlayer,
        stats: Object.keys(stats).length ? stats : undefined,
        seasonId: selectedSeasonId,
      });
      setNewPlayer({
        name: "",
        role: "Batsman",
        battingStyle: "",
        bowlingStyle: "",
        basePrice: 200000,
        photoUrl: "",
        stats: { matches: "", runs: "", wickets: "", battingAverage: "" },
      });
      setNotice("Player added.");
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "Could not add player");
    }
  }

  function selectPlayerPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file for the player photo.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("Player photos must be smaller than 3 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setNewPlayer((current) => ({ ...current, photoUrl: reader.result }));
    reader.readAsDataURL(file);
  }

  function updateUserRole(userId, field, value) {
    setUserRoles((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        [field]: value,
        ...(field === "role" && value !== "TEAM" ? { teamId: "" } : {}),
      },
    }));
  }

  async function saveUserRole(userId) {
    const assignment = userRoles[userId];
    setError("");
    try {
      await api.patch(`/api/users/${userId}/role`, {
        role: assignment.role,
        teamId: assignment.role === "TEAM" ? assignment.teamId : null,
      });
      setNotice("User role updated.");
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "Could not update user role");
    }
  }

  async function createTeam(event) {
    event.preventDefault();
    if (!selectedSeasonId) {
      setError("Create a season before adding a team.");
      return;
    }
    setError("");
    try {
      await api.post("/api/teams", {
        ...newTeam,
        budget: Number(newTeam.budget),
        seasonId: selectedSeasonId,
      });
      setNewTeam({ name: "", shortName: "", budget: "10000000" });
      setNotice("Team created.");
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "Could not create team");
    }
  }

  async function saveTeamBudget(teamId) {
    setError("");
    try {
      await api.put(`/api/teams/${teamId}`, { budget: Number(teamBudgets[teamId]) });
      setNotice("Team budget updated.");
      await refresh();
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "Could not update team budget");
    }
  }

  function startAuction(playerId) {
    if (!activeSeason || selectedSeasonId !== activeSeason.id) {
      setError("Select the active season before starting an auction.");
      return;
    }
    if (!socket?.connected) {
      setError("Auction server is not connected. Please retry when connected.");
      return;
    }
    setError("");
    setNotice("");
    socket.emit("admin:startPlayer", { playerId, seasonId: activeSeason.id });
  }

  function finalizeAuction(outcome) {
    if (!socket?.connected) {
      setError("Auction server is not connected. Please retry when connected.");
      return;
    }
    setError("");
    setNotice("");
    socket.emit(outcome === "SOLD" ? "admin:markSold" : "admin:markUnsold");
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-10">
      <h1 className="text-2xl font-bold">Admin Panel</h1>
      <p className={`text-sm ${socketConnected ? "text-emerald-400" : "text-amber-400"}`}>
        Auction server: {socketConnected ? "connected" : "connecting"}
      </p>
      {error && <p role="alert" className="bg-red-900/50 border border-red-700 text-red-200 rounded px-3 py-2 text-sm">{error}</p>}
      {notice && <p role="status" className="bg-emerald-900/40 border border-emerald-700 text-emerald-200 rounded px-3 py-2 text-sm">{notice}</p>}

      <label className="block text-sm text-slate-300">
        Manage season
        <select
          aria-label="Manage season"
          value={selectedSeasonId}
          onChange={(event) => setSelectedSeasonId(event.target.value)}
          className="ml-3 rounded bg-slate-800 px-3 py-2 outline-none"
        >
          {!seasons.length && <option value="">No seasons yet</option>}
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}{season.isActive ? " (active)" : ""}
            </option>
          ))}
        </select>
      </label>

      <section>
        <h2 className="text-lg font-semibold mb-2">Users and Teams</h2>
        <p className="text-sm text-slate-400 mb-4">
          Assign registered users as admins or team bidders. Team accounts need a team in the selected season.
        </p>

        <form onSubmit={createTeam} className="grid gap-2 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:grid-cols-[minmax(0,1fr)_10rem_minmax(10rem,0.7fr)_auto]">
          <input
            aria-label="Team name"
            placeholder="Team name"
            className="bg-slate-800 rounded px-3 py-2 outline-none"
            value={newTeam.name}
            onChange={(event) => setNewTeam({ ...newTeam, name: event.target.value })}
            required
          />
          <input
            aria-label="Team short name"
            placeholder="Short name"
            className="bg-slate-800 rounded px-3 py-2 outline-none"
            value={newTeam.shortName}
            onChange={(event) => setNewTeam({ ...newTeam, shortName: event.target.value })}
            required
          />
          <input
            aria-label="Starting team budget in rupees"
            type="number"
            min="1"
            step="1"
            placeholder="Starting budget (₹)"
            className="bg-slate-800 rounded px-3 py-2 outline-none"
            value={newTeam.budget}
            onChange={(event) => setNewTeam({ ...newTeam, budget: event.target.value })}
            required
          />
          <button
            disabled={!selectedSeasonId}
            className="rounded bg-slate-700 px-4 py-2 font-medium hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add team
          </button>
          <p className="text-xs text-slate-500 sm:col-span-4">
            {selectedSeasonId ? `New team will join ${seasons.find((season) => season.id === selectedSeasonId)?.name}.` : "Create a season before creating teams."}
          </p>
        </form>

        {teams.length > 0 && (
          <div className="mt-4 space-y-2">
            {teams.map((team) => (
              <div key={team.id} className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] sm:items-center">
                <span className="font-medium">{team.name}</span>
                <span className="text-sm text-slate-400">
                  Remaining: ₹{team.purseLeft.toLocaleString("en-IN")}
                </span>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  Budget ₹
                  <input
                    aria-label={`Budget for ${team.name}`}
                    type="number"
                    min="1"
                    step="1"
                    value={teamBudgets[team.id] ?? ""}
                    onChange={(event) => setTeamBudgets((current) => ({
                      ...current,
                      [team.id]: event.target.value,
                    }))}
                    className="min-w-0 w-full rounded bg-slate-800 px-2 py-1 text-sm text-white"
                  />
                </label>
                <button
                  onClick={() => saveTeamBudget(team.id)}
                  disabled={Number(teamBudgets[team.id]) === team.budget}
                  className="rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save budget
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {users.map((account) => {
            const assignment = userRoles[account.id] || { role: account.role, teamId: account.teamId || "" };
            const dirty = assignment.role !== account.role || (assignment.role === "TEAM" && assignment.teamId !== (account.teamId || ""));
            const availableTeams = teams;
            return (
              <div key={account.id} className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(10rem,0.8fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium">{account.name}</p>
                  <p className="truncate text-sm text-slate-400">{account.email}</p>
                </div>
                <label className="sr-only" htmlFor={`role-${account.id}`}>Role for {account.name}</label>
                <select
                  id={`role-${account.id}`}
                  value={assignment.role}
                  onChange={(event) => updateUserRole(account.id, "role", event.target.value)}
                  className="rounded bg-slate-800 px-3 py-2 outline-none"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="TEAM">Team</option>
                  <option value="ADMIN">Admin</option>
                </select>
                {assignment.role === "TEAM" ? (
                  <>
                    <label className="sr-only" htmlFor={`team-${account.id}`}>Team for {account.name}</label>
                    <select
                      id={`team-${account.id}`}
                      value={assignment.teamId}
                      onChange={(event) => updateUserRole(account.id, "teamId", event.target.value)}
                      className="rounded bg-slate-800 px-3 py-2 outline-none"
                    >
                      <option value="">Select team</option>
                      {availableTeams.map((team) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span className="text-sm text-slate-500">{account.team?.name || "No team assigned"}</span>
                )}
                <button
                  onClick={() => saveUserRole(account.id)}
                  disabled={!dirty || (assignment.role === "TEAM" && !assignment.teamId)}
                  className="rounded bg-amber-500 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            );
          })}
          {users.length === 0 && <p className="text-sm text-slate-500">No registered users found.</p>}
        </div>
      </section>

      {/* Seasons */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Seasons</h2>
        <form onSubmit={createSeason} className="flex gap-2 mb-3">
          <input
            placeholder="e.g. Season 2 - 2027"
            className="bg-slate-800 rounded px-3 py-2 flex-1 outline-none"
            value={newSeasonName}
            onChange={(e) => setNewSeasonName(e.target.value)}
          />
          <button className="bg-amber-500 text-slate-950 font-medium rounded px-4">Create</button>
        </form>
        <div className="space-y-2">
          {seasons.map((s) => (
            <div key={s.id} className="flex justify-between items-center bg-slate-900 border border-slate-800 rounded px-4 py-2">
              <span>{s.name} {s.isActive && <span className="text-amber-400">(active)</span>}</span>
              <button
                onClick={() => setSelectedSeasonId(s.id)}
                className="ml-auto mr-4 text-sm underline text-slate-400"
              >
                Manage
              </button>
              {!s.isActive && (
                <button
                  onClick={() => activateSeason(s.id)}
                  disabled={Boolean(activatingSeasonId)}
                  className="text-sm underline text-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {activatingSeasonId === s.id ? "Activating..." : "Make active"}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Players */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Players</h2>
        <form onSubmit={createPlayer} className="grid grid-cols-3 gap-2 mb-3">
          <input
            placeholder="Name"
            className="bg-slate-800 rounded px-3 py-2 outline-none"
            value={newPlayer.name}
            required
            onChange={(e) => setNewPlayer({ ...newPlayer, name: e.target.value })}
          />
          <select
            className="bg-slate-800 rounded px-3 py-2 outline-none"
            value={newPlayer.role}
            onChange={(e) => setNewPlayer({ ...newPlayer, role: e.target.value })}
          >
            <option>Batsman</option>
            <option>Bowler</option>
            <option>All-rounder</option>
            <option>Wicketkeeper</option>
          </select>
          <input
            aria-label="Batting style"
            placeholder="Batting style"
            className="bg-slate-800 rounded px-3 py-2 outline-none"
            value={newPlayer.battingStyle}
            onChange={(e) => setNewPlayer({ ...newPlayer, battingStyle: e.target.value })}
          />
          <input
            aria-label="Bowling style"
            placeholder="Bowling style"
            className="bg-slate-800 rounded px-3 py-2 outline-none"
            value={newPlayer.bowlingStyle}
            onChange={(e) => setNewPlayer({ ...newPlayer, bowlingStyle: e.target.value })}
          />
          <input
            type="number"
            placeholder="Base price"
            min="1"
            required
            className="bg-slate-800 rounded px-3 py-2 outline-none"
            value={newPlayer.basePrice}
            onChange={(e) => setNewPlayer({ ...newPlayer, basePrice: Number(e.target.value) })}
          />
          <input
            aria-label="Career matches"
            type="number"
            min="0"
            placeholder="Matches"
            className="bg-slate-800 rounded px-3 py-2 outline-none"
            value={newPlayer.stats.matches}
            onChange={(e) => setNewPlayer({
              ...newPlayer,
              stats: { ...newPlayer.stats, matches: e.target.value },
            })}
          />
          <input
            aria-label="Career runs"
            type="number"
            min="0"
            placeholder="Runs"
            className="bg-slate-800 rounded px-3 py-2 outline-none"
            value={newPlayer.stats.runs}
            onChange={(e) => setNewPlayer({
              ...newPlayer,
              stats: { ...newPlayer.stats, runs: e.target.value },
            })}
          />
          <input
            aria-label="Career wickets"
            type="number"
            min="0"
            placeholder="Wickets"
            className="bg-slate-800 rounded px-3 py-2 outline-none"
            value={newPlayer.stats.wickets}
            onChange={(e) => setNewPlayer({
              ...newPlayer,
              stats: { ...newPlayer.stats, wickets: e.target.value },
            })}
          />
          <input
            aria-label="Batting average"
            type="number"
            min="0"
            step="0.01"
            placeholder="Batting average"
            className="bg-slate-800 rounded px-3 py-2 outline-none"
            value={newPlayer.stats.battingAverage}
            onChange={(e) => setNewPlayer({
              ...newPlayer,
              stats: { ...newPlayer.stats, battingAverage: e.target.value },
            })}
          />
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={selectPlayerPhoto}
            className="col-span-2 rounded bg-slate-800 px-3 py-2 text-sm"
          />
          {newPlayer.photoUrl && <img src={newPlayer.photoUrl} alt="Player preview" className="h-10 w-10 rounded object-cover" />}
          <p className="col-span-3 text-xs text-slate-500">
            {selectedSeasonId ? `Player will be added to ${seasons.find((season) => season.id === selectedSeasonId)?.name}.` : "Create a season before adding players."}
          </p>
          <button disabled={!selectedSeasonId} className="col-span-3 bg-amber-500 text-slate-950 font-medium rounded py-2 disabled:cursor-not-allowed disabled:opacity-50">
            Add player
          </button>
        </form>

        <div className="space-y-2">
          {players.map((p) => (
            <div key={p.id} className="flex justify-between items-center bg-slate-900 border border-slate-800 rounded px-4 py-2">
              <span className="flex items-center gap-2">
                {p.photoUrl && <img src={p.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />}
                <span>
                  {p.name} — {p.role} — ₹{p.basePrice.toLocaleString("en-IN")} — {p.status}
                  {(p.battingStyle || p.bowlingStyle) && (
                    <span className="block text-xs text-slate-400">
                      {[p.battingStyle, p.bowlingStyle].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </span>
              {p.status !== "SOLD" && selectedSeasonId === activeSeason?.id && (
                <button onClick={() => startAuction(p.id)} className="text-sm bg-slate-800 hover:bg-slate-700 rounded px-3 py-1">
                  Start auction
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Live auction controls */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Live Auction Controls</h2>
        <div className="flex gap-2">
          <button
            onClick={() => finalizeAuction("SOLD")}
            disabled={!socketConnected}
            className="bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-2"
          >
            Mark SOLD
          </button>
          <button
            onClick={() => finalizeAuction("UNSOLD")}
            disabled={!socketConnected}
            className="bg-red-600 hover:bg-red-500 rounded px-4 py-2"
          >
            Mark UNSOLD
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Go to the Live Auction page to watch the room while you run it from here.
        </p>
      </section>
    </div>
  );
}
