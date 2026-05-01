import {
  insertLeadMessage,
  listRecentOutboundSmsMessages,
} from "../../lib/supabase/leadMessages";
import {
  getLeadRowBySlug,
  listLeadRows,
  rowToLead,
  type LeadRow,
} from "../../lib/supabase/leads";

function getString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value: unknown) {
  let phone = String(value ?? "").replace(/[^\d+]/g, "");

  if (phone.startsWith("00")) {
    phone = `+${phone.slice(2)}`;
  }

  if (phone.startsWith("+")) {
    return phone;
  }

  if (phone.startsWith("04")) {
    return `+61${phone.slice(1)}`;
  }

  if (phone.startsWith("03")) {
    return `+61${phone.slice(1)}`;
  }

  return phone;
}

async function findLeadByOutboundSms(fromPhone: string) {
  const normalizedFrom = normalizePhone(fromPhone);
  const messages = await listRecentOutboundSmsMessages();
  const matchedMessage = messages.find(
    (message) => normalizePhone(message.toAddress) === normalizedFrom
  );

  if (!matchedMessage) return null;

  const row = matchedMessage.slug
    ? await getLeadRowBySlug(matchedMessage.slug)
    : null;

  return {
    leadId: matchedMessage.leadId || row?.id || null,
    slug: matchedMessage.slug || String(row?.slug || ""),
  };
}

async function findLeadByPhone(fromPhone: string) {
  const normalizedFrom = normalizePhone(fromPhone);
  const rows = await listLeadRows();

  for (const row of rows) {
    const lead = rowToLead(row as LeadRow);
    const leadPhone = normalizePhone(lead.phone);

    if (leadPhone && leadPhone === normalizedFrom) {
      return {
        leadId: (row as LeadRow).id || null,
        slug: String((row as LeadRow).slug || lead.slug || ""),
      };
    }
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const from = getString(formData.get("From"));
    const to = getString(formData.get("To"));
    const body = getString(formData.get("Body"));

    if (!from || !body) {
      console.log("Inbound SMS ignored: missing sender or body");
      return new Response("", { status: 200 });
    }

    const match =
      (await findLeadByOutboundSms(from)) || (await findLeadByPhone(from));

    if (!match) {
      console.log("Inbound SMS ignored: no matching lead or outbound message", {
        from,
      });
      return new Response("", { status: 200 });
    }

    await insertLeadMessage({
      leadId: match.leadId,
      slug: match.slug,
      channel: "sms",
      direction: "inbound",
      toAddress: to,
      fromAddress: from,
      body,
      status: "received",
      provider: "twilio",
    });

    return new Response("", { status: 200 });
  } catch (error) {
    console.error("Inbound SMS webhook failed:", error);

    return new Response("", { status: 200 });
  }
}
