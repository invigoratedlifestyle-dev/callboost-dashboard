import { NextResponse } from "next/server";
import {
  getFollowUpDueStatus,
  type FollowUpStage,
} from "../../../lib/followUps";
import { listLeadMessages } from "../../../lib/supabase/leadMessages";
import {
  listLeadRows,
  rowToLead,
  type LeadRow,
} from "../../../lib/supabase/leads";
import { getLeadStatus } from "../../../lib/leadLifecycle";

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getStageLabel(stage: FollowUpStage) {
  return stage === 3 ? "Final Follow-up Due" : `Follow-up ${stage} Due`;
}

export async function GET() {
  try {
    const leadRows = (await listLeadRows()) as LeadRow[];
    const contactedLeadRows = leadRows.filter((row) => {
      const data = row.data && typeof row.data === "object" ? row.data : {};

      return getLeadStatus({ ...data, status: row.status || data.status }) ===
        "contacted";
    });
    const now = Date.now();
    const queueItems = await Promise.all(
      contactedLeadRows.map(async (leadRow) => {
        const lead = rowToLead(leadRow);
        const slug = getString(lead.slug);
        const leadId =
          leadRow.id !== null && leadRow.id !== undefined
            ? String(leadRow.id)
            : null;

        if (!slug) return null;

        const messages = await listLeadMessages({
          leadId,
          slug,
        });
        const dueStatus = getFollowUpDueStatus(lead, messages, now);

        if (!dueStatus.isDue || !dueStatus.nextStage) return null;

        return {
          id: leadId || slug,
          slug,
          businessName:
            getString(lead.businessName) || getString(lead.name) || slug,
          city: getString(lead.city),
          trade: getString(lead.trade),
          lastOutboundAt: dueStatus.lastOutboundAt,
          latestOutboundAt: dueStatus.latestOutboundAt,
          nextFollowUpStage: dueStatus.nextStage,
          nextFollowUpLabel: getStageLabel(dueStatus.nextStage),
          dueAt: dueStatus.dueAt,
          dueSince: dueStatus.dueSince,
        };
      })
    );

    const needsFollowUp = queueItems
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => {
        const aTime = new Date(a.dueAt || "").getTime();
        const bTime = new Date(b.dueAt || "").getTime();

        return (Number.isFinite(aTime) ? aTime : 0) -
          (Number.isFinite(bTime) ? bTime : 0);
      });

    return NextResponse.json({ needsFollowUp });
  } catch (error) {
    console.error("Failed to load follow-up queue:", error);

    return NextResponse.json(
      {
        error: "Failed to load follow-up queue",
        details: error instanceof Error ? error.message : "Unknown error",
        needsFollowUp: [],
      },
      { status: 500 }
    );
  }
}
