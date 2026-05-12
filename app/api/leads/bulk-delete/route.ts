import { NextResponse } from "next/server";
import { deleteLeadsBySlugs } from "../../../lib/supabase/leads";

function getIdList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function DELETE(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const ids = Array.from(new Set(getIdList(body.ids)));

    if (!ids.length) {
      return NextResponse.json({ error: "Missing ids" }, { status: 400 });
    }

    const result = await deleteLeadsBySlugs(ids);

    return NextResponse.json({
      success: true,
      deleted: result.deleted,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error("BULK_DELETE_FATAL", error);

    return NextResponse.json(
      {
        error: "Failed to delete selected leads",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
