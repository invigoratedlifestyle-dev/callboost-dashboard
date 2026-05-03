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

type ResendInboundPayload = {
  type?: string;
  data?: {
    from?: string;
    to?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    textBody?: string;
    htmlBody?: string;
    text_body?: string;
    html_body?: string;
    body?: unknown;
    content?: unknown;
    message?: unknown;
    raw?: unknown;
    attachments?: unknown;
    headers?: unknown;
  };
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function extractEmail(raw: unknown) {
  if (!raw || typeof raw !== "string") return "";

  const text = raw.trim();
  const match = text.match(/<(.+?)>/);

  if (match?.[1]) return match[1].trim().toLowerCase();

  return text.toLowerCase();
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function bodyTextFromValue(value: unknown): string {
  if (typeof value === "string") return value.trim();

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = bodyTextFromValue(item);

      if (text) return text;
    }

    return "";
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return (
      bodyTextFromValue(record.text) ||
      bodyTextFromValue(record.textBody) ||
      bodyTextFromValue(record.text_body) ||
      bodyTextFromValue(record.body) ||
      bodyTextFromValue(record.content) ||
      bodyTextFromValue(record.message) ||
      bodyTextFromValue(record.value) ||
      bodyTextFromValue(record.raw)
    );
  }

  return "";
}

function htmlFromValue(value: unknown): string {
  if (typeof value === "string") return value.trim();

  if (Array.isArray(value)) {
    for (const item of value) {
      const html = htmlFromValue(item);

      if (html) return html;
    }

    return "";
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return (
      htmlFromValue(record.html) ||
      htmlFromValue(record.htmlBody) ||
      htmlFromValue(record.html_body)
    );
  }

  return "";
}

function extractBody(data: ResendInboundPayload["data"]) {
  const textBody =
    data?.text?.trim() ||
    data?.textBody?.trim() ||
    data?.text_body?.trim() ||
    bodyTextFromValue(data?.body) ||
    bodyTextFromValue(data?.content) ||
    bodyTextFromValue(data?.message) ||
    bodyTextFromValue(data?.raw) ||
    bodyTextFromValue(data?.attachments) ||
    bodyTextFromValue(data?.headers);
  const htmlBody =
    data?.html?.trim() ||
    data?.htmlBody?.trim() ||
    data?.html_body?.trim() ||
    htmlFromValue(data?.body) ||
    htmlFromValue(data?.content) ||
    htmlFromValue(data?.message) ||
    htmlFromValue(data?.raw) ||
    htmlFromValue(data?.attachments) ||
    htmlFromValue(data?.headers);
  let body = textBody || "";

  if (!body && htmlBody) {
    body = stripHtml(htmlBody);
  }

  if (!body) {
    console.log("No inbound email body field found");
  }

  return body || "(No message body)";
}

function normalizeEmail(value: unknown) {
  return extractEmail(value) || getString(value).toLowerCase();
}

async function findLeadByOutboundEmail(
  fromEmail: string
): Promise<InboundEmailMatch | null> {
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

async function findLeadByEmail(
  fromEmail: string
): Promise<InboundEmailMatch | null> {
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
    const payload = (await req.json().catch(() => ({}))) as ResendInboundPayload;

    if (payload.type !== "email.received") {
      return new Response("ok", { status: 200 });
    }

    const data = payload.data || {};
    console.log("Inbound email payload keys:", Object.keys(payload || {}));
    console.log("Inbound email data keys:", Object.keys(data || {}));
    console.log("Inbound email data:", JSON.stringify(data || {}, null, 2));

    const from = extractEmail(data.from);
    const toRaw = Array.isArray(data.to) ? data.to[0] : data.to;
    const to = getString(toRaw);
    const subject = getString(data.subject) || "(No subject)";
    const body = extractBody(data);

    console.log("Inbound email parsed:", {
      from,
      subject,
      body,
    });

    if (!from) {
      console.log("Inbound email ignored: missing sender");
      return new Response("ok", { status: 200 });
    }

    const match =
      (await findLeadByOutboundEmail(from)) || (await findLeadByEmail(from));

    if (!match) {
      console.log("Inbound email ignored: no matching lead or outbound message", {
        from,
      });
      return new Response("ok", { status: 200 });
    }

    await insertLeadMessage({
      leadId: match.leadId,
      slug: match.slug,
      channel: "email",
      direction: "inbound",
      toAddress: to,
      fromAddress: from,
      subject,
      body,
      status: "received",
      provider: "resend",
    });

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("Inbound email webhook failed:", error);

    return new Response("ok", { status: 200 });
  }
}
