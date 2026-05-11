import { NextResponse } from "next/server";
import {
  cropImageWhitespace,
  getImageBufferFromRequest,
  getImageResult,
} from "../../../lib/brandingImages";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const sourceImage = await getImageBufferFromRequest(formData);

    if (!sourceImage) {
      return NextResponse.json({ error: "Image is required." }, { status: 400 });
    }

    const cropped = await cropImageWhitespace(sourceImage.bytes);
    const result = getImageResult(cropped, sourceImage.contentType);

    return NextResponse.json({
      imageData: result.dataUrl,
      contentType: result.contentType,
      sizeBytes: result.sizeBytes,
    });
  } catch (error) {
    console.error("Branding image crop failed:", error);

    return NextResponse.json(
      {
        error: "Failed to crop image whitespace.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
