import { CHECKS, GUIDE, PROCESS_STEPS } from "./checks";
import { STATUS_LABEL } from "./workflow";

export type AuditPromptTarget = { siteName?: string; url?: string };

const STATUSES = Object.values(STATUS_LABEL).join(" / ");

function checkSection(c: (typeof CHECKS)[number]): string {
  return [
    `### ${c.code} — ${c.title}`,
    "",
    "Criteria (from the guide):",
    ...c.rules.map((r) => `- ${r}`),
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Check | ${c.code} ${c.title} |`,
    "| Desktop | Pass / Fail / Not verified |",
    "| Mobile | Pass / Fail / Not verified |",
    `| Status | ${STATUSES} |`,
    "| Notes | Evidence: pages, routes, files and exact copy/elements inspected |",
    "| Screenshot links | Preview URLs or paths showing the issue (or \u201cnone\u201d) |",
    "| Owner | Suggested owner for the fix (content / dev / design / ops) |",
    "| What to fix | Concrete fix if Fail, otherwise \u201c\u2014\u201d |",
  ].join("\n");
}

export function buildAuditPrompt(target: AuditPromptTarget = {}): string {
  const site = target.siteName?.trim() || "[SITE NAME]";
  const url = target.url?.trim() || "[SITE URL]";
  const steps = PROCESS_STEPS.map((s) => `${s.code} ${s.title}: ${s.detail}`).join("\n");

  return `You are acting as a Technical PM auditor for this website. Audit the ENTIRE site against the "${GUIDE.title} – ${GUIDE.subtitle}" and return a complete written report.

IMPORTANT — AUDIT ONLY:
- Do NOT change, refactor, fix or commit any code, content, assets or settings. Do not open a pull request.
- Only inspect the project (code, routes, components, content, images, links, preview) and report findings.
- If something cannot be verified from the project or the preview (e.g. a value that lives in an external system), set that device to "Not verified", the Status to "Pending", and say exactly what a human must check.

SITE
- Site name: ${site}
- URL: ${url}

THE STANDARD
- ${GUIDE.tagline} ${GUIDE.intro}
- Audit owner: ${GUIDE.auditOwner}. Test on: ${GUIDE.testOn}. Final approval: ${GUIDE.finalApproval}.
- ${GUIDE.buttonsRule}: ${GUIDE.buttonsRuleDetail}
- ${GUIDE.checksRule}
- Process — ${GUIDE.processHeadline} ${GUIDE.processDetail}
${steps}

HOW TO AUDIT
1. Enumerate every route/page in the project, including product pages, intake flows, checkout, confirmation, legal pages and any unlinked pages.
2. On every page, list every button, CTA, menu item, header/footer link, form and checkout action, and trace its destination and the complete pathway.
3. Evaluate desktop and mobile separately (desktop ≥ 1280px wide, mobile ≈ 390px wide): check that every element exists, is visible, is reachable and leads to the right place on each. Include the mobile menu.
4. Evaluate each of the 12 required checks below with its exact criteria. Desktop and Mobile get separate results.
5. Status rule: "Pass" only if BOTH Desktop and Mobile pass. "Fail" if either device fails. "Pending" if it cannot be verified. "Retest" only if the code shows a fix that has not been verified on both devices yet. Never pass a check while any criterion is unmet.

OUTPUT FORMAT — return exactly these sections in Markdown, in this order, with these table columns (they map 1:1 to the audit app's fields):

## Summary
| Field | Value |
| --- | --- |
| Site name | ${site} |
| URL | ${url} |
| Audit date | YYYY-MM-DD |
| Checks passed | N / ${CHECKS.length} |
| Ready for Bree | Yes / No |

## Step 01 — Document coverage
One row per page + group of elements tested. Every button/CTA on the site must appear.
| Page | Button / link / form tested | Destination | Desktop tested | Mobile tested | Result |
| --- | --- | --- | --- | --- | --- |
| /example | Hero "Get started", header menu, footer links | /intake | Yes | Yes | OK / Broken: … |

Then state: "Desktop coverage: X%  ·  Mobile coverage: Y%" and list any button/link you could not test.

## Step 02 — Required audit checks
One table per check, for all ${CHECKS.length} checks:

${CHECKS.map(checkSection).join("\n\n")}

## Step 02 — Fix + retest list
Every check with Status Fail or Pending:
| Check | Device | Issue | Page / file | What to fix | Owner |
| --- | --- | --- | --- | --- | --- |

## Coming soon
Every product or item labeled "coming soon" or unavailable anywhere on the site (check ${CHECKS[11].code} criteria):
| Product | Reason | Verified | Evidence |
| --- | --- | --- | --- |
| Product name | Why it is labeled coming soon | Yes / No | Where it appears and how the reason was verified |
If the product is actually available, say the label is outdated and must be updated. If there are none, write "None".

## Step 03 — Verdict for Bree
- Ready for Bree: Yes / No
- "Yes" only if all ${CHECKS.length} checks are Pass on both Desktop and Mobile, coverage is 100% on both devices, and every remaining "coming soon" item has a verified reason.
- If "No", list the blocking checks (code + title) and what must happen before submitting to Bree.

Be exhaustive and specific: cite routes, component/file names and the exact text or image involved. Do not summarize or skip pages. Remember: report only — do not modify anything.`;
}
