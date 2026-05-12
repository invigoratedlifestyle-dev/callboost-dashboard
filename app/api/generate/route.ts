import { NextResponse } from "next/server";
import {
  buildGoogleReviewFields,
  fetchGooglePlaceDetails,
  normalizeGoogleReviews,
} from "../../lib/googleReviews";
import {
  getLeadBySlug,
  insertLead,
  updateLeadBySlug,
} from "../../lib/supabase/leads";
import { isValidTradeLead } from "../../lib/tradeValidation";

type GenerateRequest = {
  query?: string;
  trade?: string;
  city?: string;
  limit?: number;
};

type GooglePlace = {
  id: string;
  displayName?: {
    text?: string;
  };
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  formattedAddress?: string;
  types?: string[];
  primaryType?: string;
  primary_type?: string;
  businessStatus?: string;
};

type GoogleSearchTextResponse = {
  places?: GooglePlace[];
};

type ExistingLead = Record<string, unknown>;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getGenerationMessage(args: {
  trade: string;
  created: number;
  skipped: number;
  rejected: number;
  totalFound: number;
}) {
  if (args.created > 0) {
    return `${args.created} leads created`;
  }

  if (args.totalFound === 0) {
    return `No matching ${args.trade} businesses found`;
  }

  if (args.rejected > 0 && args.skipped === 0) {
    return "All results failed trade validation";
  }

  if (args.skipped > 0 && args.rejected === 0) {
    return "All results were skipped";
  }

  return "No new leads created";
}

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

async function searchText(query: string, apiKey: string) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.types,places.primaryType,places.businessStatus",
    },
    body: JSON.stringify({
      textQuery: query,
    }),
  });

  const data = (await res.json()) as GoogleSearchTextResponse & {
    error?: {
      message?: string;
      status?: string;
    };
  };

  if (!res.ok) {
    throw new Error(
      data.error?.message || `Google Places Search Text failed: ${res.status}`
    );
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
        { error: "Missing GOOGLE_PLACES_API_KEY" },
        { status: 500 }
      );
    }

    let body: GenerateRequest = {};

    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const trade = body.trade || process.env.LEAD_TRADE || "Plumber";
    const city = body.city || process.env.LEAD_CITY || "Hobart";
    const query = body.query || `${trade} in ${city} Tasmania Australia`;
    const limit = Math.max(1, Math.min(body.limit || 10, 20));

    const places = await searchText(query, apiKey);
    const saved = [];
    let rejected = 0;
    let skipped = 0;

    for (const place of places.slice(0, limit)) {
      const businessName = place.displayName?.text || "";

      if (!place.id || !businessName) {
        skipped += 1;
        continue;
      }

      const tradeValidation = isValidTradeLead(place, trade);

      if (!tradeValidation.isValid) {
        rejected += 1;
        console.log("[lead-validation] rejected place", {
          name: businessName,
          trade,
          primaryType: place.primaryType || place.primary_type || "",
          types: place.types || [],
          reason: tradeValidation.reason || "wrong_trade",
        });
        continue;
      }

      const slug = slugify(businessName);

      if (!slug) {
        skipped += 1;
        continue;
      }

      const existingLead = ((await getLeadBySlug(slug)) || {}) as ExistingLead;
      const placeDetails = await getGooglePlaceDetailsForLead(place.id, apiKey);
      const googleReviews = normalizeGoogleReviews(placeDetails);
      const googleReviewFields = buildGoogleReviewFields({
        existingLead,
        businessName,
        reviews: googleReviews,
      });

      const website = place.websiteUri || getString(existingLead.website);
      const phone = place.nationalPhoneNumber || getString(existingLead.phone);
      const lead = {
        ...existingLead,
        id: getString(existingLead.id) || slug,
        slug,
        googlePlaceId: place.id,
        businessName,
        trade,
        city,
        formattedAddress: place.formattedAddress || getString(existingLead.formattedAddress),
        phone,
        website,
        rating:
          placeDetails?.rating !== undefined
            ? String(placeDetails.rating)
            : place.rating !== undefined
              ? String(place.rating)
              : getString(existingLead.rating),
        reviewCount:
          placeDetails?.userRatingCount !== undefined
            ? String(placeDetails.userRatingCount)
            : place.userRatingCount !== undefined
              ? String(place.userRatingCount)
              : getString(existingLead.reviewCount),
        email: getString(existingLead.email),
        status: getString(existingLead.status) || "new",
        tradeValidation,
        source: "google_places",
        types: place.types || [],
        primaryType: place.primaryType || place.primary_type || "",
        businessStatus: place.businessStatus || "",
        description: getString(existingLead.description),
        services: Array.isArray(existingLead.services)
          ? existingLead.services
          : [],
        ...googleReviewFields,
        aiGeneratedAt: getString(existingLead.aiGeneratedAt),
        enrichedAt: getString(existingLead.enrichedAt),
      };

      console.log("Saving lead:", { businessName, website });

      const savedLead = existingLead.slug
        ? await updateLeadBySlug(slug, lead)
        : await insertLead(lead);

      saved.push(savedLead);
    }

    const totalFound = places.length;
    const created = saved.length;
    const message = getGenerationMessage({
      trade,
      created,
      skipped,
      rejected,
      totalFound,
    });

    return NextResponse.json({
      success: true,
      town: city,
      city,
      query,
      created,
      skipped,
      rejected,
      totalFound,
      message,
      saved,
    });
  } catch (error) {
    console.error("Failed to generate leads:", error);

    return NextResponse.json(
      {
        error: "Failed to generate leads",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
