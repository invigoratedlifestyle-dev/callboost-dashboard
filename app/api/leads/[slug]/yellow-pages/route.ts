import { NextResponse } from "next/server";
import { enrichLeadFromYellowPages } from "../../../../lib/enrichment/yellowPages";
import {
  getLeadById,
  getLeadBySlug,
  updateLeadBySlug,
} from "../../../../lib/supabase/leads";

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getLeadName(lead: Record<string, unknown>) {
  return (
    getString(lead.businessName) ||
    getString(lead.displayName) ||
    getString(lead.name)
  );
}

function getChangedTopLevelFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
) {
  return ["website", "email", "phone"].filter(
    (field) => !getString(before[field]) && getString(after[field])
  );
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: leadIdOrSlug } = await params;

  console.log("[YELLOW_PAGES_MANUAL_START]", {
    id: leadIdOrSlug,
  });

  try {
    const existingLead =
      (await getLeadBySlug(leadIdOrSlug)) || (await getLeadById(leadIdOrSlug));

    if (!existingLead) {
      console.log("[YELLOW_PAGES_MANUAL_ERROR]", {
        id: leadIdOrSlug,
        error: "Lead not found",
      });

      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const slug = getString(existingLead.slug) || leadIdOrSlug;

    console.log("[YELLOW_PAGES_MANUAL_LEAD]", {
      id: leadIdOrSlug,
      slug,
      name: getLeadName(existingLead),
      city: getString(existingLead.city),
      existingFields: {
        website: Boolean(getString(existingLead.website)),
        email: Boolean(getString(existingLead.email)),
        phone: Boolean(getString(existingLead.phone)),
      },
    });

    const enrichedLead = await enrichLeadFromYellowPages(existingLead);
    const updatedFields = getChangedTopLevelFields(existingLead, enrichedLead);
    const yellowPages = getRecord(enrichedLead.yellow_pages);
    const candidates = Array.isArray(enrichedLead.yellow_pages_candidates)
      ? enrichedLead.yellow_pages_candidates
      : [];

    console.log("[YELLOW_PAGES_MANUAL_RESULT]", {
      slug,
      hasYellowPages: Object.keys(yellowPages).length > 0,
      candidateCount: candidates.length,
      foundFields: {
        website: Boolean(getString(yellowPages.website)),
        email: Boolean(getString(yellowPages.email)),
        phone: Boolean(getString(yellowPages.phone)),
        mobile: Boolean(getString(yellowPages.mobile)),
      },
    });

    console.log("[YELLOW_PAGES_MANUAL_UPDATED_FIELDS]", {
      slug,
      updatedFields,
      skippedFields: ["website", "email", "phone"].filter(
        (field) => getString(existingLead[field]) && getString(yellowPages[field])
      ),
      enrichmentSources: getRecord(enrichedLead.enrichment_sources),
    });

    const updatedLead = await updateLeadBySlug(slug, enrichedLead);

    return NextResponse.json({
      success: true,
      lead: updatedLead,
      updatedFields,
    });
  } catch (error) {
    console.error("[YELLOW_PAGES_MANUAL_ERROR]", {
      id: leadIdOrSlug,
      error: error instanceof Error ? error.message : error,
    });

    return NextResponse.json(
      {
        error: "Failed to run Yellow Pages enrichment",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
