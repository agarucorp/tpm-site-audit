import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

export const auditInclude = {
  checks: { orderBy: { checkNumber: "asc" } },
  coverage: { orderBy: { createdAt: "asc" } },
  comingSoon: { orderBy: { createdAt: "asc" } },
  events: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.AuditInclude;

export type FullAudit = Prisma.AuditGetPayload<{ include: typeof auditInclude }>;

export async function getBoardAudits() {
  return prisma.audit.findMany({
    include: { checks: true, comingSoon: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ updatedAt: "desc" }],
  });
}

export type BoardAudit = Awaited<ReturnType<typeof getBoardAudits>>[number];

export async function getAudit(id: string) {
  return prisma.audit.findUnique({ where: { id }, include: auditInclude });
}

export async function getInbox() {
  const [awaiting, changes] = await Promise.all([
    prisma.audit.findMany({
      where: { stage: "READY_FOR_BREE" },
      select: { id: true, siteName: true, clientName: true, submittedAt: true, assignedPm: true },
      orderBy: { submittedAt: "asc" },
    }),
    prisma.audit.findMany({
      where: { changesRequested: true, stage: "FIX_RETEST" },
      select: { id: true, siteName: true, clientName: true, assignedPm: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return {
    awaiting: awaiting.map((a) => ({ ...a, submittedAt: a.submittedAt?.toISOString() ?? null })),
    changes: changes.map((a) => ({ ...a, updatedAt: a.updatedAt.toISOString() })),
  };
}

export type Inbox = Awaited<ReturnType<typeof getInbox>>;

export async function getHistory(filters: { q?: string; client?: string; from?: string; to?: string }) {
  const where: Prisma.AuditWhereInput = { stage: "APPROVED" };
  const and: Prisma.AuditWhereInput[] = [];
  if (filters.q) {
    and.push({
      OR: [
        { siteName: { contains: filters.q, mode: "insensitive" } },
        { url: { contains: filters.q, mode: "insensitive" } },
        { clientName: { contains: filters.q, mode: "insensitive" } },
        { approvedBy: { contains: filters.q, mode: "insensitive" } },
        { approvalComment: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.client) and.push({ clientName: filters.client });
  if (filters.from) and.push({ approvedAt: { gte: new Date(`${filters.from}T00:00:00.000Z`) } });
  if (filters.to) and.push({ approvedAt: { lte: new Date(`${filters.to}T23:59:59.999Z`) } });
  if (and.length) where.AND = and;

  const [audits, clients] = await Promise.all([
    prisma.audit.findMany({
      where,
      include: { checks: true, comingSoon: true, events: { orderBy: { createdAt: "desc" } } },
      orderBy: { approvedAt: "desc" },
    }),
    prisma.audit.findMany({
      where: { stage: "APPROVED" },
      distinct: ["clientName"],
      select: { clientName: true },
      orderBy: { clientName: "asc" },
    }),
  ]);
  return { audits, clients: clients.map((c) => c.clientName) };
}
