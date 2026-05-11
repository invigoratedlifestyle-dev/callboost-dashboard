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

export function formatAustralianPhoneNumber(phone: string) {
  const trimmedPhone = String(phone || "").trim();
  const digits = trimmedPhone.replace(/\D/g, "");
  let localDigits = "";

  if (/^0\d{9}$/.test(digits)) {
    localDigits = digits;
  } else if (/^61\d{9}$/.test(digits)) {
    localDigits = `0${digits.slice(2)}`;
  } else {
    return trimmedPhone;
  }

  if (/^04\d{8}$/.test(localDigits)) {
    return `${localDigits.slice(0, 4)} ${localDigits.slice(4, 7)} ${localDigits.slice(7)}`;
  }

  if (/^0[2378]\d{8}$/.test(localDigits)) {
    return `${localDigits.slice(0, 2)} ${localDigits.slice(2, 6)} ${localDigits.slice(6)}`;
  }

  return trimmedPhone;
}

export function hasUsableFollowUpContact(args: {
  phone?: unknown;
  email?: unknown;
}) {
  return Boolean(
    getUsableAustralianMobile(args.phone) || getUsableEmail(args.email)
  );
}
