export function appendOptOut(text: string) {
  if (/reply\s+stop/i.test(text)) {
    return text;
  }

  return `${text.trim()}\n\nReply STOP to opt out.`;
}
