export type GoogleReview = {
  author: string;
  rating: number;
  text: string;
  relativeTimeDescription: string | null;
  source: "google";
};

type GooglePlaceReview = {
  authorAttribution?: {
    displayName?: string;
  };
  rating?: number;
  text?: {
    text?: string;
  };
  relativePublishTimeDescription?: string;
};

export type GooglePlaceDetails = {
  id?: string;
  displayName?: {
    text?: string;
  };
  rating?: number;
  userRatingCount?: number;
  reviews?: GooglePlaceReview[];
};

type LeadWithReviews = Record<string, unknown>;

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function hasExistingGoogleReviews(lead: LeadWithReviews) {
  return (
    lead.reviewsSource === "google" &&
    Array.isArray(lead.reviews) &&
    lead.reviews.some(
      (review) =>
        typeof review === "object" &&
        review !== null &&
        (review as Record<string, unknown>).source === "google"
    )
  );
}

export async function fetchGooglePlaceDetails(placeId: string, apiKey: string) {
  if (!placeId || !apiKey) {
    return null;
  }

  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "id,displayName,rating,userRatingCount,reviews",
      },
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `Google Places Details failed: ${res.status} ${errorText}`
    );
  }

  return (await res.json()) as GooglePlaceDetails;
}

export function normalizeGoogleReviews(details?: GooglePlaceDetails | null) {
  return (details?.reviews || [])
    .map((review) => {
      const normalizedReview: GoogleReview = {
        author: review.authorAttribution?.displayName || "Google reviewer",
        rating: typeof review.rating === "number" ? review.rating : 0,
        text: getString(review.text?.text).trim(),
        relativeTimeDescription:
          review.relativePublishTimeDescription || null,
        source: "google",
      };

      return normalizedReview;
    })
    .filter((review) => review.text);
}

export function buildGoogleReviewFields(args: {
  existingLead?: LeadWithReviews;
  businessName: string;
  reviews: GoogleReview[];
}) {
  if (args.reviews.length > 0) {
    console.log(
      `Found ${args.reviews.length} Google reviews for ${args.businessName}`
    );

    return {
      reviews: args.reviews,
      reviewsSource: "google",
    };
  }

  if (args.existingLead && hasExistingGoogleReviews(args.existingLead)) {
    console.log(`Preserved existing Google reviews for ${args.businessName}`);

    return {
      reviews: args.existingLead.reviews,
      reviewsSource: "google",
    };
  }

  console.log(`No Google reviews found for ${args.businessName}`);

  return {
    reviews: [],
    reviewsSource: "none",
  };
}
