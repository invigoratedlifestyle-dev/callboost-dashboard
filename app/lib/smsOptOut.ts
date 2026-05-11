export function appendOptOut(text: string) {
  if (/reply\s+stop/i.test(text)) {
    return text;
  }

  return `${text.trim()}\n\nReply STOP to opt out.`;
}

const smsReplacementMap: Record<string, string> = {
  "\u00a0": " ",
  "\u2007": " ",
  "\u202f": " ",
  "\u2018": "'",
  "\u2019": "'",
  "\u201a": "'",
  "\u201b": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u201e": '"',
  "\u201f": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2212": "-",
  "\u2022": "-",
  "\u2026": "...",
};

const emojiRegex =
  /[\u{1f000}-\u{1faff}\u{2600}-\u{27bf}\u{fe0f}\u{200d}]/gu;

export function normalizeSmsText(text: string) {
  return String(text || "")
    .replace(/â€™|â€˜/g, "'")
    .replace(/â€œ|â€/g, '"')
    .replace(/â€“|â€”/g, "-")
    .replace(/â€¦/g, "...")
    .replace(/ðŸ[\s\S]{0,3}/g, "")
    .replace(/[\u00a0\u2007\u202f\u2018\u2019\u201a\u201b\u201c\u201d\u201e\u201f\u2013\u2014\u2212\u2022\u2026]/g, (char) => smsReplacementMap[char] || "")
    .replace(emojiRegex, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function prepareOutboundSmsText(text: string) {
  return normalizeSmsText(appendOptOut(text));
}
