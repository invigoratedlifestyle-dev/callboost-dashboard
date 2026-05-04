import { NextResponse } from "next/server";
import { listUnreadReplyNotifications } from "../../../lib/supabase/leadMessages";

export async function GET() {
  try {
    const notifications = await listUnreadReplyNotifications(20);

    return NextResponse.json({
      ok: true,
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    console.error("Failed to load unread reply notifications:", error);

    return NextResponse.json(
      {
        error: "Failed to load unread reply notifications",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
