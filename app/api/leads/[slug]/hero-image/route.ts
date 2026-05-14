import { NextResponse } from "next/server";
import { isArchivedLead } from "../../../../lib/leadLifecycle";
import {
  uploadLeadHeroImage,
  uploadLeadMobileHeroImage,
} from "../../../../lib/siteAssets";
import { getLeadBySlug } from "../../../../lib/supabase/leads";

const HERO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_HERO_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_HERO_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

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

    if (isArchivedLead(lead)) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Hero image file is required" },
        { status: 400 }
      );
    }

    const extension = getFileExtension(file.name);

    if (
      !ALLOWED_HERO_IMAGE_TYPES.has(file.type) ||
      !ALLOWED_HERO_IMAGE_EXTENSIONS.has(extension)
    ) {
      return NextResponse.json(
        { error: "Upload a JPG, PNG or WebP hero image." },
        { status: 400 }
      );
    }

    if (file.size > HERO_IMAGE_MAX_BYTES) {
      return NextResponse.json(
        { error: "Hero image must be 5MB or smaller." },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const variant = url.searchParams.get("variant");
    const uploadImage =
      variant === "mobile" ? uploadLeadMobileHeroImage : uploadLeadHeroImage;
    const uploadedImage = await uploadImage({
      leadKey: String(lead.slug || lead.id || slug),
      file,
    });

    return NextResponse.json({ imageUrl: uploadedImage.imageUrl });
  } catch (error) {
    console.error("Failed to upload lead hero image:", error);

    return NextResponse.json(
      {
        error: "Failed to upload hero image",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
