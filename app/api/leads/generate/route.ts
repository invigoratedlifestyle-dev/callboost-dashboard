import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { enrichLead } from "../../../lib/enrichLead";
import {
  buildGoogleReviewFields,
  fetchGooglePlaceDetails,
  normalizeGoogleReviews,
} from "../../../lib/googleReviews";
import {
  normalizeLeadIdentity,
  shouldSkipExistingLead,
  withLifecycleDefaults,
} from "../../../lib/leadLifecycle";
import {
  isValidTradeLead,
  type TradeValidationResult,
} from "../../../lib/tradeValidation";

const DEFAULT_TRADE = "plumber";
const DEFAULT_CITY = "Hobart";
const MAX_LEADS_PER_RUN = 50;
const ENRICH_AFTER_GENERATE = true;

const generatorRoot = path.join(process.cwd(), "..", "local-site-generator");
const businessesDir = path.join(generatorRoot, "data", "businesses");
const ignoredLeadsDir = path.join(generatorRoot, "data", "ignored-leads");

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

type ExistingLead = Record<string, unknown>;

type ExistingLeadValues = {
  placeId: string;
  businessName: string;
  formattedAddress: string;
  city: string;
  trade: string;
  phone: string;
};

type DedupeKeys = {
  placeKey: string;
  nameAddressKey: string;
  nameCityTradeKey: string;
  identityKey: string;
};

