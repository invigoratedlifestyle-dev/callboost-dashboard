import { NextResponse } from "next/server";
import { enrichLead } from "../../../lib/enrichLead";
import {
  buildGoogleReviewFields,
  fetchGooglePlaceDetails,
  normalizeGoogleReviews,
} from "../../../lib/googleReviews";
import {
  normalizeLeadIdentity,
} from "../../../lib/leadLifecycle";
import {
  duplicateLeadExists,
  insertIgnoredLead,
  insertLead,
} from "../../../lib/supabase/leads";
import {
  isValidTradeLead,
  type TradeValidationResult,
} from "../../../lib/tradeValidation";

const DEFAULT_TRADE = "plumber";
const DEFAULT_CITY = "Hobart";
const MAX_LEADS_PER_RUN = 50;
const ENRICH_AFTER_GENERATE = true;

type GenerateRequest = {
  trade?: string;
  city?: string;
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
  types?: string[];
  searchQueryFoundFrom?: string;
};

async function getGooglePlaceDetailsForLead(placeId: string, apiKey: string) {
  try {
    return await fetchGooglePlaceDetails(placeId, apiKey);
  } catch (error) {
    console.error("Failed to fetch Google Place Details:", {
      placeId,
      error: error instanceof Error ? error.message : error,
    });

    return null;
  }
}

type GoogleTextSearchResponse = {
  places?: GooglePlace[];
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

function clampMaxLeads(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  const fallback = Number.isFinite(parsed) ? parsed : MAX_LEADS_PER_RUN;

  return Math.max(1, Math.min(Math.floor(fallback), 200));
}

function buildSearchQueries(trade: string, city: string): string[] {
  const normalizedTrade = trade.trim().toLowerCase();

  if (normalizedTrade === "plumber" || normalizedTrade === "plumbing") {
    return [
      `${trade} ${city}`,
      `emergency ${trade} ${city}`,
      `blocked drain ${city}`,
      `hot water plumber ${city}`,
      `gas plumber ${city}`,
      `bathroom plumber ${city}`,
      `commercial plumber ${city}`,
      `residential plumber ${city}`,
      `leaking tap plumber ${city}`,
      `toilet repair plumber ${city}`,
    ];
  }

  return [
    `${trade} ${city}`,
    `emergency ${trade} ${city}`,
    `best ${trade} ${city}`,
    `local ${trade} ${city}`,
    `${trade} near ${city}`,
  ];
}

function getBusinessName(place: GooglePlace) {
  return place.displayName?.text || "";
}

function getNameAddressKey(businessName: string, formattedAddress: string) {
  if (!businessName || !formattedAddress) {
    return "";
  }

  return normalizeForDedupe(`${businessName} ${formattedAddress}`);
}

function getNameCityTradeKey(
  businessName: string,
  city: string,
  trade: string
) {
  if (!businessName || !city || !trade) {
    return "";
  }

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

function isValidLocation(place: GooglePlace) {
  const formattedAddress = (place.formattedAddress || "").toLowerCase();
  const hasTasmania =
    formattedAddress.includes("tasmania") ||
    /\btas\b/i.test(place.formattedAddress || "");
  const hasAustralia = formattedAddress.includes("australia");
  const hasAuCountryCode = (place.addressComponents || []).some((component) => {
    const types = component.types || [];
    const shortText = (component.shortText || "").toUpperCase();

    return types.includes("country") && shortText === "AU";
  });

  return (hasTasmania && hasAustralia) || hasAuCountryCode;
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
    normalizedPhone.startsWith("03")
  );
}

async function textSearch(query: string, apiKey: string) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.addressComponents,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.types",
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: 20,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `Google Places Text Search failed: ${res.status} ${errorText}`
    );
  }

  const data = (await res.json()) as GoogleTextSearchResponse;

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  return data.places || [];
}

