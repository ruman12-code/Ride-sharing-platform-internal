/**
 * Bangla and English as equal first-class languages.
 *
 * Every string is authored in both. Bangla is not a machine translation of the
 * English and is not an afterthought: for a Dhaka office it is the language many
 * colleagues will actually read, and a half-translated interface signals that
 * they are not the intended user.
 */

export type Lang = "en" | "bn";

export const STRINGS = {
  appName: { en: "Office Carpool", bn: "অফিস কারপুল" },
  tagline: {
    en: "Sharing costs, not driving for hire.",
    bn: "খরচ ভাগাভাগি, ভাড়ায় চালানো নয়।",
  },

  // Home
  offerARide: { en: "Offer a ride", bn: "রাইড অফার করুন" },
  offerASeatSub: { en: "Driving in? Take a colleague.", bn: "গাড়িতে যাচ্ছেন? সহকর্মীকে নিন।" },
  findARide: { en: "Find a ride", bn: "রাইড খুঁজুন" },
  findARideSub: { en: "Going the same way as someone.", bn: "কারও সঙ্গে একই পথে।" },
  today: { en: "Today", bn: "আজ" },
  nothingToday: { en: "No trip booked today.", bn: "আজ কোনো ট্রিপ নেই।" },
  pendingActions: { en: "Needs you", bn: "আপনার সাড়া দরকার" },
  liveActivity: {
    en: "colleagues are commuting your corridor this week",
    bn: "জন সহকর্মী এই সপ্তাহে আপনার রুটে যাতায়াত করছেন",
  },

  // Offer flow
  step: { en: "Step", bn: "ধাপ" },
  of: { en: "of", bn: "/" },
  route: { en: "Route", bn: "রুট" },
  when: { en: "When", bn: "কখন" },
  seatsAndCar: { en: "Seats & car", bn: "সিট ও গাড়ি" },
  costShare: { en: "Cost share", bn: "খরচ ভাগ" },
  from: { en: "From", bn: "কোথা থেকে" },
  to: { en: "To", bn: "কোথায়" },
  savedRoutes: { en: "Your saved routes", bn: "আপনার সংরক্ষিত রুট" },
  passingThrough: { en: "Passing through?", bn: "পথে কোথায় পড়ে?" },
  passingThroughHint: {
    en: "We filled this in from your corridor. Tap to remove a stop.",
    bn: "আপনার রুট থেকে দেওয়া হয়েছে। বাদ দিতে ট্যাপ করুন।",
  },
  yourRoute: { en: "Your route", bn: "আপনার রুট" },
  calculatingRoute: { en: "Working out the best route…", bn: "সেরা রুট বের করা হচ্ছে…" },
  noRoute: {
    en: "We couldn't work out a route between those two places.",
    bn: "এই দুই জায়গার মধ্যে কোনো রুট বের করা গেল না।",
  },
  routeHint: {
    en: "Colleagues can join or get off at any of these stops. Tap one to remove it.",
    bn: "সহকর্মীরা এই যেকোনো জায়গায় উঠতে বা নামতে পারেন। বাদ দিতে ট্যাপ করুন।",
  },
  minutes: { en: "min", bn: "মিনিট" },
  estimated: { en: "Estimated", bn: "আনুমানিক" },
  liveTraffic: { en: "Live traffic", bn: "সরাসরি ট্রাফিক" },
  anyStopOnRoute: { en: "Any stop on the route", bn: "রুটের যেকোনো জায়গা" },

  /**
   * The declaration, carried over verbatim from the legacy entry form.
   *
   * Source: `UserForm1`, label `Label9x7`, in
   * `Ride_sharing_platformFinal29012024.xlsm`. It appeared above the fields in
   * the original UserForm and is reproduced here word for word rather than
   * rewritten, because it is the organisation's own wording and the basis on
   * which colleagues previously entered their details.
   *
   * If this text ever needs to change, that is a decision for whoever owns the
   * policy, not an editorial tidy-up.
   */
  declaration: {
    en: "You are entering your Ride sharing information by yourself, voluntarily",
    bn: "আপনি নিজের ইচ্ছায়, স্বেচ্ছায় আপনার রাইড শেয়ারিং তথ্য দিচ্ছেন",
  },

  repeatWeekly: { en: "Repeat weekly", bn: "সাপ্তাহিক পুনরাবৃত্তি" },
  repeatWeeklyHint: {
    en: "Set it once. Confirm each day from a notification.",
    bn: "একবার সেট করুন। প্রতিদিন নোটিফিকেশন থেকে নিশ্চিত করুন।",
  },
  seatsOffered: { en: "Seats you can offer", bn: "কয়টি সিট দিতে পারবেন" },
  vehicle: { en: "Vehicle", bn: "গাড়ি" },
  preferences: { en: "Preferences", bn: "পছন্দ" },
  womenOnly: { en: "Women only", bn: "শুধু নারী" },
  ac: { en: "AC", bn: "এসি" },
  luggage: { en: "Luggage space", bn: "ব্যাগের জায়গা" },
  quiet: { en: "Quiet ride", bn: "নীরব যাত্রা" },
  review: { en: "Review", bn: "যাচাই" },
  publish: { en: "Publish", bn: "প্রকাশ করুন" },
  back: { en: "Back", bn: "পিছনে" },
  next: { en: "Next", bn: "পরবর্তী" },
  cancel: { en: "Cancel", bn: "বাতিল" },

  // Cost share
  youMayLower: {
    en: "You can lower this, or offer the seat free. You can never charge more.",
    bn: "কমাতে পারেন, বিনামূল্যেও দিতে পারেন। বেশি নেওয়া যাবে না।",
  },
  perSeat: { en: "per seat", bn: "প্রতি সিট" },
  capNotice: { en: "This is the most you can ask.", bn: "এটাই সর্বোচ্চ চাওয়া যায়।" },

  // Find flow
  searchWhen: { en: "When", bn: "কখন" },
  seatsNeeded: { en: "Seats", bn: "সিট" },
  seatNeeded: { en: "Seat", bn: "সিট" },
  searchAction: { en: "Search", bn: "খুঁজুন" },
  resultsCount: { en: "colleagues going your way", bn: "জন সহকর্মী আপনার পথে যাচ্ছেন" },
  requestSeat: { en: "Request seat", bn: "সিট চান" },
  alertMe: { en: "Alert me", bn: "জানাবেন" },
  seatsLeft: { en: "seats left", bn: "সিট বাকি" },
  seatLeft: { en: "seat left", bn: "সিট বাকি" },
  minWalk: { en: "min walk", bn: "মিনিট হাঁটা" },
  noMatchTitle: { en: "No match yet", bn: "এখনো কোনো মিল নেই" },
  noMatchBody: {
    en: "We'll tell you the moment a colleague posts this route.",
    bn: "কোনো সহকর্মী এই রুট দিলে সঙ্গে সঙ্গে জানাব।",
  },
  alsoWant: { en: "colleagues also want this route", bn: "জন সহকর্মীও এই রুট চান" },
  driveItYourself: { en: "Driving that way yourself?", bn: "নিজেই সেদিকে যাচ্ছেন?" },
  offerASeat: { en: "Offer a seat", bn: "একটি সিট দিন" },

  // Booking sheet
  pickupPoint: { en: "Pick-up point", bn: "ওঠার জায়গা" },
  counterfactualQuestion: {
    en: "How would you otherwise travel?",
    bn: "না পেলে কীভাবে যেতেন?",
  },
  counterfactualWhy: {
    en: "One tap. It's how we show this takes cars off the road.",
    bn: "এক ট্যাপ। এতেই প্রমাণ হয় রাস্তায় গাড়ি কমছে।",
  },
  cf_bus: { en: "Bus", bn: "বাস" },
  cf_rickshaw_cng: { en: "Rickshaw / CNG", bn: "রিকশা / সিএনজি" },
  cf_own_car: { en: "My own car", bn: "নিজের গাড়ি" },
  cf_ride_hailing: { en: "Uber / Pathao", bn: "উবার / পাঠাও" },
  cf_would_not_travel: { en: "I wouldn't travel", bn: "যেতাম না" },
  settlement: { en: "Settle by", bn: "নিষ্পত্তি" },
  sm_credit_ledger: { en: "Credit ledger", bn: "ক্রেডিট খাতা" },
  sm_employer: { en: "Employer", bn: "অফিস" },
  sm_cash: { en: "Cash", bn: "নগদ" },
  confirm: { en: "Confirm", bn: "নিশ্চিত করুন" },

  // My rides
  myRides: { en: "My rides", bn: "আমার রাইড" },
  upcoming: { en: "Upcoming", bn: "আসন্ন" },
  past: { en: "Past", bn: "অতীত" },
  offering: { en: "Offering", bn: "দিচ্ছি" },
  nothingHere: { en: "Nothing here yet.", bn: "এখনো কিছু নেই।" },

  // Match labels
  exact_route: { en: "Exact route", bn: "একই রুট" },
  on_the_way: { en: "On the way", bn: "পথেই পড়ে" },
  short_detour: { en: "Short detour", bn: "সামান্য ঘুরপথ" },

  // Days
  sun: { en: "Sun", bn: "রবি" },
  mon: { en: "Mon", bn: "সোম" },
  tue: { en: "Tue", bn: "মঙ্গল" },
  wed: { en: "Wed", bn: "বুধ" },
  thu: { en: "Thu", bn: "বৃহঃ" },
  fri: { en: "Fri", bn: "শুক্র" },
  sat: { en: "Sat", bn: "শনি" },

  taka: { en: "Tk", bn: "৳" },
  home: { en: "Home", bn: "হোম" },
} as const;

export type StringKey = keyof typeof STRINGS;

export const t = (key: StringKey, lang: Lang): string => STRINGS[key][lang];

/** Bangla-Indic digits, so numbers read naturally in the Bangla interface. */
const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"] as const;

export const num = (value: number | string, lang: Lang): string =>
  lang === "en"
    ? String(value)
    : String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);

/** Money, always with the language's own numerals and currency mark. */
export const taka = (amount: number, lang: Lang): string =>
  lang === "en" ? `Tk ${amount}` : `৳${num(amount, "bn")}`;
