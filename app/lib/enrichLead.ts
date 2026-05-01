import OpenAI from "openai";
import {
  buildGoogleReviewFields,
  fetchGooglePlaceDetails,
  normalizeGoogleReviews,
} from "./googleReviews";
import { withLifecycleDefaults } from "./leadLifecycle";
import { getLeadBySlug, updateLeadBySlug } from "./supabase/leads";
const ignoredSearchDomains = [
  "google.com",
  "facebook.com",
  "instagram.com",
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

type PlacesSearchResponse = {
  places?: Array<{
    id?: string;
    displayName?: {
      text?: string;
    };
    websiteUri?: string;
    nationalPhoneNumber?: string;
  }>;
  error?: {
    message?: string;
  };
};

type WebsiteClassification = {
  websiteStatus: WebsiteStatus;
  reasons: string[];
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
      issues: ["Website may be broken or unreachable"],
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
      issues: ["Website may be broken or unreachable"],
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
- $99 setup + $99/month
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
          "places.id,places.displayName,places.websiteUri,places.nationalPhoneNumber",
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

    console.log("Places fallback:", { businessName, website, phone });

    return { website, phone, placeId: place?.id || "" };
  } catch (error) {
    console.error("Failed to find website from Places API:", error);
    console.log("Places fallback:", { businessName, website: "", phone: "" });

    return { website: "", phone: "", placeId: "" };
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
    website: getString(args.existingLead.website) || args.website,
    phone: args.phone,
    email: args.email,
    contactPage: args.contactPage || getString(args.existingLead.contactPage),
    facebook: socials.facebook || "",
    instagram: socials.instagram || "",
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
  const existingLead = await getLeadBySlug(slug);

  if (!existingLead) {
    throw new Error("Lead not found");
  }

  let normalizedWebsite = normalizeUrl(getString(existingLead.website) || providedWebsite);
  let googleSearchEmail = "";
  let placesPhone = "";
  let placesPlaceId = getString(existingLead.googlePlaceId) || getString(existingLead.placeId);
  const businessName = getString(existingLead.businessName);

  if (!normalizedWebsite) {
    const placesResult = await findWebsiteFromPlacesApi(
      businessName,
      getString(existingLead.city)
    );
    normalizedWebsite = placesResult.website;
    placesPhone = placesResult.phone;
    placesPlaceId = placesPlaceId || placesResult.placeId;
  }

  if (!normalizedWebsite) {
    const googleSearchResult = await findWebsiteFromGoogleSearch(
      businessName,
      getString(existingLead.city)
    );
    normalizedWebsite = googleSearchResult.website;
    googleSearchEmail = googleSearchResult.email;
  }

  if (normalizedWebsite) {
    console.log("Auto-found website:", normalizedWebsite);
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
    });

    const savedLead = await updateLeadBySlug(slug, updatedLead);
    return { success: true, lead: savedLead } satisfies EnrichLeadResult;
  }

  const badDomainDetected = isBadDomain(normalizedWebsite);

  if (badDomainDetected) {
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
      website: normalizedWebsite,
      homepageHtml: "",
      email: getString(existingLead.email) || googleSearchEmail,
      phone: getString(existingLead.phone) || placesPhone,
      websiteEvaluation,
      googleReviewFields,
      badDomainDetected,
      homepageScrapeFailed: false,
    });

    const savedLead = await updateLeadBySlug(slug, updatedLead);
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
    const updatedLead = buildQualifiedLead({
      existingLead,
      website: normalizedWebsite,
      homepageHtml: "",
      email: getString(existingLead.email) || googleSearchEmail,
      phone: getString(existingLead.phone) || placesPhone,
      websiteEvaluation,
      googleReviewFields,
      badDomainDetected,
      homepageScrapeFailed: true,
    });

    const savedLead = await updateLeadBySlug(slug, updatedLead);
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
  const facebook = extractSocial(combinedHtml, "facebook");
  const instagram = extractSocial(combinedHtml, "instagram");
  const email = getString(existingLead.email) || googleSearchEmail || extractedEmail || "";
  const phone = getString(existingLead.phone) || placesPhone || "";
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
  const updatedLead = buildQualifiedLead({
    existingLead,
    website: normalizedWebsite,
    homepageHtml: homeHtml,
    email,
    phone,
    websiteEvaluation,
    googleReviewFields,
    contactPage: savedContactPage,
    socials,
    badDomainDetected,
    homepageScrapeFailed: false,
  });

  const savedLead = await updateLeadBySlug(slug, updatedLead);
  return { success: true, lead: savedLead } satisfies EnrichLeadResult;
}
