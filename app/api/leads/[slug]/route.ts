import { NextResponse } from "next/server";
import {
  isLifecycleStatus,
  type LeadRecord,
} from "../../../lib/leadLifecycle";
import { listCallbacksForLead } from "../../../lib/supabase/callbacks";
import {
  getLeadBySlug,
  getLeadRowBySlug,
  rowToLead,
  updateLeadBySlug,
  updateLeadStatusBySlug,
} from "../../../lib/supabase/leads";

function getNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const leadRow = await getLeadRowBySlug(slug);

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const lead = rowToLead(leadRow);
    const callbacks = await listCallbacksForLead({
      leadId: leadRow.id || null,
      slug,
    });

    return NextResponse.json({ lead, callbacks });
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

  try {
    let updatedLead: LeadRecord | null = null;

    if (status !== undefined) {
      if (!isLifecycleStatus(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }

      updatedLead = await updateLeadStatusBySlug(slug, status, reviewNotes);
    } else {
      const existingLead = await getLeadBySlug(slug);

      if (!existingLead) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }

      updatedLead = await updateLeadBySlug(slug, {
        ...existingLead,
        callbackForwardingEnabled:
          body.callbackForwardingEnabled === true ||
          body.callbackForwardingEnabled === "true",
        callbackForwardToEmail: getNullableString(body.callbackForwardToEmail),
        callbackForwardToPhone: getNullableString(body.callbackForwardToPhone),
      });
    }

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
