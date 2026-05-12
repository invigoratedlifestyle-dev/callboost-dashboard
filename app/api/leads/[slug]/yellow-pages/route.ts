import { NextResponse } from "next/server";
import {
  enrichLeadFromYellowPages,
  scrapeYellowPagesListing,
} from "../../../../lib/enrichment/yellowPages";
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

function applyYellowPagesDetails(
  lead: Record<string, unknown>,
  yellowPages: Record<string, unknown>
) {
  const enrichmentSources = getRecord(lead.enrichment_sources);
  const nextLead: Record<string, unknown> = {
    ...lead,
    yellow_pages: yellowPages,
  };
  const updatedFields: string[] = [];
  const skippedFields: string[] = [];

  if (!getString(nextLead.website) && getString(yellowPages.website)) {
    nextLead.website = getString(yellowPages.website);
    enrichmentSources.website = "yellow_pages";
    updatedFields.push("website");
  } else if (getString(yellowPages.website)) {
    skippedFields.push("website");
  }

  if (!getString(nextLead.email) && getString(yellowPages.email)) {
    nextLead.email = getString(yellowPages.email);
    enrichmentSources.email = "yellow_pages";
    updatedFields.push("email");
  } else if (getString(yellowPages.email)) {
    skippedFields.push("email");
  }

  if (
    !getString(nextLead.phone) &&
    (getString(yellowPages.mobile) || getString(yellowPages.phone))
  ) {
    nextLead.phone = getString(yellowPages.mobile) || getString(yellowPages.phone);
    enrichmentSources.phone = "yellow_pages";
    updatedFields.push("phone");
  } else if (getString(yellowPages.mobile) || getString(yellowPages.phone)) {
    skippedFields.push("phone");
  }

  if (Object.keys(enrichmentSources).length > 0) {
    nextLead.enrichment_sources = enrichmentSources;
  }

  return { nextLead, updatedFields, skippedFields };
}

function getManualResult(value: unknown) {
  const result = getRecord(value);

  return {
    website: getString(result.website),
    email: getString(result.email),
    phone: getString(result.phone),
    description: getString(result.description),
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: leadIdOrSlug } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const listingUrl = getString(body.listingUrl);
  const manualResult = getManualResult(body.manualResult);
  const saveOnly = body.saveOnly === true;

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

    if (listingUrl) {
      console.log("[YELLOW_PAGES_MANUAL_URL_RECEIVED]", {
        slug,
        listingUrl,
        saveOnly,
      });

      const existingYellowPages = getRecord(existingLead.yellow_pages);

      if (
        manualResult.website ||
        manualResult.email ||
        manualResult.phone ||
        manualResult.description
      ) {
        console.log("[YELLOW_PAGES_BROWSER_SCRAPE_RECEIVED]", {
          slug,
          listingUrl,
          foundFields: {
            website: Boolean(manualResult.website),
            email: Boolean(manualResult.email),
            phone: Boolean(manualResult.phone),
            description: Boolean(manualResult.description),
          },
        });

        const yellowPages = {
          ...existingYellowPages,
          manual_listing_url: listingUrl,
          browser_scraped_at: new Date().toISOString(),
          ...(manualResult.website ? { website: manualResult.website } : {}),
          ...(manualResult.email ? { email: manualResult.email } : {}),
          ...(manualResult.phone ? { phone: manualResult.phone } : {}),
          ...(manualResult.description
            ? { description: manualResult.description }
            : {}),
        };
        const { nextLead, updatedFields, skippedFields } = applyYellowPagesDetails(
          existingLead,
          yellowPages
        );

        console.log("[YELLOW_PAGES_BROWSER_SCRAPE_UPDATED_FIELDS]", {
          slug,
          updatedFields,
          skippedFields,
          enrichmentSources: getRecord(nextLead.enrichment_sources),
        });

        const updatedLead = await updateLeadBySlug(slug, nextLead);

        return NextResponse.json({
          success: true,
          lead: updatedLead,
          updatedFields,
          browserScraped: true,
        });
      }

      if (saveOnly) {
        const nextLead = {
          ...existingLead,
          yellow_pages: {
            ...existingYellowPages,
            manual_listing_url: listingUrl,
          },
        };
        const updatedLead = await updateLeadBySlug(slug, nextLead);

        return NextResponse.json({
          success: true,
          lead: updatedLead,
          updatedFields: [],
          savedOnly: true,
        });
      }

      const scrapedYellowPages = await scrapeYellowPagesListing(listingUrl);
      const yellowPages = {
        ...existingYellowPages,
        ...scrapedYellowPages,
        manual_listing_url: listingUrl,
      };

      console.log("[YELLOW_PAGES_MANUAL_URL_SCRAPE_RESULT]", {
        slug,
        listingUrl,
        foundFields: {
          website: Boolean(getString(yellowPages.website)),
          email: Boolean(getString(yellowPages.email)),
          phone: Boolean(getString(yellowPages.phone)),
          mobile: Boolean(getString(yellowPages.mobile)),
        },
      });

      const { nextLead, updatedFields, skippedFields } = applyYellowPagesDetails(
        existingLead,
        yellowPages
      );

      console.log("[YELLOW_PAGES_MANUAL_URL_UPDATED_FIELDS]", {
        slug,
        updatedFields,
        skippedFields,
        enrichmentSources: getRecord(nextLead.enrichment_sources),
      });

      const updatedLead = await updateLeadBySlug(slug, nextLead);

      return NextResponse.json({
        success: true,
        lead: updatedLead,
        updatedFields,
      });
    }

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
      hasYellowPages: Object.keys(yellowPages).length > 0,
      reason: getString(getRecord(enrichedLead.yellow_pages_search).reason),
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
