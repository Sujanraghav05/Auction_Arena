import { PrismaClient } from "@prisma/client";

// Single shared Prisma instance (avoids exhausting DB connections on free-tier Postgres)
const prisma = new PrismaClient();

export default prisma;