type ExistingDedupeKeys = {
  placeKeys: Set<string>;
  nameAddressKeys: Set<string>;
  nameCityTradeKeys: Set<string>;
  identityKeys: Set<string>;
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

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getExistingLeadValues(lead: ExistingLead): ExistingLeadValues {
  return {
    placeId: getString(lead.googlePlaceId) || getString(lead.placeId),
    businessName: getString(lead.businessName) || getString(lead.name),
    formattedAddress: getString(lead.formattedAddress),
    city: getString(lead.city),
    trade: getString(lead.trade),
    phone: getString(lead.phone),
  };
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

function addDedupeKeysFromLead(lead: ExistingLead, keys: ExistingDedupeKeys) {
  const existingLead = withLifecycleDefaults(lead);

  if (!shouldSkipExistingLead(existingLead)) {
    return;
  }

  const values = getExistingLeadValues(existingLead);
  const identity = normalizeLeadIdentity({
    googlePlaceId: values.placeId,
    businessName: values.businessName,
    phone: values.phone,
    city: values.city,
    trade: values.trade,
  });

  if (values.placeId) {
    keys.placeKeys.add(`place:${values.placeId}`);
  }

  if (identity.googlePlaceId) {
    keys.placeKeys.add(`place:${identity.googlePlaceId}`);
  }

  if (identity.identityKey) {
    keys.identityKeys.add(identity.identityKey);
  }

  if (values.businessName && values.formattedAddress) {
    keys.nameAddressKeys.add(
      getNameAddressKey(values.businessName, values.formattedAddress)
    );
  }

  if (values.businessName && values.city && values.trade) {
    keys.nameCityTradeKeys.add(
      getNameCityTradeKey(values.businessName, values.city, values.trade)
    );
  }
}

function readDedupeDirectory(dir: string, keys: ExistingDedupeKeys) {
  if (!fs.existsSync(dir)) {
    return;
  }

  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"));

  for (const file of files) {
    try {
      const filePath = path.join(dir, file);
      const lead = JSON.parse(fs.readFileSync(filePath, "utf8")) as ExistingLead;

      addDedupeKeysFromLead(lead, keys);
    } catch {
      continue;
    }
  }
}

function getExistingDedupeKeys() {
  const keys: ExistingDedupeKeys = {
    placeKeys: new Set<string>(),
    nameAddressKeys: new Set<string>(),
    nameCityTradeKeys: new Set<string>(),
    identityKeys: new Set<string>(),
  };

  readDedupeDirectory(businessesDir, keys);
  readDedupeDirectory(ignoredLeadsDir, keys);

  return keys;
}

function isExistingDuplicate(keys: DedupeKeys, existingKeys: ExistingDedupeKeys) {
  if (keys.placeKey && existingKeys.placeKeys.has(keys.placeKey)) {
    return "googlePlaceId";
  }

  if (
    keys.nameAddressKey &&
    existingKeys.nameAddressKeys.has(keys.nameAddressKey)
  ) {
    return "nameAddress";
  }

  if (
    keys.nameCityTradeKey &&
    existingKeys.nameCityTradeKeys.has(keys.nameCityTradeKey)
  ) {
    return "nameCityTrade";
  }

  if (
    keys.identityKey &&
    existingKeys.identityKeys.has(keys.identityKey)
  ) {
    return "identity";
  }

  return "";
}

function getUniqueSlug(baseSlug: string, placeId: string, index: number) {
  if (!baseSlug) {
    return placeId ? `lead-${placeId.slice(-6).toLowerCase()}` : `lead-${index}`;
  }

  let slug = baseSlug;
  const filePath = path.join(businessesDir, `${slug}.json`);

  if (!fs.existsSync(filePath)) {
    return slug;
  }

  const suffix = placeId
    ? placeId.replace(/[^a-z0-9]/gi, "").slice(-6).toLowerCase()
    : String(index + 1);

  slug = `${baseSlug}-${suffix}`;

  if (!fs.existsSync(path.join(businessesDir, `${slug}.json`))) {
    return slug;
  }

  return `${baseSlug}-${index + 1}`;
}

function getUniqueSlugInDir(
  dir: string,
  baseSlug: string,
  placeId: string,
  index: number
) {
  if (!baseSlug) {
    return placeId ? `lead-${placeId.slice(-6).toLowerCase()}` : `lead-${index}`;
  }

  if (!fs.existsSync(path.join(dir, `${baseSlug}.json`))) {
    return baseSlug;
  }

  const suffix = placeId
    ? placeId.replace(/[^a-z0-9]/gi, "").slice(-6).toLowerCase()
    : String(index + 1);
  const suffixedSlug = `${baseSlug}-${suffix}`;

  if (!fs.existsSync(path.join(dir, `${suffixedSlug}.json`))) {
    return suffixedSlug;
  }

  return `${baseSlug}-${index + 1}`;
}

function saveIgnoredLead(
  place: GooglePlace,
  city: string,
  trade: string,
  tradeValidation: TradeValidationResult,
  index: number
) {
  if (!fs.existsSync(ignoredLeadsDir)) {
    fs.mkdirSync(ignoredLeadsDir, { recursive: true });
  }

  const name = getBusinessName(place);
  const slug = getUniqueSlugInDir(
    ignoredLeadsDir,
    slugify(name),
    place.id || "",
    index
  );
  const ignoredLead = {
    name,
    phone: place.nationalPhoneNumber || "",
    placeId: place.id || "",
    city,
    trade,
    reason: "wrong_trade",
    tradeValidation,
    ignoredAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(ignoredLeadsDir, `${slug}.json`),
    JSON.stringify(ignoredLead, null, 2)
  );
}

async function textSearch(query: string, apiKey: string) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.types",
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
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GOOGLE_API_KEY or GOOGLE_MAPS_API_KEY" },
        { status: 500 }
      );
    }

    if (!fs.existsSync(businessesDir)) {
      fs.mkdirSync(businessesDir, { recursive: true });
    }

    if (!fs.existsSync(ignoredLeadsDir)) {
      fs.mkdirSync(ignoredLeadsDir, { recursive: true });
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
    const existingKeys = getExistingDedupeKeys();
    const newPlaces: GooglePlace[] = [];

    for (const place of dedupedPlaces) {
      const keys = getPlaceDedupeKeys(place, city, trade);
      const duplicateReason = isExistingDuplicate(keys, existingKeys);
      const businessName = getBusinessName(place);

      if (duplicateReason === "googlePlaceId") {
        skippedDuplicates += 1;
        console.log("Duplicate skipped by googlePlaceId:", {
          googlePlaceId: place.id,
          businessName,
        });
        continue;
      }

      if (duplicateReason === "nameAddress") {
        skippedDuplicates += 1;
        console.log("Duplicate skipped by name/address:", {
          businessName,
          formattedAddress: place.formattedAddress || "",
        });
        continue;
      }

      if (duplicateReason === "nameCityTrade") {
        skippedDuplicates += 1;
        console.log("Duplicate skipped by name/city/trade:", {
          businessName,
          city,
          trade,
        });
        continue;
      }

      if (duplicateReason === "identity") {
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

    for (const place of newPlaces) {
      const businessName = getBusinessName(place);
      const tradeValidation = isValidTradeLead(place, trade);

      if (!tradeValidation.isValid) {
        skippedWrongTrade += 1;
        console.log(
          `Skipped wrong trade: ${businessName} | targetTrade: ${trade} | score: ${tradeValidation.score}`
        );

        saveIgnoredLead(
          place,
          city,
          trade,
          tradeValidation,
          skippedWrongTrade
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
      const filePath = path.join(businessesDir, `${slug}.json`);
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
        status: "new",
        archivedAt: null,
        contactedAt: null,
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

      fs.writeFileSync(filePath, JSON.stringify(lead, null, 2));

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
          leads.push(lead);

          console.error("Generated lead enrichment failed:", {
            slug,
            error: error instanceof Error ? error.message : error,
          });
        }
      } else {
        // TODO: Keep enrichment disabled only when requested by POST body.
        leads.push(lead);
      }
    }

    console.log("Lead generation summary:", {
      rawResults,
      dedupedResults,
      saved: leads.length,
      existingSkipped,
      skippedDuplicates,
      skippedWrongTrade,
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
      saved: leads.length,
      enriched,
      enrichmentFailed,
      leads,
    });
  } catch (error) {
    console.error("Failed to generate leads:", error);

    return NextResponse.json(
      { error: "Failed to generate leads" },
      { status: 500 }
    );
  }
}
