import { NextResponse } from "next/server";
import { createCheckoutSessionForLead } from "../../../lib/stripeCheckout";

export const runtime = "nodejs";

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const leadId = getString(body.leadId);
    const slug = getString(body.slug);

    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const session = await createCheckoutSessionForLead({
      slug,
      leadId,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    console.error("STRIPE_CHECKOUT_ERROR", error);
    const message =
      error instanceof Error ? error.message : "Failed to create checkout session";
    const status = message === "Lead not found" ? 404 : 500;

    return NextResponse.json(
      {
        error: "Failed to create checkout session",
        details: message,
      },
      { status }
    );
  }
}
