import type { Corridor, Zone } from "../../../domain/entities/zone.js";

/**
 * Seeded zone reference data. There are no free-text locations anywhere.
 *
 * `aliases` carries the actual spellings found in the legacy workbook, so
 * migrated postings and colleagues' existing habits both resolve correctly.
 * One legacy poster produced four spellings of a single destination in five
 * months (LEGACY_AUDIT.md D-04); absorbing them here is what makes matching
 * possible at all.
 *
 * Coordinates are approximate zone centroids, accurate enough to order pickup
 * points and estimate a walk. They are not survey-grade and nothing in Phase 1
 * depends on them being so — matching runs over the corridor graph, not over
 * distance. Replace them when a geocoder adapter (Barikoi, Mapbox) lands.
 */

const z = (
  id: string,
  nameEn: string,
  nameBn: string,
  lat: number,
  lng: number,
  corridorIds: string[],
  aliases: string[] = [],
): Zone => ({ id, nameEn, nameBn, lat, lng, corridorIds, aliases });

export const ZONES: readonly Zone[] = [
  // --- Northern corridor: Uttara / Airport / 300 Feet -> Gulshan ---------
  z("uttara-1", "Uttara Sector 1", "উত্তরা সেক্টর ১", 23.8687, 90.3944, ["c-north"], ["uttara 1"]),
  z("uttara-3", "Uttara Sector 3", "উত্তরা সেক্টর ৩", 23.8681, 90.4005, ["c-north"], ["uttara 3"]),
  z("uttara-7", "Uttara Sector 7", "উত্তরা সেক্টর ৭", 23.8759, 90.3901, ["c-north"], ["uttara 7"]),
  z("uttara-10", "Uttara Sector 10", "উত্তরা সেক্টর ১০", 23.8792, 90.3823, ["c-north"], ["uttara 10"]),
  z("uttara-11", "Uttara Sector 11", "উত্তরা সেক্টর ১১", 23.8735, 90.3785, ["c-north"], ["uttara 11"]),
  z("uttara", "Uttara", "উত্তরা", 23.8759, 90.3795, ["c-north"], ["uttora", "uttara model town"]),
  z("airport", "Airport", "বিমানবন্দর", 23.8513, 90.4086, ["c-north"], ["hazrat shahjalal", "dhaka airport"]),
  z("khilkhet", "Khilkhet", "খিলক্ষেত", 23.8290, 90.4200, ["c-north"], ["khilket", "kilkhet"]),
  z("300-feet", "300 Feet", "৩০০ ফিট", 23.8180, 90.4650, ["c-north"], [
    "300 feets", "three hundred feet", "express road", "purbachal express",
    "bishow road", "bishwa road", "biswa road",
  ]),
  z("jamuna-future-park", "Jamuna Future Park", "যমুনা ফিউচার পার্ক", 23.8134, 90.4249, ["c-north"], [
    "jamuna", "jamuna futur park", "jumuna future park", "jfp", "future park",
  ]),
  z("kuril", "Kuril", "কুড়িল", 23.8223, 90.4197, ["c-north"], ["kuril bishwa road", "kuril flyover"]),
  z("notun-bazar", "Notun Bazar", "নতুন বাজার", 23.7997, 90.4249, ["c-north"], [
    "notun baza", "natun bazar", "new market notun bazar",
  ]),
  z("bashundhara", "Bashundhara R/A", "বসুন্ধরা আবাসিক", 23.8188, 90.4270, ["c-north"], [
    "bashundhara", "bashundara", "basundhara",
  ]),
  z("badda", "Badda", "বাড্ডা", 23.7806, 90.4256, ["c-north"], ["north badda", "middle badda"]),
  z("rampura", "Rampura", "রামপুরা", 23.7615, 90.4213, ["c-north"], []),

  // --- Gulshan core -------------------------------------------------------
  z("gulshan-2", "Gulshan-2", "গুলশান-২", 23.7936, 90.4142, ["c-north", "c-west", "c-south"], [
    "gulshan 2", "gulshan circle 2", "gulshan cirle-2", "gulshan circle two",
    // The office building. Colleagues call it Empori; the legacy file has four
    // spellings of it, and every one of them means this zone.
    "empori", "emporia", "empori tc", "gulshan empori financial tower",
    "giz tc office", "giz tc office gulshan", "tc office", "gulshan rd 123",
  ]),
  z("gulshan-1", "Gulshan-1", "গুলশান-১", 23.7808, 90.4152, ["c-north", "c-west", "c-south"], [
    "gulshan 1", "gulshan circle 1", "gulshan",
  ]),
  z("niketan", "Niketan", "নিকেতন", 23.7757, 90.4118, ["c-south"], []),
  z("banani", "Banani", "বনানী", 23.7936, 90.4043, ["c-north", "c-west"], ["banani 11"]),
  z("mohakhali", "Mohakhali", "মহাখালী", 23.7783, 90.4053, ["c-west", "c-south"], ["mohakhali dohs"]),

  // --- Western corridor: Mirpur -> Gulshan --------------------------------
  z("mirpur-1", "Mirpur-1", "মিরপুর-১", 23.7957, 90.3537, ["c-west"], ["mirpur 1"]),
  z("mirpur-2", "Mirpur-2", "মিরপুর-২", 23.8047, 90.3628, ["c-west"], ["mirpur 2"]),
  z("mirpur-6", "Mirpur-6", "মিরপুর-৬", 23.8073, 90.3663, ["c-west"], ["mirpur 6"]),
  z("mirpur-10", "Mirpur-10", "মিরপুর-১০", 23.8069, 90.3687, ["c-west"], ["mirpur 10", "mirpur"]),
  z("mirpur-11", "Mirpur-11", "মিরপুর-১১", 23.8194, 90.3654, ["c-west"], ["mirpur 11"]),
  z("mirpur-12", "Mirpur-12", "মিরপুর-১২", 23.8279, 90.3654, ["c-west"], ["mirpur 12"]),
  z("kalshi", "Kalshi", "কালশী", 23.8235, 90.3805, ["c-west"], ["kalshi road"]),
  z("kazipara", "Kazipara", "কাজীপাড়া", 23.7965, 90.3742, ["c-west"], []),
  z("shewrapara", "Shewrapara", "শেওড়াপাড়া", 23.7906, 90.3773, ["c-west"], []),
  z("agargaon", "Agargaon", "আগারগাঁও", 23.7776, 90.3795, ["c-west"], ["agargao"]),
  z("shyamoli", "Shyamoli", "শ্যামলী", 23.7746, 90.3660, ["c-west"], ["shamoli", "syamoli"]),
  z("bijoy-sarani", "Bijoy Sarani", "বিজয় সরণি", 23.7657, 90.3833, ["c-west", "c-south"], ["bijoy soroni"]),
  z("tejgaon", "Tejgaon", "তেজগাঁও", 23.7639, 90.3925, ["c-south"], ["tejgao"]),
  z("farmgate", "Farmgate", "ফার্মগেট", 23.7583, 90.3897, ["c-south"], ["farm gate"]),
  z("karwan-bazar", "Karwan Bazar", "কারওয়ান বাজার", 23.7508, 90.3934, ["c-south"], ["kawran bazar"]),

  // --- Southern corridor: Gulshan -> Dhanmondi / Mohammadpur --------------
  z("dhanmondi", "Dhanmondi", "ধানমন্ডি", 23.7461, 90.3742, ["c-south"], [
    "dhanmondi 27", "dhanmandi", "sobhanbagh", "shobhanbag",
  ]),
  z("lalmatia", "Lalmatia", "লালমাটিয়া", 23.7565, 90.3661, ["c-south"], []),
  z("mohammadpur", "Mohammadpur", "মোহাম্মদপুর", 23.7590, 90.3591, ["c-south"], ["mohammadpur bus stand"]),
  z("shahbagh", "Shahbagh", "শাহবাগ", 23.7386, 90.3954, ["c-south"], ["shahbag"]),

  // --- Old Dhaka / south-east --------------------------------------------
  z("motijheel", "Motijheel", "মতিঝিল", 23.7330, 90.4172, ["c-south"], ["dmcc", "dilkusha"]),
  z("paltan", "Paltan", "পল্টন", 23.7350, 90.4128, ["c-south"], ["purana paltan"]),
  z("jatrabari", "Jatrabari", "যাত্রাবাড়ী", 23.7104, 90.4348, [], ["jatrabri"]),
  z("sayedabad", "Sayedabad", "সায়েদাবাদ", 23.7134, 90.4270, [], ["saydabad"]),
  z("sadarghat", "Sadarghat", "সদরঘাট", 23.7061, 90.4106, [], ["shodorghat", "sodorghat"]),

  // --- Outer districts ----------------------------------------------------
  z("gazipur", "Gazipur", "গাজীপুর", 23.9999, 90.4203, [], ["gazipur chowrasta"]),
  z("savar", "Savar", "সাভার", 23.8583, 90.2667, [], []),
  z("narayanganj", "Narayanganj", "নারায়ণগঞ্জ", 23.6238, 90.4990, [], ["narayangonj"]),
];

