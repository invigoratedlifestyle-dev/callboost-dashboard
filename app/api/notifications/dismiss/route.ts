import { NextResponse } from "next/server";
import { dismissNotification } from "../../../lib/supabase/notifications";

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const notificationKey = getString(body.notificationKey || body.id);

    if (!notificationKey) {
      return NextResponse.json(
        { error: "Notification key is required" },
        { status: 400 }
      );
    }

    const dismissed = await dismissNotification({
      notificationKey,
      notificationType: getString(body.notificationType || body.type),
      leadSlug: getString(body.leadSlug),
    });

    return NextResponse.json({ ok: true, dismissed });
  } catch (error) {
    console.error("Failed to dismiss notification:", error);

    return NextResponse.json(
      {
        error: "Failed to dismiss notification",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
