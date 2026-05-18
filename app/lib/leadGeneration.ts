import { enrichLead } from "./enrichLead";
import {
  buildGoogleReviewFields,
  fetchGooglePlaceDetails,
  normalizeGoogleReviews,
} from "./googleReviews";
import { normalizeLeadIdentity } from "./leadLifecycle";
import {
  buildLocalSearchQuery,
  getCityTarget,
  getCityTargetForState,
  getStateTarget,
  type CityTarget,
} from "./leadTargeting/cities";
import { withTradeProfile } from "./leadTargeting/tradeModifiers";
import { getTradeTarget, type TradeTarget } from "./leadTargeting/trades";
import {
  duplicateLeadExists,
  insertIgnoredLead,
  insertLead,
  updateLeadBySlug,
} from "./supabase/leads";
import { isValidTradeLead, type TradeValidationResult } from "./tradeValidation";
import {
  buildWebsiteOpportunityResult,
  withEvaluatedAt,
} from "./websiteOpportunity";

const DEFAULT_TRADE = "plumber";
const DEFAULT_CITY = "Hobart";
const MAX_LEADS_PER_RUN = 50;
const ENRICH_AFTER_GENERATE = false;
const GENERATED_LEAD_ENRICHMENT_TIMEOUT_MS = 8000;

export type GenerateLeadsForTownArgs = {
  trade?: string;
  tradeKey?: string;
  city?: string;
  cityKey?: string;
  town?: string;
  state?: string;
  stateKey?: string;
  limit?: number;
  maxLeads?: number;
  enrich?: boolean;
};

type GooglePlace = {
  id?: string;
  displayName?: {
    text?: string;
  };
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  types?: string[];
  primaryType?: string;
  primary_type?: string;
  businessStatus?: string;
  searchQueryFoundFrom?: string;
};

class GeneratedLeadEnrichmentTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Generated lead enrichment timed out after ${timeoutMs}ms`);
    this.name = "GeneratedLeadEnrichmentTimeoutError";
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getGeneratedLeadOpportunity(args: {
  website: string;
  phone: string;
  rating: string;
  reviewCount: string;
}) {
  return withEvaluatedAt(
    buildWebsiteOpportunityResult({
      website: args.website,
      phone: args.phone,
      rating: args.rating,
      reviewCount: args.reviewCount,
      homepageHtml: "",
    })
  );
}

async function enrichGeneratedLeadWithTimeout(slug: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const enrichmentPromise = enrichLead(slug).catch((error) => {
    throw error;
  });

  try {
    return await Promise.race([
      enrichmentPromise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(
              new GeneratedLeadEnrichmentTimeoutError(
                GENERATED_LEAD_ENRICHMENT_TIMEOUT_MS
              )
            ),
          GENERATED_LEAD_ENRICHMENT_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    enrichmentPromise.catch((error) => {
      console.warn("Generated lead enrichment finished after timeout/failure:", {
        slug,
        error: getErrorMessage(error),
      });
    });
  }
}

async function markGeneratedLeadEnrichmentFailed(
  savedLead: Record<string, unknown>,
  error: unknown
) {
  const slug = typeof savedLead.slug === "string" ? savedLead.slug : "";

  if (!slug) return savedLead;

  try {
    return await updateLeadBySlug(slug, {
      ...savedLead,
      enrichmentStatus: "failed",
      enrichmentError: getErrorMessage(error),
      enrichmentFailedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (updateError) {
    console.warn("Failed to record generated lead enrichment failure:", {
      slug,
      error: getErrorMessage(updateError),
    });

    return savedLead;
  }
}

type GoogleTextSearchResponse = {
  places?: GooglePlace[];
  nextPageToken?: string;
  error?: {
    message?: string;
  };
};

type DedupeKeys = {
  placeKey: string;
  nameAddressKey: string;
  nameCityTradeKey: string;
  identityKey: string;
};

export function clampMaxLeads(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  const fallback = Number.isFinite(parsed) ? parsed : MAX_LEADS_PER_RUN;

  return Math.max(1, Math.min(Math.floor(fallback), 200));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeForDedupe(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchQueries(tradeTarget: TradeTarget, cityTarget: CityTarget) {
  return tradeTarget.googleQueryTerms.map((term) =>
    buildLocalSearchQuery(term, cityTarget)
  );
}

function getRequestedCityTarget(args: { city: string; state?: string }) {
  const stateTarget = args.state ? getStateTarget(args.state) : null;
  const normalizedCity = args.city.trim().toLowerCase();

  if (
    normalizedCity === "state-wide" ||
    normalizedCity === "statewide" ||
    normalizedCity === "state wide" ||
    normalizedCity === "tasmania"
  ) {
    return null;
  }

  return stateTarget
    ? getCityTargetForState(args.city, stateTarget.key) || null
    : getCityTarget(args.city) || null;
}

function getBusinessName(place: GooglePlace) {
  return place.displayName?.text || "";
}

function getNameAddressKey(businessName: string, formattedAddress: string) {
  if (!businessName || !formattedAddress) return "";

  return normalizeForDedupe(`${businessName} ${formattedAddress}`);
}

function getNameCityTradeKey(
  businessName: string,
  city: string,
  trade: string
) {
  if (!businessName || !city || !trade) return "";

  return normalizeForDedupe(`${businessName} ${city} ${trade}`);
}

function getPlaceDedupeKeys(
  place: GooglePlace,
  city: string,
  trade: string
): DedupeKeys {
  const businessName = getBusinessName(place);

  return {
    placeKey: place.id ? `place:${place.id}` : "",
    nameAddressKey: getNameAddressKey(
      businessName,
      place.formattedAddress || ""
    ),
    nameCityTradeKey: getNameCityTradeKey(businessName, city, trade),
    identityKey: normalizeLeadIdentity({
      businessName,
      phone: place.nationalPhoneNumber || "",
      city,
      trade,
    }).identityKey,
  };
}

function getUniqueSlug(baseSlug: string, placeId: string, index: number) {
  if (!baseSlug) {
    return placeId ? `lead-${placeId.slice(-6).toLowerCase()}` : `lead-${index}`;
  }

  return baseSlug;
}

async function getGooglePlaceDetailsForLead(placeId: string, apiKey: string) {
  try {
    return await fetchGooglePlaceDetails(placeId, apiKey);
  } catch (error) {
    console.error("[lead-generation] Google Place Details failed", {
      placeId,
      error: error instanceof Error ? error.message : error,
    });

    return null;
  }
}

async function saveIgnoredLead(
  place: GooglePlace,
  city: string,
  trade: string,
  reason: "wrong_trade" | "invalid_location" | "invalid_phone",
  index: number,
  tradeValidation?: TradeValidationResult
) {
  const name = getBusinessName(place);
  const slug = getUniqueSlug(slugify(name), place.id || "", index);
  const ignoredLead = {
    slug,
    name,
    phone: place.nationalPhoneNumber || "",
    placeId: place.id || "",
    city,
    trade,
    reason,
    tradeValidation,
    formattedAddress: place.formattedAddress || "",
    ignoredAt: new Date().toISOString(),
  };

  await insertIgnoredLead(ignoredLead);
}

const AU_STATE_MARKERS = [
  "australia",
  "tasmania",
  "tas",
  "victoria",
  "vic",
  "new south wales",
  "nsw",
  "queensland",
  "qld",
  "south australia",
  "sa",
  "western australia",
  "wa",
  "australian capital territory",
  "act",
  "northern territory",
  "nt",
];

const OBVIOUS_FOREIGN_ADDRESS_MARKERS = [
  "united states",
  "usa",
  "ca usa",
  "ny",
  "texas",
  "florida",
  "california",
  "illinois",
  "pennsylvania",
  "ohio",
  "georgia",
  "north carolina",
  "michigan",
  "new jersey",
  "virginia",
  "washington",
  "arizona",
  "massachusetts",
  "tennessee",
  "indiana",
  "missouri",
  "maryland",
  "wisconsin",
  "colorado",
  "minnesota",
  "south carolina",
  "alabama",
  "louisiana",
  "kentucky",
  "oregon",
  "oklahoma",
  "connecticut",
  "utah",
  "iowa",
  "nevada",
  "arkansas",
  "mississippi",
  "kansas",
  "new mexico",
  "nebraska",
  "idaho",
  "west virginia",
  "hawaii",
  "new hampshire",
  "maine",
  "montana",
  "rhode island",
  "delaware",
  "south dakota",
  "north dakota",
  "alaska",
  "vermont",
  "wyoming",
];

function hasAddressMarker(address: string, marker: string) {
  return new RegExp(`\\b${marker.replace(/\s+/g, "\\s+")}\\b`, "i").test(
    address
  );
}

function getOutOfRegionReason(place: GooglePlace) {
  const formattedAddress = (place.formattedAddress || "").toLowerCase();
  const hasFormattedAddress = Boolean(formattedAddress);
  const hasAustralianAddressMarker = AU_STATE_MARKERS.some((marker) =>
    hasAddressMarker(formattedAddress, marker)
  );
  const hasObviousForeignAddressMarker = OBVIOUS_FOREIGN_ADDRESS_MARKERS.some(
    (marker) => hasAddressMarker(formattedAddress, marker)
  );
  const countryComponents = (place.addressComponents || []).filter((component) =>
    (component.types || []).includes("country")
  );
  const hasCountryComponents = countryComponents.length > 0;
  const hasAuCountryCode = countryComponents.some((component) => {
    const shortText = (component.shortText || "").toUpperCase();
    const longText = (component.longText || "").toLowerCase();

    return shortText === "AU" || longText === "australia";
  });
  const internationalPhone = place.internationalPhoneNumber?.trim() || "";
  const nationalPhone = place.nationalPhoneNumber?.trim() || "";
  const website = (place.websiteUri || "").toLowerCase();

  if (hasCountryComponents) return hasAuCountryCode ? "" : "country_not_au";
  if (hasFormattedAddress && hasObviousForeignAddressMarker) {
    return "foreign_address";
  }
  if (internationalPhone && !internationalPhone.startsWith("+61")) {
    return "non_au_international_phone";
  }
  if (nationalPhone.startsWith("+1")) return "us_phone";
  if (/\.(?:com|net|org)$/.test(website) && website.includes("usa")) {
    return "us_website";
  }
  if (hasFormattedAddress && hasAustralianAddressMarker) return "";

  return "";
}

function isValidPhone(phone?: string) {
  const trimmedPhone = phone?.trim() || "";

  if (!trimmedPhone) return false;
  if (trimmedPhone.startsWith("+1")) return false;
  if (/^\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(trimmedPhone)) {
    return false;
  }

  const normalizedPhone = trimmedPhone.replace(/[\s().-]/g, "");

  return (
    normalizedPhone.startsWith("+61") ||
    normalizedPhone.startsWith("04") ||
    normalizedPhone.startsWith("02") ||
    normalizedPhone.startsWith("03") ||
    normalizedPhone.startsWith("07") ||
    normalizedPhone.startsWith("08")
  );
}

function buildLocationRectangle(lat: number, lng: number, radiusMeters: number) {
  const earthRadiusMeters = 6371000;
  const latDelta = (radiusMeters / earthRadiusMeters) * (180 / Math.PI);
  const lngDelta =
    (radiusMeters / earthRadiusMeters) *
    (180 / Math.PI) /
    Math.cos((lat * Math.PI) / 180);

  return {
    low: {
      latitude: lat - latDelta,
      longitude: lng - lngDelta,
    },
    high: {
      latitude: lat + latDelta,
      longitude: lng + lngDelta,
    },
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGenerationMessage(args: {
  trade: string;
  created: number;
  skipped: number;
  rejected: number;
  totalFound: number;
}) {
  if (args.created > 0) return `${args.created} leads created`;
  if (args.totalFound === 0) {
    return `No matching ${args.trade} businesses found`;
  }
  if (args.skipped > 0 && args.rejected === 0) {
    return "All results were duplicates";
  }
  if (args.rejected > 0 && args.skipped === 0) {
    return "All results failed trade validation";
  }
  if (args.skipped > 0 || args.rejected > 0) return "No new leads created";

  return `No matching ${args.trade} businesses found`;
}

async function textSearch(
  query: string,
  apiKey: string,
  cityTarget: CityTarget,
  maxResults: number
) {
  const rectangle = buildLocationRectangle(
    cityTarget.lat,
    cityTarget.lng,
    cityTarget.radiusMeters
  );
  const allPlaces: GooglePlace[] = [];
  let pageToken = "";

  console.log("PLACES_TEXT_SEARCH_TARGET", {
    query,
    city: cityTarget.city,
    state: cityTarget.state,
    countryCode: cityTarget.countryCode,
    rectangle,
    maxResults,
  });

  do {
    const body = {
      textQuery: query,
      regionCode: cityTarget.countryCode,
      locationRestriction: {
        rectangle,
      },
      pageSize: Math.min(20, Math.max(1, maxResults - allPlaces.length)),
      ...(pageToken ? { pageToken } : {}),
    };

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.addressComponents,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.types,places.primaryType,places.businessStatus",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[lead-generation] Google Places Text Search failed", {
        query,
        status: res.status,
        errorText,
      });
      throw new Error(
        `Google Places Text Search failed: ${res.status} ${errorText}`
      );
    }

    const data = (await res.json()) as GoogleTextSearchResponse;

    if (data.error?.message) {
      console.error("[lead-generation] Google Places invalid response", {
        query,
        message: data.error.message,
      });
      throw new Error(data.error.message);
    }

    allPlaces.push(...(data.places || []));
    pageToken = data.nextPageToken || "";

    console.log("PLACES_TEXT_SEARCH_PAGE", {
      query,
      pageResults: data.places?.length || 0,
      totalCollected: allPlaces.length,
      hasNextPage: Boolean(data.nextPageToken),
    });

    if (pageToken && allPlaces.length < maxResults) await delay(1500);
  } while (pageToken && allPlaces.length < maxResults);

  return allPlaces.slice(0, maxResults);
}

export async function generateLeadsForTown(args: GenerateLeadsForTownArgs) {
  const apiKey =
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY or GOOGLE_MAPS_API_KEY");
  }

  const requestedTrade =
    args.tradeKey || args.trade || process.env.LEAD_TRADE || DEFAULT_TRADE;
  const requestedState = args.stateKey || args.state || process.env.LEAD_STATE;
  const requestedCity =
    args.cityKey ||
    args.city ||
    args.town ||
    process.env.LEAD_CITY ||
    DEFAULT_CITY;
  const tradeTarget = getTradeTarget(requestedTrade);
  const cityTarget = getRequestedCityTarget({
    city: requestedCity,
    state: requestedState,
  });

  if (!tradeTarget) throw new Error("Invalid trade target");
  if (!cityTarget) throw new Error("Invalid Town/Suburb target");

  const trade = tradeTarget.key;
  const city = cityTarget.city;
  const maxLeads = clampMaxLeads(args.limit ?? args.maxLeads);
  const enrich = args.enrich ?? ENRICH_AFTER_GENERATE;
  const searchQueries = buildSearchQueries(tradeTarget, cityTarget);

  console.log("Lead generation settings:", {
    trade,
    townOrSuburb: cityTarget.key,
    state: cityTarget.stateCode,
    maxLeads,
    enrich,
  });

  const rawPlaces: GooglePlace[] = [];

  for (const query of searchQueries) {
    console.log("Searching Places query:", query);
    const places = await textSearch(query, apiKey, cityTarget, maxLeads);

    console.log("Places returned:", { query, count: places.length });
    rawPlaces.push(
      ...places.map((place) => ({
        ...place,
        searchQueryFoundFrom: query,
      }))
    );
  }

  const rawResults = rawPlaces.length;
  const dedupedPlaces: GooglePlace[] = [];
  const seenPlaceKeys = new Set<string>();
  const seenNameAddressKeys = new Set<string>();
  const seenNameCityTradeKeys = new Set<string>();
  const seenIdentityKeys = new Set<string>();
  let skippedDuplicates = 0;

  for (const place of rawPlaces) {
    const keys = getPlaceDedupeKeys(place, city, trade);
    const businessName = getBusinessName(place);

    if (keys.placeKey && seenPlaceKeys.has(keys.placeKey)) {
      skippedDuplicates += 1;
      console.log("[lead-generation] duplicate skipped by googlePlaceId", {
        googlePlaceId: place.id,
        businessName,
      });
      continue;
    }

    if (keys.nameAddressKey && seenNameAddressKeys.has(keys.nameAddressKey)) {
      skippedDuplicates += 1;
      console.log("[lead-generation] duplicate skipped by name/address", {
        businessName,
        formattedAddress: place.formattedAddress || "",
      });
      continue;
    }

    if (keys.nameCityTradeKey && seenNameCityTradeKeys.has(keys.nameCityTradeKey)) {
      skippedDuplicates += 1;
      console.log("[lead-generation] duplicate skipped by name/city/trade", {
        businessName,
        city,
        trade,
      });
      continue;
    }

    if (keys.identityKey && seenIdentityKeys.has(keys.identityKey)) {
      skippedDuplicates += 1;
      console.log("[lead-generation] duplicate skipped by name/phone/city/trade", {
        businessName,
        phone: place.nationalPhoneNumber || "",
        city,
        trade,
      });
      continue;
    }

    if (keys.placeKey) seenPlaceKeys.add(keys.placeKey);
    if (keys.nameAddressKey) seenNameAddressKeys.add(keys.nameAddressKey);
    if (keys.nameCityTradeKey) seenNameCityTradeKeys.add(keys.nameCityTradeKey);
    if (keys.identityKey) seenIdentityKeys.add(keys.identityKey);

    dedupedPlaces.push(place);
  }

  const dedupedResults = dedupedPlaces.length;
  const newPlaces: GooglePlace[] = [];

  for (const place of dedupedPlaces) {
    const businessName = getBusinessName(place);
    const baseSlug = slugify(businessName);
    const slug = getUniqueSlug(baseSlug, place.id || "", newPlaces.length);
    const duplicateReason = await duplicateLeadExists({
      slug,
      googlePlaceId: place.id || "",
      businessName,
      formattedAddress: place.formattedAddress || "",
      phone: place.nationalPhoneNumber || "",
      city,
      trade,
    });

    if (duplicateReason) {
      skippedDuplicates += 1;
      console.log("[lead-generation] existing duplicate skipped", {
        duplicateReason,
        googlePlaceId: place.id,
        slug,
        businessName,
      });
      continue;
    }

    newPlaces.push(place);
  }

  const existingSkipped = dedupedPlaces.length - newPlaces.length;
  const validPlaces: Array<{
    place: GooglePlace;
    tradeValidation: TradeValidationResult;
  }> = [];
  let skippedWrongTrade = 0;
  let skippedInvalidLocation = 0;
  let skippedInvalidPhone = 0;

  for (const place of newPlaces) {
    const businessName = getBusinessName(place);
    const outOfRegionReason = getOutOfRegionReason(place);

    if (outOfRegionReason) {
      skippedInvalidLocation += 1;
      console.log("LEAD_REJECTED_OUT_OF_REGION", {
        place_id: place.id || "",
        name: businessName,
        city_target: cityTarget.key,
        trade,
        reason: outOfRegionReason,
        formattedAddress: place.formattedAddress || "",
        internationalPhoneNumber: place.internationalPhoneNumber || "",
      });
      await saveIgnoredLead(
        place,
        city,
        trade,
        "invalid_location",
        skippedInvalidLocation
      );
      continue;
    }

    if (!isValidPhone(place.internationalPhoneNumber || place.nationalPhoneNumber)) {
      skippedInvalidPhone += 1;
      console.log("[lead-generation] skipped invalid phone", {
        name: businessName,
        phone: place.internationalPhoneNumber || place.nationalPhoneNumber || "",
      });
      await saveIgnoredLead(
        place,
        city,
        trade,
        "invalid_phone",
        skippedInvalidPhone
      );
      continue;
    }

    const tradeValidation = isValidTradeLead(place, trade);

    if (!tradeValidation.isValid) {
      skippedWrongTrade += 1;
      console.log("[lead-validation] rejected place", {
        name: businessName,
        trade,
        primaryType: place.primaryType || place.primary_type || "",
        types: place.types || [],
        reason: tradeValidation.reason || "wrong_trade",
      });
      await saveIgnoredLead(
        place,
        city,
        trade,
        "wrong_trade",
        skippedWrongTrade,
        tradeValidation
      );
      continue;
    }

    validPlaces.push({ place, tradeValidation });
  }

  validPlaces.sort((a, b) => {
    const scoreDiff = b.tradeValidation.score - a.tradeValidation.score;
    if (scoreDiff !== 0) return scoreDiff;

    const ratingDiff = (b.place.rating || 0) - (a.place.rating || 0);
    if (ratingDiff !== 0) return ratingDiff;

    return (b.place.userRatingCount || 0) - (a.place.userRatingCount || 0);
  });

  const cappedPlaces = validPlaces.slice(0, maxLeads);
  const leads = [];
  let enriched = 0;
  let enrichmentFailed = 0;
  let skippedNoOpportunity = 0;

  for (const { place, tradeValidation } of cappedPlaces) {
    const businessName = getBusinessName(place);
    if (!businessName) continue;

    const baseSlug = slugify(businessName);
    const slug = getUniqueSlug(baseSlug, place.id || "", leads.length);
    const now = new Date().toISOString();
    const placeDetails = await getGooglePlaceDetailsForLead(place.id || "", apiKey);
    const googleReviews = normalizeGoogleReviews(placeDetails);
    const googleReviewFields = buildGoogleReviewFields({
      businessName,
      reviews: googleReviews,
    });
    const website = place.websiteUri || "";
    const phone = place.internationalPhoneNumber || place.nationalPhoneNumber || "";
    const rating =
      placeDetails?.rating !== undefined
        ? String(placeDetails.rating)
        : place.rating !== undefined
          ? String(place.rating)
          : "";
    const reviewCount =
      placeDetails?.userRatingCount !== undefined
        ? String(placeDetails.userRatingCount)
        : place.userRatingCount !== undefined
          ? String(place.userRatingCount)
          : "";
    const websiteOpportunity = getGeneratedLeadOpportunity({
      website,
      phone,
      rating,
      reviewCount,
    });

    if (websiteOpportunity.level === "none") {
      skippedNoOpportunity += 1;
      console.log(
        "[Lead Generation] Skipping no-opportunity lead:",
        businessName
      );
      continue;
    }

    const leadPriorityScore =
      tradeValidation.score +
      (Number(place.rating) || 0) +
      Math.min(Number(place.userRatingCount) || 0, 100) / 100;
    const lead = withTradeProfile({
      businessName,
      trade,
      city,
      state: cityTarget.stateCode,
      stateName: cityTarget.state,
      slug,
      id: slug,
      googlePlaceId: place.id || "",
      formattedAddress: place.formattedAddress || "",
      location: place.location || null,
      rating,
      reviewCount,
      website,
      phone,
      leadPriorityScore,
      tradeValidation,
      stage: "lead",
      status: "new",
      contactedAt: null,
      clientAt: null,
      archivedAt: null,
      reviewNotes: "",
      source: "google_places",
      searchQueryFoundFrom: place.searchQueryFoundFrom || "",
      targetCityKey: cityTarget.key,
      targetCity: cityTarget.city,
      targetStateCode: cityTarget.stateCode,
      targetState: cityTarget.state,
      targetCountry: cityTarget.country,
      targetCountryCode: cityTarget.countryCode,
      targetLat: cityTarget.lat,
      targetLng: cityTarget.lng,
      targetRadiusMeters: cityTarget.radiusMeters,
      sourceQuery: place.searchQueryFoundFrom || "",
      types: place.types || [],
      primaryType: place.primaryType || place.primary_type || "",
      businessStatus: place.businessStatus || "",
      email: "",
      description: "",
      services: [],
      website_opportunity_v2: websiteOpportunity,
      ...googleReviewFields,
      aiGeneratedAt: "",
      enrichedAt: "",
      enrichmentStatus: enrich ? "pending" : "pending_async",
      enrichmentError: "",
      createdAt: now,
      updatedAt: now,
    });

    console.log("Saving lead:", { businessName, website: lead.website });

    const savedLead = await insertLead(lead);

    if (enrich) {
      try {
        const enrichmentResult = await enrichGeneratedLeadWithTimeout(slug);

        console.log("Generated lead enriched:", {
          slug,
          success: enrichmentResult.success,
        });
        enriched += 1;
        leads.push(enrichmentResult.lead);
      } catch (error) {
        enrichmentFailed += 1;
        const failedLead = await markGeneratedLeadEnrichmentFailed(
          savedLead,
          error
        );
        leads.push(failedLead);
        console.warn("Generated lead enrichment failed non-fatally:", {
          slug,
          error: getErrorMessage(error),
        });
      }
    } else {
      leads.push(savedLead);
    }
  }

  const skipped =
    existingSkipped +
    skippedDuplicates +
    skippedInvalidLocation +
    skippedInvalidPhone +
    skippedNoOpportunity;
  const rejected = skippedWrongTrade;
  const totalFound = rawResults;
  const message = getGenerationMessage({
    trade,
    created: leads.length,
    skipped,
    rejected,
    totalFound,
  });

  console.log("[lead-generation] summary", {
    town: city,
    trade,
    rawResults,
    dedupedResults,
    saved: leads.length,
    created: leads.length,
    skipped,
    rejected,
    totalFound,
    existingSkipped,
    skippedDuplicates,
    skippedWrongTrade,
    skippedInvalidLocation,
    skippedInvalidPhone,
    skippedNoOpportunity,
    enriched,
    enrichmentFailed,
  });

  return {
    success: true,
    town: city,
    trade,
    city,
    created: leads.length,
    skipped,
    rejected,
    totalFound,
    message,
    queriesRun: searchQueries.length,
    rawResults,
    dedupedResults,
    existingSkipped,
    skippedDuplicates,
    skippedWrongTrade,
    skippedInvalidLocation,
    skippedInvalidPhone,
    skippedNoOpportunity,
    saved: leads.length,
    enriched,
    enrichmentFailed,
    leads,
  };
}
