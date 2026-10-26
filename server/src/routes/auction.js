import { Router } from "express";
import prisma from "../db.js";

const router = Router();

// Lets a client that just joined (or refreshed) catch up on the live auction state
// The authoritative live state itself lives in src/socket.js (in-memory + DB-backed)
router.get("/state", async (req, res) => {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) return res.json({ season: null });

  const teams = await prisma.team.findMany({ where: { seasonId: season.id } });
  res.json({ season, teams });
});

export default router;
