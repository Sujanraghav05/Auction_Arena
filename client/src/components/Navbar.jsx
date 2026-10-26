import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
      <Link to="/" className="text-xl font-bold text-amber-400">
        AuctionArena
      </Link>
      <div className="flex items-center gap-5 text-sm">
        <Link to="/" className="hover:text-amber-400">Players</Link>
        <Link to="/auction" className="hover:text-amber-400">Live Auction</Link>
        {user?.role === "ADMIN" && (
          <Link to="/admin" className="hover:text-amber-400">Admin</Link>
        )}
        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-slate-400">{user.name} ({user.role})</span>
            <button onClick={logout} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700">
              Logout
            </button>
          </div>
        ) : (
          <Link to="/login" className="px-3 py-1 rounded bg-amber-500 text-slate-950 font-medium">
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}
