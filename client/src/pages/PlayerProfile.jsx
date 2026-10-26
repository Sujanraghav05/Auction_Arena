import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import api from "../api.js";

export default function PlayerProfile() {
  const { id } = useParams();
  const [player, setPlayer] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setPlayer(null);
    setError("");
    api.get(`/api/players/${id}`)
      .then((res) => {
        if (active) setPlayer(res.data);
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.response?.data?.error || requestError.message || "Could not load player");
        }
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (error) return <p role="alert" className="p-6 text-red-300">{error}</p>;
  if (!player) return <p className="p-6 text-slate-400">Loading...</p>;

  const chartData = player.results.map((r) => ({
    season: r.season.name,
    price: r.soldPrice ? r.soldPrice / 100000 : 0, // in lakhs, for readable bars
    team: r.team?.name || "Unsold",
  }));
  const careerStats = Object.entries(player.stats || {}).filter(([, value]) =>
    value !== null && value !== undefined && value !== ""
  );

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        {player.photoUrl && (
          <img src={player.photoUrl} alt={player.name} className="w-20 h-20 rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-bold">{player.name}</h1>
          <p className="text-slate-400">{player.role}</p>
          {(player.battingStyle || player.bowlingStyle) && (
            <p className="text-sm text-slate-400">
              {[player.battingStyle, player.bowlingStyle].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="text-sm text-slate-500">
            Base price: ₹{player.basePrice.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {careerStats.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Player Record</h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {careerStats.map(([key, value]) => (
              <div key={key} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                <dt className="text-xs capitalize text-slate-400">{key.replace(/([A-Z])/g, " $1")}</dt>
                <dd className="mt-1 font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <h2 className="text-lg font-semibold mb-2">Auction Rate History</h2>
      {chartData.length === 0 ? (
        <p className="text-slate-500 mb-6">No auction history yet for this player.</p>
      ) : (
        <div className="h-64 bg-slate-900 border border-slate-800 rounded-lg p-4 mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="season" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} label={{ value: "₹ Lakhs", angle: -90, position: "insideLeft", fill: "#94a3b8" }} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                formatter={(value, name, props) => [`₹${value}L`, props.payload.team]}
              />
              <Bar dataKey="price" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <h2 className="text-lg font-semibold mb-2">Season by Season</h2>
      <div className="space-y-2">
        {player.results.map((r) => (
          <div key={r.id} className="flex justify-between bg-slate-900 border border-slate-800 rounded px-4 py-2">
            <span>{r.season.name}</span>
            <span className="text-slate-400">{r.team?.name || "Unsold"}</span>
            <span className="font-medium">
              {r.soldPrice ? `₹${r.soldPrice.toLocaleString("en-IN")}` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
