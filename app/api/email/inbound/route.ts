import { Resend } from "resend";
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
    email_id?: string;
    emailId?: string;
    id?: string;
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

type FullInboundEmail = {
  from?: string | null;
  to?: string[] | string | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
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

function getBodyFromEmail(email: FullInboundEmail | null) {
  const textBody = email?.text?.trim();
  const htmlBody = email?.html?.trim();

  if (textBody) return textBody;
  if (htmlBody) return stripHtml(htmlBody);

  return "";
}

async function fetchInboundEmailContent(
  emailId: string
): Promise<FullInboundEmail | null> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log("Inbound email content fetch skipped: missing RESEND_API_KEY");
    return null;
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.receiving.get(emailId);

    if (result.error) {
      throw new Error(result.error.message);
    }

    if (result.data) {
      return result.data as FullInboundEmail;
    }
  } catch (sdkError) {
    console.error("Resend SDK inbound email fetch failed:", sdkError);
  }

  try {
    const response = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(details || `HTTP ${response.status}`);
    }

    const json = (await response.json()) as
      | FullInboundEmail
      | { data?: FullInboundEmail };
    const wrapped = json as { data?: FullInboundEmail };

    return wrapped.data || (json as FullInboundEmail);
  } catch (fetchError) {
    console.error("Resend API inbound email fetch failed:", fetchError);
  }

  return null;
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
    const emailId = getString(data.email_id || data.emailId || data.id);
    const fullEmail = emailId ? await fetchInboundEmailContent(emailId) : null;
    const from = extractEmail(data.from || fullEmail?.from);
    const toValue = data.to || fullEmail?.to;
    const toRaw = Array.isArray(toValue) ? toValue[0] : toValue;
    const to = getString(toRaw);
    const subject = getString(data.subject || fullEmail?.subject) || "(No subject)";
    const fetchedBody = getBodyFromEmail(fullEmail);
    const body = fetchedBody || extractBody(data);

    if (!fetchedBody && body === "(No message body)") {
      console.log("No inbound email body field found", { emailId });
    }

    console.log("Inbound email parsed:", {
      from,
      subject,
      hasBody: body !== "(No message body)",
      emailId,
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
