import "server-only";

export type YellowPagesDetails = {
  url: string;
  website?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  abn?: string;
  established_year?: string;
  category?: string;
  payment_methods?: string[];
  opening_hours?: string[];
  years_in_business?: string;
  scraped_at: string;
};

export type YellowPagesCandidate = {
  title: string;
  url: string;
  snippet?: string;
};

export type YellowPagesSearchResult = {
  query: string;
  candidates: YellowPagesCandidate[];
  chosenUrl: string;
  reason: string;
};

type LeadLike = Record<string, unknown>;

const YELLOW_PAGES_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const YELLOW_PAGES_TIMEOUT_MS = 10000;

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCharCode(parseInt(code, 16))
    );
}

function stripHtml(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchTextWithTimeout(url: string, timeoutMs = YELLOW_PAGES_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-AU,en;q=0.9",
        "user-agent": YELLOW_PAGES_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function getLeadName(lead: LeadLike) {
  return (
    getString(lead.businessName) ||
    getString(lead.displayName) ||
    getString(lead.name)
  );
}

function getLeadSuburb(lead: LeadLike) {
  return getString(lead.city) || getString(lead.town) || getString(lead.suburb);
}

function getLeadState(lead: LeadLike) {
  return (
    getString(lead.state) ||
    getString(lead.stateCode) ||
    getString(lead.region) ||
    getStateFromAddress(getString(lead.address) || getString(lead.formattedAddress))
  );
}

function getStateFromAddress(address: string) {
  const match = address.match(/\b(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\b/i);
  return match?.[1]?.toUpperCase() || "";
}

function buildSearchQuery(lead: LeadLike) {
  return [getLeadName(lead), getLeadSuburb(lead), getLeadState(lead), "Yellow Pages"]
    .filter(Boolean)
    .join(" ");
}

function normalizeBusinessName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(?:pty|ltd|limited|proprietary|company|co|inc|pl|aust|australia)\b/g, " ")
    .replace(/\b(?:and|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getNameTokens(value: string) {
  return normalizeBusinessName(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function isCandidateMatch(lead: LeadLike, candidate: YellowPagesCandidate) {
  const leadName = normalizeBusinessName(getLeadName(lead));
  const candidateTitle = normalizeBusinessName(candidate.title);

  if (!leadName || !candidateTitle) return false;
  if (candidateTitle.includes(leadName) || leadName.includes(candidateTitle)) {
    return true;
  }

  const leadTokens = getNameTokens(leadName);
  const candidateTokens = new Set(getNameTokens(candidateTitle));

  if (leadTokens.length === 0) return false;

  const matchedTokens = leadTokens.filter((token) => candidateTokens.has(token));
  const requiredMatches = Math.max(1, Math.ceil(leadTokens.length * 0.7));

  return matchedTokens.length >= requiredMatches;
}

function normalizeYellowPagesUrl(rawUrl: string) {
  const decodedUrl = decodeHtmlEntities(rawUrl);
  let candidate = decodedUrl;

  try {
    const parsed = new URL(decodedUrl, "https://www.yellowpages.com.au");
    const nestedUrl =
      parsed.searchParams.get("q") ||
      parsed.searchParams.get("url") ||
      parsed.searchParams.get("u") ||
      parsed.searchParams.get("target");

    if (nestedUrl) {
      candidate = nestedUrl;
    }
  } catch {
    candidate = decodedUrl;
  }

  try {
    const parsed = new URL(candidate, "https://www.yellowpages.com.au");

    if (!parsed.hostname.toLowerCase().includes("yellowpages.com.au")) {
      return "";
    }

    parsed.hash = "";

    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|gclid|fbclid)/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

function extractSearchCandidates(html: string) {
  const candidates: YellowPagesCandidate[] = [];
  const seenUrls = new Set<string>();
  const linkMatches = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];

  for (const match of linkMatches) {
    const url = normalizeYellowPagesUrl(match[1] || "");

    if (
      !url ||
      seenUrls.has(url) ||
      /\/search\//i.test(url) ||
      /\/advertise\//i.test(url) ||
      /\/contact-us/i.test(url)
    ) {
      continue;
    }

    const title = stripHtml(match[2] || "");
    const startIndex = typeof match.index === "number" ? match.index + match[0].length : 0;
    const nearbyHtml = html.slice(startIndex, startIndex + 700);
    const snippet = stripHtml(nearbyHtml)
      .replace(/^Cached\s*/i, "")
      .slice(0, 240);

    seenUrls.add(url);
    candidates.push({
      title: title || url,
      url,
      ...(snippet ? { snippet } : {}),
    });
  }

  const plainMatch = html.match(/https?:\/\/(?:www\.)?yellowpages\.com\.au\/[^\s"'<>]+/i);

  if (plainMatch) {
    const url = normalizeYellowPagesUrl(plainMatch[0]);
    if (url && !seenUrls.has(url)) {
      candidates.push({
        title: url,
        url,
      });
    }
  }

  return candidates.slice(0, 10);
}

function extractJsonLd(html: string) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const values: Record<string, unknown>[] = [];

  for (const block of blocks) {
    const rawJson = stripHtml(block[1] || "");

    try {
      const parsed = JSON.parse(rawJson);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        if (item && typeof item === "object") {
          values.push(item as Record<string, unknown>);
        }
      }
    } catch {
      // Directory pages sometimes include invalid escaped JSON. Regex fallback handles key fields.
    }
  }

  return values;
}

function findNestedString(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const current = record[key];

    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }

    if (Array.isArray(current)) {
      const firstString = current.find((item) => typeof item === "string");
      if (typeof firstString === "string" && firstString.trim()) {
        return firstString.trim();
      }
    }
  }

  for (const current of Object.values(record)) {
    const nested = findNestedString(current, keys);
    if (nested) return nested;
  }

  return "";
}

function extractAddressFromJsonLd(jsonLd: Record<string, unknown>[]) {
  for (const item of jsonLd) {
    const address = getRecord(item.address);
    const streetAddress = getString(address.streetAddress);
    const locality = getString(address.addressLocality);
    const region = getString(address.addressRegion);
    const postcode = getString(address.postalCode);

    const formatted = [streetAddress, locality, region, postcode].filter(Boolean).join(", ");
    if (formatted) return formatted;

    const plainAddress = findNestedString(item, ["address"]);
    if (plainAddress) return plainAddress;
  }

  return "";
}

function extractFirstRegexValue(text: string, regexes: RegExp[]) {
  for (const regex of regexes) {
    const match = text.match(regex);
    const value = match?.[1]?.trim();

    if (value) {
      return value.replace(/[|,.;:\s]+$/g, "").trim();
    }
  }

  return "";
}

function extractEmail(html: string, visibleText: string) {
  const mailtoMatch = html.match(/mailto:([^"'>?\s]+)/i);
  const plainMatch = visibleText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return decodeHtmlEntities(mailtoMatch?.[1] || plainMatch?.[0] || "");
}

function normalizePhone(value: string) {
  return value.replace(/\s+/g, " ").replace(/[().-]/g, " ").replace(/\s+/g, " ").trim();
}

function extractPhones(html: string, visibleText: string) {
  const phones = new Set<string>();

  for (const match of html.matchAll(/href=["']tel:([^"']+)["']/gi)) {
    const phone = normalizePhone(decodeHtmlEntities(match[1] || ""));
    if (phone) phones.add(phone);
  }

  for (const match of visibleText.matchAll(/(?:\+?61[\s.-]?)?(?:0[\s.-]?)?[2378][\d\s.-]{7,12}|(?:\+?61[\s.-]?)?(?:0[\s.-]?)?4[\d\s.-]{7,12}/g)) {
    const phone = normalizePhone(match[0] || "");
    const digitCount = phone.replace(/\D/g, "").length;
    if (digitCount >= 8 && digitCount <= 12) {
      phones.add(phone);
    }
  }

  const allPhones = [...phones];
  const mobile =
    allPhones.find((phone) => /^(?:\+?61\s*)?0?4/.test(phone.replace(/[().-]/g, " "))) ||
    "";
  const phone = allPhones.find((phoneValue) => phoneValue !== mobile) || mobile || "";

  return { phone, mobile };
}

function extractWebsite(html: string) {
  const hrefMatches = [...html.matchAll(/href=["']([^"']+)["']/gi)];

  for (const match of hrefMatches) {
    const rawHref = decodeHtmlEntities(match[1] || "");

    if (/^mailto:|^tel:/i.test(rawHref)) continue;

    try {
      const parsed = new URL(rawHref, "https://www.yellowpages.com.au");
      const nestedUrl =
        parsed.searchParams.get("url") ||
        parsed.searchParams.get("u") ||
        parsed.searchParams.get("target") ||
        parsed.searchParams.get("redirect");
      const candidate = nestedUrl || parsed.toString();
      const candidateUrl = new URL(candidate);
      const host = candidateUrl.hostname.toLowerCase();

      if (
        host.includes("yellowpages.com.au") ||
        host.includes("google.com") ||
        host.includes("facebook.com") ||
        host.includes("instagram.com")
      ) {
        continue;
      }

      return candidateUrl.toString();
    } catch {
      // Keep scanning links.
    }
  }

  return "";
}

function extractPaymentMethods(visibleText: string) {
  const paymentTerms = [
    "Visa",
    "Mastercard",
    "EFTPOS",
    "Cash",
    "Cheque",
    "Direct Deposit",
    "American Express",
    "AMEX",
    "PayPal",
    "BPAY",
  ];

  return paymentTerms.filter((term) => new RegExp(`\\b${term}\\b`, "i").test(visibleText));
}

function extractOpeningHours(jsonLd: Record<string, unknown>[], visibleText: string) {
  const hours = new Set<string>();

  for (const item of jsonLd) {
    const openingHours = item.openingHours || item.openingHoursSpecification;

    if (typeof openingHours === "string") {
      hours.add(openingHours);
    } else if (Array.isArray(openingHours)) {
      for (const value of openingHours) {
        if (typeof value === "string") {
          hours.add(value);
        } else if (value && typeof value === "object") {
          const record = value as Record<string, unknown>;
          const day = Array.isArray(record.dayOfWeek)
            ? record.dayOfWeek.join(", ")
            : getString(record.dayOfWeek);
          const opens = getString(record.opens);
          const closes = getString(record.closes);
          const formatted = [day, opens && closes ? `${opens}-${closes}` : ""]
            .filter(Boolean)
            .join(" ");

          if (formatted) hours.add(formatted);
        }
      }
    }
  }

  for (const match of visibleText.matchAll(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s*:?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi)) {
    hours.add(match[0].trim());
  }

  return [...hours].slice(0, 14);
}

function extractCategory(jsonLd: Record<string, unknown>[], html: string, visibleText: string) {
  const jsonCategory = findNestedString(jsonLd, ["category", "description", "@type"]);
  if (jsonCategory) return jsonCategory;

  const metaCategory = html.match(/<meta[^>]+(?:property|name)=["'](?:og:title|title)["'][^>]+content=["']([^"']+)["']/i);
  if (metaCategory?.[1]) {
    return stripHtml(metaCategory[1]).split("|")[0]?.trim() || "";
  }

  return extractFirstRegexValue(visibleText, [
    /Categories?\s*[:|-]\s*([^|]+?)(?:\s{2,}|ABN|Open|$)/i,
    /Business type\s*[:|-]\s*([^|]+?)(?:\s{2,}|ABN|Open|$)/i,
  ]);
}

function compactDetails(details: YellowPagesDetails) {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== "";
    })
  ) as YellowPagesDetails;
}

export async function searchYellowPagesListings(
  lead: LeadLike
): Promise<YellowPagesSearchResult> {
  const query = buildSearchQuery(lead);
  const name = getLeadName(lead);

  if (!query || !name) {
    console.log("YELLOW_PAGES_NO_LISTING", {
      name,
      reason: "missing_search_terms",
    });
    return {
      query,
      candidates: [],
      chosenUrl: "",
      reason: "missing_search_terms",
    };
  }

  console.log("YELLOW_PAGES_SEARCH_START", {
    name,
    suburb: getLeadSuburb(lead),
    state: getLeadState(lead),
    query,
  });

  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    const html = await fetchTextWithTimeout(searchUrl);
    const candidates = extractSearchCandidates(html);
    const matchedCandidate = candidates.find((candidate) =>
      isCandidateMatch(lead, candidate)
    );
    const fallbackCandidate = candidates.length === 1 ? candidates[0] : undefined;
    const chosenCandidate = matchedCandidate || fallbackCandidate;

    console.log("YELLOW_PAGES_SEARCH_CANDIDATES", {
      name,
      query,
      candidates: candidates.map((candidate) => ({
        title: candidate.title,
        url: candidate.url,
      })),
      chosenUrl: chosenCandidate?.url || "",
      reason: matchedCandidate
        ? "matched_business_name"
        : fallbackCandidate
          ? "single_candidate_fallback"
          : candidates.length
            ? "no_candidate_matched"
            : "no_candidates_found",
    });

    if (chosenCandidate?.url) {
      console.log("YELLOW_PAGES_LISTING_FOUND", {
        name,
        url: chosenCandidate.url,
        title: chosenCandidate.title,
        reason: matchedCandidate ? "matched_business_name" : "single_candidate_fallback",
      });
      return {
        query,
        candidates,
        chosenUrl: chosenCandidate.url,
        reason: matchedCandidate ? "matched_business_name" : "single_candidate_fallback",
      };
    }

    console.log("YELLOW_PAGES_NO_LISTING", {
      name,
      query,
      candidates: candidates.map((candidate) => ({
        title: candidate.title,
        url: candidate.url,
      })),
      reason: candidates.length ? "no_candidate_matched" : "no_candidates_found",
    });
    return {
      query,
      candidates,
      chosenUrl: "",
      reason: candidates.length ? "no_candidate_matched" : "no_candidates_found",
    };
  } catch (error) {
    console.log("YELLOW_PAGES_NO_LISTING", {
      name,
      query,
      reason: error instanceof Error ? error.message : "search_failed",
    });
    return {
      query,
      candidates: [],
      chosenUrl: "",
      reason: error instanceof Error ? error.message : "search_failed",
    };
  }
}

export async function findYellowPagesListing(lead: LeadLike) {
  const result = await searchYellowPagesListings(lead);

  return result.chosenUrl;
}

export async function scrapeYellowPagesListing(url: string) {
  const listingUrl = normalizeYellowPagesUrl(url);

  if (!listingUrl) {
    throw new Error("Invalid Yellow Pages listing URL");
  }

  const html = await fetchTextWithTimeout(listingUrl);
  const visibleText = stripHtml(html);
  const jsonLd = extractJsonLd(html);
  const { phone, mobile } = extractPhones(html, visibleText);
  const abn = extractFirstRegexValue(visibleText, [
    /\bABN\s*[:#]?\s*([0-9 ]{11,20})\b/i,
  ]).replace(/\s+/g, " ");
  const yearsInBusiness = extractFirstRegexValue(visibleText, [
    /\b(\d{1,3}\s+years?\s+in\s+business)\b/i,
    /\b(\d{1,3}\s+years?\s+experience)\b/i,
  ]);
  const establishedYear = extractFirstRegexValue(visibleText, [
    /\bEstablished\s*(?:in)?\s*(\d{4})\b/i,
    /\bSince\s*(\d{4})\b/i,
  ]);
  const details = compactDetails({
    url: listingUrl,
    website: extractWebsite(html),
    email: extractEmail(html, visibleText),
    phone,
    mobile,
    address: extractAddressFromJsonLd(jsonLd) ||
      extractFirstRegexValue(visibleText, [
        /\bAddress\s*[:|-]\s*([^|]+?)(?:\s{2,}|Phone|Mobile|ABN|$)/i,
      ]),
    abn,
    established_year: establishedYear,
    category: extractCategory(jsonLd, html, visibleText),
    payment_methods: extractPaymentMethods(visibleText),
    opening_hours: extractOpeningHours(jsonLd, visibleText),
    years_in_business: yearsInBusiness,
    scraped_at: new Date().toISOString(),
  });

  console.log("YELLOW_PAGES_SCRAPE_RESULT", {
    url: listingUrl,
    hasWebsite: Boolean(details.website),
    hasEmail: Boolean(details.email),
    hasPhone: Boolean(details.phone),
    hasMobile: Boolean(details.mobile),
    hasAbn: Boolean(details.abn),
    hasOpeningHours: Boolean(details.opening_hours?.length),
  });

  return details;
}

export async function enrichLeadFromYellowPages(lead: LeadLike) {
  try {
    const searchResult = await searchYellowPagesListings(lead);
    const listingUrl = searchResult.chosenUrl;

    if (!listingUrl) {
      return searchResult.candidates.length
        ? {
            ...lead,
            yellow_pages_candidates: searchResult.candidates,
          }
        : lead;
    }

    const yellowPages = await scrapeYellowPagesListing(listingUrl);
    const enrichmentSources = getRecord(lead.enrichment_sources);
    const nextLead: LeadLike = {
      ...lead,
      yellow_pages: yellowPages,
      yellow_pages_candidates: searchResult.candidates,
    };
    const updatedFields: string[] = [];
    const skippedFields: string[] = [];

    if (!getString(nextLead.website) && yellowPages.website) {
      nextLead.website = yellowPages.website;
      enrichmentSources.website = "yellow_pages";
      updatedFields.push("website");
    } else if (yellowPages.website) {
      skippedFields.push("website");
    }

    if (!getString(nextLead.email) && yellowPages.email) {
      nextLead.email = yellowPages.email;
      enrichmentSources.email = "yellow_pages";
      updatedFields.push("email");
    } else if (yellowPages.email) {
      skippedFields.push("email");
    }

    if (!getString(nextLead.phone) && (yellowPages.mobile || yellowPages.phone)) {
      nextLead.phone = yellowPages.mobile || yellowPages.phone;
      enrichmentSources.phone = "yellow_pages";
      updatedFields.push("phone");
    } else if (yellowPages.mobile || yellowPages.phone) {
      skippedFields.push("phone");
    }

    if (Object.keys(enrichmentSources).length > 0) {
      nextLead.enrichment_sources = enrichmentSources;
    }

    console.log("YELLOW_PAGES_ENRICH_APPLIED", {
      name: getLeadName(lead),
      listingUrl,
      updatedFields,
      skippedFields,
      foundFields: {
        website: Boolean(yellowPages.website),
        email: Boolean(yellowPages.email),
        phone: Boolean(yellowPages.phone),
        mobile: Boolean(yellowPages.mobile),
      },
    });

    return nextLead;
  } catch (error) {
    console.error("YELLOW_PAGES_ENRICH_ERROR", {
      name: getLeadName(lead),
      suburb: getLeadSuburb(lead),
      error: error instanceof Error ? error.message : error,
    });
    return lead;
  }
}
