import { NextResponse } from "next/server";
import { getStripe } from "../../../lib/stripe";
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

    if (!leadRow.stripe_customer_id) {
      return NextResponse.json(
        { error: "Missing Stripe customer" },
        { status: 400 }
      );
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: leadRow.stripe_customer_id,
      return_url: `${getRequiredEnv("NEXT_PUBLIC_APP_URL")}/success`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("STRIPE_PORTAL_ERROR", error);

    return NextResponse.json(
      { error: "Failed to create billing portal session" },
      { status: 500 }
    );
  }
}
