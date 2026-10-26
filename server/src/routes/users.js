import { Router } from "express";
import prisma from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
const roles = ["ADMIN", "TEAM", "VIEWER"];

router.get("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        teamId: true,
        team: { select: { id: true, name: true, seasonId: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (error) {
    console.error("Failed to list users:", error);
    res.status(500).json({ error: "Could not load users" });
  }
});

router.patch("/:id/role", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const { role, teamId } = req.body;
    if (!roles.includes(role)) {
      return res.status(400).json({ error: "Choose ADMIN, TEAM, or VIEWER" });
    }

    let assignedTeamId = null;
    if (role === "TEAM") {
      if (typeof teamId !== "string" || !teamId) {
        return res.status(400).json({ error: "Choose a team for this user" });
      }
      const team = await prisma.team.findUnique({ where: { id: teamId } });
      if (!team) return res.status(404).json({ error: "Team not found" });
      assignedTeamId = team.id;
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role, teamId: assignedTeamId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        teamId: true,
        team: { select: { id: true, name: true, seasonId: true } },
        createdAt: true,
      },
    });
    res.json(user);
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ error: "User not found" });
    console.error("Failed to update user role:", error);
    res.status(500).json({ error: "Could not update user role" });
  }
});

export default router;
