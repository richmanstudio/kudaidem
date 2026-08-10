import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { hashInviteCode } from "../features/beta/server/access";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const label = process.argv[2]?.slice(0, 80) || "closed-beta";
const maxUses = Math.max(1, Math.min(100, Number(process.argv[3]) || 1));
const days = Math.max(1, Math.min(90, Number(process.argv[4]) || 14));
const code = `KDI-${randomBytes(5).toString("hex").toUpperCase()}`;

await prisma.betaInvite.create({ data: {
  codeHash: hashInviteCode(code),
  label,
  maxUses,
  expiresAt: new Date(Date.now() + days * 86400000),
} });

console.log(JSON.stringify({ code, label, maxUses, expiresInDays: days }, null, 2));
await prisma.$disconnect();
