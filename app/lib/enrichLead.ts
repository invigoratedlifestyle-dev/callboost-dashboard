import OpenAI from "openai";
import {
  buildGoogleReviewFields,
  fetchGooglePlaceDetails,
  normalizeGoogleReviews,
} from "./googleReviews";
import {
  normalizeDomain,
  scoreBusinessInfoCandidate,
  type BusinessInfoMatch,
} from "./businessInfoMatch";
import { withLifecycleDefaults } from "./leadLifecycle";
import { enrichLeadFromYellowPages } from "./enrichment/yellowPages";
import { withTradeProfile } from "./leadTargeting/tradeModifiers";
import { getLeadBySlug, updateLeadBySlug } from "./supabase/leads";
const ignoredSearchDomains = [
  "google.com",
  "yelp.com",
  "tripadvisor.com",
];
const BAD_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "yelp",
  "yellowpages",
  "truelocal",
  "wordofmouth",
  "hipages",
  "oneflare",
  "tripadvisor",
];
const CTA_TERMS = [
  "contact",
  "call",
  "quote",
  "enquire",
  "book",
  "service",
  "services",
];

type WebsiteStatus = "no_website" | "weak_website" | "has_website";

type PrimaryBusinessPresenceType =
  | "website"
  | "facebook"
  | "instagram"
  | "directory"
  | "google_business"
  | "unknown";

