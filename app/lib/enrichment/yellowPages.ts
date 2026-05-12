import "server-only";

export type YellowPagesCandidate = {
  title: string;
  url: string;
  snippet?: string;
  phone?: string;
};

export type YellowPagesSearchResult = {
  query: string;
  searchUrl: string;
  candidates: YellowPagesCandidate[];
  chosenUrl: string;
  reason: string;
};

type LeadLike = Record<string, unknown>;

const YELLOW_PAGES_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const YELLOW_PAGES_TIMEOUT_MS = 8000;

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

async function fetchTextWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YELLOW_PAGES_TIMEOUT_MS);

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

function buildSearchQuery(lead: LeadLike, clue = getLeadName(lead)) {
  return [clue, getLeadSuburb(lead), getLeadState(lead)]
    .filter(Boolean)
    .join(" ");
}

function buildYellowPagesSearchUrl(lead: LeadLike, clue: string) {
  const locationClue = [getLeadSuburb(lead), getLeadState(lead)]
    .filter(Boolean)
    .join(" ");
  const searchUrl = new URL("https://www.yellowpages.com.au/search/listings");

  searchUrl.searchParams.set("clue", clue);

  if (locationClue) {
    searchUrl.searchParams.set("locationClue", locationClue);
  }

  return searchUrl.toString();
}

function getSearchClueVariations(lead: LeadLike) {
  const name = getLeadName(lead);
  const withoutSuffixes = name
    .replace(/\b(?:pty\.?|ltd\.?|limited|proprietary)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const firstTwoWords = withoutSuffixes.split(/\s+/).slice(0, 2).join(" ");

  return [...new Set([name, withoutSuffixes, firstTwoWords].filter(Boolean))];
}

function normalizeBusinessName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " ")
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
  const candidateTokens = getNameTokens(candidateTitle);
  const leadTokenText = leadTokens.join(" ");
  const candidateTokenText = candidateTokens.join(" ");
  const partialLeadTexts = [
    leadTokenText,
    leadTokens.slice(0, 3).join(" "),
    leadTokens.slice(0, 2).join(" "),
  ].filter((value) => value.length >= 5);

  if (
    partialLeadTexts.some(
      (partial) =>
        candidateTokenText.includes(partial) || partial.includes(candidateTokenText)
    )
  ) {
    return true;
  }

  const candidateTokenSet = new Set(candidateTokens);
  const matchedTokens = leadTokens.filter((token) => candidateTokenSet.has(token));
  const requiredMatches = Math.max(1, Math.ceil(leadTokens.length * 0.7));

  return matchedTokens.length >= requiredMatches;
}

function normalizeYellowPagesUrl(rawUrl: string) {
  const decodedUrl = decodeHtmlEntities(rawUrl);

  try {
    const parsed = new URL(decodedUrl, "https://www.yellowpages.com.au");
    const nestedUrl =
      parsed.searchParams.get("q") ||
      parsed.searchParams.get("url") ||
      parsed.searchParams.get("u") ||
      parsed.searchParams.get("target");
    const candidate = nestedUrl || parsed.toString();
    const candidateUrl = new URL(candidate, "https://www.yellowpages.com.au");

    if (!candidateUrl.hostname.toLowerCase().includes("yellowpages.com.au")) {
      return "";
    }

    candidateUrl.hash = "";

    return candidateUrl.toString();
  } catch {
    return "";
  }
}

function isInvalidYellowPagesListingUrl(url: string) {
  return (
    !url ||
    /\/httpservice\//i.test(url) ||
    /\/retry\//i.test(url) ||
    /enablejs/i.test(url) ||
    /captcha/i.test(url) ||
    /\/search\//i.test(url) ||
    /\/advertise\//i.test(url) ||
    /\/contact-us/i.test(url)
  );
}

function isGenericAnchorText(value: string) {
  return /^(?:click\s+)?here$/i.test(value.trim()) || /^learn more$/i.test(value.trim());
}

function extractPhoneFromText(value: string) {
  const match = value.match(
    /(?:\+?61[\s.-]?)?(?:0[\s.-]?)?[2378][\d\s.-]{7,12}|(?:\+?61[\s.-]?)?(?:0[\s.-]?)?4[\d\s.-]{7,12}/
  );

  return match?.[0]?.trim() || "";
}

function uniqueCandidates(candidates: YellowPagesCandidate[]) {
  const seenUrls = new Set<string>();
  const unique: YellowPagesCandidate[] = [];

  for (const candidate of candidates) {
    if (!candidate.url || seenUrls.has(candidate.url)) continue;

    seenUrls.add(candidate.url);
    unique.push(candidate);
  }

  return unique;
}

