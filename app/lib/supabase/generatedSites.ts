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

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getReviews(lead: LeadRecord) {
  return Array.isArray(lead.reviews)
    ? lead.reviews
        .map((review) => {
          if (!review || typeof review !== "object") return null;

          const currentReview = review as Record<string, unknown>;
          const text =
            typeof currentReview.text === "string"
              ? currentReview.text
              : typeof (currentReview.text as Record<string, unknown>)?.text ===
                  "string"
                ? String((currentReview.text as Record<string, unknown>).text)
                : "";

          return {
            author:
              getString(currentReview.author) ||
              getString(currentReview.name) ||
              "Local Customer",
            rating: Number(currentReview.rating) || 5,
            text,
          };
        })
        .filter((review): review is { author: string; rating: number; text: string } =>
          Boolean(review?.text)
        )
        .slice(0, 3)
    : [];
}

export function buildGeneratedSiteHtml(lead: LeadRecord) {
  const businessName = getString(lead.businessName) || "Local Business";
  const city = getString(lead.city) || "Hobart";
  const trade = getString(lead.trade) || "Local Service";
  const phone = getString(lead.phone);
  const email = getString(lead.email);
  const website = getString(lead.website);
  const description =
    getString(lead.description) ||
    getString(lead.solution) ||
    `${businessName} provides reliable ${trade.toLowerCase()} services across ${city}.`;
  const services = getStringArray(lead.services);
  const reviews = getReviews(lead);
  const headline =
    getString(lead.headline) ||
    `${escapeHtml(trade)} services in ${escapeHtml(city)}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(businessName)} | ${escapeHtml(city)} ${escapeHtml(trade)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <style>
    :root { color-scheme: light; --ink: #0f172a; --muted: #475569; --brand: #2563eb; --soft: #eff6ff; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: var(--ink); background: #f8fafc; line-height: 1.6; }
    a { color: inherit; }
    .wrap { width: min(1120px, calc(100% - 32px)); margin: 0 auto; }
    header { background: white; border-bottom: 1px solid #e2e8f0; }
    nav { min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .brand { font-weight: 900; font-size: 20px; }
    .phone { background: var(--brand); color: white; text-decoration: none; padding: 12px 16px; border-radius: 8px; font-weight: 800; }
    .hero { padding: 72px 0; background: linear-gradient(135deg, #dbeafe, #f8fafc); }
    .hero-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(280px, .6fr); gap: 32px; align-items: center; }
    h1 { font-size: clamp(36px, 6vw, 64px); line-height: 1; margin: 0 0 20px; letter-spacing: 0; }
    h2 { font-size: 32px; line-height: 1.15; margin: 0 0 20px; }
    p { margin: 0 0 18px; color: var(--muted); }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
    .button { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 18px; border-radius: 8px; font-weight: 800; text-decoration: none; }
    .primary { background: var(--brand); color: white; }
    .secondary { background: white; color: var(--ink); border: 1px solid #cbd5e1; }
    .panel { background: white; border: 1px solid #dbeafe; border-radius: 8px; padding: 24px; box-shadow: 0 20px 60px rgba(15, 23, 42, .08); }
    .section { padding: 56px 0; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 22px; }
    .stars { color: #eab308; font-weight: 900; letter-spacing: 2px; }
    footer { background: #0f172a; color: white; padding: 36px 0; }
    footer p { color: #cbd5e1; }
    @media (max-width: 800px) { .hero-grid, .grid { grid-template-columns: 1fr; } nav { align-items: flex-start; flex-direction: column; padding: 16px 0; } }
  </style>
</head>
<body>
  <header>
    <nav class="wrap">
      <div class="brand">${escapeHtml(businessName)}</div>
      ${phone ? `<a class="phone" href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>` : ""}
    </nav>
  </header>

  <main>
    <section class="hero">
      <div class="wrap hero-grid">
        <div>
          <h1>${headline}</h1>
          <p>${escapeHtml(description)}</p>
          <div class="actions">
            ${phone ? `<a class="button primary" href="tel:${escapeHtml(phone)}">Call Now</a>` : ""}
            ${email ? `<a class="button secondary" href="mailto:${escapeHtml(email)}">Request a Quote</a>` : ""}
          </div>
        </div>
        <div class="panel">
          <strong>${escapeHtml(city)} ${escapeHtml(trade)}</strong>
          <p>Fast local help, clear communication, and service built around calls from nearby customers.</p>
          ${website ? `<p>Original website: <a href="${escapeHtml(website)}">${escapeHtml(website)}</a></p>` : ""}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <h2>Services</h2>
        <div class="grid">
          ${
            services.length
              ? services
                  .slice(0, 6)
                  .map((service) => `<div class="card">${escapeHtml(service)}</div>`)
                  .join("")
              : `<div class="card">Emergency ${escapeHtml(trade)}</div><div class="card">Repairs and maintenance</div><div class="card">Local service calls</div>`
          }
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <h2>What customers say</h2>
        <div class="grid">
          ${
            reviews.length
              ? reviews
                  .map(
                    (review) => `<div class="card"><div class="stars">${"★".repeat(
                      Math.max(1, Math.min(5, Math.round(review.rating)))
                    )}</div><p>${escapeHtml(review.text)}</p><strong>${escapeHtml(
                      review.author
                    )}</strong></div>`
                  )
                  .join("")
              : `<div class="card"><div class="stars">★★★★★</div><p>Great service, highly recommended.</p><strong>Local Customer</strong></div>`
          }
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="wrap">
      <strong>${escapeHtml(businessName)}</strong>
      <p>${escapeHtml(city)} ${escapeHtml(trade)} services${phone ? ` | ${escapeHtml(phone)}` : ""}</p>
    </div>
  </footer>
</body>
</html>`;
}
