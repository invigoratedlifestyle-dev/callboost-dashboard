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

export function sanitizeForGsm(text: string) {
  return normalizeSmsText(text)
    .replace(/[^\x0a\x0d\x20-\x7e]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const gsmExtendedCharacters = new Set(["^", "{", "}", "\\", "[", "~", "]", "|", "\u20ac"]);

function isGsmBasicCharacter(char: string) {
  const code = char.charCodeAt(0);

  if (char === "\n" || char === "\r") return true;
  if (code >= 32 && code <= 126) return true;

  return false;
}

export function estimateSmsSegments(text: string) {
  const sanitized = sanitizeForGsm(text);
  let encoding: "GSM-7" | "Unicode" = "GSM-7";
  let length = 0;

  for (const char of sanitized) {
    if (!isGsmBasicCharacter(char)) {
      encoding = "Unicode";
      break;
    }

    length += gsmExtendedCharacters.has(char) ? 2 : 1;
  }

  if (encoding === "Unicode") {
    length = [...sanitized].length;
  }

  const singleSegmentLimit = encoding === "GSM-7" ? 160 : 70;
  const multiSegmentLimit = encoding === "GSM-7" ? 153 : 67;
  const estimatedSegments =
    length <= singleSegmentLimit
      ? 1
      : Math.max(1, Math.ceil(length / multiSegmentLimit));

  return {
    encoding,
    estimatedSegments,
    length,
    text: sanitized,
  };
}

export function prepareOutboundSmsText(text: string) {
  return sanitizeForGsm(appendOptOut(text));
}
