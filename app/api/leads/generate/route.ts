import { NextResponse } from "next/server";
import {
  generateLeadsForTown,
  type GenerateLeadsForTownArgs,
} from "../../../lib/leadGeneration";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as GenerateLeadsForTownArgs;
    const result = await generateLeadsForTown(body);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to generate leads:", error);

    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "Invalid trade target" ||
      message === "Invalid Town/Suburb target"
        ? 400
        : 500;

    return NextResponse.json(
      {
        success: false,
        error: "Lead generation failed",
        details: message,
      },
      { status }
    );
  }
}
