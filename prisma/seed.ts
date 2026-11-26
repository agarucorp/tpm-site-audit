import { PrismaClient, type CheckStatus } from "@prisma/client";

const prisma = new PrismaClient();

const allPass = (owner = "") =>
  Array.from({ length: 12 }, (_, i) => ({
    checkNumber: i + 1,
    desktopPass: true,
    mobilePass: true,
    status: "PASS" as CheckStatus,
    owner,
  }));

const days = (n: number) => new Date(Date.now() - n * 86_400_000);

async function main() {
  const existing = await prisma.audit.count();
  if (existing > 0) {
    console.log(`Seed skipped: ${existing} audit(s) already exist. Run "npm run db:reset" to start fresh.`);
    return;
  }

  // 1. Mid-audit with failures -> Fix & retest
  const lumina = await prisma.audit.create({
    data: {
      siteName: "Lumina Wellness",
      url: "https://luminawellness.example.com",
      auditDate: days(2),
      stage: "FIX_RETEST",
      checks: {
        create: [
          { checkNumber: 1, desktopPass: true, mobilePass: false, status: "RETEST", owner: "Alex Rivera",
            notes: "Footer 'Careers' link 404s on mobile only.", retestResult: "Fixed on staging, retest pending on mobile." },
          { checkNumber: 2, desktopPass: true, mobilePass: true, status: "PASS" },
          { checkNumber: 3, desktopPass: true, mobilePass: true, status: "PASS" },
          { checkNumber: 4, desktopPass: false, mobilePass: false, status: "FAIL", owner: "Dana (content)",
            notes: "Dosing table inside the Semaglutide FAQ image and in product copy.",
            screenshotLinks: ["https://drive.example.com/lumina/dosing-faq.png"] },
          { checkNumber: 5, desktopPass: true, mobilePass: true, status: "PASS" },
          { checkNumber: 6, desktopPass: true, mobilePass: true, status: "PASS" },
          { checkNumber: 7, desktopPass: true, mobilePass: true, status: "PASS" },
          { checkNumber: 8, desktopPass: true, mobilePass: true, status: "PASS" },
          { checkNumber: 9, desktopPass: false, mobilePass: false, status: "FAIL", owner: "Sam (dev)",
            notes: "LegitScript badge links to a different business domain.",
            screenshotLinks: ["https://drive.example.com/lumina/legitscript.png"] },
          { checkNumber: 10, desktopPass: true, mobilePass: true, status: "PASS" },
          { checkNumber: 11, desktopPass: true, mobilePass: false, status: "PENDING" },
          { checkNumber: 12, desktopPass: false, mobilePass: false, status: "PENDING" },
        ],
      },
      coverage: {
        create: [
          { page: "/", element: "Hero CTA, header menu, footer links", desktopTested: true, mobileTested: true },
          { page: "/weight-loss/semaglutide", element: "Get started, duration selector", desktopTested: true, mobileTested: true },
          { page: "/hrt", element: "Start intake (3 entry points)", desktopTested: true, mobileTested: true },
          { page: "/checkout", element: "Place order, coupon form", desktopTested: true, mobileTested: false },
        ],
      },
      comingSoon: {
        create: [
          { product: "Tirzepatide", reason: "Pharmacy partner not yet live in system", verified: true },
          { product: "NAD+ injections", reason: "Pending pricing approval", verified: false },
        ],
      },
      events: {
        create: [
          { type: "CREATED", actorName: "Alex Rivera", actorRole: "PM", toStage: "IN_AUDIT", createdAt: days(2) },
          { type: "STAGE_CHANGED", actorName: "Alex Rivera", actorRole: "PM", fromStage: "IN_AUDIT", toStage: "FIX_RETEST", createdAt: days(1) },
        ],
      },
    },
  });

  // 2. Fresh audit -> In audit
  await prisma.audit.create({
    data: {
      siteName: "Northside Men's Health",
      url: "https://northside.example.com",
      auditDate: days(0),
      checks: {
        create: Array.from({ length: 12 }, (_, i) =>
          i < 2
            ? { checkNumber: i + 1, desktopPass: true, mobilePass: i === 1, status: (i === 1 ? "PASS" : "PENDING") as CheckStatus }
            : { checkNumber: i + 1 },
        ),
      },
      coverage: { create: [{ page: "/", element: "Header menu, hero CTA", desktopTested: true, mobileTested: false }] },
      comingSoon: { create: [{ product: "Enclomiphene", reason: "", verified: false }] },
      events: { create: [{ type: "CREATED", actorName: "Jordan Lee", actorRole: "PM", toStage: "IN_AUDIT" }] },
    },
  });

  // 3. All checks complete -> Ready for Bree
  await prisma.audit.create({
    data: {
      siteName: "Harbor Hormone Health",
      url: "https://harborhormone.example.com",
      auditDate: days(4),
      stage: "READY_FOR_BREE",
      submittedAt: days(1),
      checks: { create: allPass() },
      coverage: {
        create: [
          { page: "/", element: "Header menu, hero CTAs, footer links", desktopTested: true, mobileTested: true },
          { page: "/hrt/women", element: "Start intake, product cards", desktopTested: true, mobileTested: true },
          { page: "/checkout", element: "Checkout + confirmation page", desktopTested: true, mobileTested: true },
        ],
      },
      comingSoon: { create: [{ product: "Estradiol cream", reason: "Compounding pharmacy onboarding", verified: true }] },
      events: {
        create: [
          { type: "CREATED", actorName: "Jordan Lee", actorRole: "PM", toStage: "IN_AUDIT", createdAt: days(4) },
          { type: "STAGE_CHANGED", actorName: "Jordan Lee", actorRole: "PM", fromStage: "FIX_RETEST", toStage: "READY_FOR_BREE",
            comment: "All 12 checks passed on desktop and mobile. Submitted to Bree for final approval.", createdAt: days(1) },
        ],
      },
    },
  });

  // 4. Approved and archived
  await prisma.audit.create({
    data: {
      siteName: "Peak Vitality Clinic",
      url: "https://peakvitality.example.com",
      auditDate: days(12),
      stage: "APPROVED",
      submittedAt: days(9),
      approvedAt: days(8),
      approvedBy: "Bree",
      approvalComment: "Clean audit. Coming soon reason for Sermorelin confirmed with ops.",
      checks: { create: allPass() },
      coverage: {
        create: [
          { page: "/", element: "All header/footer links, hero CTAs", desktopTested: true, mobileTested: true },
          { page: "/products", element: "Every product card + duration option", desktopTested: true, mobileTested: true },
          { page: "/checkout", element: "Full checkout + confirmation", desktopTested: true, mobileTested: true },
        ],
      },
      comingSoon: { create: [{ product: "Sermorelin", reason: "Supplier backorder until Q1", verified: true }] },
      events: {
        create: [
          { type: "CREATED", actorName: "Alex Rivera", actorRole: "PM", toStage: "IN_AUDIT", createdAt: days(12) },
          { type: "STAGE_CHANGED", actorName: "Alex Rivera", actorRole: "PM", fromStage: "FIX_RETEST", toStage: "READY_FOR_BREE",
            comment: "All 12 checks passed on desktop and mobile. Submitted to Bree for final approval.", createdAt: days(9) },
          { type: "APPROVED", actorName: "Bree", actorRole: "APPROVER", fromStage: "READY_FOR_BREE", toStage: "APPROVED",
            comment: "Clean audit. Coming soon reason for Sermorelin confirmed with ops.", createdAt: days(8) },
        ],
      },
    },
  });

  console.log(`Seeded 4 sample audits (e.g. ${lumina.siteName}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
