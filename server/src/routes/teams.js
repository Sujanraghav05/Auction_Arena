import { Router } from "express";
import prisma from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
const MAX_BUDGET = 2_147_483_647;

// ---- Seasons ----

router.get("/seasons", async (req, res) => {
  const seasons = await prisma.season.findMany({ orderBy: { createdAt: "desc" } });
  res.json(seasons);
});

router.post("/seasons", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { name, purseAmount } = req.body;
  const season = await prisma.season.create({
    data: { name, purseAmount: purseAmount ?? 10000000 },
  });
  res.status(201).json(season);
});

// Mark one season active, deactivate the rest (only one live auction season at a time)
router.post("/seasons/:id/activate", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const season = await prisma.$transaction(async (tx) => {
    const targetSeason = await tx.season.findUnique({ where: { id: req.params.id } });
    if (!targetSeason) return null;

    await tx.season.updateMany({
      where: { id: { not: targetSeason.id }, isActive: true },
      data: { isActive: false },
    });

    return tx.season.update({
      where: { id: targetSeason.id },
      data: { isActive: true },
    });
  });

  if (!season) return res.status(404).json({ error: "Season not found" });
  res.json(season);
});

// ---- Teams ----

router.get("/", async (req, res) => {
  const { seasonId } = req.query;
  const teams = await prisma.team.findMany({
    where: seasonId ? { seasonId } : undefined,
    orderBy: { name: "asc" },
  });
  res.json(teams);
});

router.get("/:id", async (req, res) => {
  const team = await prisma.team.findUnique({
    where: { id: req.params.id },
    include: { results: { include: { player: true, season: true } } },
  });
  if (!team) return res.status(404).json({ error: "Team not found" });
  res.json(team);
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { name, shortName, logoUrl, seasonId, budget } = req.body;
  if (!name || !shortName || !seasonId) {
    return res.status(400).json({ error: "Team name, short name, and season are required" });
  }
  if (budget !== undefined && (!Number.isSafeInteger(budget) || budget <= 0 || budget > MAX_BUDGET)) {
    return res.status(400).json({ error: "Team budget must be a positive whole number" });
  }
  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season) return res.status(404).json({ error: "Season not found" });

  const teamBudget = budget ?? season.purseAmount;
  const team = await prisma.team.create({
    data: { name, shortName, logoUrl, seasonId, budget: teamBudget, purseLeft: teamBudget },
  });
  res.status(201).json(team);
});

router.put("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { budget } = req.body;
  if (!Number.isSafeInteger(budget) || budget <= 0 || budget > MAX_BUDGET) {
    return res.status(400).json({ error: "Team budget must be a positive whole number" });
  }
  try {
    const team = await prisma.$transaction(async (tx) => {
      const existingTeam = await tx.team.findUnique({ where: { id: req.params.id } });
      if (!existingTeam) return null;
      const spent = existingTeam.budget - existingTeam.purseLeft;
      if (budget < spent) {
        return { insufficientBudget: true };
      }
      return tx.team.update({
        where: { id: existingTeam.id },
        data: { budget, purseLeft: budget - spent },
      });
    });
    if (!team) return res.status(404).json({ error: "Team not found" });
    if (team.insufficientBudget) {
      return res.status(400).json({ error: "Budget cannot be lower than the amount already spent" });
    }
    res.json(team);
  } catch (error) {
    console.error("Failed to update team budget:", error);
    res.status(500).json({ error: "Could not update team budget" });
  }
});

export default router;
