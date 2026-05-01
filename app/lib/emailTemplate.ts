import type { Lead } from "./leads";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getLeadUrl(lead: Lead) {
  return `https://www.callboost.co/${slugify(lead.city)}/${slugify(lead.trade)}/${lead.slug}/`;
}

export function transformIssueToSentence(issue: string): string {
  const normalizedIssue = issue.toLowerCase();

  if (
    normalizedIssue.includes("no contact") ||
    normalizedIssue.includes("quote") ||
    normalizedIssue.includes("form")
  ) {
    return "It's not very clear how someone can request a quote";
  }

  if (
    normalizedIssue.includes("phone") ||
    normalizedIssue.includes("call") ||
    normalizedIssue.includes("cta")
  ) {
    return "The call button could be easier to find on mobile";
  }

  if (
    normalizedIssue.includes("outdated") ||
    normalizedIssue.includes("dated") ||
    normalizedIssue.includes("old") ||
    normalizedIssue.includes("diy") ||
    normalizedIssue.includes("generic")
  ) {
    return "The layout feels a bit dated compared to newer local sites";
  }

  if (
    normalizedIssue.includes("mobile") ||
    normalizedIssue.includes("viewport") ||
    normalizedIssue.includes("responsive")
  ) {
    return "The mobile experience could be simpler for people in a hurry";
  }

  if (
    normalizedIssue.includes("local") ||
    normalizedIssue.includes("service positioning")
  ) {
    return "It could be clearer which local services you want calls for";
  }

  if (
    normalizedIssue.includes("trust") ||
    normalizedIssue.includes("review") ||
    normalizedIssue.includes("testimonial")
  ) {
    return "The page could do more to build trust before someone calls";
  }

  if (
    normalizedIssue.includes("thin") ||
    normalizedIssue.includes("content") ||
    normalizedIssue.includes("small")
  ) {
    return "There isn't much on the page to turn visitors into calls";
  }

  if (
    normalizedIssue.includes("broken") ||
    normalizedIssue.includes("unreachable") ||
    normalizedIssue.includes("failed")
  ) {
    return "Some visitors may have trouble loading the site";
  }

  return "A couple of small improvements could help increase calls";
}

function getIssueBullets(issues?: string[]) {
  const fallbackIssues = [
    "A couple of small improvements could help increase calls",
    "The mobile experience could be simplified",
  ];
  const transformedIssues = (issues || []).map(transformIssueToSentence);
  const uniqueIssues = Array.from(new Set(transformedIssues)).slice(0, 3);
  const finalIssues = uniqueIssues.length ? uniqueIssues : fallbackIssues;

  return finalIssues.map((issue) => `- ${issue}`).join("\n");
}

export function generateOfferEmail(lead: Lead) {
  const previewUrl = getLeadUrl(lead);
  const websiteEvaluation = lead.websiteEvaluation;

  if (websiteEvaluation?.quality === "none") {
    return `Hey ${lead.businessName},

I couldn't find a proper website for your business, so I put together a quick preview for you:

${previewUrl}

It's designed to help you get more calls from people searching locally.

If you like it, I can set it up properly for you.

- Jamie`;
  }

  const issueBullets = getIssueBullets(websiteEvaluation?.issues);

  return `Hey ${lead.businessName},

I took a quick look at your website and noticed a couple of things that might be costing you calls:

${issueBullets}

I actually mocked up a cleaner version here:
${previewUrl}

It's designed to make it easier for people to call you quickly from mobile.

If you like it, I can set it up properly for you.

- Jamie`;
}