export async function POST(req: Request) {
  try {
    const apiKey =
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GOOGLE_API_KEY or GOOGLE_MAPS_API_KEY" },
        { status: 500 }
      );
    }

    let body: GenerateRequest = {};

    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const trade = body.trade || process.env.LEAD_TRADE || DEFAULT_TRADE;
    const city = body.city || process.env.LEAD_CITY || DEFAULT_CITY;
    const maxLeads = clampMaxLeads(body.maxLeads ?? MAX_LEADS_PER_RUN);
    const enrich = body.enrich ?? ENRICH_AFTER_GENERATE;
    const searchQueries = buildSearchQueries(trade, city);

    console.log("Lead generation settings:", {
      trade,
      city,
      maxLeads,
      enrich,
    });

    const rawPlaces: GooglePlace[] = [];

    for (const query of searchQueries) {
      try {
        console.log("Searching Places query:", query);

        const places = await textSearch(query, apiKey);

        console.log("Places returned:", {
          query,
          count: places.length,
        });

        rawPlaces.push(
          ...places.map((place) => ({
            ...place,
            searchQueryFoundFrom: query,
          }))
        );
      } catch (error) {
        console.error("Places query failed:", {
          query,
          error: error instanceof Error ? error.message : error,
        });
      }
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
        console.log("Duplicate skipped by googlePlaceId:", {
          googlePlaceId: place.id,
          businessName,
        });
        continue;
      }

      if (
        keys.nameAddressKey &&
        seenNameAddressKeys.has(keys.nameAddressKey)
      ) {
        skippedDuplicates += 1;
        console.log("Duplicate skipped by name/address:", {
          businessName,
          formattedAddress: place.formattedAddress || "",
        });
        continue;
      }

      if (
        keys.nameCityTradeKey &&
        seenNameCityTradeKeys.has(keys.nameCityTradeKey)
      ) {
        skippedDuplicates += 1;
        console.log("Duplicate skipped by name/city/trade:", {
          businessName,
          city,
          trade,
        });
        continue;
      }

      if (keys.identityKey && seenIdentityKeys.has(keys.identityKey)) {
        skippedDuplicates += 1;
        console.log("Duplicate skipped by name/phone/city/trade:", {
          businessName,
          phone: place.nationalPhoneNumber || "",
          city,
          trade,
        });
        continue;
      }

      if (keys.placeKey) {
        seenPlaceKeys.add(keys.placeKey);
      }

      if (keys.nameAddressKey) {
        seenNameAddressKeys.add(keys.nameAddressKey);
      }

      if (keys.nameCityTradeKey) {
        seenNameCityTradeKeys.add(keys.nameCityTradeKey);
      }

      if (keys.identityKey) {
        seenIdentityKeys.add(keys.identityKey);
      }

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

      if (duplicateReason === "place_id" || duplicateReason === "ignored_place_id") {
        skippedDuplicates += 1;
        console.log("Duplicate skipped by googlePlaceId:", {
          googlePlaceId: place.id,
          businessName,
        });
        continue;
      }

      if (duplicateReason === "slug" || duplicateReason === "ignored_slug") {
        skippedDuplicates += 1;
        console.log("Duplicate skipped by slug:", {
          slug,
          businessName,
        });
        continue;
      }

      if (duplicateReason === "identity" || duplicateReason === "ignored_identity") {
        skippedDuplicates += 1;
        console.log("Duplicate skipped by name/phone/city/trade:", {
          businessName,
          phone: place.nationalPhoneNumber || "",
          city,
          trade,
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

      if (!isValidLocation(place)) {
        skippedInvalidLocation += 1;
        console.log(`Skipped (wrong location): ${businessName}`);

        await saveIgnoredLead(
          place,
          city,
          trade,
          "invalid_location",
          skippedInvalidLocation
        );
        continue;
      }

      if (!isValidPhone(place.nationalPhoneNumber)) {
        skippedInvalidPhone += 1;
        console.log(
          `Skipped (invalid phone): ${place.nationalPhoneNumber || ""}`
        );

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
        console.log(
          `Skipped wrong trade: ${businessName} | targetTrade: ${trade} | score: ${tradeValidation.score}`
        );

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

      validPlaces.push({
        place,
        tradeValidation,
      });
    }

    const cappedPlaces = validPlaces.slice(0, maxLeads);
    const leads = [];
    let enriched = 0;
    let enrichmentFailed = 0;

    for (const { place, tradeValidation } of cappedPlaces) {
      const businessName = getBusinessName(place);

      if (!businessName) {
        continue;
      }

      const baseSlug = slugify(businessName);
      const slug = getUniqueSlug(baseSlug, place.id || "", leads.length);
      const now = new Date().toISOString();
      const placeDetails = await getGooglePlaceDetailsForLead(
        place.id || "",
        apiKey
      );
      const googleReviews = normalizeGoogleReviews(placeDetails);
      const googleReviewFields = buildGoogleReviewFields({
        businessName,
        reviews: googleReviews,
      });
      const lead = {
        businessName,
        trade,
        city,
        slug,
        id: slug,
        googlePlaceId: place.id || "",
        formattedAddress: place.formattedAddress || "",
        location: place.location || null,
        rating:
          placeDetails?.rating !== undefined
            ? String(placeDetails.rating)
            : place.rating !== undefined
              ? String(place.rating)
              : "",
        reviewCount:
          placeDetails?.userRatingCount !== undefined
            ? String(placeDetails.userRatingCount)
            : place.userRatingCount !== undefined
              ? String(place.userRatingCount)
              : "",
        website: place.websiteUri || "",
        phone: place.nationalPhoneNumber || "",
        tradeValidation,
        status: "lead",
        contactedAt: null,
        clientAt: null,
        archivedAt: null,
        reviewNotes: "",
        source: "google_places",
        searchQueryFoundFrom: place.searchQueryFoundFrom || "",
        types: place.types || [],
        email: "",
        description: "",
        services: [],
        ...googleReviewFields,
        aiGeneratedAt: "",
        enrichedAt: "",
        createdAt: now,
        updatedAt: now,
      };

      console.log("Saving lead:", { businessName, website: lead.website });

      const savedLead = await insertLead(lead);

      if (enrich) {
        try {
          const enrichmentResult = await enrichLead(slug);

          console.log("Generated lead enriched:", {
            slug,
            success: enrichmentResult.success,
          });

          enriched += 1;
          leads.push(enrichmentResult.lead);
        } catch (error) {
          enrichmentFailed += 1;
          leads.push(savedLead);

          console.error("Generated lead enrichment failed:", {
            slug,
            error: error instanceof Error ? error.message : error,
          });
        }
      } else {
        // TODO: Keep enrichment disabled only when requested by POST body.
        leads.push(savedLead);
      }
    }

    console.log("Lead generation summary:", {
      rawResults,
      dedupedResults,
      saved: leads.length,
      existingSkipped,
      skippedDuplicates,
      skippedWrongTrade,
      skippedInvalidLocation,
      skippedInvalidPhone,
      enriched,
      enrichmentFailed,
    });

    return NextResponse.json({
      success: true,
      trade,
      city,
      queriesRun: searchQueries.length,
      rawResults,
      dedupedResults,
      existingSkipped,
      skippedDuplicates,
      skippedWrongTrade,
      skippedInvalidLocation,
      skippedInvalidPhone,
      saved: leads.length,
      enriched,
      enrichmentFailed,
      leads,
    });
  } catch (error) {
    console.error("Failed to generate leads:", error);

    return NextResponse.json(
      {
        error: "Lead generation failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
