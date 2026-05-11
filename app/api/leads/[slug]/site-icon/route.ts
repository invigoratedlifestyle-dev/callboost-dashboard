import { NextResponse } from "next/server";
import { isArchivedLead } from "../../../../lib/leadLifecycle";
import { uploadLeadSiteIconImage } from "../../../../lib/siteAssets";
import { getLeadBySlug } from "../../../../lib/supabase/leads";

const SITE_ICON_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_SITE_ICON_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_SITE_ICON_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

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
        { error: "Site icon file is required" },
        { status: 400 }
      );
    }

    const extension = getFileExtension(file.name);

    if (
      !ALLOWED_SITE_ICON_TYPES.has(file.type) ||
      !ALLOWED_SITE_ICON_EXTENSIONS.has(extension)
    ) {
      return NextResponse.json(
        { error: "Upload a PNG, JPG or WebP site icon." },
        { status: 400 }
      );
    }

    if (file.size > SITE_ICON_MAX_BYTES) {
      return NextResponse.json(
        { error: "Site icon must be 2MB or smaller." },
        { status: 400 }
      );
    }

    const uploadedImage = await uploadLeadSiteIconImage({
      leadKey: String(lead.slug || lead.id || slug),
      file,
    });

    return NextResponse.json({ imageUrl: uploadedImage.imageUrl });
  } catch (error) {
    console.error("Failed to upload site icon:", error);

    return NextResponse.json(
      {
        error: "Failed to upload site icon",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
