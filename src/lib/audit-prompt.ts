export type AuditPromptTarget = { siteName?: string; url?: string };

export const AUDIT_PROMPT = `Perform a full site audit following these 12 checks, on desktop and mobile. Do not change anything. For each check, report PASS or FAIL, the exact page and element, and what's wrong:
01 Buttons + CTAs: click every button, link, menu, header/footer link, form and checkout step. Verify each destination and the full pathway. Confirm 100% coverage.
02 Homepage continuity: branding, messaging, offers and layout are consistent. Homepage content and CTAs match the linked product pages. No incomplete sections.
03 Product packaging: every image matches the product form (injection = vial or pen, cream/lotion = bottle, pump, tube or jar).
04 No dosing information anywhere: product copy, FAQs, labels or text inside images.
05 Durations + checkout: every product/duration option works through checkout. Selection, price and duration stay correct in the cart and at checkout.
06 Checkout confirmation: a successful checkout shows a confirmation page saying the order or request was received.
07 HRT intake first: every HRT entry point goes to intake before checkout. No HRT pathway bypasses intake.
08 Labs: verify every lab panel and biomarker shown is currently available and matches the system. Flag any that don't.
09 LegitScript: verify the status is verified for the correct domain, the badge opens LegitScript, and the destination matches the client's domain.
10 Business details + legal: list the email, phone and address shown on every page. Flag placeholders, inconsistencies or another business's details. Check that legal pages are current, with no placeholders.
11 Imagery: flag artificial-looking AI images, and distorted text, logos, anatomy or containers.
12 Coming soon: list every product marked "coming soon" or unavailable, with its page.`;

export function buildAuditPrompt(target: AuditPromptTarget = {}): string {
  const site = target.siteName?.trim();
  const url = target.url?.trim();
  if (!site && !url) return AUDIT_PROMPT;
  return `Site: ${site ?? ""}\nURL: ${url ?? ""}\n\n${AUDIT_PROMPT}`;
}
