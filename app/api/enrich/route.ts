import { NextResponse } from "next/server";
import { enrichLead } from "../../lib/enrichLead";

export async function POST(req: Request) {
  try {
    const { slug, website } = await req.json();

    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const result = await enrichLead(slug, website);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to enrich lead:", error);

    const message = error instanceof Error ? error.message : "Failed to enrich lead";
    const status = message === "Lead not found" ? 404 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
