import { NextResponse } from "next/server";
import { deleteSiteAsset } from "../../../lib/siteAssets";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    if (!id) {
      return NextResponse.json({ error: "Asset id is required" }, { status: 400 });
    }

    const asset = await deleteSiteAsset(id);

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json({ asset });
  } catch (error) {
    console.error("Failed to delete site asset:", error);

    return NextResponse.json(
      {
        error: "Failed to delete site asset",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
