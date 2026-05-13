export type WebsiteOpportunityLevel =
  | "high"
  | "medium"
  | "low"
  | "unranked"
  | "none";

export type WebsiteOpportunitySignal = {
  id: string;
  severity: "high" | "medium" | "low";
  label: string;
  detail?: string;
};

export type WebsiteOpportunityResult = {
  level: WebsiteOpportunityLevel;
  highSignals: WebsiteOpportunitySignal[];
  mediumSignals: WebsiteOpportunitySignal[];
  lowSignals: WebsiteOpportunitySignal[];
  requiresManualReview: boolean;
  reason: string;
};

export type StoredWebsiteOpportunityResult = WebsiteOpportunityResult & {
  evaluatedAt?: string;
};

type WebsiteEvaluationLike = {
  hasWebsite?: boolean;
  isWorking?: boolean | null;
  quality?: string;
  issues?: string[];
  summary?: string;
};

type BuildWebsiteOpportunityArgs = {
  website?: string | null;
  homepageHtml?: string | null;
  socials?: {
    facebook?: string | null;
    instagram?: string | null;
  } | null;
  websiteEvaluation?: WebsiteEvaluationLike | null;
  businessPresenceType?: string | null;
  badDomainDetected?: boolean;
  homepageScrapeFailed?: boolean;
};

const currentYear = new Date().getFullYear();

function getCleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getPresenceType(url: string) {
  if (!url) return "unknown";

  try {
    const parsedUrl = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = parsedUrl.hostname.replace(/^www\./i, "").toLowerCase();

    if (host.includes("facebook.com") || host.includes("fb.com")) return "facebook";
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("google.com") || host.includes("maps.app.goo.gl")) {
      return "google_business";
    }

    if (
      [
        "linkedin.com",
        "yelp",
        "yellowpages",
        "truelocal",
        "wordofmouth",
        "hipages",
        "oneflare",
        "tripadvisor",
      ].some((domain) => host.includes(domain) || parsedUrl.href.includes(domain))
    ) {
      return "directory";
    }

    return "website";
  } catch {
    return "unknown";
  }
}

