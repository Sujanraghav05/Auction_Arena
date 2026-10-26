import "./env.js";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import authRoutes from "./routes/auth.js";
import playerRoutes from "./routes/players.js";
import teamRoutes from "./routes/teams.js";
import auctionRoutes from "./routes/auction.js";
import userRoutes from "./routes/users.js";
import { initSocket } from "./socket.js";

const app = express();
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(cors({ origin: CLIENT_URL, credentials: true }));
// Player photos are stored as data URLs, so allow a reasonably sized image payload.
app.use(express.json({ limit: "5mb" }));

// Keep-alive target for UptimeRobot (or similar) on free-tier hosts that sleep
app.get("/health", (req, res) => res.send("ok"));

app.use("/api/auth", authRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/auction", auctionRoutes);
app.use("/api/users", userRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_URL, credentials: true },
});
initSocket(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`AuctionArena server running on port ${PORT}`));
