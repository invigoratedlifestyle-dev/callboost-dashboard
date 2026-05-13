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
  issues: string[];
  positives: string[];
  summary: string;
};

export type StoredWebsiteOpportunityResult = WebsiteOpportunityResult & {
  evaluatedAt?: string;
};

type WebsiteEvaluationLike = {
  hasWebsite?: boolean;
  isWorking?: boolean | null;
  quality?: string;
  issues?: string[] | null;
  summary?: string | null;
};

type BuildWebsiteOpportunityArgs = {
  website?: string | null;
  homepageHtml?: string | null;
  socials?: {
    facebook?: string | null;
    instagram?: string | null;
  } | null;
  phone?: string | null;
  email?: string | null;
  rating?: string | number | null;
  reviewCount?: string | number | null;
  description?: string | null;
  services?: string[] | null;
  websiteEvaluation?: WebsiteEvaluationLike | null;
  businessPresenceType?: string | null;
  badDomainDetected?: boolean;
  homepageScrapeFailed?: boolean;
};

type LegacyWebsiteOpportunityLike = {
  issue?: string | null;
  issues?: string[] | null;
  summary?: string | null;
};

type WebsiteOpportunityContextEvaluation = WebsiteEvaluationLike & {
  score?: number | null;
  recommendation?: string | null;
  positives?: string[] | null;
};

type BuildOutreachOpportunityContextArgs = {
  websiteOpportunityV2?: StoredWebsiteOpportunityResult | null;
  websiteOpportunity?: LegacyWebsiteOpportunityLike | null;
  websiteEvaluation?: WebsiteOpportunityContextEvaluation | null;
  opportunityScore?: number | null;
};

export type OutreachOpportunityContext = {
  level: WebsiteOpportunityLevel;
  reason: string;
  signalLabels: string[];
  issues: string[];
  positives: string[];
  summary: string;
  legacyScore?: number;
  legacyConfidence?: string;
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

const signalIssueText: Record<string, string> = {
  no_website_found: "No standalone business website was found.",
  no_real_business_website:
    "The listed website is not a standalone business domain.",
  non_tld_or_invalid_domain:
    "The listed website is not a standalone business domain.",
  directory_only_website:
    "The business appears to rely on a directory listing rather than its own website.",
  social_only_presence:
    "The business appears to rely on social media rather than a dedicated website.",
  parked_domain: "The website appears to be parked or unused.",
  invalid_domain: "The listed website does not appear to be a valid business domain.",
  unreachable_or_intermittent: "The website could not be reliably reached.",
  unusable_mobile_experience: "The website appears difficult to use on mobile.",
  old_footer_year:
    "The website footer suggests the site has not been updated recently.",
  clearly_outdated_layout: "The website layout appears dated.",
  slow_load: "The website appears slow to load.",
  ssl_security_warning: "The website may have a security or SSL issue.",
  broken_navigation: "The website navigation appears broken or difficult to use.",
  poor_mobile_cta_visibility:
    "The website does not make it easy for mobile visitors to call or enquire.",
  no_testimonials: "The website does not show testimonials or customer proof.",
  weak_cta: "The website has weak or unclear calls to action.",
  no_trust_badges: "The website lacks visible trust signals.",
  no_gallery: "The website does not show much visual proof of completed work.",
  no_review_embeds: "The website does not highlight customer reviews.",
  generic_stock_content: "The website content appears generic.",
  weak_branding: "The website branding appears weak or inconsistent.",
  inconsistent_colours_fonts:
    "The website has inconsistent colours, fonts, or layout.",
  no_sticky_call_button:
    "The website does not provide a persistent mobile call option.",
  unclear_service_areas: "The website does not clearly explain service areas.",
};

function buildSummary(level: WebsiteOpportunityLevel) {
  if (level === "high") {
    return "Severe website opportunity based on high-confidence signal(s).";
  }

  if (level === "medium") {
    return "Meaningful website opportunity based on multiple medium-strength signals.";
  }

  if (level === "low") {
    return "Lower-priority website opportunity based on multiple weaker signals.";
  }

  if (level === "unranked") {
    return "Insufficient online presence to safely rank; manual review required.";
  }

  return "Not enough qualifying signals found.";
}

function buildIssuesFromSignals(signals: WebsiteOpportunitySignal[]) {
  return dedupeStrings(
    signals.map((signal) => signalIssueText[signal.id] || signal.label)
  );
}

function hasReviewCount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) && parsed > 0;
}

function hasTextArray(value: unknown) {
  return Array.isArray(value) && value.some((item) => getCleanString(item));
}

