import { NextResponse } from "next/server";
import {
  isLifecycleStage,
  type LeadRecord,
} from "../../../lib/leadLifecycle";
import { isLeadStatus } from "../../../lib/leadWorkflow";
import { withTradeProfile } from "../../../lib/leadTargeting/tradeModifiers";
import { listCallbacksForLead } from "../../../lib/supabase/callbacks";
import {
  getLeadBySlug,
  getLeadRowBySlug,
  rowToLead,
  touchLeadActivity,
  updateLeadBySlug,
  updateLeadStageBySlug,
  updateLeadStatus,
} from "../../../lib/supabase/leads";

function getNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasOwn(body: Record<string, unknown>, field: string) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function isHexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const leadRow = await getLeadRowBySlug(slug);

    if (!leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const touchedLead = await touchLeadActivity(slug);
    const lead = touchedLead || rowToLead(leadRow);
    const callbacks = await listCallbacksForLead({
      leadId: leadRow.id || null,
      slug,
    });

    return NextResponse.json({ lead, callbacks });
  } catch (error) {
    console.error("Failed to load lead:", error);

    return NextResponse.json(
      {
        error: "Failed to load lead",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const stage = body.stage;
  const status = body.status;
  const reviewNotes =
    typeof body.reviewNotes === "string" ? body.reviewNotes : undefined;

  try {
    let updatedLead: LeadRecord | null = null;

    if (stage !== undefined) {
      if (!isLifecycleStage(stage)) {
        return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
      }

      updatedLead = await updateLeadStageBySlug(slug, stage, reviewNotes);
    } else if (status !== undefined) {
      if (!isLeadStatus(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }

      updatedLead = await updateLeadStatus(slug, status, {
        preserveTerminal: false,
      });
    } else {
      const existingLead = await getLeadBySlug(slug);

      if (!existingLead) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }

      const nextLead = { ...existingLead };

      if (hasOwn(body, "trade") && typeof body.trade === "string") {
        nextLead.trade = body.trade;
      }

      if (hasOwn(body, "city") && typeof body.city === "string") {
        nextLead.city = body.city;
      }

      if (hasOwn(body, "address") && typeof body.address === "string") {
        nextLead.address = body.address;
        nextLead.formattedAddress = body.address;
      }

      if (hasOwn(body, "phone") && typeof body.phone === "string") {
        nextLead.phone = body.phone;
      }

      if (hasOwn(body, "email") && typeof body.email === "string") {
        nextLead.email = body.email;
      }

      if (hasOwn(body, "website") && typeof body.website === "string") {
        nextLead.website = body.website;
      }

      if (hasOwn(body, "displayName") && typeof body.displayName === "string") {
        nextLead.displayName = body.displayName;
      }

      if (hasOwn(body, "facebook") && typeof body.facebook === "string") {
        nextLead.facebook = body.facebook;
      }

      if (hasOwn(body, "instagram") && typeof body.instagram === "string") {
        nextLead.instagram = body.instagram;
      }

      if (hasOwn(body, "heroImageUrl") && typeof body.heroImageUrl === "string") {
        nextLead.heroImageUrl = body.heroImageUrl;
      }

      if (
        hasOwn(body, "siteBrandingUrl") &&
        typeof body.siteBrandingUrl === "string"
      ) {
        nextLead.siteBrandingUrl = body.siteBrandingUrl;
      }

      if (hasOwn(body, "siteIconUrl") && typeof body.siteIconUrl === "string") {
        nextLead.siteIconUrl = body.siteIconUrl;
      }

      if (hasOwn(body, "design")) {
        const existingDesign =
          nextLead.design && typeof nextLead.design === "object"
            ? (nextLead.design as Record<string, unknown>)
            : {};
        const existingGeneratedSiteDesign =
          nextLead.generated_site_design &&
          typeof nextLead.generated_site_design === "object"
            ? (nextLead.generated_site_design as Record<string, unknown>)
            : {};
        const requestedDesign =
          body.design && typeof body.design === "object"
            ? (body.design as Record<string, unknown>)
            : {};
        const bodyAccentColor =
          requestedDesign.bodyAccentColor || requestedDesign.accentTextColor;

        nextLead.design = {
          ...existingDesign,
          ...(isHexColor(requestedDesign.buttonColor)
            ? { buttonColor: requestedDesign.buttonColor }
            : {}),
          ...(isHexColor(requestedDesign.buttonTextColor)
            ? { buttonTextColor: requestedDesign.buttonTextColor }
            : {}),
          ...(isHexColor(requestedDesign.accentTextColor)
            ? { accentTextColor: requestedDesign.accentTextColor }
            : {}),
          ...(isHexColor(requestedDesign.heroAccentColor)
            ? { heroAccentColor: requestedDesign.heroAccentColor }
            : {}),
          ...(isHexColor(bodyAccentColor)
            ? {
                bodyAccentColor,
                accentTextColor: bodyAccentColor,
              }
            : {}),
          ...(isHexColor(requestedDesign.serviceAreaCardColor)
            ? { serviceAreaCardColor: requestedDesign.serviceAreaCardColor }
            : {}),
          ...(isHexColor(requestedDesign.footerBackgroundColor)
            ? { footerBackgroundColor: requestedDesign.footerBackgroundColor }
            : {}),
        };
        nextLead.generated_site_design = {
          ...existingGeneratedSiteDesign,
          ...(isHexColor(requestedDesign.buttonColor)
            ? { button_color: requestedDesign.buttonColor }
            : {}),
          ...(isHexColor(requestedDesign.buttonTextColor)
            ? { button_text_color: requestedDesign.buttonTextColor }
            : {}),
          ...(isHexColor(bodyAccentColor)
            ? {
                accent_text_color: bodyAccentColor,
                body_accent_color: bodyAccentColor,
              }
            : {}),
          ...(isHexColor(requestedDesign.heroAccentColor)
            ? { hero_accent_color: requestedDesign.heroAccentColor }
            : {}),
          ...(isHexColor(requestedDesign.serviceAreaCardColor)
            ? { service_area_card_color: requestedDesign.serviceAreaCardColor }
            : {}),
          ...(isHexColor(requestedDesign.footerBackgroundColor)
            ? { footer_background_color: requestedDesign.footerBackgroundColor }
            : {}),
        };
      }

      if (hasOwn(body, "callbackForwardingEnabled")) {
        nextLead.callbackForwardingEnabled =
          body.callbackForwardingEnabled === true ||
          body.callbackForwardingEnabled === "true";
      }

      if (hasOwn(body, "callbackForwardToEmail")) {
        nextLead.callbackForwardToEmail = getNullableString(
          body.callbackForwardToEmail
        );
      }

      if (hasOwn(body, "callbackForwardToPhone")) {
        nextLead.callbackForwardToPhone = getNullableString(
          body.callbackForwardToPhone
        );
      }

      try {
        updatedLead = await updateLeadBySlug(slug, withTradeProfile(nextLead));
        if (hasOwn(body, "siteBrandingUrl")) {
          if (updatedLead.generatedSiteUrl && updatedLead.siteBrandingUrl) {
            updatedLead =
              (await updateLeadStatus(slug, "ready_for_client")) || updatedLead;
          } else {
            updatedLead = (await touchLeadActivity(slug)) || updatedLead;
          }
        }
      } catch (error) {
        console.error("LEAD_UPDATE_ERROR", error);
        throw error;
      }
    }

    if (!updatedLead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, lead: updatedLead });
  } catch (error) {
    console.error("LEAD_PATCH_FATAL", error);

    return NextResponse.json(
      {
        error: "Failed to update lead",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
