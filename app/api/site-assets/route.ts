import { NextResponse } from "next/server";
import {
  listSiteAssets,
  uploadSiteAsset,
} from "../../lib/siteAssets";

function getString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  try {
    const assets = await listSiteAssets();

    return NextResponse.json({ assets });
  } catch (error) {
    console.error("Failed to list site assets:", error);

    return NextResponse.json(
      {
        error: "Failed to list site assets",
        details: error instanceof Error ? error.message : "Unknown error",
        assets: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const trade = getString(formData.get("trade"));
    const assetType = getString(formData.get("assetType")) || "hero";
    const altText = getString(formData.get("altText"));
    const file = formData.get("file");

    if (!trade) {
      return NextResponse.json({ error: "Trade is required" }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image uploads are supported" },
        { status: 400 }
      );
    }

    const asset = await uploadSiteAsset({
      trade,
      assetType,
      file,
      altText,
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    console.error("Failed to upload site asset:", error);

    return NextResponse.json(
      {
        error: "Failed to upload site asset",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
