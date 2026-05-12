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

function extractYellowPagesUrl(html: string) {
  const hrefMatches = [...html.matchAll(/href=["']([^"']+)["']/gi)];

  for (const match of hrefMatches) {
    const url = normalizeYellowPagesUrl(match[1] || "");

    if (
      url &&
      !/\/search\//i.test(url) &&
      !/\/advertise\//i.test(url) &&
      !/\/contact-us/i.test(url)
    ) {
      return url;
    }
  }

  const plainMatch = html.match(/https?:\/\/(?:www\.)?yellowpages\.com\.au\/[^\s"'<>]+/i);
  return plainMatch ? normalizeYellowPagesUrl(plainMatch[0]) : "";
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

export async function findYellowPagesListing(lead: LeadLike) {
  const query = buildSearchQuery(lead);
  const name = getLeadName(lead);

  if (!query || !name) {
    console.log("YELLOW_PAGES_NO_LISTING", {
      name,
      reason: "missing_search_terms",
    });
    return "";
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
    const listingUrl = extractYellowPagesUrl(html);

    if (listingUrl) {
      console.log("YELLOW_PAGES_LISTING_FOUND", {
        name,
        url: listingUrl,
      });
      return listingUrl;
    }

    console.log("YELLOW_PAGES_NO_LISTING", {
      name,
      query,
      reason: "no_yellow_pages_result",
    });
    return "";
  } catch (error) {
    console.log("YELLOW_PAGES_NO_LISTING", {
      name,
      query,
      reason: error instanceof Error ? error.message : "search_failed",
    });
    return "";
  }
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
    const listingUrl = await findYellowPagesListing(lead);

    if (!listingUrl) {
      return lead;
    }

    const yellowPages = await scrapeYellowPagesListing(listingUrl);
    const nextLead: LeadLike = {
      ...lead,
      yellow_pages: yellowPages,
    };

    if (!getString(nextLead.website) && yellowPages.website) {
      nextLead.website = yellowPages.website;
    }

    if (!getString(nextLead.email) && yellowPages.email) {
      nextLead.email = yellowPages.email;
    }

    if (!getString(nextLead.phone) && (yellowPages.mobile || yellowPages.phone)) {
      nextLead.phone = yellowPages.mobile || yellowPages.phone;
    }

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
