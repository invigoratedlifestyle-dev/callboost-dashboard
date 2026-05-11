export type BusinessInfoConfidence = "high" | "medium" | "low" | "rejected";

export type BusinessInfoMatch = {
  confidence: BusinessInfoConfidence;
  score: number;
  reasons: string[];
  matched_fields: {
    phone: boolean;
    email: boolean;
    domain: boolean;
    source: boolean;
    name: boolean;
    location: boolean;
    trade: boolean;
  };
  candidate_url?: string;
  candidate_source?: string;
  requires_review: boolean;
  candidate_data?: Record<string, unknown>;
};

export type LeadMatchInput = {
  businessName?: string;
  displayName?: string;
  name?: string;
  phone?: string;
  email?: string;
  website?: string;
  sourceUrl?: string;
  primaryBusinessPresenceUrl?: string;
  city?: string;
  suburb?: string;
  town?: string;
  state?: string;
  region?: string;
  country?: string;
  trade?: string;
};

export type CandidateMatchInput = LeadMatchInput & {
  url?: string;
  source?: string;
  official?: boolean;
  data?: Record<string, unknown>;
};

const AU_COUNTRY_TERMS = new Set(["australia", "au", "aus"]);
const STATE_ALIASES: Record<string, string> = {
  tasmania: "tas",
  tas: "tas",
  victoria: "vic",
  vic: "vic",
  "new south wales": "nsw",
  nsw: "nsw",
  queensland: "qld",
  qld: "qld",
  "south australia": "sa",
  sa: "sa",
  "western australia": "wa",
  wa: "wa",
  "northern territory": "nt",
  nt: "nt",
  "australian capital territory": "act",
  act: "act",
};

function cleanText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeDomain(value: unknown) {
  const text = String(value || "").trim();

  if (!text) return "";

  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);

    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return text
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split(/[/?#]/)[0]
      .toLowerCase();
  }
}

function normalizeComparableUrl(value: unknown) {
  const text = String(value || "").trim();

  if (!text) return "";

  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ["fbclid", "gclid"].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    return `${url.hostname.replace(/^www\./i, "").toLowerCase()}${url.pathname
      .replace(/\/+$/g, "")
      .toLowerCase()}${url.search}`;
  } catch {
    return text
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/g, "")
      .toLowerCase();
  }
}

