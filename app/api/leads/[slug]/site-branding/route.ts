import { NextResponse } from "next/server";
import { uploadLeadSiteBrandingImage } from "../../../../lib/siteAssets";
import { getLeadBySlug } from "../../../../lib/supabase/leads";

const BRANDING_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_BRANDING_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_BRANDING_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
]);

function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    if (!slug) {
      return NextResponse.json({ error: "Lead slug is required" }, { status: 400 });
    }

    const lead = await getLeadBySlug(slug);

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Site branding image file is required" },
        { status: 400 }
      );
    }

    const extension = getFileExtension(file.name);

    if (
      !ALLOWED_BRANDING_IMAGE_TYPES.has(file.type) ||
      !ALLOWED_BRANDING_IMAGE_EXTENSIONS.has(extension)
    ) {
      return NextResponse.json(
        { error: "Upload a JPG, PNG or WebP branding image." },
        { status: 400 }
      );
    }

    if (file.size > BRANDING_IMAGE_MAX_BYTES) {
      return NextResponse.json(
        { error: "Branding image must be 2MB or smaller." },
        { status: 400 }
      );
    }

    const uploadedImage = await uploadLeadSiteBrandingImage({
      leadKey: String(lead.slug || lead.id || slug),
      file,
    });

    return NextResponse.json({ imageUrl: uploadedImage.imageUrl });
  } catch (error) {
    console.error("Failed to upload site branding image:", error);

    return NextResponse.json(
      {
        error: "Failed to upload site branding image",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
