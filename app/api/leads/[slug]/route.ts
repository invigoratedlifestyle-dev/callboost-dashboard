import { NextResponse } from "next/server";
import {
  isLifecycleStatus,
} from "../../../lib/leadLifecycle";
import {
  getLeadBySlug,
  updateLeadStatusBySlug,
} from "../../../lib/supabase/leads";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const lead = await getLeadBySlug(slug);

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ lead });
  } catch (error) {
    console.error("Failed to load lead:", error);

    return NextResponse.json(
      {
        error: "Failed to load lead",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const status = body.status;
  const reviewNotes =
    typeof body.reviewNotes === "string" ? body.reviewNotes : undefined;

  if (!isLifecycleStatus(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    const updatedLead = await updateLeadStatusBySlug(slug, status, reviewNotes);

    if (!updatedLead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ lead: updatedLead });
  } catch (error) {
    console.error("Failed to update lead:", error);

    return NextResponse.json(
      {
        error: "Failed to update lead",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
