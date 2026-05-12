import { NextResponse } from "next/server";
import { listNeedsFollowUp } from "../../lib/supabase/followUpQueue";
import { listUnreadReplyNotifications } from "../../lib/supabase/leadMessages";

export async function GET() {
  try {
    const [replies, followUps] = await Promise.all([
      listUnreadReplyNotifications(20),
      listNeedsFollowUp(),
    ]);
    const replyNotifications = replies.map((reply) => ({
      type: "reply" as const,
      id: `reply-${reply.id}`,
      leadSlug: reply.lead_slug,
      businessName: reply.business_name,
      leadStage: reply.lead_status,
      leadStatus: reply.lead_status,
      channel: reply.channel,
      body: reply.body,
      subject: reply.subject,
      createdAt: reply.created_at,
      label: "New reply",
    }));
    const followUpNotifications = followUps.map((followUp) => ({
      type: "follow_up" as const,
      id: `follow-up-${followUp.slug}-${followUp.nextFollowUpStage}`,
      leadSlug: followUp.slug,
      businessName: followUp.businessName,
      city: followUp.city,
      trade: followUp.trade,
      nextFollowUpStage: followUp.nextFollowUpStage,
      nextFollowUpLabel: followUp.nextFollowUpLabel,
      dueAt: followUp.dueAt,
      createdAt: followUp.dueAt,
      label: "Follow-up due",
    }));
    const notifications = [...replyNotifications, ...followUpNotifications].sort(
      (a, b) => {
        const aTime = new Date(a.createdAt || "").getTime();
        const bTime = new Date(b.createdAt || "").getTime();

        return (Number.isFinite(aTime) ? aTime : 0) -
          (Number.isFinite(bTime) ? bTime : 0);
      }
    );

    return NextResponse.json({
      ok: true,
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    console.error("Failed to load notifications:", error);

    return NextResponse.json(
      {
        error: "Failed to load notifications",
        details: error instanceof Error ? error.message : "Unknown error",
        notifications: [],
      },
      { status: 500 }
    );
  }
}
