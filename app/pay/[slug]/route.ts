import { NextResponse } from "next/server";
import { createCheckoutSessionForLead } from "../../lib/stripeCheckout";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const session = await createCheckoutSessionForLead({ slug });

    if (!session.url) {
      throw new Error("Checkout session did not return a URL");
    }

    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error("PAY_REDIRECT_CHECKOUT_ERROR", error);

    return NextResponse.json(
      {
        error: "Failed to create payment link",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: error instanceof Error && error.message === "Lead not found" ? 404 : 500 }
    );
  }
}
