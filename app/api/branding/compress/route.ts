import { NextResponse } from "next/server";
import {
  BRANDING_TARGET_BYTES,
  compressImageUnderBytes,
  getImageBufferFromRequest,
} from "../../../lib/brandingImages";

function getBoolean(value: FormDataEntryValue | null, fallback: boolean) {
  if (value === "true") return true;
  if (value === "false") return false;

  return fallback;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const sourceImage = await getImageBufferFromRequest(formData);

    if (!sourceImage) {
      return NextResponse.json({ error: "Image is required." }, { status: 400 });
    }

    const result = await compressImageUnderBytes(sourceImage.bytes, {
      maxBytes: BRANDING_TARGET_BYTES,
      transparent: getBoolean(formData.get("transparent"), true),
    });

    return NextResponse.json({
      imageData: result.dataUrl,
      contentType: result.contentType,
      sizeBytes: result.sizeBytes,
    });
  } catch (error) {
    console.error("Branding image compression failed:", error);

    return NextResponse.json(
      {
        error: "Failed to compress image.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
