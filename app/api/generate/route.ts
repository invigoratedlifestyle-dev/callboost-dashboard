import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  buildGoogleReviewFields,
  fetchGooglePlaceDetails,
  normalizeGoogleReviews,
} from "../../lib/googleReviews";

const generatorRoot = path.join(process.cwd(), "..", "local-site-generator");
const businessesDir = path.join(generatorRoot, "data", "businesses");

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

function readExistingLead(filePath: string): ExistingLead {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
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
        "places.id,places.displayName,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri",
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
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GOOGLE_API_KEY" },
        { status: 500 }
      );
    }

    if (!fs.existsSync(businessesDir)) {
      fs.mkdirSync(businessesDir, { recursive: true });
    }

    let body: GenerateRequest = {};

    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const trade = body.trade || process.env.LEAD_TRADE || "Plumber";
    const city = body.city || process.env.LEAD_CITY || "Hobart";
    const query = body.query || `${trade} in ${city}`;
    const limit = Math.max(1, Math.min(body.limit || 10, 20));

    const places = await searchText(query, apiKey);
    const saved = [];

    for (const place of places.slice(0, limit)) {
      const businessName = place.displayName?.text || "";

      if (!place.id || !businessName) {
        continue;
      }

      const slug = slugify(businessName);

      if (!slug) {
        continue;
      }

      const filePath = path.join(businessesDir, `${slug}.json`);
      const existingLead = readExistingLead(filePath);
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
        businessName,
        trade,
        city,
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
        description: getString(existingLead.description),
        services: Array.isArray(existingLead.services)
          ? existingLead.services
          : [],
        ...googleReviewFields,
        aiGeneratedAt: getString(existingLead.aiGeneratedAt),
        enrichedAt: getString(existingLead.enrichedAt),
      };

      console.log("Saving lead:", { businessName, website });

      fs.writeFileSync(filePath, JSON.stringify(lead, null, 2));
      saved.push(lead);
    }

    return NextResponse.json({
      success: true,
      query,
      saved,
    });
  } catch (error) {
    console.error("Failed to generate leads:", error);

    return NextResponse.json(
      { error: "Failed to generate leads" },
      { status: 500 }
    );
  }
}
