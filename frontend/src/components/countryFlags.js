/** Maps the country/team name or tag used across the app (either the full name used by
 * the Series Predictor's team dropdowns, e.g. "India", or the trailing "(TAG)" used in
 * player display strings, e.g. "V Kohli (INDIA)") to a real flag image URL.
 *
 * There's no image-fetching capability available to bundle real board crest PNGs (and no
 * reliably-licensed source for them), so this hotlinks small flag images from flagcdn.com -
 * a free CDN purpose-built for exactly this (no attribution/key required, ISO 3166-1 codes).
 */
const NAME_TO_ISO2 = {
  // Full country names (used by the Series Predictor's team lists).
  INDIA: "in",
  AUSTRALIA: "au",
  ENGLAND: "gb",
  "SOUTH AFRICA": "za",
  "NEW ZEALAND": "nz",
  PAKISTAN: "pk",
  BANGLADESH: "bd",
  ZIMBABWE: "zw",
  AFGHANISTAN: "af",
  IRELAND: "ie",
  NAMIBIA: "na",
  NETHERLANDS: "nl",
  "UNITED ARAB EMIRATES": "ae",
  "HONG KONG": "hk",
  CANADA: "ca",
  SCOTLAND: "gb",
  OMAN: "om",
  "PAPUA NEW GUINEA": "pg",
  JERSEY: "je",
  MALAYSIA: "my",
  MALTA: "mt",
  MALAWI: "mw",
  UGANDA: "ug",
  QATAR: "qa",
  KENYA: "ke",
  NEPAL: "np",
  "UNITED STATES OF AMERICA": "us",
  USA: "us",
  BERMUDA: "bm",
  ITALY: "it",
  SURINAME: "sr",
  BAHAMAS: "bs",
  PHILIPPINES: "ph",
  ARGENTINA: "ar",
  AUSTRIA: "at",
  BELGIUM: "be",
  BOTSWANA: "bw",
  BRAZIL: "br",
  BULGARIA: "bg",
  CAMBODIA: "kh",
  CAMEROON: "cm",
  CHILE: "cl",
  CHINA: "cn",
  CROATIA: "hr",
  CYPRUS: "cy",
  DENMARK: "dk",
  ESTONIA: "ee",
  FINLAND: "fi",
  GERMANY: "de",
  GHANA: "gh",
  GIBRALTAR: "gi",
  HUNGARY: "hu",
  INDONESIA: "id",
  JAPAN: "jp",
  LUXEMBOURG: "lu",
  MONGOLIA: "mn",
  MYANMAR: "mm",
  NIGERIA: "ng",
  NORWAY: "no",
  PORTUGAL: "pt",
  RWANDA: "rw",
  SERBIA: "rs",
  SINGAPORE: "sg",
  SPAIN: "es",
  SWEDEN: "se",
  THAILAND: "th",
  VANUATU: "vu",
  // Abbreviated tags used in the leaderboard CSVs' player display strings.
  ENG: "gb",
  AUS: "au",
  SA: "za",
  NZ: "nz",
  PAK: "pk",
  BAN: "bd",
  ZIM: "zw",
  AFG: "af",
  IRE: "ie",
  NAM: "na",
  NED: "nl",
  UAE: "ae",
  HKG: "hk",
  CAN: "ca",
  SCOT: "gb",
  OMA: "om",
  PNG: "pg",
  JER: "je",
  MAL: "my",
  MLT: "mt",
  MWI: "mw",
  UGA: "ug",
  QAT: "qa",
};

// No single national flag applies to these composite/multi-nation teams.
const NO_FLAG = new Set(["WEST INDIES", "WI", "ICC WORLD XI", "ASIA XI", "AFRICA XI", "ICC", "WORLD"]);

/** Extracts the trailing "(TAG)" from a player display string, e.g. "V Kohli (INDIA)" -> "INDIA". */
function extractTag(label) {
  const match = /\(([^()]+)\)\s*$/.exec(label || "");
  if (!match) return null;
  // Composite tags like "Asia/ICC/SL" or "AUS/ICC" - try the most specific (last) segment.
  return match[1].split("/").pop().trim().toUpperCase();
}

/** Normalizes a team/country name or a "Name (TAG)" player label down to the uppercase key
 * used by both the flag map here and the jersey-color map in jerseyColors.js. */
export function normalizeTeamTag(nameOrLabel) {
  return extractTag(nameOrLabel) || (nameOrLabel || "").trim().toUpperCase();
}

/** Returns a flagcdn.com image URL for a team/country name or player label, or null if no
 * single national flag applies (composite teams) or the country isn't recognized. */
export function flagUrl(nameOrLabel, width = 80) {
  const tag = normalizeTeamTag(nameOrLabel);
  if (!tag || NO_FLAG.has(tag)) return null;
  const iso2 = NAME_TO_ISO2[tag];
  if (!iso2) return null;
  // flagcdn.com only serves fixed width buckets - any other width 404s, so snap up to
  // the nearest one instead of passing the requested pixel size straight through.
  const BUCKETS = [20, 40, 80, 160, 320, 640, 1280, 2560];
  const bucket = BUCKETS.find((b) => b >= width) || BUCKETS[BUCKETS.length - 1];
  return `https://flagcdn.com/w${bucket}/${iso2}.png`;
}
