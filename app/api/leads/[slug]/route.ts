import { NextResponse } from "next/server";
import fs from "fs";
import {
  getLeadFilePath,
  isLifecycleStatus,
  updateLeadStatus,
  withLifecycleDefaults,
} from "../../../lib/leadLifecycle";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const filePath = getLeadFilePath(slug);

  if (!fs.existsSync(filePath)) {
    console.error("Lead JSON not found:", filePath);

    return NextResponse.json(
      { error: "Lead not found", filePath },
      { status: 404 }
    );
  }

  const lead = withLifecycleDefaults(JSON.parse(fs.readFileSync(filePath, "utf8")));

  fs.writeFileSync(filePath, JSON.stringify(lead, null, 2));

  return NextResponse.json({ lead });
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

  const updatedLead = updateLeadStatus(slug, status, reviewNotes);

  if (!updatedLead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({ lead: updatedLead });
}
