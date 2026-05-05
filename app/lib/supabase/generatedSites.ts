import { getSupabaseAdmin } from "./server";
import type { LeadRecord } from "../leadLifecycle";

export type GeneratedSiteRow = {
  id?: string | number;
  lead_id?: string | number | null;
  slug: string;
  html: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type Review = {
  author: string;
  rating: number | null;
  text: string;
  relativeTimeDescription: string;
  source: string;
};

export async function saveGeneratedSite(args: {
  leadId?: string | number | null;
  slug: string;
  html: string;
}) {
  const supabase = getSupabaseAdmin();
  const existing = await supabase
    .from("generated_sites")
    .select("id")
    .eq("slug", args.slug)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  const row = {
    lead_id: args.leadId || null,
    slug: args.slug,
    html: args.html,
  };

  if (existing.data?.id) {
    const { data, error } = await supabase
      .from("generated_sites")
      .update(row)
      .eq("id", existing.data.id)
      .select("*")
      .single();

    if (error) throw error;

    return data as GeneratedSiteRow;
  }

  const { data, error } = await supabase
    .from("generated_sites")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;

  return data as GeneratedSiteRow;
}

export async function getGeneratedSiteBySlug(slug: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("generated_sites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;

  return data as GeneratedSiteRow | null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: unknown) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function slugify(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.text === "string") return record.text;
    if (typeof record.name === "string") return record.name;
    if (typeof record.displayName === "string") return record.displayName;
  }

  return "";
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.map((item) => getText(item).trim()).filter(Boolean);
}

