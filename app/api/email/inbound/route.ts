import {
  insertLeadMessage,
  listRecentOutboundEmailMessages,
} from "../../../lib/supabase/leadMessages";
import {
  getLeadRowBySlug,
  listLeadRows,
  rowToLead,
  type LeadRow,
} from "../../../lib/supabase/leads";

type InboundEmailMatch = {
  leadId?: string | number | null;
  slug: string;
};

function getString(value: unknown): string {
  if (typeof value === "string") return value.trim();

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return getString(record.email || record.address || record.text);
  }

  return "";
}

function normalizeEmail(value: unknown) {
  return getString(value).toLowerCase();
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    const text = getString(value);

    if (text) return text;
  }

  return "";
}

function extractInboundEmail(payload: Record<string, unknown>) {
  const email =
    payload.email && typeof payload.email === "object"
      ? (payload.email as Record<string, unknown>)
      : {};
  const from = pickFirstString(
    payload.from,
    payload.From,
    email.from,
    email.From,
    (email.headers as Record<string, unknown> | undefined)?.from
  );
  const to = pickFirstString(
    payload.to,
    payload.To,
    email.to,
    email.To,
    (email.headers as Record<string, unknown> | undefined)?.to
  );
  const subject = pickFirstString(
    payload.subject,
    payload.Subject,
    email.subject,
    email.Subject
  );
  const text = pickFirstString(
    payload.text,
    payload.Text,
    payload.textBody,
    email.text,
    email.Text,
    email.textBody
  );
  const html = pickFirstString(
    payload.html,
    payload.Html,
    payload.htmlBody,
    email.html,
    email.Html,
    email.htmlBody
  );

  return {
    from,
    to,
    subject,
    body: text || stripHtml(html),
  };
}

async function findLeadByOutboundEmail(fromEmail: string): Promise<InboundEmailMatch | null> {
  const normalizedFrom = normalizeEmail(fromEmail);
  const messages = await listRecentOutboundEmailMessages();
  const matchedMessage = messages.find(
    (message) => normalizeEmail(message.toAddress) === normalizedFrom
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

async function findLeadByEmail(fromEmail: string): Promise<InboundEmailMatch | null> {
  const normalizedFrom = normalizeEmail(fromEmail);
  const rows = await listLeadRows();

  for (const row of rows) {
    const lead = rowToLead(row as LeadRow);
    const leadEmail = normalizeEmail(lead.email);

    if (leadEmail && leadEmail === normalizedFrom) {
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
    const payload = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const inbound = extractInboundEmail(payload);

    if (!inbound.from || !inbound.body) {
      console.log("Inbound email ignored: missing sender or body", {
        from: inbound.from,
      });
      return new Response("", { status: 200 });
    }

    const match =
      (await findLeadByOutboundEmail(inbound.from)) ||
      (await findLeadByEmail(inbound.from));

    if (!match) {
      console.log("Inbound email ignored: no matching lead or outbound message", {
        from: inbound.from,
      });
      return new Response("", { status: 200 });
    }

    await insertLeadMessage({
      leadId: match.leadId,
      slug: match.slug,
      channel: "email",
      direction: "inbound",
      toAddress: inbound.to,
      fromAddress: inbound.from,
      subject: inbound.subject,
      body: inbound.body,
      status: "received",
      provider: "resend",
    });

    return new Response("", { status: 200 });
  } catch (error) {
    console.error("Inbound email webhook failed:", error);

    return new Response("", { status: 200 });
  }
}
