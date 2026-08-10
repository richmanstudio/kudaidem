import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

type DbGlobal = typeof globalThis & { __kudaidemPrisma?: PrismaClient };

export function getDb() {
  const globalDb = globalThis as DbGlobal;
  if (globalDb.__kudaidemPrisma) return globalDb.__kudaidemPrisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  if (process.env.NODE_ENV !== "production") globalDb.__kudaidemPrisma = prisma;
  return prisma;
}
