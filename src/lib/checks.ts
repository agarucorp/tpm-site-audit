// Source of truth: "The site audit – Technical PM Quality Standard" (whitelabelmd.com).
// Text is reproduced verbatim from the guide.

export type CheckDefinition = {
  number: number;
  code: string;
  title: string;
  shortTitle: string;
  rules: string[];
};

export const GUIDE = {
  title: "The site audit",
  subtitle: "Technical PM Quality Standard",
  tagline: "Every button. Every pathway.",
  intro: "Complete every required check before requesting final approval.",
  auditOwner: "Technical PM",
  testOn: "Desktop + mobile",
  finalApproval: "Bree",
  buttonsRule: "100% of buttons must be clicked",
  buttonsRuleDetail: "Every destination and complete pathway - on desktop and mobile.",
  checksRule: "Mark complete only after both device reviews pass.",
  processHeadline: "Technical PM audits. Bree approves.",
  processDetail: "Complete the audit, fix and retest failures, then submit for final approval.",
  footer: "Internal site audit | Desktop + mobile",
};

export const CHECKS: CheckDefinition[] = [
  {
    number: 1,
    code: "01",
    title: "100% of buttons + CTAs",
    shortTitle: "Buttons + CTAs",
    rules: [
      "Click every button on every page, on desktop and mobile.",
      "Verify the intended destination and the complete pathway.",
      "Include menus, header/footer links, forms and checkout.",
    ],
  },
  {
    number: 2,
    code: "02",
    title: "Homepage continuity",
    shortTitle: "Homepage continuity",
    rules: [
      "Review the full page for consistent branding, messaging, offers and layout.",
      "Confirm homepage content and CTAs match the linked product pages.",
      "Resolve inconsistent or incomplete sections.",
    ],
  },
  {
    number: 3,
    code: "03",
    title: "Correct product packaging",
    shortTitle: "Correct packaging",
    rules: [
      "Injection: correct injectable vial or pen.",
      "Cream/lotion: appropriate bottle, pump, tube or jar.",
      "Verify every image matches the actual product form.",
    ],
  },
  {
    number: 4,
    code: "04",
    title: "No dosing information",
    shortTitle: "No dosing info",
    rules: [
      "Remove dosing information from every page.",
      "Check product copy, FAQs, labels and text inside images.",
      "Do not pass a page while dosing information remains.",
    ],
  },
  {
    number: 5,
    code: "05",
    title: "Durations + checkout",
    shortTitle: "Durations + checkout",
    rules: [
      "Verify every offered product duration against the system.",
      "Test every product/duration option through checkout.",
      "Confirm selections, prices and durations stay correct in the cart and at checkout.",
    ],
  },
  {
    number: 6,
    code: "06",
    title: "Checkout confirmation page",
    shortTitle: "Confirmation page",
    rules: [
      "Successful checkout must show a confirmation page.",
      "Clearly confirm that the order or request was received.",
      "Test that this page appears on desktop and mobile.",
    ],
  },
  {
    number: 7,
    code: "07",
    title: "All HRT = intake first",
    shortTitle: "HRT intake first",
    rules: [
      "Click every HRT entry point.",
      "Confirm HRT intake happens before checkout.",
      "Verify no HRT pathway bypasses the intake-first flow.",
    ],
  },
  {
    number: 8,
    code: "08",
    title: "Lab panels + biomarkers",
    shortTitle: "Labs + biomarkers",
    rules: [
      "Show only lab offerings currently available in the system.",
      "Match every panel and biomarker list to the system.",
      "Resolve outdated, missing or incorrect lab information.",
    ],
  },
  {
    number: 9,
    code: "09",
    title: "LegitScript status + link",
    shortTitle: "LegitScript",
    rules: [
      "Confirm verified status for the correct business/domain.",
      "Click the badge or link and confirm it opens LegitScript.",
      "Verify the destination matches the client's domain.",
    ],
  },
  {
    number: 10,
    code: "10",
    title: "Business details + legal pages",
    shortTitle: "Business details + legal",
    rules: [
      "Verify email, phone and address against approved business details.",
      "Check legal pages are current and correct for the client's business.",
      "Remove placeholders site-wide and any other business's details.",
    ],
  },
  {
    number: 11,
    code: "11",
    title: "Natural, credible imagery",
    shortTitle: "Credible imagery",
    rules: [
      "Reject overdone AI and artificial-looking visuals.",
      "Check for distorted text, logos, anatomy and containers.",
      "Replace unrealistic or heavily edited imagery.",
    ],
  },
  {
    number: 12,
    code: "12",
    title: "\u201cComing soon\u201d review",
    shortTitle: "Coming soon review",
    rules: [
      "Check every \u201ccoming soon\u201d or unavailable product.",
      "Verify current availability and the reason for the label.",
      "Update outdated labels when the product is available.",
      "Bring any remaining \u201ccoming soon\u201d item and its reason to Bree.",
    ],
  },
];

export const PROCESS_STEPS = [
  {
    code: "01",
    title: "Document coverage",
    detail: "Log tested pages/buttons and confirm 100% coverage on desktop and mobile.",
  },
  {
    code: "02",
    title: "Fix + retest",
    detail: "Record failed checks, screenshots, an owner and the retest result. Fix each failure.",
  },
  {
    code: "03",
    title: "Bree sign-off",
    detail:
      "Submit the completed audit and verified \u201ccoming soon\u201d reasons to Bree for final approval.",
  },
];

export const CHECK_COUNT = CHECKS.length;

export function getCheck(number: number): CheckDefinition {
  const c = CHECKS.find((c) => c.number === number);
  if (!c) throw new Error(`Unknown check ${number}`);
  return c;
}