function buildPositives(args: {
  website: string;
  hasWebsite: boolean;
  hasSocials: boolean;
  homepageHtml: string;
  text: string;
  isReachable: boolean;
  phone?: string | null;
  email?: string | null;
  rating?: string | number | null;
  reviewCount?: string | number | null;
  description?: string | null;
  services?: string[] | null;
}) {
  const positives: string[] = [];

  if (args.website && args.hasWebsite) {
    positives.push("Has a standalone business website.");
  }

  if (getCleanString(args.phone) || /href=["']tel:/i.test(args.homepageHtml)) {
    positives.push("Phone number is available.");
  }

  if (
    getCleanString(args.email) ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(args.homepageHtml)
  ) {
    positives.push("Email contact is available.");
  }

  if (args.hasSocials) {
    positives.push("Social presence found.");
  }

  if (args.isReachable) {
    positives.push("Website is reachable.");
  }

  if (/<meta[^>]+name=["']viewport["']/i.test(args.homepageHtml)) {
    positives.push("Website has basic mobile support.");
  }

  if (hasReviewCount(args.reviewCount) || hasReviewCount(args.rating)) {
    positives.push("Google reviews are available.");
  }

  if (getCleanString(args.description) || hasTextArray(args.services)) {
    positives.push("Core business information is available.");
  }

  return dedupeStrings(positives);
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
  const allSignals = [...highSignals, ...mediumSignals, ...lowSignals];
  const isReachable =
    Boolean(homepageHtml) &&
    evaluation?.isWorking !== false &&
    !args.homepageScrapeFailed;

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
    issues: buildIssuesFromSignals(allSignals),
    positives: buildPositives({
      website,
      hasWebsite,
      hasSocials,
      homepageHtml,
      text,
      isReachable,
      phone: args.phone,
      email: args.email,
      rating: args.rating,
      reviewCount: args.reviewCount,
      description: args.description,
      services: args.services,
    }),
    summary: buildSummary(level),
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

function dedupeStrings(values: unknown[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  values.forEach((value) => {
    const cleaned = getCleanString(value);
    const key = cleaned.toLowerCase();

    if (!cleaned || seen.has(key)) return;

    seen.add(key);
    output.push(cleaned);
  });

  return output;
}

function getLegacyOpportunityLevel(args: BuildOutreachOpportunityContextArgs) {
  const score =
    typeof args.websiteEvaluation?.score === "number"
      ? args.websiteEvaluation.score
      : typeof args.opportunityScore === "number"
        ? args.opportunityScore
        : null;

  if (args.websiteEvaluation?.quality === "none") return "high";
  if (args.websiteEvaluation?.isWorking === false) return "high";
  if (score === null) return "none";
  if (score >= 70) return "high";
  if (score >= 40) return "medium";

  return "none";
}

function getLegacyReason(args: BuildOutreachOpportunityContextArgs) {
  const summary = getCleanString(args.websiteOpportunity?.summary);

  if (summary) return summary;

  const evaluationSummary = getCleanString(args.websiteEvaluation?.summary);

  if (evaluationSummary) return evaluationSummary;

  const level = getLegacyOpportunityLevel(args);

  return level === "none"
    ? "No current website opportunity ranking is available."
    : "Legacy website analysis indicates an opportunity for improvement.";
}

export function buildOutreachOpportunityContext(
  args: BuildOutreachOpportunityContextArgs
): OutreachOpportunityContext {
  const websiteOpportunityV2 = args.websiteOpportunityV2 || null;
  const signals = websiteOpportunityV2
    ? [
        ...websiteOpportunityV2.highSignals,
        ...websiteOpportunityV2.mediumSignals,
        ...websiteOpportunityV2.lowSignals,
      ]
    : [];
  const legacyIssueValues = [
    ...(Array.isArray(args.websiteOpportunity?.issues)
      ? args.websiteOpportunity?.issues || []
      : []),
    args.websiteOpportunity?.issue,
    ...(Array.isArray(args.websiteEvaluation?.issues)
      ? args.websiteEvaluation?.issues || []
      : []),
  ];
  const legacyScore =
    typeof args.websiteEvaluation?.score === "number"
      ? args.websiteEvaluation.score
      : typeof args.opportunityScore === "number"
        ? args.opportunityScore
        : undefined;
  const legacyConfidence = getCleanString(args.websiteEvaluation?.recommendation);

  return {
    level: websiteOpportunityV2?.level || getLegacyOpportunityLevel(args),
    reason: websiteOpportunityV2?.reason || getLegacyReason(args),
    signalLabels: dedupeStrings(signals.map((signal) => signal.label)),
    issues: websiteOpportunityV2
      ? dedupeStrings(websiteOpportunityV2.issues || [])
      : dedupeStrings(legacyIssueValues),
    positives: websiteOpportunityV2
      ? dedupeStrings(websiteOpportunityV2.positives || [])
      : dedupeStrings(
          Array.isArray(args.websiteEvaluation?.positives)
            ? args.websiteEvaluation?.positives || []
            : []
        ),
    summary:
      websiteOpportunityV2?.summary ||
      getCleanString(args.websiteEvaluation?.summary) ||
      "",
    ...(legacyScore !== undefined ? { legacyScore } : {}),
    ...(legacyConfidence ? { legacyConfidence } : {}),
  };
}
