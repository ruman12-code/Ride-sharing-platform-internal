import type { Id } from "../types.js";

/**
 * A named place. Seeded and versioned reference data — never free text.
 *
 * The legacy workbook let people type locations freely and one poster produced
 * four spellings of a single destination in five months: "Jamuna 300 feet",
 * "Jamuna Futur Park", "Jumuna Future Park Express Road (300 Feet)",
 * "Notun Baza to Bishow road to 300 feet" (LEGACY_AUDIT.md D-04). Nothing can
 * match across those. Hence: a closed set, with aliases doing the absorbing.
 */
export interface Zone {
  readonly id: Id;
  readonly nameEn: string;
  readonly nameBn: string;
  readonly lat: number;
  readonly lng: number;
  readonly corridorIds: readonly Id[];
  /**
   * Spellings that resolve to this zone, lowercased.
   *
   * Seeded from the real spellings in the legacy file, so migrated postings and
   * colleagues' habits both land on the right zone.
   */
  readonly aliases: readonly string[];
}

/** A named commuting route. Zones in travel order. */
export interface Corridor {
  readonly id: Id;
  readonly nameEn: string;
  readonly nameBn: string;
  readonly zoneIds: readonly Id[];
}

/** Resolve a free-text spelling to a zone. Used by migration and search only. */
export const resolveZone = (zones: readonly Zone[], text: string): Zone | undefined => {
  const needle = text.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    zones.find((z) => z.nameEn.toLowerCase() === needle || z.nameBn === text.trim()) ??
    zones.find((z) => z.aliases.includes(needle))
  );
};
