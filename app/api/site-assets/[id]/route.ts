import { NextResponse } from "next/server";
import {
  deleteSiteAsset,
  updateSiteAssetActiveState,
} from "../../../lib/siteAssets";

function getBoolean(value: unknown) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;

  return null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    if (!id) {
      return NextResponse.json({ error: "Asset id is required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const isActive = getBoolean(body.isActive ?? body.is_active);

    if (isActive === null) {
      return NextResponse.json(
        { error: "isActive boolean is required" },
        { status: 400 }
      );
    }

    const asset = await updateSiteAssetActiveState(id, isActive);

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json({ asset });
  } catch (error) {
    console.error("Failed to update site asset:", error);

    return NextResponse.json(
      {
        error: "Failed to update site asset",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

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