function extractSearchCandidates(html: string) {
  const rawCandidates: YellowPagesCandidate[] = [];
  const linkMatches = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];

  for (const match of linkMatches) {
    const url = normalizeYellowPagesUrl(match[1] || "");
    const title = stripHtml(match[2] || "");

    if (
      !url ||
      isInvalidYellowPagesListingUrl(url) ||
      !title ||
      isGenericAnchorText(title)
    ) {
      continue;
    }

    const startIndex = typeof match.index === "number" ? match.index + match[0].length : 0;
    const nearbyHtml = html.slice(Math.max(0, startIndex - 500), startIndex + 1000);
    const snippet = stripHtml(nearbyHtml).slice(0, 240);
    const phone = extractPhoneFromText(snippet);

    rawCandidates.push({
      title,
      url,
      ...(snippet ? { snippet } : {}),
      ...(phone ? { phone } : {}),
    });
  }

  return uniqueCandidates(rawCandidates).slice(0, 15);
}

export async function searchYellowPagesListings(
  lead: LeadLike
): Promise<YellowPagesSearchResult> {
  const searchClues = getSearchClueVariations(lead);
  const query = buildSearchQuery(lead, searchClues[0] || getLeadName(lead));
  const name = getLeadName(lead);

  if (!query || !name || searchClues.length === 0) {
    return {
      query,
      searchUrl: "",
      candidates: [],
      chosenUrl: "",
      reason: "missing_search_terms",
    };
  }

  let lastSearchUrl = "";
  let lastQuery = query;
  let lastCandidates: YellowPagesCandidate[] = [];
  let lastReason = "no_search_attempted";

  for (const clue of searchClues) {
    const attemptQuery = buildSearchQuery(lead, clue);
    const searchUrl = buildYellowPagesSearchUrl(lead, clue);
    lastSearchUrl = searchUrl;
    lastQuery = attemptQuery;

    try {
      const html = await fetchTextWithTimeout(searchUrl);
      const candidates = extractSearchCandidates(html);
      const matchedCandidate = candidates.find((candidate) =>
        isCandidateMatch(lead, candidate)
      );
      const fallbackCandidate =
        candidates.length === 1 ? candidates[0] : undefined;
      const chosenCandidate = matchedCandidate || fallbackCandidate;

      lastCandidates = candidates;
      lastReason = matchedCandidate
        ? "matched_business_name"
        : fallbackCandidate
          ? "single_candidate_fallback"
          : candidates.length
            ? "no_candidate_matched"
            : "no_candidates_found";

      if (chosenCandidate?.url) {
        return {
          query: attemptQuery,
          searchUrl,
          candidates,
          chosenUrl: chosenCandidate.url,
          reason: lastReason,
        };
      }
    } catch (error) {
      lastReason = error instanceof Error ? error.message : "search_failed";
      console.log("YELLOW_PAGES_SEARCH_UNAVAILABLE", {
        name,
        query: attemptQuery,
        searchUrl,
        reason: lastReason,
      });
    }
  }

  return {
    query: lastQuery,
    searchUrl: lastSearchUrl,
    candidates: lastCandidates,
    chosenUrl: "",
    reason: lastReason,
  };
}

export async function findYellowPagesListing(lead: LeadLike) {
  const result = await searchYellowPagesListings(lead);

  return result.chosenUrl;
}

export async function enrichLeadFromYellowPages(lead: LeadLike) {
  try {
    const searchResult = await searchYellowPagesListings(lead);
    const now = new Date().toISOString();
    const yellowPagesSearch = {
      query: searchResult.query,
      searchUrl: searchResult.searchUrl,
      candidateCount: searchResult.candidates.length,
      fetchedAt: now,
      reason: searchResult.reason,
    };

    return {
      ...lead,
      yellow_pages_search: yellowPagesSearch,
      ...(searchResult.chosenUrl
        ? {
            yellow_pages: {
              ...(lead.yellow_pages && typeof lead.yellow_pages === "object"
                ? (lead.yellow_pages as Record<string, unknown>)
                : {}),
              listing_url: searchResult.chosenUrl,
              url: searchResult.chosenUrl,
              found_at: now,
            },
          }
        : {}),
      ...(searchResult.candidates.length
        ? { yellow_pages_candidates: searchResult.candidates }
        : {}),
    };
  } catch (error) {
    console.log("YELLOW_PAGES_ENRICH_SKIPPED", {
      name: getLeadName(lead),
      suburb: getLeadSuburb(lead),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return lead;
  }
}