function hasValidTld(url: string) {
  try {
    const parsedUrl = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = parsedUrl.hostname.replace(/^www\./i, "").toLowerCase();
    const labels = host.split(".").filter(Boolean);
    const tld = labels[labels.length - 1] || "";

    return labels.length >= 2 && /^[a-z]{2,63}$/i.test(tld);
  } catch {
    return false;
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function getOldFooterYear(html: string) {
  const footerMatch = html.match(/<footer\b[\s\S]*?<\/footer>/i);
  const footerText = footerMatch ? stripHtml(footerMatch[0]) : stripHtml(html);
  const years = [...footerText.matchAll(/\b(?:19|20)\d{2}\b/g)]
    .map((match) => Number(match[0]))
    .filter((year) => year >= 1990 && year <= currentYear);

  if (!years.length) return null;

  const newestYear = Math.max(...years);

  return currentYear - newestYear >= 5 ? newestYear : null;
}

function addSignal(
  signals: WebsiteOpportunitySignal[],
  signal: WebsiteOpportunitySignal
) {
  if (!signals.some((item) => item.id === signal.id)) {
    signals.push(signal);
  }
}

function buildReason(args: {
  level: WebsiteOpportunityLevel;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  noWebsite: boolean;
  hasSocials: boolean;
}) {
  if (args.level === "unranked") {
    return "No website or social presence was found, so this lead needs manual review before ranking.";
  }

  if (args.level === "high") {
    return `High opportunity because ${args.highCount} high signal${
      args.highCount === 1 ? "" : "s"
    } were found.`;
  }

  if (args.level === "medium") {
    return `Medium opportunity because ${args.mediumCount} medium signals were found.`;
  }

  if (args.level === "low") {
    return `Low opportunity because ${args.lowCount} low signals were found.`;
  }

  if (args.noWebsite && args.hasSocials) {
    return "No website was found, but a social presence exists; this remains a high-signal condition if present in the signal list.";
  }

  return "Not enough signals were found to rank this as a website opportunity.";
}

export function buildWebsiteOpportunityResult(
  args: BuildWebsiteOpportunityArgs
): WebsiteOpportunityResult {
  const website = getCleanString(args.website);
  const homepageHtml = getCleanString(args.homepageHtml);
  const evaluation = args.websiteEvaluation;
  const issueText = (evaluation?.issues || []).join(" \n ").toLowerCase();
  const summaryText = getCleanString(evaluation?.summary).toLowerCase();
  const searchableText = `${issueText} ${summaryText}`;
  const text = stripHtml(homepageHtml).toLowerCase();
  const hasFacebook = Boolean(getCleanString(args.socials?.facebook));
  const hasInstagram = Boolean(getCleanString(args.socials?.instagram));
  const hasSocials = hasFacebook || hasInstagram;
  const presenceType = args.businessPresenceType || getPresenceType(website);
  const hasWebsite =
    Boolean(website) &&
    presenceType === "website" &&
    evaluation?.hasWebsite !== false;
  const highSignals: WebsiteOpportunitySignal[] = [];
  const mediumSignals: WebsiteOpportunitySignal[] = [];
  const lowSignals: WebsiteOpportunitySignal[] = [];

  if (!hasWebsite) {
    addSignal(highSignals, {
      id: "no_website_found",
      severity: "high",
      label: "No website found",
    });
  }

  if (website && presenceType !== "website") {
    addSignal(highSignals, {
      id: "no_real_business_website",
      severity: "high",
      label: "No real business website",
      detail: "The primary presence is not an owned business website.",
    });
  }

  if (website && !hasValidTld(website)) {
    addSignal(highSignals, {
      id: "non_tld_or_invalid_domain",
      severity: "high",
      label: "Non-TLD or invalid domain",
    });
  }

  if (presenceType === "directory" || presenceType === "google_business") {
    addSignal(highSignals, {
      id: "directory_only_website",
      severity: "high",
      label: "Directory-only website",
    });
  }

  if (presenceType === "facebook" || presenceType === "instagram") {
    addSignal(highSignals, {
      id: "social_only_presence",
      severity: "high",
      label:
        presenceType === "facebook"
          ? "Facebook-only presence"
          : "Instagram-only presence",
    });
  }

  if (args.badDomainDetected) {
    addSignal(highSignals, {
      id: "invalid_domain",
      severity: "high",
      label: "Invalid domain",
    });
  }

  if (
    includesAny(`${text} ${searchableText}`, [
      /parked domain/,
      /domain is parked/,
      /buy this domain/,
      /this domain is for sale/,
    ])
  ) {
    addSignal(highSignals, {
      id: "parked_domain",
      severity: "high",
      label: "Parked domain",
    });
  }

  if (
    evaluation?.isWorking === false ||
    args.homepageScrapeFailed ||
    includesAny(searchableText, [/unreachable/, /intermittent/, /failed to load/])
  ) {
    addSignal(mediumSignals, {
      id: "unreachable_or_intermittent",
      severity: "medium",
      label: "Unreachable / intermittent website",
    });
  }

  if (homepageHtml && !/<meta[^>]+name=["']viewport["']/i.test(homepageHtml)) {
    addSignal(mediumSignals, {
      id: "unusable_mobile_experience",
      severity: "medium",
      label: "Unusable mobile experience",
    });
  }

  if (includesAny(searchableText, [/unusable mobile/, /mobile friendliness/])) {
    addSignal(mediumSignals, {
      id: "unusable_mobile_experience",
      severity: "medium",
      label: "Unusable mobile experience",
    });
  }

  const oldFooterYear = homepageHtml ? getOldFooterYear(homepageHtml) : null;
  if (oldFooterYear) {
    addSignal(mediumSignals, {
      id: "old_footer_year",
      severity: "medium",
      label: "Footer year 5+ years old",
      detail: `Newest detected footer year is ${oldFooterYear}.`,
    });
  }

  if (
    includesAny(`${searchableText} ${text}`, [
      /old site/,
      /outdated footer/,
      /outdated layout/,
      /looks outdated/,
      /generic, diy, or outdated/,
      /flash/,
      /table layout/,
    ])
  ) {
    addSignal(mediumSignals, {
      id: "clearly_outdated_layout",
      severity: "medium",
      label: "Clearly outdated layout",
    });
  }

  if (includesAny(searchableText, [/slow load/, /loads slowly/, /slow website/])) {
    addSignal(mediumSignals, {
      id: "slow_load",
      severity: "medium",
      label: "Slow load",
    });
  }

  if (includesAny(searchableText, [/ssl/, /security warning/, /not secure/])) {
    addSignal(mediumSignals, {
      id: "ssl_security_warning",
      severity: "medium",
      label: "SSL/security warning",
    });
  }

  if (includesAny(searchableText, [/broken navigation/, /broken nav/, /broken links?/])) {
    addSignal(mediumSignals, {
      id: "broken_navigation",
      severity: "medium",
      label: "Broken navigation",
    });
  }

  if (
    (homepageHtml && !/href=["']tel:/i.test(homepageHtml)) ||
    includesAny(searchableText, [/phone .*not prominent/, /poor mobile cta/])
  ) {
    addSignal(mediumSignals, {
      id: "poor_mobile_cta_visibility",
      severity: "medium",
      label: "Poor mobile CTA visibility",
    });
  }

  if (
    (homepageHtml && !includesAny(text, [/testimonial/, /review/])) ||
    includesAny(searchableText, [/no testimonials?/])
  ) {
    addSignal(lowSignals, {
      id: "no_testimonials",
      severity: "low",
      label: "No testimonials",
    });
  }

  if (
    (homepageHtml &&
      !includesAny(text, [/quote/, /contact/, /call/, /book/, /enquire/, /estimate/])) ||
    includesAny(searchableText, [/weak cta/, /no clear .*call-to-action/])
  ) {
    addSignal(lowSignals, {
      id: "weak_cta",
      severity: "low",
      label: "Weak CTA",
    });
  }

  if (
    (homepageHtml &&
      !includesAny(text, [/licensed/, /insured/, /guarantee/, /accredited/])) ||
    includesAny(searchableText, [/no trust badges?/, /trust signals are limited/])
  ) {
    addSignal(lowSignals, {
      id: "no_trust_badges",
      severity: "low",
      label: "No trust badges",
    });
  }

  if (
    (homepageHtml &&
      !includesAny(text, [/gallery/, /portfolio/, /our work/, /before and after/])) ||
    includesAny(searchableText, [/no gallery/])
  ) {
    addSignal(lowSignals, {
      id: "no_gallery",
      severity: "low",
      label: "No gallery",
    });
  }

  if (
    (homepageHtml &&
      !includesAny(homepageHtml.toLowerCase(), [
        /google reviews/,
        /reviews-widget/,
        /schema.org\/review/,
      ])) ||
    includesAny(searchableText, [/no review embeds?/])
  ) {
    addSignal(lowSignals, {
      id: "no_review_embeds",
      severity: "low",
      label: "No review embeds",
    });
  }

  if (includesAny(`${searchableText} ${text}`, [/stock content/, /lorem ipsum/, /generic content/])) {
    addSignal(lowSignals, {
      id: "generic_stock_content",
      severity: "low",
      label: "Generic stock content",
    });
  }

  if (includesAny(searchableText, [/weak branding/, /thin content/])) {
    addSignal(lowSignals, {
      id: "weak_branding",
      severity: "low",
      label: "Weak branding",
    });
  }

  if (includesAny(searchableText, [/inconsistent colours/, /inconsistent colors/, /inconsistent fonts/])) {
    addSignal(lowSignals, {
      id: "inconsistent_colours_fonts",
      severity: "low",
      label: "Inconsistent colours/fonts",
    });
  }

  if (
    (homepageHtml &&
      !includesAny(homepageHtml.toLowerCase(), [
        /position:\s*sticky/,
        /position:\s*fixed/,
      ])) ||
    includesAny(searchableText, [/no sticky call button/])
  ) {
    addSignal(lowSignals, {
      id: "no_sticky_call_button",
      severity: "low",
      label: "No sticky call button",
    });
  }

  if (
    (homepageHtml &&
      !includesAny(text, [/service area/, /areas we serve/, /suburbs/, /local/])) ||
    includesAny(searchableText, [/service positioning is weak/, /unclear service areas/])
  ) {
    addSignal(lowSignals, {
      id: "unclear_service_areas",
      severity: "low",
      label: "Unclear service areas",
    });
  }

  const noWebsite = !hasWebsite;
  let level: WebsiteOpportunityLevel = "none";
  let requiresManualReview = false;

  if (noWebsite && !hasSocials) {
    level = "unranked";
    requiresManualReview = true;
  } else if (highSignals.length >= 1) {
    level = "high";
  } else if (mediumSignals.length >= 2) {
    level = "medium";
  } else if (lowSignals.length >= 3) {
    level = "low";
  }

  return {
    level,
    highSignals,
    mediumSignals,
    lowSignals,
    requiresManualReview,
    reason: buildReason({
      level,
      highCount: highSignals.length,
      mediumCount: mediumSignals.length,
      lowCount: lowSignals.length,
      noWebsite,
      hasSocials,
    }),
  };
}

export function withEvaluatedAt(
  result: WebsiteOpportunityResult,
  evaluatedAt = new Date().toISOString()
): StoredWebsiteOpportunityResult {
  return {
    ...result,
    evaluatedAt,
  };
}
