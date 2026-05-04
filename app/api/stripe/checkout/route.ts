import { NextResponse } from "next/server";
import { getStripe } from "../../../lib/stripe";
import { getSupabaseAdmin } from "../../../lib/supabase/server";
import {
  getLeadRowBySlug,
  rowToLead,
  type LeadRow,
} from "../../../lib/supabase/leads";

export const runtime = "nodejs";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function matchesLeadId(leadId: string, row: LeadRow) {
  if (!leadId) return true;

  const lead = rowToLead(row);
  const rowId = row.id !== undefined && row.id !== null ? String(row.id) : "";
  const rowSlug = getString(row.slug) || getString(lead.slug);

  return leadId === rowId || leadId === getString(lead.id) || leadId === rowSlug;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const leadId = getString(body.leadId);
    const slug = getString(body.slug);

    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const leadRow = await getLeadRowBySlug(slug);

    if (!leadRow || !matchesLeadId(leadId, leadRow)) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const stripe = getStripe();
    const supabase = getSupabaseAdmin();
    const lead = rowToLead(leadRow);
    const leadSlug = getString(lead.slug) || slug;
    const appUrl = getRequiredEnv("NEXT_PUBLIC_APP_URL");
    const setupPriceId = getRequiredEnv("STRIPE_SETUP_PRICE_ID");
    const monthlyPriceId = getRequiredEnv("STRIPE_MONTHLY_PRICE_ID");
    const metadata = {
      lead_id:
        leadRow.id !== undefined && leadRow.id !== null
          ? String(leadRow.id)
          : getString(lead.id) || leadSlug,
      lead_slug: leadSlug,
    };

    let customerId = leadRow.stripe_customer_id || "";

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: getString(lead.email) || undefined,
        name:
          getString(lead.businessName) || getString(lead.name) || undefined,
        metadata,
      });

      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: monthlyPriceId,
          quantity: 1,
        },
        {
          price: setupPriceId,
          quantity: 1,
        },
      ],
      metadata,
      subscription_data: {
        metadata,
      },
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/cancel?lead=${encodeURIComponent(leadSlug)}`,
    });

    const { error } = await supabase
      .from("leads")
      .update({
        stripe_customer_id: customerId,
        stripe_checkout_session_id: session.id,
      })
      .eq("slug", leadSlug);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    console.error("STRIPE_CHECKOUT_ERROR", error);

    return NextResponse.json(
      {
        error: "Failed to create checkout session",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