function titleCase(value: unknown) {
  return String(value ?? "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cleanBusinessName(value: unknown) {
  return getText(value)
    .replace(/#+/g, "")
    .replace(/\s*[-–—]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function phoneToTel(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function hashString(value: unknown) {
  const text = String(value ?? "");
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function pickStable<T>(items: T[], seed: string, offset = 0) {
  return items[(hashString(seed) + offset) % items.length];
}

function isPlumberTrade(trade: unknown) {
  return String(trade ?? "").toLowerCase().includes("plumb");
}

function isServiceTrade(trade: unknown) {
  const text = String(trade ?? "").toLowerCase();

  return [
    "plumb",
    "electric",
    "roof",
    "locksmith",
    "hvac",
    "air conditioning",
    "handyman",
    "gas",
    "pest",
    "clean",
    "garage",
    "glass",
    "tree",
    "landscap",
  ].some((keyword) => text.includes(keyword));
}

function normalizeTrade(trade: unknown) {
  const text = String(trade ?? "").toLowerCase();

  if (text.includes("plumb")) return "plumber";
  if (text.includes("electric")) return "electrician";
  if (text.includes("roof")) return "roofer";

  return slugify(trade || "tradie");
}

function getDefaultServices(trade: string) {
  if (isPlumberTrade(trade)) {
    return [
      "Emergency Plumbing",
      "Blocked Drains",
      "Hot Water Systems",
      "Leak Detection & Repairs",
      "General Plumbing",
      "Bathroom & Kitchen Plumbing",
      "Gas Fitting",
      "Commercial Plumbing",
    ];
  }

  return [
    `Emergency ${titleCase(trade)}`,
    "Repairs & Maintenance",
    "Residential Service",
    "Commercial Service",
    "Local Call Outs",
    "Quotes & Advice",
  ];
}

function getServiceDescription(serviceName: string, trade: string) {
  const lower = serviceName.toLowerCase();

  if (lower.includes("emergency") || lower.includes("urgent")) {
    return "Fast help for urgent issues, leaks, overflows and jobs that cannot wait.";
  }

  if (lower.includes("blocked") || lower.includes("drain")) {
    return "Clear blocked sinks, toilets, showers and stormwater drains with practical repair advice.";
  }

  if (lower.includes("hot water")) {
    return "Repair, replacement and servicing for electric, gas and common hot water systems.";
  }

  if (lower.includes("leak")) {
    return "Find the source of leaks and arrange repairs before water damage gets worse.";
  }

  if (lower.includes("bathroom") || lower.includes("kitchen")) {
    return "Support for renovations, upgrades, taps, toilets, sinks and fixtures.";
  }

  if (lower.includes("gas")) {
    return "Gas fitting support where suitable, with clear scope and safety-minded workmanship.";
  }

  if (lower.includes("commercial")) {
    return "Reliable support for shops, offices, rentals and local business premises.";
  }

  return `Straightforward ${trade.toLowerCase()} repairs, maintenance and installation help for local properties.`;
}

function getServices(lead: LeadRecord, trade: string) {
  const leadServices = getStringArray(lead.services);
  const defaults = getDefaultServices(trade);
  const seen = new Set<string>();
  const services: string[] = [];

  for (const service of [...leadServices, ...defaults]) {
    const clean = service.length > 80 ? `${service.slice(0, 77)}...` : service;
    const key = clean.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      services.push(clean);
    }
  }

  return services.slice(0, 6);
}

function getTopServices(services: string[], trade: string) {
  if (services.length > 0) return services.slice(0, 3).join(", ");

  if (isPlumberTrade(trade)) return "leaks, blocked drains and hot water issues";

  return "repairs, maintenance and urgent jobs";
}

function getHeroImages(trade: string, seed: string) {
  const plumberImages = [
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Sink_unclogging_repair.jpg",
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Plumber_at_work.jpg",
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Plumber_under_kitchen_sink.jpg",
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Plumber_soldering_pipe_above_new_water_heater.JPG",
  ];
  const genericTradeImages = [
    "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1800&q=80",
    "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1800&q=80",
  ];

  return pickStable(isPlumberTrade(trade) ? plumberImages : genericTradeImages, seed);
}

function getLocationCoords(location: unknown) {
  if (!location || typeof location !== "object") return null;

  const record = location as Record<string, unknown>;
  const lat = record.lat ?? record.latitude;
  const lng = record.lng ?? record.longitude;
  const latNumber = Number(lat);
  const lngNumber = Number(lng);

  if (!Number.isFinite(latNumber) || !Number.isFinite(lngNumber)) return null;

  return { lat: latNumber, lng: lngNumber };
}

function getMapEmbedUrl(lead: LeadRecord) {
  const coords = getLocationCoords(lead.location);

  if (coords) {
    return `https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=14&output=embed`;
  }

  const address = getText(lead.formattedAddress);

  if (address) {
    return `https://www.google.com/maps?q=${encodeURIComponent(address)}&z=14&output=embed`;
  }

  return "";
}

function formatHours(hours: unknown) {
  if (!hours) return [];
  if (Array.isArray(hours)) return hours.map(getText).filter(Boolean);
  if (typeof hours === "string") return [hours];

  if (typeof hours === "object") {
    const record = hours as Record<string, unknown>;

    if (Array.isArray(record.weekdayDescriptions)) {
      return record.weekdayDescriptions.map(getText).filter(Boolean);
    }

    if (Array.isArray(record.weekdayText)) {
      return record.weekdayText.map(getText).filter(Boolean);
    }
  }

  return [];
}

function formatReviewText(review: unknown) {
  const text = getText(review).trim();

  return text.length > 190 ? `${text.slice(0, 187)}...` : text;
}

function normalizeReview(review: unknown): Review | null {
  if (!review) return null;

  if (typeof review === "string") {
    return {
      author: "Local Customer",
      rating: 5,
      text: formatReviewText(review),
      relativeTimeDescription: "",
      source: "",
    };
  }

  if (typeof review !== "object") return null;

  const record = review as Record<string, unknown>;
  const rating = Number(record.rating);
  const normalized = {
    author:
      getText(record.author || record.author_name || record.name).trim() ||
      "Local Customer",
    rating: Number.isFinite(rating) ? rating : null,
    text: formatReviewText(record.text || review),
    relativeTimeDescription: getText(
      record.relativeTimeDescription || record.relative_time_description
    ).trim(),
    source: getText(record.source).trim().toLowerCase(),
  };

  if (!normalized.author && !normalized.rating && !normalized.text) return null;

  return normalized;
}

function getReviews(lead: LeadRecord) {
  return Array.isArray(lead.reviews)
    ? lead.reviews
        .map(normalizeReview)
        .filter(
          (review): review is Review =>
            Boolean(review?.text) && Number(review?.rating || 0) >= 4
        )
        .sort((a, b) => {
          const ratingDiff = Number(b.rating || 0) - Number(a.rating || 0);

          if (ratingDiff !== 0) return ratingDiff;

          return getReviewAgeDays(a) - getReviewAgeDays(b);
        })
        .slice(0, 3)
    : [];
}

function getReviewAgeDays(review: Review) {
  const text = review.relativeTimeDescription || "";
  const numberMatch = text.match(/\d+/);
  const amount = numberMatch ? Number(numberMatch[0]) : 0;

  if (/day/i.test(text)) return amount;
  if (/week/i.test(text)) return amount * 7;
  if (/month/i.test(text)) return amount * 30;
  if (/year/i.test(text)) return amount * 365;

  return Number.MAX_SAFE_INTEGER;
}

function isGoogleReviewSource(lead: LeadRecord, reviews: Review[]) {
  const reviewsSource = getText(lead.reviewsSource).toLowerCase();

  return reviewsSource === "google" || reviews.some((review) => review.source === "google");
}

function renderStars(rating: number | null) {
  if (!rating || !Number.isFinite(rating) || rating <= 0) return "";

  const count = Math.max(1, Math.min(5, Math.round(rating)));

  return "&#9733;".repeat(count);
}

function getTrustItems(args: {
  city: string;
  lead: LeadRecord;
  services: string[];
  trade: string;
}) {
  const { city, lead, services, trade } = args;
  const tradeLower = trade.toLowerCase();
  const label = isPlumberTrade(trade)
    ? "plumbing"
    : tradeLower || "service";
  const items: [string, string][] = [
    [
      "Licensed & insured",
      `Professional ${label} help with safety-minded workmanship.`,
    ],
    [
      `Local ${city} service`,
      `Support from a local business focused on ${city} and nearby areas.`,
    ],
    [
      "Fast response",
      `Quick contact for ${getTopServices(services, trade).toLowerCase()} and urgent jobs.`,
    ],
    ["Clear quotes", "Straightforward communication before work begins."],
    [
      "Quality workmanship",
      "Neat, practical repairs and installations for homes and businesses.",
    ],
    [
      "Residential & commercial",
      "Help for households, rentals, offices and local business premises.",
    ],
  ];
  const years =
    getText(lead.yearsExperience) ||
    getText(lead.yearsInBusiness) ||
    getText(lead.experienceYears);

  if (years) {
    items.push([
      `${years} years of experience`,
      "Experienced help for common and complex local jobs.",
    ]);
  }

  return items.slice(0, 6);
}

function getServiceAreas(lead: LeadRecord, city: string) {
  const areas = getStringArray(lead.serviceAreas);

  if (areas.length > 0) return areas.join(", ");

  const suburbs = getStringArray(lead.nearbySuburbs);

  if (suburbs.length > 0) return [city, ...suburbs].filter(Boolean).join(", ");

  return city ? `${city} and surrounding areas` : "Local service area";
}

function buildFaqs(args: { city: string; businessName: string; trade: string }) {
  const { city, businessName, trade } = args;
  const tradeLower = isPlumberTrade(trade) ? "plumbing" : trade.toLowerCase();

  if (isPlumberTrade(trade)) {
    return [
      [
        `Do you service ${city}?`,
        `Yes. ${businessName} provides plumbing help across ${city} and surrounding areas.`,
      ],
      [
        "Can you help with urgent plumbing issues?",
        "Call directly for urgent leaks, blocked drains, hot water problems and other plumbing issues that need prompt attention.",
      ],
      [
        "Do you provide quotes before starting?",
        "Yes. You can talk through the job first and get a clear next step before work begins.",
      ],
      [
        "Can you fix blocked drains?",
        "Yes. Blocked sinks, toilets, showers and drains are common plumbing jobs that can be assessed and cleared.",
      ],
      [
        "Do you repair hot water systems?",
        "Yes. Hot water repairs, replacements and servicing can be discussed when you call or request a callback.",
      ],
      [
        "Do you handle residential and commercial plumbing?",
        "Yes. The site can support plumbing enquiries for homes, rentals, shops, offices and local businesses.",
      ],
    ];
  }

  return [
    [
      `Do you service ${city}?`,
      `Yes. ${businessName} provides ${tradeLower} help across ${city} and surrounding areas.`,
    ],
    [
      "Can I request a quote?",
      "Yes. Send a short description of the job and the team can call back with the next step.",
    ],
    [
      "Do you handle urgent jobs?",
      "Call directly for time-sensitive local jobs and practical advice about availability.",
    ],
    [
      "Do you work with homes and businesses?",
      "Yes. The site supports enquiries from residential and commercial customers.",
    ],
  ];
}

function buildHeroHeadline(trade: string, city: string) {
  if (isPlumberTrade(trade)) return `Trusted Plumbing Services in ${city}`;

  return `Trusted ${titleCase(trade)} Services in ${city}`;
}

function buildHeroSubheading(trade: string, city: string, topServices: string) {
  const label = isPlumberTrade(trade) ? "plumbing" : trade.toLowerCase();

  return `Fast, reliable ${label} for homes and businesses across ${city}. Call today for help with ${topServices}.`;
}

export function buildGeneratedSiteHtml(lead: LeadRecord) {
  const slugSource =
    getText(lead.slug) ||
    getText(lead.id) ||
    getText(lead.googlePlaceId) ||
    getText(lead.businessName) ||
    getText(lead.name) ||
    "local-business";
  const businessName =
    cleanBusinessName(lead.businessName || lead.name) || titleCase(slugSource);
  const trade = getText(lead.trade).trim() || "plumber";
  const tradeLabel = titleCase(trade);
  const city = getText(lead.city).trim() || "Hobart";
  const citySlug = slugify(city || "local");
  const tradeSlug = normalizeTrade(trade);
  const businessSlug = slugify(slugSource);
  const seed = `${businessSlug}-${citySlug}-${tradeSlug}`;
  const heroImage = getHeroImages(trade, seed);
  const phone = getText(lead.phone).trim();
  const phoneRaw = phoneToTel(phone);
  const hasPhone = Boolean(phoneRaw);
  const email = getText(lead.email).trim();
  const emailHref = email ? `mailto:${encodeURIComponent(email)}` : "";
  const formattedAddress = getText(lead.formattedAddress).trim();
  const rating = getText(lead.rating).trim();
  const reviewCount =
    getText(lead.user_ratings_total).trim() ||
    getText(lead.reviewCount).trim() ||
    getText(lead.userRatingCount).trim();
  const hasRating = Boolean(rating && reviewCount);
  const services = getServices(lead, trade);
  const topServices = getTopServices(services, trade);
  const serviceAreas = getServiceAreas(lead, city);
  const trustItems = getTrustItems({ city, lead, services, trade });
  const faqs = buildFaqs({ city, businessName, trade });
  const reviews = getReviews(lead);
  const hasReviews = reviews.length > 0;
  const usingGoogleReviews = hasReviews && isGoogleReviewSource(lead, reviews);
  const mapEmbedUrl = getMapEmbedUrl(lead);
  const hoursLines = formatHours(lead.hours);
  const variant = isPlumberTrade(trade) ? "plumber-classic" : "tradie-classic";
  const heroHeadline = buildHeroHeadline(trade, city);
  const heroSubheading = buildHeroSubheading(trade, city, topServices);
  const description =
    getText(lead.description).trim() ||
    `${businessName} provides local ${tradeLabel} services in ${city}. Call directly or request a callback.`;

  const navCallHtml = hasPhone
    ? `<a class="nav-call" href="tel:${escapeAttribute(phoneRaw)}">${escapeHtml(phone)}</a>`
    : "";
  const callButtonHtml = hasPhone
    ? `<a class="button accent" href="tel:${escapeAttribute(phoneRaw)}">Call Now: ${escapeHtml(phone)}</a>`
    : `<a class="button accent" href="#quote">Call Now</a>`;
  const ratingBadgeHtml = hasRating
    ? `<div class="hero-rating">Rated ${escapeHtml(rating)}&#9733; from ${escapeHtml(reviewCount)} local reviews</div>`
    : "";
  const reviewSummaryHtml = hasRating
    ? `<p class="review-summary">Rated ${escapeHtml(rating)}&#9733; from ${escapeHtml(reviewCount)} local reviews</p>`
    : "";
  const heroUrgencyHtml = isServiceTrade(trade)
    ? `<p class="hero-urgency">Available today for urgent ${escapeHtml(tradeLabel.toLowerCase())} issues</p>`
    : "";
  const contactPhoneHtml = hasPhone
    ? `<p><span>Phone</span><a href="tel:${escapeAttribute(phoneRaw)}">${escapeHtml(phone)}</a></p>`
    : "";
  const emailHtml = email
    ? `<p><span>Email</span><a href="${escapeAttribute(emailHref)}">${escapeHtml(email)}</a></p>`
    : "";
  const addressHtml = formattedAddress
    ? `<p><span>Address</span>${escapeHtml(formattedAddress)}</p>`
    : "";
  const mobileCallHtml = hasPhone
    ? `<div class="mobile-call-bar"><a href="tel:${escapeAttribute(phoneRaw)}">Call ${escapeHtml(phone)}</a></div>`
    : "";
  const servicesHtml = services
    .map(
      (service) => `
        <article class="service-card">
          <h3>${escapeHtml(service)}</h3>
          <p>${escapeHtml(getServiceDescription(service, tradeLabel))}</p>
          ${hasPhone ? `<a href="tel:${escapeAttribute(phoneRaw)}">Call for ${escapeHtml(service)}</a>` : `<a href="#quote">Ask about ${escapeHtml(service)}</a>`}
        </article>`
    )
    .join("");
  const trustHtml = trustItems
    .map(
      ([title, text]) => `
        <div class="trust-card">
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(text)}</p>
        </div>`
    )
    .join("");
  const reviewsHeading = usingGoogleReviews
    ? "Google reviews from local customers"
    : "What locals are saying";
  const reviewsIntro = usingGoogleReviews
    ? "Real Google reviews from recent local customers."
    : "Recent customer feedback from local jobs.";
  const reviewsHtml = reviews
    .map((review) => {
      const stars = renderStars(review.rating);
      const time = review.relativeTimeDescription
        ? `<small>${escapeHtml(review.relativeTimeDescription)}</small>`
        : "";

      return `
        <article class="review-card">
          ${stars ? `<div class="stars">${stars}</div>` : ""}
          <p>"${escapeHtml(review.text)}"</p>
          <small>${escapeHtml(review.author)}</small>
          ${time}
        </article>`;
    })
    .join("");
  const reviewsSectionHtml = hasReviews
    ? `
    <section id="reviews" class="section">
      <div class="container">
        <div class="section-header center">
          <div class="section-kicker">Reviews</div>
          <h2>${escapeHtml(reviewsHeading)}</h2>
          ${reviewSummaryHtml}
          <p class="muted">${escapeHtml(reviewsIntro)}</p>
        </div>
        <div class="review-grid">${reviewsHtml}</div>
      </div>
    </section>`
    : "";
  const faqHtml = faqs
    .map(
      ([question, answer]) => `
        <details class="faq-item">
          <summary>${escapeHtml(question)}</summary>
          <p>${escapeHtml(answer)}</p>
        </details>`
    )
    .join("");
  const hoursHtml =
    hoursLines.length > 0
      ? `<div class="hours-card"><h3>Opening hours</h3><ul>${hoursLines
          .map((line) => `<li>${escapeHtml(line)}</li>`)
          .join("")}</ul></div>`
      : isServiceTrade(trade)
        ? `<div class="hours-card"><h3>Opening hours</h3><p>Open 24 hours / 7 days</p></div>`
        : "";
  const footerHoursHtml =
    hoursLines.length > 0
      ? `<ul>${hoursLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
      : isServiceTrade(trade)
        ? "<p>Open 24 hours / 7 days</p>"
        : "";
  const mapHtml = mapEmbedUrl
    ? `<div class="map-panel">
        <h3>Find us in ${escapeHtml(city)}</h3>
        <iframe src="${escapeAttribute(mapEmbedUrl)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map showing ${escapeAttribute(businessName)} in ${escapeAttribute(city)}"></iframe>
      </div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(businessName)} | ${escapeHtml(tradeLabel)} in ${escapeHtml(city)}</title>
  <meta name="description" content="${escapeAttribute(description)}" />
  <style>
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #172033; background: #ffffff; line-height: 1.55; }
    a { color: inherit; }
    h1, h2, h3, p { margin: 0; }
    h1 { max-width: 900px; margin: 0 auto; color: white; font-size: clamp(42px, 6.1vw, 78px); line-height: 1.02; letter-spacing: 0; }
    h2 { color: #111827; font-size: clamp(30px, 4vw, 46px); line-height: 1.08; letter-spacing: 0; }
    h3 { color: #111827; font-size: 20px; line-height: 1.2; letter-spacing: 0; }
    p { font-size: 17px; }
    .container { width: min(100% - 40px, 1120px); margin: 0 auto; }
    .site-header { position: sticky; top: 0; z-index: 50; background: rgba(255, 255, 255, 0.98); border-bottom: 1px solid #e6eaf0; backdrop-filter: blur(14px); }
    .nav { min-height: 74px; display: flex; align-items: center; justify-content: space-between; gap: 28px; }
    .brand { min-width: 0; color: #111827; text-decoration: none; }
    .brand strong { display: block; overflow: hidden; max-width: 360px; color: #111827; font-size: 19px; line-height: 1.1; text-overflow: ellipsis; white-space: nowrap; }
    .brand span { display: block; margin-top: 4px; color: #667085; font-size: 13px; font-weight: 800; }
    .nav-links { display: flex; align-items: center; gap: 24px; color: #344054; font-size: 14px; font-weight: 800; }
    .nav-links a { text-decoration: none; }
    .nav-call { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 10px 17px; border-radius: 10px; background: #0f766e; color: white; text-decoration: none; font-size: 14px; font-weight: 900; white-space: nowrap; }
    .hero { min-height: 650px; display: flex; align-items: center; padding: 92px 0 104px; color: white; background: linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)), var(--hero-img); background-position: center; background-size: cover; }
    .hero-content { max-width: 900px; margin: 0 auto; text-align: center; }
    .hero-rating { display: inline-flex; width: fit-content; margin-bottom: 18px; padding: 8px 13px; border: 1px solid rgba(255, 255, 255, 0.28); border-radius: 999px; background: rgba(255, 255, 255, 0.16); color: white; font-size: 14px; font-weight: 900; backdrop-filter: blur(10px); }
    .hero-label { margin-bottom: 14px; color: #a7f3d0; font-size: 14px; font-weight: 950; letter-spacing: 0.13em; text-transform: uppercase; }
    .hero-subtitle { max-width: 720px; margin: 20px auto 0; color: #f1f5f9; font-size: 20px; }
    .hero-bullets { display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; margin-top: 26px; color: white; font-weight: 900; }
    .hero-bullets span { padding: 10px 14px; border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 999px; background: rgba(255, 255, 255, 0.12); backdrop-filter: blur(10px); }
    .cta-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 30px; }
    .button { min-height: 54px; display: inline-flex; align-items: center; justify-content: center; padding: 14px 22px; border-radius: 11px; border: 1px solid transparent; font-size: 16px; font-weight: 950; text-decoration: none; cursor: pointer; }
    .button.accent { background: #14b8a6; color: #042f2e; box-shadow: 0 18px 36px rgba(20, 184, 166, 0.28); }
    .button.primary { background: #0f766e; color: white; box-shadow: 0 16px 34px rgba(15, 118, 110, 0.22); }
    .button.secondary { background: white; color: #111827; border-color: #d0d5dd; }
    .hero .button.secondary { background: rgba(255, 255, 255, 0.94); }
    .hero-urgency { margin-top: 18px; color: #d1fae5; font-size: 15px; font-weight: 900; }
    .quote-strip { position: relative; z-index: 5; margin-top: -54px; padding-bottom: 34px; }
    .quote-card { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 28px; align-items: center; padding: 28px; border: 1px solid #e6eaf0; border-radius: 18px; background: white; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.16); }
    .quote-card h2 { font-size: clamp(28px, 3.5vw, 38px); }
    .muted { color: #556070; }
    .mini-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .mini-form label, .callback-form label { display: grid; gap: 7px; color: #344054; font-size: 13px; font-weight: 900; }
    input, textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 13px 14px; color: #111827; font: inherit; background: white; }
    textarea { min-height: 112px; resize: vertical; }
    .mini-form .full { grid-column: 1 / -1; }
    .form-success { display: none; color: #0f766e; font-size: 14px; font-weight: 900; }
    .callback-form.is-sent .form-success, .mini-form.is-sent .form-success { display: block; }
    .section { padding: 78px 0; }
    .section.soft { background: #f7fafc; }
    .section-header { max-width: 720px; margin-bottom: 30px; }
    .section-header.center { margin-left: auto; margin-right: auto; text-align: center; }
    .section-kicker { margin-bottom: 10px; color: #0f766e; font-size: 13px; font-weight: 950; letter-spacing: 0.12em; text-transform: uppercase; }
    .services-grid, .trust-grid, .review-grid, .faq-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
    .service-card, .trust-card, .review-card, .faq-item, .contact-panel, .callback-form, .map-panel { border: 1px solid #e6eaf0; border-radius: 16px; background: white; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06); }
    .service-card, .trust-card, .review-card { padding: 24px; }
    .service-card { display: grid; gap: 12px; }
    .service-card p, .trust-card p, .review-card p, .faq-item p { color: #556070; font-size: 16px; }
    .service-card a { width: fit-content; margin-top: 4px; color: #0f766e; font-weight: 950; text-decoration: none; }
    .trust-card h3 { color: #0f766e; }
    .review-summary { margin-bottom: 16px; color: #0f766e; font-weight: 950; text-align: center; }
    .stars { margin-bottom: 10px; color: #f59e0b; font-size: 17px; letter-spacing: 0; }
    .review-card small { display: block; margin-top: 10px; color: #667085; font-weight: 800; }
    .faq-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .faq-item { padding: 0; overflow: hidden; }
    .faq-item summary { cursor: pointer; padding: 19px 20px; color: #111827; font-size: 17px; font-weight: 950; list-style: none; }
    .faq-item summary::-webkit-details-marker { display: none; }
    .faq-item p { padding: 0 20px 20px; }
    .areas-panel { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 28px; align-items: center; padding: 34px; border-radius: 18px; background: #0b1220; color: white; }
    .areas-panel h2 { color: white; }
    .areas-panel p { color: #cbd5e1; }
    .areas-list { padding: 22px; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 14px; background: rgba(255, 255, 255, 0.08); color: white; font-size: 18px; font-weight: 900; }
    .contact-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items: start; }
    .contact-panel, .callback-form { display: grid; gap: 18px; padding: 26px; }
    .contact-actions { display: grid; gap: 12px; }
    .contact-actions p { display: grid; gap: 4px; padding: 14px 0; border-bottom: 1px solid #eef2f7; }
    .contact-actions span { color: #667085; font-size: 12px; font-weight: 950; letter-spacing: 0.08em; text-transform: uppercase; }
    .contact-actions a { color: #0f766e; font-size: 20px; font-weight: 950; text-decoration: none; overflow-wrap: anywhere; }
    .hours-card { padding: 18px; border-radius: 14px; background: #f7fafc; }
    .hours-card ul, .footer ul { margin: 10px 0 0; padding: 0; list-style: none; }
    .hours-card li, .footer li { margin-top: 5px; color: inherit; font-size: 15px; }
    .map-wrap { margin-top: 22px; }
    .map-panel { overflow: hidden; }
    .map-panel h3 { padding: 18px 20px; border-bottom: 1px solid #e6eaf0; }
    .map-panel iframe { width: 100%; min-height: 320px; display: block; border: 0; }
    .footer { background: #0b1220; color: white; padding: 50px 0 28px; }
    .footer-grid { display: grid; grid-template-columns: 1.25fr 1fr 1fr 1fr; gap: 30px; }
    .footer h3, .footer h4 { margin: 0 0 10px; color: white; }
    .footer p { color: #cbd5e1; font-size: 15px; }
    .footer-links { display: grid; gap: 8px; color: #cbd5e1; font-size: 15px; }
    .footer-links a { color: #cbd5e1; text-decoration: none; overflow-wrap: anywhere; }
    .footer-links a:hover { color: white; }
    .footer-bottom { display: flex; justify-content: space-between; gap: 18px; margin-top: 34px; padding-top: 22px; border-top: 1px solid rgba(255, 255, 255, 0.12); color: #94a3b8; font-size: 14px; }
    .mobile-call-bar { display: none; }
    @media (max-width: 980px) { .nav-links { display: none; } .quote-card, .areas-panel, .contact-layout { grid-template-columns: 1fr; } .services-grid, .trust-grid, .review-grid, .faq-grid, .footer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 700px) { body { padding-bottom: 82px; } .container { width: min(100% - 28px, 1120px); } .nav { min-height: 66px; gap: 12px; } .brand strong { max-width: 210px; font-size: 16px; } .brand span { font-size: 12px; } .nav-call { display: none; } .hero { min-height: auto; padding: 58px 0 86px; } h1 { font-size: clamp(36px, 12vw, 48px); } .hero-subtitle { font-size: 18px; } .hero-bullets { display: grid; grid-template-columns: 1fr 1fr; } .hero-bullets span { border-radius: 12px; } .button, .cta-row, .cta-row a { width: 100%; } .quote-strip { margin-top: -44px; } .quote-card, .contact-panel, .callback-form, .areas-panel { padding: 22px; } .mini-form, .services-grid, .trust-grid, .review-grid, .faq-grid, .footer-grid { grid-template-columns: 1fr; } .section { padding: 58px 0; } .footer { padding-bottom: 32px; } .footer-bottom { display: grid; } .mobile-call-bar { display: block; position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 80; } .mobile-call-bar a { min-height: 58px; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: #14b8a6; color: #042f2e; box-shadow: 0 18px 38px rgba(2, 6, 23, 0.24); font-size: 17px; font-weight: 950; text-decoration: none; } }
  </style>
</head>
<body class="${escapeAttribute(variant)}">
  <header class="site-header">
    <div class="container nav">
      <a class="brand" href="#">
        <strong>${escapeHtml(businessName)}</strong>
        <span>${escapeHtml(tradeLabel)} in ${escapeHtml(city)}</span>
      </a>
      <nav class="nav-links">
        <a href="#services">Services</a>
        <a href="#reviews">Reviews</a>
        <a href="#faq">FAQ</a>
        <a href="#quote">Contact</a>
      </nav>
      ${navCallHtml}
    </div>
  </header>

  <section class="hero" style="--hero-img: url('${escapeAttribute(heroImage)}');">
    <div class="container">
      <div class="hero-content">
        ${ratingBadgeHtml}
        <div class="hero-label">${escapeHtml(businessName)}</div>
        <h1>${escapeHtml(heroHeadline)}</h1>
        <p class="hero-subtitle">${escapeHtml(heroSubheading)}</p>
        <div class="cta-row">
          ${callButtonHtml}
          <a class="button secondary" href="#quote">Request Quote</a>
        </div>
        <div class="hero-bullets">
          <span>Local ${escapeHtml(city)} service</span>
          <span>Fast response</span>
          <span>Clear quotes</span>
          <span>Direct contact</span>
        </div>
        ${heroUrgencyHtml}
      </div>
    </div>
  </section>

  <main>
    <section id="quote" class="quote-strip">
      <div class="container">
        <div class="quote-card">
          <div>
            <div class="section-kicker">Quick quote</div>
            <h2>Need ${escapeHtml(isPlumberTrade(trade) ? "plumbing" : tradeLabel.toLowerCase())} help?</h2>
            <p class="muted">Send the basics through and ${escapeHtml(businessName)} can call back with the next step.</p>
          </div>
          <form class="mini-form" data-slug="${escapeAttribute(businessSlug)}">
            <label>Name<input name="name" type="text" autocomplete="name" required /></label>
            <label>Phone<input name="phone" type="tel" autocomplete="tel" required /></label>
            <label>Service needed<input name="service" type="text" placeholder="${escapeAttribute(isPlumberTrade(trade) ? "Blocked drain, leak, hot water..." : "Repairs, maintenance, quote...")}" /></label>
            <label>Message<input name="message" type="text" placeholder="Where is the issue?" /></label>
            <div class="full">
              <button class="button primary" type="submit">Request a Call Back</button>
              <p class="form-success">Thanks - we'll call you shortly.</p>
            </div>
          </form>
        </div>
      </div>
    </section>

    <section id="services" class="section">
      <div class="container">
        <div class="section-header">
          <div class="section-kicker">Services</div>
          <h2>Our ${escapeHtml(city)} ${escapeHtml(tradeLabel)} Services</h2>
          <p class="muted">Practical ${escapeHtml(tradeLabel.toLowerCase())} help for homes, rentals, shops and commercial properties across ${escapeHtml(city)}.</p>
        </div>
        <div class="services-grid">${servicesHtml}</div>
      </div>
    </section>

    <section class="section soft">
      <div class="container">
        <div class="section-header center">
          <div class="section-kicker">Why choose us</div>
          <h2>Local ${escapeHtml(isPlumberTrade(trade) ? "plumbers" : "service")} you can call directly</h2>
          <p class="muted">A simple, contact-first site for people who need clear help without hunting around.</p>
        </div>
        <div class="trust-grid">${trustHtml}</div>
      </div>
    </section>

    ${reviewsSectionHtml}

    <section id="areas" class="section soft">
      <div class="container">
        <div class="areas-panel">
          <div>
            <div class="section-kicker">Service areas</div>
            <h2>Serving ${escapeHtml(city)} and nearby suburbs</h2>
            <p>Local ${escapeHtml(tradeLabel.toLowerCase())} services for homes and businesses across the area.</p>
          </div>
          <div class="areas-list">${escapeHtml(serviceAreas)}</div>
        </div>
      </div>
    </section>

    <section id="faq" class="section">
      <div class="container">
        <div class="section-header">
          <div class="section-kicker">FAQ</div>
          <h2>Common ${escapeHtml(isPlumberTrade(trade) ? "plumbing" : tradeLabel.toLowerCase())} questions</h2>
          <p class="muted">Straight answers before you pick up the phone.</p>
        </div>
        <div class="faq-grid">${faqHtml}</div>
      </div>
    </section>

    <section class="section soft">
      <div class="container">
        <div class="section-header">
          <div class="section-kicker">Contact</div>
          <h2>Call now or request a callback</h2>
          <p class="muted">Call directly for the fastest response, or send a callback request with a short job description.</p>
        </div>
        <div class="contact-layout">
          <div class="contact-panel">
            <h3>${escapeHtml(businessName)}</h3>
            <div class="contact-actions">
              ${contactPhoneHtml}
              ${emailHtml}
              ${addressHtml}
            </div>
            ${hoursHtml}
            ${callButtonHtml}
          </div>
          <form class="callback-form" data-slug="${escapeAttribute(businessSlug)}">
            <h3>Request a callback</h3>
            <p class="muted">Leave your details and a short description of the job.</p>
            <label>Name<input name="name" type="text" autocomplete="name" required /></label>
            <label>Phone<input name="phone" type="tel" autocomplete="tel" required /></label>
            <label>Message<textarea name="message" placeholder="Briefly describe the job"></textarea></label>
            <button class="button primary" type="submit">Request a Call Back</button>
            <p class="form-success">Thanks - we'll call you shortly.</p>
          </form>
        </div>
        <div class="map-wrap">${mapHtml}</div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <h3>${escapeHtml(businessName)}</h3>
          <p>Local ${escapeHtml(tradeLabel.toLowerCase())} services for homes and businesses in ${escapeHtml(city)}.</p>
        </div>
        <div>
          <h4>Contact</h4>
          <div class="footer-links">
            ${hasPhone ? `<a href="tel:${escapeAttribute(phoneRaw)}">${escapeHtml(phone)}</a>` : ""}
            ${email ? `<a href="${escapeAttribute(emailHref)}">${escapeHtml(email)}</a>` : ""}
            <span>${escapeHtml(city)}</span>
          </div>
        </div>
        <div>
          <h4>Hours</h4>
          <div class="footer-links">${footerHoursHtml}</div>
        </div>
        <div>
          <h4>Quick links</h4>
          <div class="footer-links">
            <a href="#services">Services</a>
            <a href="#reviews">Reviews</a>
            <a href="#areas">Service areas</a>
            <a href="#quote">Request callback</a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <span>&copy; ${escapeHtml(businessName)}</span>
        <span>Serving ${escapeHtml(city)} and surrounding areas</span>
      </div>
    </div>
  </footer>

  ${mobileCallHtml}

  <script>
    document.querySelectorAll(".callback-form, .mini-form").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const submitButton = form.querySelector("button[type='submit']");

        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = "Sending...";
        }

        try {
          const response = await fetch("/api/callback", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              slug: form.getAttribute("data-slug"),
              name: formData.get("name") || "",
              phone: formData.get("phone") || "",
              message: ["service", "message"]
                .map((key) => {
                  const value = formData.get(key);
                  return value ? key + ": " + value : "";
                })
                .filter(Boolean)
                .join("\\n"),
            }),
          });

          if (!response.ok) {
            throw new Error("Callback request failed");
          }

          form.classList.add("is-sent");
          form.reset();
        } catch (error) {
          alert("Sorry, we could not send that request. Please call instead.");
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Request a Call Back";
          }
        }
      });
    });
  </script>
</body>
</html>`;
}
