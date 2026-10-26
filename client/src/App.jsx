import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import PlayerProfile from "./pages/PlayerProfile.jsx";
import AuctionRoom from "./pages/AuctionRoom.jsx";
import Admin from "./pages/Admin.jsx";
import Login from "./pages/Login.jsx";
import { useAuth } from "./context/AuthContext.jsx";

export default function App() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen">
      <Navbar />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/players/:id" element={<PlayerProfile />} />
        <Route path="/auction" element={<AuctionRoom />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/admin"
          element={user?.role === "ADMIN" ? <Admin /> : <p className="p-6 text-slate-400">Admin only.</p>}
        />
      </Routes>
    </div>
  );
}