export function normalizeBusinessName(value: unknown) {
  return cleanText(value)
    .replace(/\b(pty|ltd|limited|company|co|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLocation(value: unknown) {
  const normalized = cleanText(value);

  return STATE_ALIASES[normalized] || normalized;
}

export function normalizePhoneNumber(value: unknown) {
  const raw = String(value || "")
    .replace(/^tel:/i, "")
    .replace(/[^\d+]/g, "");

  if (!raw) return "";

  let digits = raw.startsWith("+") ? raw.slice(1) : raw;

  if (digits.startsWith("61")) {
    digits = `0${digits.slice(2)}`;
  }

  if (digits.length === 9 && /^[23478]/.test(digits)) {
    digits = `0${digits}`;
  }

  return digits.replace(/\D/g, "");
}

function getLeadName(lead: LeadMatchInput) {
  return (
    normalizeBusinessName(lead.displayName) ||
    normalizeBusinessName(lead.businessName) ||
    normalizeBusinessName(lead.name)
  );
}

function tokenOverlap(a: string, b: string) {
  const aTokens = new Set(a.split(" ").filter((token) => token.length >= 3));
  const bTokens = b.split(" ").filter((token) => token.length >= 3);

  if (!aTokens.size || !bTokens.length) return 0;

  const matches = bTokens.filter((token) => aTokens.has(token)).length;

  return matches / Math.max(aTokens.size, bTokens.length);
}

function getCountry(value: unknown) {
  const normalized = normalizeLocation(value);

  return AU_COUNTRY_TERMS.has(normalized) ? "australia" : normalized;
}

function getState(value: unknown) {
  return normalizeLocation(value);
}

function getCityish(input: LeadMatchInput) {
  return (
    normalizeLocation(input.suburb) ||
    normalizeLocation(input.town) ||
    normalizeLocation(input.city)
  );
}

function getConfidence(args: {
  score: number;
  strongMatch: boolean;
  strongContradiction: boolean;
  matchedName: boolean;
  matchedLocation: boolean;
  matchedTrade: boolean;
}) {
  if (args.strongContradiction || args.score < 0) return "rejected";
  if (args.strongMatch) return "high";
  if (args.matchedName && args.matchedLocation && args.matchedTrade) {
    return "medium";
  }
  if (args.score >= 55 && args.matchedName && args.matchedLocation) return "medium";
  if (args.score >= 30) return "low";

  return "low";
}

export function scoreBusinessInfoCandidate(
  lead: LeadMatchInput,
  candidate: CandidateMatchInput
): BusinessInfoMatch {
  let score = 0;
  const reasons: string[] = [];
  const leadPhone = normalizePhoneNumber(lead.phone);
  const candidatePhone = normalizePhoneNumber(candidate.phone);
  const leadEmail = normalizeEmail(lead.email);
  const candidateEmail = normalizeEmail(candidate.email);
  const leadDomain = normalizeDomain(lead.website);
  const candidateDomain = normalizeDomain(candidate.website || candidate.url);
  const leadSourceUrl = normalizeComparableUrl(
    lead.primaryBusinessPresenceUrl || lead.sourceUrl
  );
  const candidateSourceUrl = normalizeComparableUrl(candidate.url || candidate.sourceUrl);
  const leadName = getLeadName(lead);
  const candidateName = getLeadName(candidate);
  const leadCity = getCityish(lead);
  const candidateCity = getCityish(candidate);
  const leadState = getState(lead.state || lead.region);
  const candidateState = getState(candidate.state || candidate.region);
  const leadCountry = getCountry(lead.country || "australia");
  const candidateCountry = getCountry(candidate.country);
  const leadTrade = cleanText(lead.trade);
  const candidateTrade = cleanText(candidate.trade);
  const matched = {
    phone: Boolean(leadPhone && candidatePhone && leadPhone === candidatePhone),
    email: Boolean(leadEmail && candidateEmail && leadEmail === candidateEmail),
    domain: Boolean(leadDomain && candidateDomain && leadDomain === candidateDomain),
    source: Boolean(
      leadSourceUrl && candidateSourceUrl && leadSourceUrl === candidateSourceUrl
    ),
    name: false,
    location: false,
    trade: false,
  };

  if (matched.phone) {
    score += 100;
    reasons.push("Exact phone match");
  }

  if (matched.email) {
    score += 100;
    reasons.push("Exact email match");
  }

  if (matched.domain) {
    score += 100;
    reasons.push("Exact domain match");
  }

  if (matched.source) {
    score += 100;
    reasons.push("Exact saved business presence URL match");
  }

  const nameOverlap = tokenOverlap(leadName, candidateName);

  if (leadName && candidateName && (leadName === candidateName || nameOverlap >= 0.6)) {
    score += 25;
    matched.name = true;
    reasons.push("Business name matches");
  }

  if (leadCity && candidateCity && leadCity === candidateCity) {
    score += 25;
    matched.location = true;
    reasons.push("City/suburb matches");
  }

  if (leadState && candidateState && leadState === candidateState) {
    score += 15;
    matched.location = true;
    reasons.push("State/region matches");
  }

  if (candidateCountry && leadCountry && candidateCountry === leadCountry) {
    score += 10;
    reasons.push("Country matches");
  }

  if (
    leadTrade &&
    candidateTrade &&
    (leadTrade.includes(candidateTrade) || candidateTrade.includes(leadTrade))
  ) {
    score += 15;
    matched.trade = true;
    reasons.push("Trade/category matches");
  }

  if (candidate.official) {
    score += 10;
    reasons.push("Official-looking source");
  }

  const strongMatch = matched.phone || matched.email || matched.domain || matched.source;
  let strongContradiction = false;

  if (candidateCountry && leadCountry && candidateCountry !== leadCountry) {
    score -= 100;
    strongContradiction = true;
    reasons.push("Wrong country");
  }

  if (!strongMatch && leadState && candidateState && leadState !== candidateState) {
    score -= 60;
    strongContradiction = true;
    reasons.push("Wrong state/region without phone, email, or domain match");
  }

  if (
    !strongMatch &&
    leadTrade &&
    candidateTrade &&
    !leadTrade.includes(candidateTrade) &&
    !candidateTrade.includes(leadTrade)
  ) {
    score -= 40;
    reasons.push("Different trade/category");
  }

  if (matched.name && !matched.location && !matched.trade && !strongMatch) {
    reasons.push("Name-only match is not enough to auto-apply");
  }

  const confidence = getConfidence({
    score,
    strongMatch,
    strongContradiction,
    matchedName: matched.name,
    matchedLocation: matched.location,
    matchedTrade: matched.trade,
  });

  return {
    confidence,
    score,
    reasons: reasons.length ? reasons : ["No strong match signals found"],
    matched_fields: matched,
    candidate_url: candidate.url || candidate.website,
    candidate_source: candidate.source,
    requires_review: confidence !== "high",
    ...(candidate.data ? { candidate_data: candidate.data } : {}),
  };
}
