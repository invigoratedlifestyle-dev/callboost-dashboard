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
    message_id?: string;
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
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
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

function cleanReplyBody(body: string) {
  return body
    .split(/\nOn .*wrote:/i)[0]
    .split(/\nFrom:/i)[0]
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchInboundEmailContent(
  emailId: string
): Promise<{ fullEmail: FullInboundEmail | null; fullEmailError: unknown }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    const error = "Missing RESEND_API_KEY";
    console.error("Inbound email content fetch skipped:", error);
    return { fullEmail: null, fullEmailError: error };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.receiving.get(emailId);

    return {
      fullEmail: result.data ? (result.data as FullInboundEmail) : null,
      fullEmailError: result.error || null,
    };
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

    return {
      fullEmail: wrapped.data || (json as FullInboundEmail),
      fullEmailError: null,
    };
  } catch (fetchError) {
    console.error("Resend API inbound email fetch failed:", fetchError);
    return { fullEmail: null, fullEmailError: fetchError };
  }
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
    console.log("Fetching full inbound email from Resend:", emailId);

    const { fullEmail, fullEmailError } = emailId
      ? await fetchInboundEmailContent(emailId)
      : {
          fullEmail: null,
          fullEmailError: "Missing email_id",
        };

    console.log("RESEND_FULL_EMAIL_RESULT", {
      error: fullEmailError,
      keys: fullEmail ? Object.keys(fullEmail) : [],
      hasText: Boolean(fullEmail?.text),
      hasHtml: Boolean(fullEmail?.html),
      textPreview: fullEmail?.text?.slice(0, 200),
      htmlPreview: fullEmail?.html?.slice(0, 200),
    });

    const from = extractEmail(data.from || fullEmail?.from);
    const toValue = data.to || fullEmail?.to;
    const toRaw = Array.isArray(toValue) ? toValue[0] : toValue;
    const to = getString(toRaw);
    const subject = getString(data.subject || fullEmail?.subject) || "(No subject)";
    const rawBody =
      fullEmail?.text?.trim() || stripHtml(fullEmail?.html || "") || "";
    const body = cleanReplyBody(rawBody) || "(No message body)";

    if (body === "(No message body)") {
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
      providerMessageId: getString(data.message_id || emailId),
    });

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("Inbound email webhook failed:", error);

    return new Response("ok", { status: 200 });
  }
}
