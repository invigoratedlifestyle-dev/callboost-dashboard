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

function getReviewRating(review: unknown) {
  if (!review || typeof review !== "object") return 0;

  const rating = Number((review as Record<string, unknown>).rating);

  return Number.isFinite(rating) ? rating : 0;
}

function getReviewTime(review: GoogleReview) {
  const text = review.relativeTimeDescription || "";
  const numberMatch = text.match(/\d+/);
  const amount = numberMatch ? Number(numberMatch[0]) : 0;

  if (/day/i.test(text)) return amount;
  if (/week/i.test(text)) return amount * 7;
  if (/month/i.test(text)) return amount * 30;
  if (/year/i.test(text)) return amount * 365;

  return Number.MAX_SAFE_INTEGER;
}

function filterPositiveReviews(reviews: GoogleReview[]) {
  return reviews
    .filter((review) => review.rating >= 4)
    .sort((a, b) => {
      const ratingDiff = b.rating - a.rating;

      if (ratingDiff !== 0) return ratingDiff;

      return getReviewTime(a) - getReviewTime(b);
    });
}

function normalizeStoredGoogleReview(review: unknown): GoogleReview | null {
  if (!review || typeof review !== "object") return null;

  const record = review as Record<string, unknown>;
  const rating = getReviewRating(review);
  const text = getString(record.text).trim();

  if (rating < 4 || !text) return null;

  return {
    author:
      getString(record.author).trim() ||
      getString(record.author_name).trim() ||
      getString(record.name).trim() ||
      "Google reviewer",
    rating,
    text,
    relativeTimeDescription:
      getString(record.relativeTimeDescription).trim() ||
      getString(record.relative_time_description).trim() ||
      null,
    source: "google",
  };
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
  return filterPositiveReviews(
    (details?.reviews || [])
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
      .filter((review) => review.text)
  );
}

export function buildGoogleReviewFields(args: {
  existingLead?: LeadWithReviews;
  businessName: string;
  reviews: GoogleReview[];
}) {
  const reviews = filterPositiveReviews(args.reviews);

  if (reviews.length > 0) {
    console.log(
      `Found ${reviews.length} positive Google reviews for ${args.businessName}`
    );

    return {
      reviews,
      reviewsSource: "google",
    };
  }

  if (args.existingLead && hasExistingGoogleReviews(args.existingLead)) {
    const existingReviews = Array.isArray(args.existingLead.reviews)
      ? filterPositiveReviews(
          args.existingLead.reviews
            .map(normalizeStoredGoogleReview)
            .filter((review): review is GoogleReview => Boolean(review))
        )
      : [];

    if (!existingReviews.length) {
      console.log(`No positive Google reviews found for ${args.businessName}`);

      return {
        reviews: [],
        reviewsSource: "none",
      };
    }

    console.log(`Preserved existing Google reviews for ${args.businessName}`);

    return {
      reviews: existingReviews,
      reviewsSource: "google",
    };
  }

  console.log(`No positive Google reviews found for ${args.businessName}`);

  return {
    reviews: [],
    reviewsSource: "none",
  };
}
