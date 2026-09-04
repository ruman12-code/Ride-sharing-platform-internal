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
  /**
   * Named routes this zone belongs to, for reporting only.
   *
   * Never a routing input. Routes are computed between any two zones from
   * geography; a hand-maintained corridor list meant a journey nobody had
   * anticipated could not be offered.
   */
  readonly corridorIds: readonly Id[];
  /**
   * Spellings that resolve to this zone, lowercased.
   *
   * Seeded from the real spellings in the legacy file, so migrated postings and
   * colleagues' habits both land on the right zone.
   */
  readonly aliases: readonly string[];
  /**
   * The broader area this place sits inside, if any.
   *
   * Purely a grouping for the picker: choosing "Uttara" then narrowing to
   * "Diabari" is two short lists instead of one long one. It has no effect on
   * routing — every zone, parent or child, is its own node in the graph.
   *
   * That distinction is the point. Uttara Diabari and Uttara Jashim Uddin are
   * about four kilometres apart and do not take the same road to Gulshan, so
   * treating them as one origin would compute a route neither driver actually
   * drives. They are separate places that happen to share a name.
   */
  readonly parentId?: Id;
  /** True when this is a recognised landmark rather than a general area. */
  readonly isLandmark?: boolean;
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
