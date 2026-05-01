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

function extractEmailAddress(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const email = extractEmailAddress(item);

      if (email) return email;
    }

    return "";
  }

  if (typeof value === "string") {
    const text = value.trim();
    const angleMatch = text.match(/<([^<>@\s]+@[^<>\s]+)>/);

    if (angleMatch?.[1]) return angleMatch[1].toLowerCase();

    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

    return emailMatch?.[0]?.toLowerCase() || "";
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return extractEmailAddress(
      record.email || record.address || record.text || record.value
    );
  }

  return "";
}

function normalizeEmail(value: unknown) {
  return extractEmailAddress(value) || getString(value).toLowerCase();
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
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .trim();
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    const text = getString(value);

    if (text) return text;
  }

  return "";
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractTextBody(payload: Record<string, unknown>) {
  const data = getRecord(payload.data);
  const dataEmail = getRecord(data.email);
  const text = pickFirstString(
    data.text,
    data.text_body,
    data.reply_text,
    data.body,
    data.message,
    data.content,
    dataEmail.text,
    payload.text,
    payload.reply_text,
    payload.body
  );
  const html = pickFirstString(
    data.html,
    data.html_body,
    dataEmail.html,
    payload.html
  );

  return text || stripHtml(html);
}

function extractInboundEmail(payload: Record<string, unknown>) {
  const data = getRecord(payload.data);
  const email =
    payload.email && typeof payload.email === "object"
      ? (payload.email as Record<string, unknown>)
      : {};
  const from = extractEmailAddress(
    data.from ||
    payload.from,
  ) || extractEmailAddress(
    getRecord(data.from).email ||
      getRecord(data.from).address ||
      getRecord(payload.from).email ||
      getRecord(payload.from).address ||
      payload.From ||
      email.from ||
      email.From ||
      getRecord(email.headers).from
  );
  const to = extractEmailAddress(
    data.to ||
    payload.to,
  ) || extractEmailAddress(
    getRecord(data.to).email ||
      getRecord(data.to).address ||
      getRecord(payload.to).email ||
      getRecord(payload.to).address ||
      payload.To ||
      email.to ||
      email.To ||
      getRecord(email.headers).to
  );
  const subject = pickFirstString(
    data.subject,
    payload.subject,
    payload.Subject,
    email.subject,
    email.Subject
  );

  return {
    from,
    to,
    subject,
    body: extractTextBody(payload),
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

    console.log("Inbound email payload:", JSON.stringify(payload, null, 2));
    console.log("Inbound email keys", Object.keys(payload));
    console.log("Inbound email data keys", Object.keys(getRecord(payload.data)));

    const inbound = extractInboundEmail(payload);

    if (!inbound.from) {
      console.log("Inbound email ignored: missing sender", {
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
      body: inbound.body || "(No message body)",
      status: "received",
      provider: "resend",
    });

    return new Response("", { status: 200 });
  } catch (error) {
    console.error("Inbound email webhook failed:", error);

    return new Response("", { status: 200 });
  }
}
