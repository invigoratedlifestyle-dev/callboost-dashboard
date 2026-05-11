export const EMAIL_UNSUBSCRIBE_FOOTER =
  "If you'd prefer not to receive further emails, just reply with unsubscribe.";

export function appendEmailUnsubscribeFooter(body: string) {
  if (body.includes(EMAIL_UNSUBSCRIBE_FOOTER)) {
    return body;
  }

  const trimmedBody = body.trimEnd();

  return trimmedBody
    ? `${trimmedBody}\n\n${EMAIL_UNSUBSCRIBE_FOOTER}`
    : EMAIL_UNSUBSCRIBE_FOOTER;
}

export function isEmailUnsubscribeIntent(args: {
  body?: string | null;
  subject?: string | null;
}) {
  const text = `${args.subject || ""}\n${args.body || ""}`.toLowerCase();

  return (
    /\b(unsubscribe|unsubscribed|remove me|stop emailing|do not email me|no more emails)\b/.test(
      text
    ) || /\bdon['’]?t email me\b/.test(text)
  );
}
