export function isPlaceholderEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  return (
    normalizedEmail === "contact@example.com" ||
    normalizedEmail === "admin@example.com" ||
    normalizedEmail === "test@example.com" ||
    normalizedEmail.endsWith("@example.com")
  );
}

export function getUsableEmail(value: unknown) {
  const email = String(value || "").trim();

  return email && !isPlaceholderEmail(email) ? email : "";
}

export function isAustralianMobileNumber(value: unknown) {
  const normalizedPhone = String(value || "").replace(/[^\d+]/g, "");

  if (/^04\d{8}$/.test(normalizedPhone)) return true;
  if (/^\+614\d{8}$/.test(normalizedPhone)) return true;
  if (/^614\d{8}$/.test(normalizedPhone)) return true;

  return false;
}

export function getUsableAustralianMobile(value: unknown) {
  const phone = String(value || "").trim();

  return isAustralianMobileNumber(phone) ? phone : "";
}

export function hasUsableFollowUpContact(args: {
  phone?: unknown;
  email?: unknown;
}) {
  return Boolean(
    getUsableAustralianMobile(args.phone) || getUsableEmail(args.email)
  );
}
