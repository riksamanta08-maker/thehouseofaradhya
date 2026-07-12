const crypto = require("crypto");

function normalizeString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeEmail(value) {
  const normalized = normalizeString(value)?.toLowerCase() || null;
  if (!normalized) {
    return null;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function normalizeCountryCode(value) {
  const normalized = normalizeString(value)?.toLowerCase() || null;
  if (!normalized) {
    return null;
  }

  if (normalized === "in" || normalized === "india") {
    return "IN";
  }

  return normalized.toUpperCase();
}

function normalizePhoneToMetaE164(value, country = "IN") {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const digitsOnly = normalized.replace(/\D/g, "");
  if (!digitsOnly) {
    return null;
  }

  const normalizedCountry = normalizeCountryCode(country) || "IN";

  if (normalizedCountry === "IN") {
    if (digitsOnly.length === 10) {
      return `91${digitsOnly}`;
    }

    if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
      return `91${digitsOnly.slice(1)}`;
    }

    if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
      return digitsOnly;
    }

    return null;
  }

  if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
    return digitsOnly;
  }

  return null;
}

function sha256Hex(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function compactMetaObject(value) {
  if (Array.isArray(value)) {
    const normalizedItems = value
      .filter((entry) => entry !== null && entry !== undefined)
      .map((entry) => (typeof entry === "object" ? compactMetaObject(entry) : entry))
      .filter((entry) => {
        if (entry === null || entry === undefined) {
          return false;
        }

        if (Array.isArray(entry)) {
          return entry.length > 0;
        }

        if (typeof entry === "object") {
          return Object.keys(entry).length > 0;
        }

        return true;
      });

    return normalizedItems;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === null || entry === undefined) {
        return false;
      }

      if (Array.isArray(entry)) {
        return compactMetaObject(entry).length > 0;
      }

      if (typeof entry === "object") {
        return Object.keys(compactMetaObject(entry)).length > 0;
      }

      return true;
    }).map(([key, entry]) => [key, typeof entry === "object" ? compactMetaObject(entry) : entry]),
  );
}

function buildMetaHashedArray(value) {
  const hashedValue = sha256Hex(value);
  return hashedValue ? [hashedValue] : undefined;
}

function buildMetaUserData({ email = null, phone = null, country = "IN" } = {}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhoneToMetaE164(phone, country);
  return compactMetaObject({
    em: buildMetaHashedArray(normalizedEmail),
    ph: buildMetaHashedArray(normalizedPhone),
  });
}

module.exports = {
  buildMetaUserData,
  buildMetaHashedArray,
  compactMetaObject,
  normalizeEmail,
  normalizePhoneToMetaE164,
  sha256Hex,
};