type PlacesSearchResponse = {
  places?: Array<{
    id?: string;
    displayName?: {
      text?: string;
    };
    websiteUri?: string;
    nationalPhoneNumber?: string;
    formattedAddress?: string;
    primaryTypeDisplayName?: {
      text?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type WebsiteClassification = {
  websiteStatus: WebsiteStatus;
  reasons: string[];
};

type BusinessPresenceMetadata = {
  originalWebsiteUrl?: string;
  canonicalWebsiteUrl?: string;
  primaryBusinessPresenceUrl?: string;
  primaryBusinessPresenceType?: PrimaryBusinessPresenceType;
  inferredDomain?: string;
  inferredDomainChecked?: boolean;
  inferredDomainResponded?: boolean;
  sourceUrl?: string;
  sourceType?: PrimaryBusinessPresenceType;
  extractedEmail?: string;
  extractedPhone?: string;
  extraPhones?: string[];
  extractedAddress?: string;
  extractedSocials?: {
    facebook?: string;
    instagram?: string;
  };
  candidateImages?: string[];
  updatedAt: string;
};

type WebsiteEvaluationQuality =
  | "none"
  | "bad"
  | "weak"
  | "average"
  | "good"
  | "unknown";

type WebsiteEvaluationRecommendation = "target" | "maybe" | "skip";

type WebsiteEvaluation = {
  evaluatedAt: string | null;
  websiteUrl: string | null;
  hasWebsite: boolean;
  isWorking: boolean | null;
  quality: WebsiteEvaluationQuality;
  score: number;
  issues: string[];
  positives: string[];
  summary: string;
  recommendation: WebsiteEvaluationRecommendation;
};

export type EnrichLeadResult = {
  success: boolean;
  lead: Record<string, unknown>;
};

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function normalizeUrl(url?: string) {
  const trimmedUrl = url?.trim() || "";

  if (!trimmedUrl) return "";

  const urlWithProtocol = /^https?:\/\//i.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`;

  try {
    const parsedUrl = new URL(urlWithProtocol);
    parsedUrl.protocol = "https:";
    parsedUrl.hash = "";

    for (const key of [...parsedUrl.searchParams.keys()]) {
      if (
        /^utm_/i.test(key) ||
        ["fbclid", "gclid", "gbraid", "wbraid"].includes(key.toLowerCase())
      ) {
        parsedUrl.searchParams.delete(key);
      }
    }

    return parsedUrl.toString();
  } catch {
    return urlWithProtocol;
  }
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function shouldRunYellowPagesEnrichment(lead: Record<string, unknown>) {
  const yellowPages = getRecord(lead.yellow_pages);

  return !(
    getString(lead.website) &&
    getString(lead.email) &&
    getString(lead.phone) &&
    getString(yellowPages.mobile)
  );
}

async function enrichFromYellowPagesIfNeeded(lead: Record<string, unknown>) {
  if (!shouldRunYellowPagesEnrichment(lead)) {
    return lead;
  }

  return enrichLeadFromYellowPages(lead);
}

function getExistingPrimaryPresenceUrl(lead: Record<string, unknown>) {
  const presence = getRecord(lead.business_presence);

  return (
    getString(presence.primaryBusinessPresenceUrl) ||
    getString(presence.sourceUrl) ||
    getString(presence.originalWebsiteUrl)
  );
}

function isBadDomain(url: string) {
  try {
    const parsedUrl = new URL(normalizeUrl(url));
    const host = parsedUrl.hostname.replace(/^www\./i, "").toLowerCase();

    return BAD_DOMAINS.some(
      (domain) =>
        host.includes(domain) || parsedUrl.href.toLowerCase().includes(domain)
    );
  } catch {
    return true;
  }
}

function getBusinessPresenceType(url: string): PrimaryBusinessPresenceType {
  if (!url) return "unknown";

  try {
    const parsedUrl = new URL(normalizeUrl(url));
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

function isFacebookUrl(url: string) {
  return getBusinessPresenceType(url) === "facebook";
}

function isInstagramUrl(url: string) {
  return getBusinessPresenceType(url) === "instagram";
}

function isSocialOrDirectoryUrl(url: string) {
  return ["facebook", "instagram", "directory", "google_business"].includes(
    getBusinessPresenceType(url)
  );
}

function isCanonicalWebsitePresence(url: string) {
  return Boolean(url) && getBusinessPresenceType(url) === "website";
}

function getEmailDomain(email: string) {
  const domain = email.trim().toLowerCase().split("@")[1] || "";

  if (!domain || ["gmail.com", "outlook.com", "hotmail.com", "icloud.com", "yahoo.com"].includes(domain)) {
    return "";
  }

  return normalizeDomain(domain);
}

function getInferredWebsiteCandidates(email: string) {
  const domain = getEmailDomain(email);

  if (!domain) return [];

  return [`https://${domain}`, `https://www.${domain}`];
}

function getUrlOrigin(url: string) {
  try {
    const parsedUrl = new URL(normalizeUrl(url));

    return parsedUrl.origin;
  } catch {
    return "";
  }
}

function extractMetaContent(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const reverseRegex = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
    "i"
  );

  return html.match(regex)?.[1] || html.match(reverseRegex)?.[1] || "";
}

function toAbsoluteUrl(url: string, baseUrl: string) {
  if (!url) return "";

  try {
    return new URL(url, normalizeUrl(baseUrl)).toString();
  } catch {
    return "";
  }
}

function extractCandidateImages(html: string, baseUrl: string) {
  const images = new Set<string>();
  const ogImage = extractMetaContent(html, "og:image");
  const twitterImage = extractMetaContent(html, "twitter:image");

  for (const image of [ogImage, twitterImage]) {
    const absoluteUrl = toAbsoluteUrl(image, baseUrl);
    if (absoluteUrl) images.add(absoluteUrl);
  }

  const imageRegex = /<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = imageRegex.exec(html)) && images.size < 8) {
    const absoluteUrl = toAbsoluteUrl(match[1], baseUrl);

    if (absoluteUrl) images.add(absoluteUrl);
  }

  return [...images].slice(0, 8);
}

function extractAddress(html: string) {
  const text = stripHtml(html);
  const addressMatch = text.match(
    /\b\d{1,5}\s+[A-Za-z0-9.' -]+(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|court|ct|place|pl|crescent|cres|highway|hwy)\b[^,\n]*(?:,\s*[A-Za-z ]+){0,3}(?:,\s*(?:tas|tasmania|vic|victoria|nsw|qld|sa|wa|nt|act|australia)){0,2}(?:,\s*\d{4})?/i
  );

  return addressMatch?.[0]?.trim() || "";
}

function extractStateFromText(value: string) {
  const text = value.toLowerCase();

  if (/\b(tas|tasmania)\b/.test(text)) return "Tasmania";
  if (/\b(vic|victoria)\b/.test(text)) return "Victoria";
  if (/\b(nsw|new south wales)\b/.test(text)) return "NSW";
  if (/\b(qld|queensland)\b/.test(text)) return "Queensland";
  if (/\b(sa|south australia)\b/.test(text)) return "South Australia";
  if (/\b(wa|western australia)\b/.test(text)) return "Western Australia";
  if (/\b(nt|northern territory)\b/.test(text)) return "Northern Territory";
  if (/\b(act|australian capital territory)\b/.test(text)) return "ACT";

  return "";
}

function extractCountryFromText(value: string) {
  const text = value.toLowerCase();

  if (/\b(australia|tasmania|victoria|new south wales|queensland)\b/.test(text)) {
    return "Australia";
  }

  if (/\b(united states|usa|canada|new zealand|uk|united kingdom)\b/.test(text)) {
    return text.match(/\b(united states|usa|canada|new zealand|uk|united kingdom)\b/i)?.[0] || "";
  }

  return "";
}

function extractCityFromAddress(value: string) {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length >= 2 ? parts[1] : "";
}

async function checkInferredCanonicalWebsite(args: {
  email: string;
  businessName: string;
}) {
  const candidates = getInferredWebsiteCandidates(args.email);
  const inferredDomain = candidates[0] ? normalizeDomain(candidates[0]) : "";

  if (!candidates.length) {
    return {
      inferredDomain,
      checked: false,
      responded: false,
      canonicalWebsiteUrl: "",
    };
  }

  for (const candidate of candidates) {
    try {
      const html = await fetchHtml(candidate);
      const normalizedCandidate = normalizeUrl(candidate);
      const meaningfulParts = getMeaningfulBusinessNameParts(args.businessName);
      const lowerHtml = html.toLowerCase();
      const appearsRelevant =
        meaningfulParts.length === 0 ||
        meaningfulParts.some((part) => lowerHtml.includes(part)) ||
        normalizeDomain(candidate).includes(meaningfulParts[0] || "");

      console.log("BUSINESS_PRESENCE inferred domain check", {
        inferredDomain,
        candidate: normalizedCandidate,
        responded: true,
        appearsRelevant,
      });

      if (appearsRelevant) {
        return {
          inferredDomain,
          checked: true,
          responded: true,
          canonicalWebsiteUrl: getUrlOrigin(normalizedCandidate),
          html,
        };
      }
    } catch (error) {
      console.log("BUSINESS_PRESENCE inferred domain check", {
        inferredDomain,
        candidate,
        responded: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    inferredDomain,
    checked: true,
    responded: false,
    canonicalWebsiteUrl: "",
  };
}

function getMeaningfulBusinessNameParts(businessName: string) {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((part) => part.length >= 4);
}

function classifyWebsite(args: {
  website: string;
  homepageHtml: string;
  businessName: string;
}): WebsiteClassification {
  const website = args.website || "";
  const homepageHtml = args.homepageHtml || "";
  const businessName = args.businessName || "";
  const reasons: string[] = [];

  if (!website) {
    reasons.push("No website found");
    return { websiteStatus: "no_website", reasons };
  }

  if (isBadDomain(website)) {
    reasons.push("Website is a directory or social profile");
    return { websiteStatus: "no_website", reasons };
  }

  if (!homepageHtml.trim()) {
    reasons.push("Homepage failed to load or returned empty HTML");
    return { websiteStatus: "no_website", reasons };
  }

  const lowerHtml = homepageHtml.toLowerCase();
  const meaningfulParts = getMeaningfulBusinessNameParts(businessName);
  const containsBusinessNamePart =
    meaningfulParts.length === 0 ||
    meaningfulParts.some((part) => lowerHtml.includes(part));
  const hasCta = CTA_TERMS.some((term) => lowerHtml.includes(term));

  if (!containsBusinessNamePart) {
    reasons.push("Homepage does not clearly mention the business name");
  }

  if (homepageHtml.length < 1000) {
    reasons.push("Homepage content is very small");
  }

  if (!hasCta) {
    reasons.push("Homepage is missing obvious call-to-action terms");
  }

  if (homepageHtml.length < 1000 || !hasCta) {
    return { websiteStatus: "weak_website", reasons };
  }

  return { websiteStatus: "has_website", reasons };
}

function getPriority(score: number) {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function getRecommendation(score: number): WebsiteEvaluationRecommendation {
  if (score >= 70) return "target";
  if (score >= 40) return "maybe";
  return "skip";
}

function clampScore(score: unknown) {
  const parsed = typeof score === "number" ? score : Number(score);
  const safeScore = Number.isFinite(parsed) ? parsed : 50;

  return Math.max(0, Math.min(Math.round(safeScore), 100));
}

function coerceQuality(value: unknown): WebsiteEvaluationQuality {
  if (
    value === "none" ||
    value === "bad" ||
    value === "weak" ||
    value === "average" ||
    value === "good" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
}

function coerceStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getHtmlSignals(html: string) {
  const lowerHtml = html.toLowerCase();
  const text = stripHtml(html);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const hasPhoneLink = /href=["']tel:/i.test(html);
  const hasForm = /<form\b/i.test(html);
  const hasCta = /(quote|contact|call|book|enquire|estimate)/i.test(text);
  const hasLocalTerms = /(service area|local|nearby|suburb|city|hobart)/i.test(text);
  const hasTrustSignals = /(reviews?|testimonials?|licensed|insured|years|guarantee)/i.test(text);
  const hasOldTech =
    /wp-content|wixstatic|squarespace|weebly|godaddy|table layout|flash/i.test(
      lowerHtml
    );

  return {
    title,
    hasViewport,
    hasPhoneLink,
    hasForm,
    hasCta,
    hasLocalTerms,
    hasTrustSignals,
    hasOldTech,
    textSample: text.slice(0, 5000),
    htmlLength: html.length,
  };
}

function extractJson(text: string) {
  const cleaned = text.trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const objectMatch = cleaned.match(/\{[\s\S]*\}/);

  if (objectMatch?.[0]) {
    return JSON.parse(objectMatch[0]);
  }

  throw new Error("AI response did not contain valid JSON");
}

function normalizeWebsiteEvaluation(args: {
  raw: Record<string, unknown>;
  website: string;
  hasWebsite: boolean;
  isWorking: boolean | null;
}): WebsiteEvaluation {
  const score = clampScore(args.raw.score);
  const quality = coerceQuality(args.raw.quality);
  const recommendation = getRecommendation(score);

  return {
    evaluatedAt: new Date().toISOString(),
    websiteUrl: args.website || null,
    hasWebsite: args.hasWebsite,
    isWorking: args.isWorking,
    quality,
    score,
    issues: coerceStringArray(args.raw.issues),
    positives: coerceStringArray(args.raw.positives),
    summary:
      typeof args.raw.summary === "string"
        ? args.raw.summary.trim().slice(0, 500)
        : "",
    recommendation,
  };
}

function buildStaticWebsiteEvaluation(args: {
  website: string;
  homepageHtml: string;
  isWorking: boolean | null;
  issues: string[];
  positives?: string[];
  quality?: WebsiteEvaluationQuality;
  score?: number;
  summary?: string;
}): WebsiteEvaluation {
  const hasWebsite = Boolean(args.website);
  const score =
    typeof args.score === "number"
      ? clampScore(args.score)
      : !hasWebsite
        ? 98
        : args.isWorking === false
          ? 95
          : 65;
  const quality =
    args.quality || (!hasWebsite ? "none" : args.isWorking === false ? "bad" : "weak");

  return {
    evaluatedAt: new Date().toISOString(),
    websiteUrl: args.website || null,
    hasWebsite,
    isWorking: args.isWorking,
    quality,
    score,
    issues: args.issues,
    positives: args.positives || [],
    summary:
      args.summary ||
      (!hasWebsite
        ? "No website was found, making this a strong target for a simple local business website."
        : "The website appears to have improvement opportunities."),
    recommendation: getRecommendation(score),
  };
}

function heuristicWebsiteEvaluation(args: {
  website: string;
  homepageHtml: string;
  isWorking: boolean | null;
  businessName: string;
  city: string;
  trade: string;
}) {
  if (!args.website) {
    return buildStaticWebsiteEvaluation({
      website: "",
      homepageHtml: "",
      isWorking: null,
      quality: "none",
      score: 98,
      issues: ["No website found"],
    });
  }

  if (args.isWorking === false || !args.homepageHtml.trim()) {
    return buildStaticWebsiteEvaluation({
      website: args.website,
      homepageHtml: "",
      isWorking: false,
      quality: "bad",
      score: 95,
      issues: ["I couldn’t get your site to load on mobile"],
      summary:
        "The website could not be loaded reliably, making this a strong replacement opportunity.",
    });
  }

  const signals = getHtmlSignals(args.homepageHtml);
  const issues: string[] = [];
  const positives: string[] = [];
  let score = 25;

  if (!signals.hasViewport) {
    issues.push("Mobile friendliness is unclear");
    score += 18;
  } else {
    positives.push("Mobile viewport is present");
  }

  if (!signals.hasPhoneLink) {
    issues.push("Phone call-to-action is not prominent");
    score += 15;
  } else {
    positives.push("Phone link is available");
  }

  if (!signals.hasCta) {
    issues.push("No clear quote or contact call-to-action");
    score += 18;
  } else {
    positives.push("Call-to-action language is present");
  }

  if (!signals.hasLocalTerms) {
    issues.push("Local service positioning is weak");
    score += 10;
  }

  if (!signals.hasTrustSignals) {
    issues.push("Trust signals are limited");
    score += 8;
  }

  if (signals.hasOldTech) {
    issues.push("Website may be generic, DIY, or outdated");
    score += 15;
  }

  if (signals.htmlLength < 2500) {
    issues.push("Website content looks thin");
    score += 12;
  }

  const finalScore = clampScore(score);
  const quality: WebsiteEvaluationQuality =
    finalScore >= 80
      ? "bad"
      : finalScore >= 60
        ? "weak"
        : finalScore >= 35
          ? "average"
          : "good";

  return buildStaticWebsiteEvaluation({
    website: args.website,
    homepageHtml: args.homepageHtml,
    isWorking: true,
    quality,
    score: finalScore,
    issues: issues.length ? issues : ["Website appears functional"],
    positives,
    summary:
      finalScore >= 70
        ? "The website has clear conversion or quality gaps and is a good improvement target."
        : finalScore >= 40
          ? "The website has some improvement opportunities, but may need manual review."
          : "The website appears relatively solid compared with stronger opportunities.",
  });
}

async function evaluateWebsiteOpportunity(args: {
  existingLead: Record<string, unknown>;
  website: string;
  homepageHtml: string;
  isWorking: boolean | null;
}) {
  const businessName = getString(args.existingLead.businessName);
  const city = getString(args.existingLead.city);
  const trade = getString(args.existingLead.trade);

  if (!args.website) {
    return buildStaticWebsiteEvaluation({
      website: "",
      homepageHtml: "",
      isWorking: null,
      quality: "none",
      score: 98,
      issues: ["No website found"],
    });
  }

  if (args.isWorking === false || !args.homepageHtml.trim()) {
    return buildStaticWebsiteEvaluation({
      website: args.website,
      homepageHtml: "",
      isWorking: false,
      quality: "bad",
      score: 95,
      issues: ["I couldn’t get your site to load on mobile"],
      summary:
        "The website could not be loaded reliably, making this a strong replacement opportunity.",
    });
  }

  if (!openai) {
    return heuristicWebsiteEvaluation({
      website: args.website,
      homepageHtml: args.homepageHtml,
      isWorking: args.isWorking,
      businessName,
      city,
      trade,
    });
  }

  const signals = getHtmlSignals(args.homepageHtml);
  const prompt = `
Evaluate this local business website as an opportunity for CallBoost.

CallBoost offer:
- Simple professional local business website
- $199 setup + $49.95/month
- Best targets have no website, broken websites, outdated websites, weak conversion, generic DIY sites, poor local positioning, hidden phone/contact CTAs, or poor mobile signals.

Business:
${JSON.stringify(
  {
    businessName,
    city,
    trade,
    website: args.website,
  },
  null,
  2
)}

Website signals:
${JSON.stringify(signals, null, 2)}

Score model:
- No website: 95-100
- Broken/unreachable: 90-100
- Bad/outdated website: 80-95
- Weak/basic website: 60-79
- Average website: 35-59
- Good website: 0-34

Return ONLY valid JSON:
{
  "quality": "bad",
  "score": 86,
  "issues": [
    "Website looks outdated",
    "Phone number is not prominent",
    "No clear quote call-to-action"
  ],
  "positives": [
    "Business name is clear"
  ],
  "summary": "The website is basic and unlikely to convert mobile visitors well.",
  "recommendation": "target"
}
`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You evaluate local business websites for replacement/improvement opportunity. Return only strict JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });
    const content = res.choices[0]?.message.content || "{}";
    const raw = extractJson(content) as Record<string, unknown>;

    return normalizeWebsiteEvaluation({
      raw,
      website: args.website,
      hasWebsite: true,
      isWorking: true,
    });
  } catch (error) {
    console.error("Website AI evaluation failed:", error);

    return heuristicWebsiteEvaluation({
      website: args.website,
      homepageHtml: args.homepageHtml,
      isWorking: args.isWorking,
      businessName,
      city,
      trade,
    });
  }
}

function extractEmail(html: string) {
  const matches = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return matches?.[0] || "";
}

function extractPhone(html: string) {
  const telMatch = html.match(/tel:([^"'\s<>]+)/i);

  if (telMatch?.[1]) return telMatch[1];

  const matches = stripHtml(html).match(
    /(?:\+?61[\s.-]?)?(?:0[\s.-]?)?(?:4\d{2}[\s.-]?\d{3}[\s.-]?\d{3}|[2378][\s.-]?\d{4}[\s.-]?\d{4})/
  );

  return matches?.[0] || "";
}

function extractPhones(html: string) {
  const phones = new Set<string>();
  const telRegex = /tel:([^"'\s<>]+)/gi;
  let telMatch: RegExpExecArray | null;

  while ((telMatch = telRegex.exec(html))) {
    if (telMatch[1]) phones.add(telMatch[1].trim());
  }

  const text = stripHtml(html);
  const phoneRegex =
    /(?:\+?61[\s.-]?)?(?:0[\s.-]?)?(?:4\d{2}[\s.-]?\d{3}[\s.-]?\d{3}|[2378][\s.-]?\d{4}[\s.-]?\d{4})/g;
  let phoneMatch: RegExpExecArray | null;

  while ((phoneMatch = phoneRegex.exec(text))) {
    if (phoneMatch[0]) phones.add(phoneMatch[0].trim());
  }

  return [...phones];
}

function extractLinks(html: string) {
  const links: string[] = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html))) {
    const href = match[1];
    const text = match[2] || "";

    if (href && /(contact|enquiry|inquiry|quote|book)/i.test(`${href} ${text}`)) {
      links.push(href);
    }
  }

  return links;
}

function extractContactPage(html: string, website: string) {
  const contactLink = extractLinks(html)[0];

  if (!contactLink) return "";

  try {
    return new URL(contactLink, website).toString();
  } catch {
    return "";
  }
}

function extractSocial(html: string, platform: "facebook" | "instagram") {
  const regex =
    platform === "facebook"
      ? /https?:\/\/(?:www\.)?facebook\.com\/[^"'\s<>?#]+/i
      : /https?:\/\/(?:www\.)?instagram\.com\/[^"'\s<>?#]+/i;
  const match = html.match(regex);

  return match?.[0] || "";
}

function extractInstagramPresence(html: string) {
  const instagramUrl = extractSocial(html, "instagram");

  if (instagramUrl) return instagramUrl;

  const text = stripHtml(html);
  const handleMatch =
    text.match(/(?:instagram|insta|ig)\s*(?:[:@-]|\bat\b|handle)?\s*@?([A-Za-z0-9._]{3,30})/i) ||
    text.match(/\b([A-Za-z][A-Za-z0-9]*_[A-Za-z0-9._]{3,30})\b/) ||
    text.match(/@([A-Za-z0-9._]{3,30})\b/);
  const handle = handleMatch?.[1]?.replace(/[.]+$/g, "");

  if (!handle) return "";

  return `https://www.instagram.com/${handle}/`;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isIgnoredSearchUrl(value: string) {
  try {
    const host = new URL(value).hostname.replace(/^www\./i, "").toLowerCase();

    return ignoredSearchDomains.some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );
  } catch {
    return true;
  }
}

function cleanGoogleResultUrl(rawUrl: string) {
  const decodedUrl = decodeHtml(rawUrl);

  try {
    const parsedUrl = new URL(decodedUrl, "https://www.google.com");
    const resultUrl =
      parsedUrl.pathname === "/url"
        ? parsedUrl.searchParams.get("q") || parsedUrl.searchParams.get("url")
        : decodedUrl;

    if (!resultUrl || !/^https?:\/\//i.test(resultUrl)) return "";

    return normalizeUrl(resultUrl);
  } catch {
    return "";
  }
}

function extractWebsiteFromGoogleSearch(html: string) {
  const regex = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html))) {
    const resultUrl = cleanGoogleResultUrl(match[1]);

    if (resultUrl && !isIgnoredSearchUrl(resultUrl)) {
      return resultUrl;
    }
  }

  return "";
}

function extractEmailFromGoogleSearch(html: string) {
  return extractEmail(html);
}

function redactContactSample(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(
      /(?:\+?61[\s.-]?)?(?:0[\s.-]?)?(?:4\d{2}[\s.-]?\d{3}[\s.-]?\d{3}|[2378][\s.-]?\d{4}[\s.-]?\d{4})/g,
      "[phone]"
    )
    .slice(0, 300);
}

function isBlockedSocialFetch(htmlOrText: string, url: string) {
  const type = getBusinessPresenceType(url);

  if (type !== "facebook" && type !== "instagram") return false;

  const text = stripHtml(htmlOrText).toLowerCase();
  const meaningfulText = text.replace(/\s+/g, " ").trim();

  return (
    htmlOrText.length < 1200 ||
    meaningfulText.length < 120 ||
    /you must log in|log into facebook|login required|unsupported browser|browser is not supported|enable javascript|temporarily blocked|content isn't available/i.test(
      text
    )
  );
}

async function fetchHtmlWithDebug(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let res: Response;

  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 CallBoost Lead Enrichment",
      },
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timeout);
  }

  const html = await res.text();
  const blocked = isBlockedSocialFetch(html, res.url || url);

  console.log("BUSINESS_PRESENCE_FETCH", {
    sourceUrl: url,
    finalUrl: res.url || url,
    status: res.status,
    ok: res.ok,
    contentLength: html.length,
    blocked,
    sample: redactContactSample(stripHtml(html).replace(/\s+/g, " ").trim()),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }

  return {
    html,
    status: res.status,
    finalUrl: res.url || url,
    blocked,
  };
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let res: Response;

  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 CallBoost Lead Enrichment",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }

  return res.text();
}

async function findWebsiteFromGoogleSearch(businessName?: string, city?: string) {
  const query = `${businessName || ""} ${city || ""} official website`.trim();

  if (!query) {
    return { website: "", email: "" };
  }

  try {
    const params = new URLSearchParams({ q: query });
    const html = await fetchHtml(`https://www.google.com/search?${params}`);
    const website = extractWebsiteFromGoogleSearch(html);
    const email = extractEmailFromGoogleSearch(html);

    console.log("Google snippet:", { website, email });

    return { website, email };
  } catch (error) {
    console.error("Failed to auto-find website:", error);
    return { website: "", email: "" };
  }
}

function extractFacebookCanonicalUrl(html: string) {
  const ogUrl = extractMetaContent(html, "og:url");
  const canonicalMatch = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i
  );
  const reverseCanonicalMatch = html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i
  );
  const canonicalUrl = ogUrl || canonicalMatch?.[1] || reverseCanonicalMatch?.[1] || "";

  if (canonicalUrl && isFacebookUrl(canonicalUrl) && !/profile\.php/i.test(canonicalUrl)) {
    return normalizeUrl(canonicalUrl);
  }

  const handleMatch = html.match(/https?:\/\/(?:www\.)?facebook\.com\/(?!profile\.php)([A-Za-z0-9_.-]+)/i);

  return handleMatch?.[0] ? normalizeUrl(handleMatch[0]) : "";
}

function getFacebookPath(url: string) {
  try {
    const parsedUrl = new URL(normalizeUrl(url));
    return parsedUrl.pathname.replace(/^\/+|\/+$/g, "");
  } catch {
    return "";
  }
}

function mergeTextParts(parts: string[]) {
  return parts.filter(Boolean).join("\n\n");
}

async function searchBusinessPresenceFallback(args: {
  businessName: string;
  city?: string;
  sourceUrl: string;
  existingEmail?: string;
  existingPhone?: string;
}) {
  const facebookPath = getFacebookPath(args.sourceUrl);
  const queries = [
    `"${args.businessName}" "facebook"`,
    args.city ? `"${args.businessName}" "${args.city}" "facebook"` : "",
    args.existingEmail ? `"${args.businessName}" "${args.existingEmail}"` : "",
    args.existingPhone ? `"${args.businessName}" "${args.existingPhone}"` : "",
    facebookPath ? `site:facebook.com/${facebookPath} "${args.businessName}"` : "",
    facebookPath ? `site:facebook.com/${facebookPath} email phone instagram` : "",
  ].filter(Boolean);
  const htmlParts: string[] = [];
  const urls = new Set<string>();

  for (const query of queries) {
    try {
      const params = new URLSearchParams({ q: query });
      const html = await fetchHtml(`https://www.google.com/search?${params}`);
      const canonical = extractFacebookCanonicalUrl(html);

      if (canonical) urls.add(canonical);
      htmlParts.push(html);

      console.log("BUSINESS_PRESENCE fallback search", {
        query,
        contentLength: html.length,
        canonicalFacebookUrl: canonical,
      });
    } catch (error) {
      console.log("BUSINESS_PRESENCE fallback search failed", {
        query,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const html = mergeTextParts(htmlParts);

  return {
    html,
    canonicalFacebookUrl: [...urls][0] || "",
    email: extractEmail(html),
    phones: extractPhones(html),
    instagram: extractInstagramPresence(html),
    address: extractAddress(html),
    candidateImages: extractCandidateImages(html, args.sourceUrl),
  };
}

async function findWebsiteFromPlacesApi(businessName?: string, city?: string) {
  const apiKey =
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY;
  const query = `${businessName || ""} ${city || ""}`.trim();

  if (!apiKey || !query) {
    return { website: "", phone: "", placeId: "" };
  }

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.websiteUri,places.nationalPhoneNumber,places.formattedAddress,places.primaryTypeDisplayName",
      },
      body: JSON.stringify({
        textQuery: query,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Google Places fallback failed: ${res.status} ${errorText}`);
    }

    const data = (await res.json()) as PlacesSearchResponse;

    if (data.error?.message) {
      throw new Error(data.error.message);
    }

    const place = data.places?.find((item) => item.websiteUri);
    const website = normalizeUrl(place?.websiteUri);
    const phone = place?.nationalPhoneNumber || "";
    const address = place?.formattedAddress || "";
    const category = place?.primaryTypeDisplayName?.text || "";

    console.log("Places fallback:", { businessName, website, phone, address });

    return { website, phone, placeId: place?.id || "", address, category };
  } catch (error) {
    console.error("Failed to find website from Places API:", error);
    console.log("Places fallback:", { businessName, website: "", phone: "" });

    return { website: "", phone: "", placeId: "", address: "", category: "" };
  }
}

async function getGoogleReviewFields(args: {
  existingLead: Record<string, unknown>;
  businessName: string;
  placeId: string;
}) {
  const apiKey =
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey || !args.placeId) {
    return buildGoogleReviewFields({
      existingLead: args.existingLead,
      businessName: args.businessName,
      reviews: [],
    });
  }

  try {
    const details = await fetchGooglePlaceDetails(args.placeId, apiKey);
    const reviews = normalizeGoogleReviews(details);

    return buildGoogleReviewFields({
      existingLead: args.existingLead,
      businessName: args.businessName,
      reviews,
    });
  } catch (error) {
    console.error("Failed to fetch Google reviews:", error);

    return buildGoogleReviewFields({
      existingLead: args.existingLead,
      businessName: args.businessName,
      reviews: [],
    });
  }
}

function logQualification(args: {
  websiteStatus: WebsiteStatus;
  reasons: string[];
  score: number;
  priority: string;
  badDomainDetected: boolean;
  homepageScrapeFailed: boolean;
}) {
  console.log("Website status:", args.websiteStatus);
  console.log("Website status reasons:", args.reasons);
  console.log("Lead score:", args.score);
  console.log("Lead priority:", args.priority);
  console.log("Bad domain detected:", args.badDomainDetected);
  console.log("Homepage scrape failed:", args.homepageScrapeFailed);
}

function buildBusinessInfoMatch(args: {
  existingLead: Record<string, unknown>;
  candidateUrl?: string;
  candidateSource: string;
  candidateName?: string;
  candidateWebsite?: string;
  candidateEmail?: string;
  candidatePhone?: string;
  candidateCity?: string;
  candidateState?: string;
  candidateCountry?: string;
  candidateTrade?: string;
  official?: boolean;
  candidateData?: Record<string, unknown>;
}) {
  const match = scoreBusinessInfoCandidate(
    {
      businessName: getString(args.existingLead.businessName),
      displayName: getString(args.existingLead.displayName),
      name: getString(args.existingLead.name),
      phone: getString(args.existingLead.phone),
      email: getString(args.existingLead.email),
      website: getString(args.existingLead.website),
      sourceUrl: getExistingPrimaryPresenceUrl(args.existingLead),
      primaryBusinessPresenceUrl: getExistingPrimaryPresenceUrl(args.existingLead),
      city: getString(args.existingLead.city),
      suburb: getString(args.existingLead.suburb),
      town: getString(args.existingLead.town),
      state: getString(args.existingLead.state),
      region: getString(args.existingLead.region),
      country: getString(args.existingLead.country) || "Australia",
      trade: getString(args.existingLead.trade),
    },
    {
      businessName: args.candidateName,
      phone: args.candidatePhone,
      email: args.candidateEmail,
      website: args.candidateWebsite || args.candidateUrl,
      url: args.candidateUrl || args.candidateWebsite,
      sourceUrl: args.candidateUrl || args.candidateWebsite,
      city: args.candidateCity,
      state: args.candidateState,
      country: args.candidateCountry,
      trade: args.candidateTrade,
      source: args.candidateSource,
      official: args.official,
      data: args.candidateData,
    }
  );

  console.log("BUSINESS_INFO_MATCH", {
    candidateUrl: match.candidate_url,
    candidateSource: match.candidate_source,
    score: match.score,
    confidence: match.confidence,
    reasons: match.reasons,
    autoApplied: match.confidence === "high",
  });

  return match;
}

function buildNoReliableBusinessInfoMatch(
  candidateSource: string
): BusinessInfoMatch {
  return {
    confidence: "low",
    score: 0,
    reasons: ["No reliable external business profile candidate found"],
    matched_fields: {
      phone: false,
      email: false,
      domain: false,
      source: false,
      name: false,
      location: false,
      trade: false,
    },
    candidate_source: candidateSource,
    requires_review: true,
  };
}

function buildBusinessPresenceMetadata(args: {
  existingLead: Record<string, unknown>;
  canonicalWebsiteUrl?: string;
  primaryBusinessPresenceUrl?: string;
  primaryBusinessPresenceType?: PrimaryBusinessPresenceType;
  inferredDomain?: string;
  inferredDomainChecked?: boolean;
  inferredDomainResponded?: boolean;
  sourceUrl?: string;
  sourceType?: PrimaryBusinessPresenceType;
  extractedEmail?: string;
  extractedPhone?: string;
  extraPhones?: string[];
  extractedAddress?: string;
  extractedSocials?: {
    facebook?: string;
    instagram?: string;
  };
  candidateImages?: string[];
}) {
  const existingPresence =
    args.existingLead.business_presence &&
    typeof args.existingLead.business_presence === "object"
      ? (args.existingLead.business_presence as Partial<BusinessPresenceMetadata>)
      : {};

  return {
    ...existingPresence,
    ...(args.canonicalWebsiteUrl
      ? { canonicalWebsiteUrl: args.canonicalWebsiteUrl }
      : {}),
    ...(args.primaryBusinessPresenceUrl
      ? { primaryBusinessPresenceUrl: args.primaryBusinessPresenceUrl }
      : {}),
    ...(args.primaryBusinessPresenceType
      ? { primaryBusinessPresenceType: args.primaryBusinessPresenceType }
      : {}),
    ...(args.inferredDomain ? { inferredDomain: args.inferredDomain } : {}),
    ...(typeof args.inferredDomainChecked === "boolean"
      ? { inferredDomainChecked: args.inferredDomainChecked }
      : {}),
    ...(typeof args.inferredDomainResponded === "boolean"
      ? { inferredDomainResponded: args.inferredDomainResponded }
      : {}),
    ...(args.sourceUrl ? { sourceUrl: args.sourceUrl } : {}),
    ...(args.sourceType ? { sourceType: args.sourceType } : {}),
    ...(args.extractedEmail ? { extractedEmail: args.extractedEmail } : {}),
    ...(args.extractedPhone ? { extractedPhone: args.extractedPhone } : {}),
    ...(args.extraPhones?.length ? { extraPhones: args.extraPhones } : {}),
    ...(args.extractedAddress ? { extractedAddress: args.extractedAddress } : {}),
    ...(args.extractedSocials ? { extractedSocials: args.extractedSocials } : {}),
    ...(args.candidateImages?.length
      ? { candidateImages: args.candidateImages }
      : {}),
    updatedAt: new Date().toISOString(),
  } satisfies BusinessPresenceMetadata;
}

function getExtraPhones(existingPhone: string, extractedPhone: string) {
  if (!existingPhone || !extractedPhone) return [];

  return existingPhone.trim() === extractedPhone.trim() ? [] : [extractedPhone];
}

function buildQualifiedLead(args: {
  existingLead: Record<string, unknown>;
  website: string;
  homepageHtml: string;
  email: string;
  phone: string;
  websiteEvaluation: WebsiteEvaluation;
  contactPage?: string;
  socials?: Record<string, string>;
  badDomainDetected: boolean;
  homepageScrapeFailed: boolean;
  googleReviewFields: Record<string, unknown>;
  businessInfoMatch: BusinessInfoMatch;
  businessPresence: BusinessPresenceMetadata;
}) {
  const socials = args.socials || {
    facebook: getString(args.existingLead.facebook),
    instagram: getString(args.existingLead.instagram),
  };
  const classification = classifyWebsite({
    website: args.website,
    homepageHtml: args.homepageHtml,
    businessName: getString(args.existingLead.businessName),
  });
  const leadScore = args.websiteEvaluation.score;
  const priority = getPriority(leadScore);
  const highConfidenceBusinessInfo = args.businessInfoMatch.confidence === "high";
  const existingFacebook = getString(args.existingLead.facebook);
  const existingInstagram = getString(args.existingLead.instagram);
  const existingPhone = getString(args.existingLead.phone);
  const existingEmail = getString(args.existingLead.email);
  const nextPhone = existingPhone || (highConfidenceBusinessInfo ? args.phone : "");
  const nextEmail = existingEmail || (highConfidenceBusinessInfo ? args.email : "");
  const nextWebsite =
    getString(args.existingLead.website) ||
    (highConfidenceBusinessInfo ? args.website : "");
  const nextFacebook =
    existingFacebook ||
    (highConfidenceBusinessInfo ? socials.facebook || "" : "");
  const nextInstagram =
    existingInstagram ||
    (highConfidenceBusinessInfo ? socials.instagram || "" : "");
  const existingAddress =
    getString(args.existingLead.address) ||
    getString(args.existingLead.formattedAddress);
  const extractedAddress = args.businessPresence.extractedAddress || "";
  const nextAddress =
    existingAddress || (highConfidenceBusinessInfo ? extractedAddress : "");

  logQualification({
    websiteStatus: classification.websiteStatus,
    reasons: classification.reasons,
    score: leadScore,
    priority,
    badDomainDetected: args.badDomainDetected,
    homepageScrapeFailed: args.homepageScrapeFailed,
  });

  return {
    ...withLifecycleDefaults(args.existingLead),
    website: nextWebsite,
    phone: nextPhone,
    email: nextEmail,
    address: nextAddress,
    formattedAddress: nextAddress,
    contactPage: args.contactPage || getString(args.existingLead.contactPage),
    facebook: nextFacebook,
    instagram: nextInstagram,
    business_info_match: args.businessInfoMatch,
    business_presence: args.businessPresence,
    websiteEvaluation: args.websiteEvaluation,
    ...args.googleReviewFields,
    websiteStatus: classification.websiteStatus,
    websiteStatusReasons: classification.reasons,
    leadScore,
    priority,
    enrichedAt: new Date().toISOString(),
  };
}

export async function enrichLead(slug: string, providedWebsite?: string) {
  let existingLead = await getLeadBySlug(slug);

  if (!existingLead) {
    throw new Error("Lead not found");
  }

  const existingWebsite = getString(existingLead.website);
  const existingPrimaryPresenceUrl = getExistingPrimaryPresenceUrl(existingLead);
  const originalPresenceUrl = existingPrimaryPresenceUrl || existingWebsite || providedWebsite || "";
  let normalizedWebsite = normalizeUrl(existingWebsite || providedWebsite);
  if (!normalizedWebsite && existingPrimaryPresenceUrl) {
    normalizedWebsite = normalizeUrl(existingPrimaryPresenceUrl);
  }
  let googleSearchEmail = "";
  let placesPhone = "";
  let placesAddress = "";
  let placesCategory = "";
  let placesPlaceId = getString(existingLead.googlePlaceId) || getString(existingLead.placeId);
  let businessInfoCandidateSource = existingWebsite
    ? "existing_lead_website"
    : existingPrimaryPresenceUrl
      ? "existing_business_presence"
    : providedWebsite
      ? "provided_website"
      : "";
  const businessName = getString(existingLead.businessName);

  if (!normalizedWebsite) {
    const placesResult = await findWebsiteFromPlacesApi(
      businessName,
      getString(existingLead.city)
    );
    normalizedWebsite = placesResult.website;
    placesPhone = placesResult.phone;
    placesAddress = placesResult.address || "";
    placesCategory = placesResult.category || "";
    placesPlaceId = placesPlaceId || placesResult.placeId;
    if (placesResult.website) {
      businessInfoCandidateSource = "google_places";
    }
  }

  if (!normalizedWebsite) {
    const googleSearchResult = await findWebsiteFromGoogleSearch(
      businessName,
      getString(existingLead.city)
    );
    normalizedWebsite = googleSearchResult.website;
    googleSearchEmail = googleSearchResult.email;
    if (googleSearchResult.website) {
      businessInfoCandidateSource = "google_search";
    }
  }

  if (!normalizedWebsite) {
    const yellowPagesLead = await enrichFromYellowPagesIfNeeded(existingLead);
    const yellowPagesWebsite = getString(yellowPagesLead.website);

    if (yellowPagesWebsite) {
      existingLead = yellowPagesLead;
      normalizedWebsite = normalizeUrl(yellowPagesWebsite);
      businessInfoCandidateSource = "yellow_pages";
    } else if (yellowPagesLead !== existingLead) {
      existingLead = yellowPagesLead;
    }
  }

  if (normalizedWebsite) {
    console.log("BUSINESS_PRESENCE start", {
      originalWebsiteUrl: originalPresenceUrl,
      sourceUrl: normalizedWebsite,
      sourceType: getBusinessPresenceType(normalizedWebsite),
      candidateSourceIncluded: true,
    });
  }

  if (!normalizedWebsite) {
    const googleReviewFields = await getGoogleReviewFields({
      existingLead,
      businessName,
      placeId: placesPlaceId,
    });
    const websiteEvaluation = await evaluateWebsiteOpportunity({
      existingLead,
      website: "",
      homepageHtml: "",
      isWorking: null,
    });
    const noReliableMatch = buildNoReliableBusinessInfoMatch("no_website");
    const businessPresence = buildBusinessPresenceMetadata({
      existingLead,
      extractedEmail: googleSearchEmail,
      extractedPhone: placesPhone,
      extractedAddress: placesAddress,
      sourceType: "unknown",
    });
    const updatedLead = buildQualifiedLead({
      existingLead,
      website: "",
      homepageHtml: "",
      email: getString(existingLead.email) || googleSearchEmail,
      phone: getString(existingLead.phone) || placesPhone,
      websiteEvaluation,
      googleReviewFields,
      badDomainDetected: false,
      homepageScrapeFailed: true,
      businessInfoMatch: noReliableMatch,
      businessPresence,
    });

    const yellowPagesLead = await enrichFromYellowPagesIfNeeded(updatedLead);
    const savedLead = await updateLeadBySlug(slug, withTradeProfile(yellowPagesLead));
    return { success: true, lead: savedLead } satisfies EnrichLeadResult;
  }

  const badDomainDetected =
    isSocialOrDirectoryUrl(normalizedWebsite) || isBadDomain(normalizedWebsite);

  if (badDomainDetected) {
    const presenceType = getBusinessPresenceType(normalizedWebsite);
    let presenceHtml = "";
    let presenceFetchFailed = false;
    let presenceFetchBlocked = false;
    let presenceFinalUrl = normalizedWebsite;
    let extractionSource: "direct_fetch" | "fallback_search" | "mixed" | "none" =
      "none";
    let facebookCanonicalized = false;

    try {
      const fetchedPresence = await fetchHtmlWithDebug(normalizedWebsite);
      presenceHtml = fetchedPresence.html;
      presenceFetchBlocked = fetchedPresence.blocked;
      presenceFinalUrl = fetchedPresence.finalUrl;
      extractionSource = presenceFetchBlocked ? "none" : "direct_fetch";
    } catch (error) {
      presenceFetchFailed = true;
      console.log("BUSINESS_PRESENCE profile fetch limited", {
        sourceUrl: normalizedWebsite,
        sourceType: presenceType,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    const extractedEmail = presenceHtml ? extractEmail(presenceHtml) : "";
    const directPhones = presenceHtml ? extractPhones(presenceHtml) : [];
    const extractedAddress = presenceHtml ? extractAddress(presenceHtml) : "";
    const directFacebookCanonical = presenceHtml
      ? extractFacebookCanonicalUrl(presenceHtml)
      : "";
    const redirectedFacebookCanonical =
      isFacebookUrl(presenceFinalUrl) && !/profile\.php/i.test(presenceFinalUrl)
        ? normalizeUrl(presenceFinalUrl)
        : "";
    const shouldFallbackSearch =
      (presenceType === "facebook" || presenceType === "instagram") &&
      (presenceFetchBlocked ||
        (!extractedEmail &&
          directPhones.length === 0 &&
          !extractedAddress &&
          !extractInstagramPresence(presenceHtml)));
    const fallback = shouldFallbackSearch
      ? await searchBusinessPresenceFallback({
          businessName,
          city: getString(existingLead.city),
          sourceUrl: normalizedWebsite,
          existingEmail: getString(existingLead.email),
          existingPhone: getString(existingLead.phone),
        })
      : {
          html: "",
          canonicalFacebookUrl: "",
          email: "",
          phones: [] as string[],
          instagram: "",
          address: "",
          candidateImages: [] as string[],
        };
    const combinedPresenceText = mergeTextParts([presenceHtml, fallback.html]);
    const resolvedFacebookUrl =
      redirectedFacebookCanonical ||
      directFacebookCanonical ||
      fallback.canonicalFacebookUrl ||
      normalizedWebsite;
    facebookCanonicalized =
      Boolean(
        (redirectedFacebookCanonical ||
          directFacebookCanonical ||
          fallback.canonicalFacebookUrl) &&
          isFacebookUrl(normalizedWebsite)
      ) &&
      resolvedFacebookUrl !== normalizedWebsite;
    const allExtractedPhones = [...new Set([...directPhones, ...fallback.phones])];
    const bestExtractedPhone =
      allExtractedPhones.find((phoneValue) => /(?:\+?61[\s.-]?)?(?:0[\s.-]?)?4/.test(phoneValue)) ||
      allExtractedPhones[0] ||
      "";
    const bestExtractedEmail = extractedEmail || fallback.email;
    const bestExtractedAddress = extractedAddress || fallback.address;
    const bestExtractedInstagram =
      extractInstagramPresence(combinedPresenceText) || fallback.instagram;
    const candidateImages = [
      ...new Set([
        ...(presenceHtml ? extractCandidateImages(presenceHtml, normalizedWebsite) : []),
        ...fallback.candidateImages,
      ]),
    ].slice(0, 8);

    if (fallback.html) {
      extractionSource = presenceHtml && !presenceFetchBlocked ? "mixed" : "fallback_search";
    }

    const facebook =
      isFacebookUrl(normalizedWebsite)
        ? resolvedFacebookUrl
        : presenceHtml
          ? extractSocial(presenceHtml, "facebook")
          : "";
    const instagram =
      isInstagramUrl(normalizedWebsite)
        ? normalizedWebsite
        : bestExtractedInstagram;
    const candidateAddress = bestExtractedAddress || placesAddress;
    const email = getString(existingLead.email) || googleSearchEmail || bestExtractedEmail;
    const inferredWebsite = await checkInferredCanonicalWebsite({
      email,
      businessName,
    });
    const businessInfoMatch = buildBusinessInfoMatch({
      existingLead,
      candidateUrl: normalizedWebsite,
      candidateSource: businessInfoCandidateSource || presenceType,
      candidateName: businessName,
      candidateEmail: bestExtractedEmail || googleSearchEmail,
      candidatePhone: bestExtractedPhone || placesPhone,
      candidateCity: extractCityFromAddress(candidateAddress) || undefined,
      candidateState: extractStateFromText(candidateAddress) || undefined,
      candidateCountry: extractCountryFromText(candidateAddress) || undefined,
      candidateTrade: placesCategory,
      official: false,
      candidateData: {
        extractionSource,
        finalUrl: presenceFinalUrl,
        email: bestExtractedEmail || googleSearchEmail,
        phone: bestExtractedPhone || placesPhone,
        phones: allExtractedPhones,
        address: candidateAddress,
        facebook,
        instagram,
        candidateImages,
      },
    });
    const businessPresence = buildBusinessPresenceMetadata({
      existingLead,
      canonicalWebsiteUrl: inferredWebsite.canonicalWebsiteUrl,
      primaryBusinessPresenceUrl:
        businessInfoMatch.confidence === "high" ? normalizedWebsite : undefined,
      primaryBusinessPresenceType:
        businessInfoMatch.confidence === "high" ? presenceType : undefined,
      inferredDomain: inferredWebsite.inferredDomain,
      inferredDomainChecked: inferredWebsite.checked,
      inferredDomainResponded: inferredWebsite.responded,
      sourceUrl: normalizedWebsite,
      sourceType: presenceType,
      extractedEmail: bestExtractedEmail || googleSearchEmail,
      extractedPhone: bestExtractedPhone || placesPhone,
      extraPhones: getExtraPhones(
        getString(existingLead.phone),
        bestExtractedPhone || placesPhone
      ),
      extractedAddress: candidateAddress,
      extractedSocials: {
        facebook,
        instagram,
      },
      candidateImages,
    });

    console.log("BUSINESS_PRESENCE result", {
      sourceUrl: normalizedWebsite,
      sourceType: presenceType,
      extractionSource,
      fetchedFinalUrl: presenceFinalUrl,
      directFetchBlocked: presenceFetchBlocked,
      extractedEmail: bestExtractedEmail || googleSearchEmail,
      extractedPhones: allExtractedPhones,
      extraPhones: getExtraPhones(getString(existingLead.phone), bestExtractedPhone),
      extractedAddress: candidateAddress,
      extractedSocials: { facebook, instagram },
      facebookCanonicalized,
      inferredDomain: inferredWebsite.inferredDomain,
      inferredDomainResponded: inferredWebsite.responded,
      confidence: businessInfoMatch.confidence,
      score: businessInfoMatch.score,
      reasons: businessInfoMatch.reasons,
      action:
        businessInfoMatch.confidence === "high"
          ? "auto_applied_primary_presence"
          : businessInfoMatch.confidence === "medium"
            ? "stored_for_review"
            : "rejected_or_fallback",
    });

    const googleReviewFields = await getGoogleReviewFields({
      existingLead,
      businessName,
      placeId: placesPlaceId,
    });
    const websiteEvaluation = buildStaticWebsiteEvaluation({
      website: normalizedWebsite,
      homepageHtml: "",
      isWorking: false,
      quality: "none",
      score: 96,
      issues: ["Website is a directory or social profile"],
      summary:
        "The listed website is not a usable owned business website, making this a strong target.",
    });
    const updatedLead = buildQualifiedLead({
      existingLead,
      website: inferredWebsite.canonicalWebsiteUrl,
      homepageHtml: inferredWebsite.html || "",
      email,
      phone: getString(existingLead.phone) || placesPhone || bestExtractedPhone,
      websiteEvaluation,
      googleReviewFields,
      badDomainDetected,
      homepageScrapeFailed: presenceFetchFailed,
      businessInfoMatch,
      businessPresence,
      socials: {
        facebook,
        instagram,
      },
    });

    console.log("BUSINESS_PRESENCE final fields applied", {
      website: getString(updatedLead.website),
      facebook: getString(updatedLead.facebook),
      instagram: getString(updatedLead.instagram),
      email: getString(updatedLead.email),
      phone: getString(updatedLead.phone),
      extractionSource,
      extractedEmail: bestExtractedEmail || googleSearchEmail,
      extractedPhones: allExtractedPhones,
      extraPhones: businessPresence.extraPhones || [],
      extractedInstagram: instagram,
      extractedAddress: candidateAddress,
      facebookCanonicalized,
      primaryBusinessPresenceUrl: businessPresence.primaryBusinessPresenceUrl,
      primaryBusinessPresenceType: businessPresence.primaryBusinessPresenceType,
    });

    const yellowPagesLead = await enrichFromYellowPagesIfNeeded(updatedLead);
    const savedLead = await updateLeadBySlug(slug, withTradeProfile(yellowPagesLead));
    return { success: true, lead: savedLead } satisfies EnrichLeadResult;
  }

  let homeHtml = "";

  try {
    homeHtml = await fetchHtml(normalizedWebsite);
  } catch (error) {
    console.error("Failed to fetch website:", error);

    const googleReviewFields = await getGoogleReviewFields({
      existingLead,
      businessName,
      placeId: placesPlaceId,
    });
    const websiteEvaluation = await evaluateWebsiteOpportunity({
      existingLead,
      website: normalizedWebsite,
      homepageHtml: "",
      isWorking: false,
    });
    const businessInfoMatch = buildBusinessInfoMatch({
      existingLead,
      candidateUrl: normalizedWebsite,
      candidateSource: businessInfoCandidateSource || "website_fetch_failed",
      candidateWebsite: normalizedWebsite,
      candidateEmail: googleSearchEmail,
      candidatePhone: placesPhone,
      candidateCity: placesAddress || undefined,
      candidateState: placesAddress || undefined,
      candidateCountry: placesAddress ? "Australia" : undefined,
      candidateTrade: placesCategory,
      official: isCanonicalWebsitePresence(normalizedWebsite),
      candidateData: {
        email: googleSearchEmail,
        phone: placesPhone,
        address: placesAddress,
      },
    });
    const inferredWebsite = await checkInferredCanonicalWebsite({
      email: getString(existingLead.email) || googleSearchEmail,
      businessName,
    });
    const businessPresence = buildBusinessPresenceMetadata({
      existingLead,
      canonicalWebsiteUrl:
        businessInfoMatch.confidence === "high"
          ? normalizedWebsite
          : inferredWebsite.canonicalWebsiteUrl,
      primaryBusinessPresenceUrl:
        businessInfoMatch.confidence === "high" ? normalizedWebsite : undefined,
      primaryBusinessPresenceType:
        businessInfoMatch.confidence === "high"
          ? getBusinessPresenceType(normalizedWebsite)
          : undefined,
      inferredDomain: inferredWebsite.inferredDomain,
      inferredDomainChecked: inferredWebsite.checked,
      inferredDomainResponded: inferredWebsite.responded,
      sourceUrl: normalizedWebsite,
      sourceType: getBusinessPresenceType(normalizedWebsite),
      extractedEmail: googleSearchEmail,
      extractedPhone: placesPhone,
      extractedAddress: placesAddress,
    });
    const updatedLead = buildQualifiedLead({
      existingLead,
      website:
        businessInfoMatch.confidence === "high"
          ? normalizedWebsite
          : inferredWebsite.canonicalWebsiteUrl,
      homepageHtml: "",
      email: getString(existingLead.email) || googleSearchEmail,
      phone: getString(existingLead.phone) || placesPhone,
      websiteEvaluation,
      googleReviewFields,
      badDomainDetected,
      homepageScrapeFailed: true,
      businessInfoMatch,
      businessPresence,
    });

    const yellowPagesLead = await enrichFromYellowPagesIfNeeded(updatedLead);
    const savedLead = await updateLeadBySlug(slug, withTradeProfile(yellowPagesLead));
    return { success: true, lead: savedLead } satisfies EnrichLeadResult;
  }

  const contactPage = extractContactPage(homeHtml, normalizedWebsite);
  let contactHtml = "";

  if (contactPage) {
    try {
      contactHtml = await fetchHtml(contactPage);
    } catch {
      contactHtml = "";
    }
  }

  const combinedHtml = `${homeHtml}\n${contactHtml}`;
  const extractedEmail = extractEmail(combinedHtml);
  const extractedPhone = extractPhone(combinedHtml);
  const extractedAddress = extractAddress(combinedHtml);
  const facebook = extractSocial(combinedHtml, "facebook");
  const instagram = extractInstagramPresence(combinedHtml);
  const email = getString(existingLead.email) || googleSearchEmail || extractedEmail || "";
  const phone = getString(existingLead.phone) || placesPhone || extractedPhone || "";
  const candidateImages = extractCandidateImages(combinedHtml, normalizedWebsite);
  const candidateAddress = extractedAddress || placesAddress;
  const socials = {
    facebook: facebook || getString(existingLead.facebook),
    instagram: instagram || getString(existingLead.instagram),
  };
  const savedContactPage = contactPage || getString(existingLead.contactPage);

  console.log("Enrich result:", { email, contactPage: savedContactPage });

  const googleReviewFields = await getGoogleReviewFields({
    existingLead,
    businessName,
    placeId: placesPlaceId,
  });
  const websiteEvaluation = await evaluateWebsiteOpportunity({
    existingLead,
    website: normalizedWebsite,
    homepageHtml: homeHtml,
    isWorking: true,
  });
  const businessInfoMatch = buildBusinessInfoMatch({
    existingLead,
    candidateUrl: normalizedWebsite,
    candidateSource: businessInfoCandidateSource || "website",
    candidateName: businessName,
    candidateWebsite: normalizedWebsite,
    candidateEmail: extractedEmail || googleSearchEmail,
    candidatePhone: extractedPhone || placesPhone,
    candidateCity: extractCityFromAddress(candidateAddress) || undefined,
    candidateState: extractStateFromText(candidateAddress) || undefined,
    candidateCountry: extractCountryFromText(candidateAddress) || undefined,
    candidateTrade: placesCategory,
    official: true,
    candidateData: {
      contactPage: savedContactPage,
      email: extractedEmail || googleSearchEmail,
      phone: extractedPhone || placesPhone,
      address: candidateAddress,
      facebook,
      instagram,
      candidateImages,
    },
  });
  const inferredWebsite = await checkInferredCanonicalWebsite({
    email,
    businessName,
  });
  const businessPresence = buildBusinessPresenceMetadata({
    existingLead,
    canonicalWebsiteUrl:
      businessInfoMatch.confidence === "high"
        ? normalizedWebsite
        : inferredWebsite.canonicalWebsiteUrl,
    primaryBusinessPresenceUrl:
      businessInfoMatch.confidence === "high" ? normalizedWebsite : undefined,
    primaryBusinessPresenceType:
      businessInfoMatch.confidence === "high" ? "website" : undefined,
    inferredDomain: inferredWebsite.inferredDomain,
    inferredDomainChecked: inferredWebsite.checked,
    inferredDomainResponded: inferredWebsite.responded,
    sourceUrl: normalizedWebsite,
    sourceType: "website",
    extractedEmail: extractedEmail || googleSearchEmail,
    extractedPhone: extractedPhone || placesPhone,
    extraPhones: getExtraPhones(
      getString(existingLead.phone),
      extractedPhone || placesPhone
    ),
    extractedAddress: candidateAddress,
    extractedSocials: {
      facebook,
      instagram,
    },
    candidateImages,
  });

  console.log("BUSINESS_PRESENCE result", {
    sourceUrl: normalizedWebsite,
    sourceType: "website",
    extractedEmail: extractedEmail || googleSearchEmail,
    extractedPhone: extractedPhone || placesPhone,
    extractedAddress: candidateAddress,
    inferredDomain: inferredWebsite.inferredDomain,
    inferredDomainResponded: inferredWebsite.responded,
    confidence: businessInfoMatch.confidence,
    score: businessInfoMatch.score,
    reasons: businessInfoMatch.reasons,
    action:
      businessInfoMatch.confidence === "high"
        ? "auto_applied_canonical_website"
        : businessInfoMatch.confidence === "medium"
          ? "stored_for_review"
          : "rejected_or_fallback",
  });
  const updatedLead = buildQualifiedLead({
    existingLead,
    website:
      businessInfoMatch.confidence === "high"
        ? normalizedWebsite
        : inferredWebsite.canonicalWebsiteUrl,
    homepageHtml: homeHtml,
    email,
    phone,
    websiteEvaluation,
    googleReviewFields,
    contactPage: savedContactPage,
    socials,
    badDomainDetected,
    homepageScrapeFailed: false,
    businessInfoMatch,
    businessPresence,
  });

  const yellowPagesLead = await enrichFromYellowPagesIfNeeded(updatedLead);
  const savedLead = await updateLeadBySlug(slug, withTradeProfile(yellowPagesLead));
  return { success: true, lead: savedLead } satisfies EnrichLeadResult;
}