/**
 * Named corridors. Ordered zone lists used to pre-populate "passing through?"
 * in the offer flow, so a driver is never facing a blank box.
 *
 * These three were confirmed by the sponsor and are visible in the legacy data.
 */
export const CORRIDORS: readonly Corridor[] = [
  {
    id: "c-north",
    nameEn: "Uttara / Khilkhet / 300 Feet → Gulshan",
    nameBn: "উত্তরা / খিলক্ষেত / ৩০০ ফিট → গুলশান",
    zoneIds: [
      "uttara", "airport", "khilkhet", "300-feet", "kuril",
      "jamuna-future-park", "notun-bazar", "badda", "gulshan-2", "gulshan-1",
    ],
  },
  {
    id: "c-west",
    nameEn: "Mirpur → Gulshan",
    nameBn: "মিরপুর → গুলশান",
    zoneIds: [
      "mirpur-12", "mirpur-11", "mirpur-10", "kalshi", "kazipara",
      "shewrapara", "agargaon", "banani", "gulshan-2", "gulshan-1",
    ],
  },
  {
    id: "c-south",
    nameEn: "Gulshan → Dhanmondi / Mohammadpur",
    nameBn: "গুলশান → ধানমন্ডি / মোহাম্মদপুর",
    zoneIds: [
      "gulshan-1", "mohakhali", "bijoy-sarani", "farmgate",
      "dhanmondi", "lalmatia", "mohammadpur",
    ],
  },
];

export const zoneById = (id: string): Zone | undefined => ZONES.find((zone) => zone.id === id);

/**
 * Zones the driver probably passes through, from the corridor graph.
 *
 * Pre-populating this is a direct response to the audit: the legacy Route
 * column was blank in 13 of 20 rows, and the cause was a commented-out write in
 * the submit handler rather than user laziness (L-03). A suggestion the driver
 * confirms is both faster than typing and verifiable end to end.
 */
export const suggestViaZones = (originId: string, destinationId: string): readonly string[] => {
  for (const corridor of CORRIDORS) {
    const from = corridor.zoneIds.indexOf(originId);
    const to = corridor.zoneIds.indexOf(destinationId);
    if (from !== -1 && to !== -1 && from < to) {
      return corridor.zoneIds.slice(from + 1, to);
    }
  }
  return [];
};
