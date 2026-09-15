import { normalizeTeamTag } from "./countryFlags.js";

/** Approximate primary ODI/T20 kit color for each team, keyed the same way as the flag map
 * (full country name for the Series Predictor's dropdowns, or the abbreviated "(TAG)" used
 * in player display strings) - used to color chart bars/probability bars per-team instead of
 * a fixed, team-agnostic gold/emerald pair. */
const JERSEY_COLORS = {
  INDIA: "#1d4fd8",
  IND: "#1d4fd8",
  AUSTRALIA: "#f8c807",
  AUS: "#f8c807",
  ENGLAND: "#2a52be",
  ENG: "#2a52be",
  "SOUTH AFRICA": "#00843d",
  SA: "#00843d",
  "NEW ZEALAND": "#d6d6d6",
  NZ: "#d6d6d6",
  PAKISTAN: "#0b6e2c",
  PAK: "#0b6e2c",
  "SRI LANKA": "#0e4d92",
  SL: "#0e4d92",
  BANGLADESH: "#006a4e",
  BAN: "#006a4e",
  "WEST INDIES": "#7b0d1e",
  WI: "#7b0d1e",
  AFGHANISTAN: "#0057b7",
  AFG: "#0057b7",
  ZIMBABWE: "#d21f3c",
  ZIM: "#d21f3c",
  IRELAND: "#169b62",
  IRE: "#169b62",
  SCOTLAND: "#0065bd",
  SCOT: "#0065bd",
  NETHERLANDS: "#ff6c00",
  NED: "#ff6c00",
  NEPAL: "#dc143c",
  "UNITED ARAB EMIRATES": "#ce1126",
  UAE: "#ce1126",
  NAMIBIA: "#003580",
  NAM: "#003580",
  OMAN: "#c8102e",
  OMA: "#c8102e",
  "UNITED STATES OF AMERICA": "#0a3161",
  USA: "#0a3161",
  CANADA: "#e8112d",
  CAN: "#e8112d",
  "HONG KONG": "#de2910",
  HKG: "#de2910",
  KENYA: "#00853f",
  "PAPUA NEW GUINEA": "#ce1126",
  PNG: "#ce1126",
};

/** Returns a hex jersey color for a team/country name or player label, or null if unknown. */
export function jerseyColor(nameOrLabel) {
  const tag = normalizeTeamTag(nameOrLabel);
  return (tag && JERSEY_COLORS[tag]) || null;
}

/** Picks black or white text for readable contrast against a given hex background color. */
export function readableTextColor(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  if (!m) return "#ffffff";
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.55 ? "#141a17" : "#ffffff";
}
