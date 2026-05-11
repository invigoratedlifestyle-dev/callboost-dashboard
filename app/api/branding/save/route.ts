import { NextResponse } from "next/server";
import {
  BRANDING_TARGET_BYTES,
  compressImageUnderBytes,
  getImageBufferFromRequest,
} from "../../../lib/brandingImages";
import { uploadSiteAssetBuffer } from "../../../lib/siteAssets";
import {
  getLeadBySlug,
  updateLeadBrandingAssets,
} from "../../../lib/supabase/leads";

function getString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(value: FormDataEntryValue | null, fallback: boolean) {
  if (value === "true") return true;
  if (value === "false") return false;

  return fallback;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const leadSlug = getString(formData.get("leadSlug"));
    const assetType = getString(formData.get("assetType")) || "navigation-branding";
    const altText = getString(formData.get("altText"));
    const sourceImage = await getImageBufferFromRequest(formData);

    if (!leadSlug) {
      return NextResponse.json({ error: "Lead is required." }, { status: 400 });
    }

    if (!["navigation-branding", "hero", "icon"].includes(assetType)) {
      return NextResponse.json({ error: "Invalid asset type." }, { status: 400 });
    }

    if (!sourceImage) {
      return NextResponse.json({ error: "Image is required." }, { status: 400 });
    }

    const lead = await getLeadBySlug(leadSlug);

    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    const processed = await compressImageUnderBytes(sourceImage.bytes, {
      maxBytes: BRANDING_TARGET_BYTES,
      transparent: assetType !== "hero" && getBoolean(formData.get("transparent"), true),
    });
    const asset = await uploadSiteAssetBuffer({
      trade: String(lead.trade || "generic"),
      assetType,
      bytes: processed.bytes,
      contentType: processed.contentType,
      extension: processed.extension,
      altText:
        altText ||
        `${String(lead.businessName || lead.name || leadSlug)} ${assetType}`,
    });
    const updatedLead = await updateLeadBrandingAssets(leadSlug, {
      ...(assetType === "navigation-branding"
        ? { siteBrandingUrl: asset.imageUrl }
        : {}),
      ...(assetType === "hero" ? { heroImageUrl: asset.imageUrl } : {}),
      ...(assetType === "icon" ? { siteIconUrl: asset.imageUrl } : {}),
    });

    return NextResponse.json({
      asset,
      lead: updatedLead,
      imageUrl: asset.imageUrl,
      sizeBytes: processed.sizeBytes,
    });
  } catch (error) {
    console.error("Branding asset save failed:", error);

    return NextResponse.json(
      {
        error: "Failed to save branding asset.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
