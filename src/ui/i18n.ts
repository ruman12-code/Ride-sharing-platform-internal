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
  appName: { en: "Ekpothe", bn: "একপথে" },
  appNameSub: { en: "on one path", bn: "এক পথে" },
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

  // Contact exchange — how the pickup actually gets arranged.
  howToReachYou: { en: "How can a colleague reach you?", bn: "সহকর্মী আপনাকে কীভাবে পাবেন?" },
  contactHint: {
    en: "A phone or WhatsApp number. Nobody can browse this. It is shown to one colleague, once a seat is confirmed, and every time it is shown is recorded.",
    bn: "ফোন বা হোয়াটসঅ্যাপ নম্বর। কেউ এটি খুঁজে দেখতে পারবে না। আসন নিশ্চিত হলে শুধু একজন সহকর্মীকে দেখানো হয়, এবং প্রতিবার দেখানোর রেকর্ড থাকে।",
  },
  saveContact: { en: "Save", bn: "সংরক্ষণ" },
  contactSaved: { en: "Saved.", bn: "সংরক্ষিত।" },
  contactMissing: {
    en: "Add a number so the colleague you ride with can reach you.",
    bn: "যাঁর সঙ্গে যাবেন তিনি যেন আপনাকে পান, সেজন্য একটি নম্বর দিন।",
  },
  getTheirNumber: { en: "Get their number", bn: "তাঁর নম্বর নিন" },
  theirNumberHidden: {
    en: "They haven't added a number yet. Ekpothe will not invent one.",
    bn: "তিনি এখনো নম্বর দেননি। একপথে কোনো নম্বর বানিয়ে দেবে না।",
  },
  markDone: { en: "Mark this trip done", bn: "যাত্রা সম্পন্ন বলে চিহ্নিত করুন" },
  pendingActions: { en: "Needs you", bn: "আপনার সাড়া দরকার" },
  liveActivity: {
    en: "rides on offer right now",
    bn: "টি যাত্রা এখন খোলা আছে",
  },
  liveActivityOne: {
    en: "ride on offer right now",
    bn: "টি যাত্রা এখন খোলা আছে",
  },
  /*
    The honest empty state.

    An empty marketplace really does get abandoned on sight, which is why the
    count used to be padded. The answer is to ask for the thing that fixes it
    rather than to pretend it is already fixed.
  */
  noRidesYet: {
    en: "No rides posted yet. Post yours — a colleague searching tomorrow will find it.",
    bn: "এখনো কোনো যাত্রা নেই। আপনারটি দিন — আগামীকাল কেউ খুঁজলে সেটি পাবেন।",
  },

  // Offer flow
  step: { en: "Step", bn: "ধাপ" },
  of: { en: "of", bn: "/" },
  route: { en: "Route", bn: "রুট" },
  when: { en: "When", bn: "কখন" },
  departureTime: { en: "Departure time", bn: "ছাড়ার সময়" },
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
  suggestedRoute: { en: "Best route we found", bn: "আমরা যে রুটটি পেয়েছি" },
  useThisRoute: { en: "Use this route", bn: "এই রুটেই যাব" },
  changePoints: { en: "Change start or end", bn: "শুরু বা শেষ বদলান" },
  approvedRoute: { en: "Route confirmed", bn: "রুট নিশ্চিত" },
  pickYourStops: { en: "Where will you stop?", bn: "কোথায় থামবেন?" },
  pickYourStopsHint: {
    en: "These are the places on your route. Turn off any you'd rather not stop at — colleagues can only join where you do stop.",
    bn: "এগুলো আপনার রুটের জায়গা। যেখানে থামতে চান না বন্ধ করে দিন — সহকর্মীরা কেবল সেখানেই উঠতে পারবেন যেখানে আপনি থামবেন।",
  },
  allStops: { en: "All", bn: "সব" },
  noStops: { en: "None", bn: "কোনোটিই নয়" },
  stopsChosen: { en: "stops", bn: "টি জায়গা" },
  editRoute: { en: "Edit", bn: "বদলান" },
  whereWillYouJoin: { en: "Where will you get in?", bn: "কোথায় উঠবেন?" },
  whereWillYouLeave: { en: "Where will you get out?", bn: "কোথায় নামবেন?" },
  nearestToYou: { en: "Closest to you", bn: "আপনার সবচেয়ে কাছে" },
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
  disclaimerHeading: { en: "Disclaimer", bn: "দাবিত্যাগ" },

  /**
   * Stated wherever a colleague commits to something: at the door, next to the
   * disclaimer, and in About. It protects the colleague — who should know what
   * they are joining — and the person who built it, who should not be taken to
   * be speaking for the organisation.
   */
  unofficialTitle: { en: "Not an official system", bn: "এটি প্রাতিষ্ঠানিক ব্যবস্থা নয়" },
  unofficial: {
    en: "Ekpothe is a voluntary tool built by a colleague. It is not run by, endorsed by, or connected to your employer, and taking part is entirely your choice.",
    bn: "একপথে একজন সহকর্মীর তৈরি একটি স্বেচ্ছামূলক টুল। এটি আপনার প্রতিষ্ঠান পরিচালিত বা অনুমোদিত নয়, এবং অংশ নেওয়া সম্পূর্ণ আপনার ইচ্ছা।",
  },
  unofficialShort: {
    en: "A colleague's voluntary tool — not an official system.",
    bn: "সহকর্মীর স্বেচ্ছামূলক টুল — প্রাতিষ্ঠানিক ব্যবস্থা নয়।",
  },

  // Registration
  register: { en: "Create an account", bn: "অ্যাকাউন্ট খুলুন" },
  alreadyHave: { en: "I already have an account", bn: "আমার অ্যাকাউন্ট আছে" },
  needAccount: { en: "I need an account", bn: "আমার অ্যাকাউন্ট দরকার" },
  personalEmail: { en: "Personal email", bn: "ব্যক্তিগত ইমেইল" },
  /*
    Signing in says only "Email".

    It used to say "Work email", left over from when a work address was how you
    got in. On a form that now refuses work addresses outright, that label was
    telling people to type the one thing the next screen would reject.
  */
  signInEmail: { en: "Email", bn: "ইমেইল" },
  personalEmailHint: {
    en: "Your own address, not your work one. That's deliberate — it keeps your employer's data out of this entirely.",
    bn: "আপনার নিজের ঠিকানা, অফিসের নয়। এটি ইচ্ছাকৃত — এতে আপনার প্রতিষ্ঠানের তথ্য এর বাইরে থাকে।",
  },
  blockedDomainsHint: {
    en: "Addresses at %s are not accepted.",
    bn: "%s ঠিকানা গ্রহণ করা হয় না।",
  },
  password: { en: "Password", bn: "পাসওয়ার্ড" },
  passwordHint: { en: "At least 8 characters.", bn: "কমপক্ষে ৮টি অক্ষর।" },
  optionalSection: { en: "Optional — helps me recognise you", bn: "ঐচ্ছিক — আপনাকে চিনতে সাহায্য করে" },
  officialName: { en: "Your name at work", bn: "অফিসে আপনার নাম" },
  departmentField: { en: "Department", bn: "বিভাগ" },
  optionalHint: {
    en: "Leave both blank if you'd rather not say. You'll still be approved.",
    bn: "না জানাতে চাইলে খালি রাখুন। তবুও অনুমোদন পাবেন।",
  },

  // Notifications
  notifications: { en: "Notifications", bn: "নোটিফিকেশন" },
  notifyOn: { en: "Notifications are on", bn: "নোটিফিকেশন চালু আছে" },
  notifyOff: { en: "Turn on notifications", bn: "নোটিফিকেশন চালু করুন" },
  notifyWhy: {
    en: "So you hear about a seat request without opening the app. This is the whole point — a driver who never checks is a colleague left waiting.",
    bn: "অ্যাপ না খুলেই সিটের অনুরোধ জানতে। এটাই মূল কথা — চালক না দেখলে সহকর্মী অপেক্ষায় থাকেন।",
  },
  notifyDenied: {
    en: "Your browser has blocked notifications for this site. You can allow them again in your browser settings.",
    bn: "আপনার ব্রাউজার এই সাইটের নোটিফিকেশন বন্ধ করেছে। ব্রাউজার সেটিংস থেকে চালু করতে পারেন।",
  },
  notifyUnsupported: {
    en: "This browser can't show notifications. You'll still get an email.",
    bn: "এই ব্রাউজারে নোটিফিকেশন দেখানো যায় না। তবে ইমেইল পাবেন।",
  },

  // Requests waiting for the driver
  seatRequests: { en: "Seat requests", bn: "সিটের অনুরোধ" },
  accept: { en: "Accept", bn: "গ্রহণ" },
  decline: { en: "Decline", bn: "না" },
  declineQuiet: {
    en: "Declining is silent — they're only told the seat isn't available.",
    bn: "না বললে নীরবে হয় — তাঁকে শুধু জানানো হয় সিট নেই।",
  },
  wantsASeat: { en: "wants a seat", bn: "একটি সিট চান" },

  // Invite-only pilot
  inviteOnlyTitle: { en: "You'll need a code", bn: "আপনার একটি কোড লাগবে" },
  inviteOnlyBody: {
    en: "Ekpothe is invite-only while we try it out. Ask the colleague who told you about it, and they'll send you a code.",
    bn: "পরীক্ষামূলক পর্যায়ে একপথে শুধু আমন্ত্রণে চলে। যিনি আপনাকে জানিয়েছেন তাঁর কাছে কোড চান।",
  },
  whatToCallYou: { en: "What should colleagues call you?", bn: "সহকর্মীরা আপনাকে কী নামে ডাকবেন?" },
  nameHint: {
    en: "However you'd like to appear. A first name is plenty.",
    bn: "যেভাবে দেখাতে চান। শুধু নামের প্রথম অংশই যথেষ্ট।",
  },
  noEmailNeeded: {
    en: "No email address is asked for or stored.",
    bn: "কোনো ইমেইল ঠিকানা চাওয়া বা সংরক্ষণ করা হয় না।",
  },
  waitingToJoin: { en: "Waiting to join", bn: "যোগ দিতে অপেক্ষমাণ" },
  nobodyWaiting: {
    en: "Nobody is waiting. Colleagues who register appear here.",
    bn: "কেউ অপেক্ষায় নেই। যাঁরা নিবন্ধন করবেন তাঁরা এখানে দেখা যাবেন।",
  },
  approving: { en: "Approving…", bn: "অনুমোদন হচ্ছে…" },
  approved: { en: "Approved — they can sign in now", bn: "অনুমোদিত — তাঁরা এখন সাইন ইন করতে পারবেন" },
  registeredAs: { en: "Registered as", bn: "নিবন্ধিত নাম" },
  noOfficialName: {
    en: "No official name given — approve only if you recognise them.",
    bn: "সরকারি নাম দেওয়া হয়নি — চিনতে পারলেই অনুমোদন করুন।",
  },
  approveWarning: {
    en: "Approving lets this person see every published ride and the names on them. Approve only colleagues you recognise.",
    bn: "অনুমোদন করলে এই ব্যক্তি সব প্রকাশিত যাত্রা ও সেখানকার নাম দেখতে পাবেন। শুধু পরিচিত সহকর্মীকেই অনুমোদন করুন।",
  },
  inviteColleague: { en: "Invite a colleague", bn: "সহকর্মীকে আমন্ত্রণ" },
  theirName: { en: "Their name", bn: "তাঁর নাম" },
  generateCode: { en: "Create a code", bn: "কোড তৈরি করুন" },

  // Contribution — what, if anything, the rider gives the driver
  whatDoYouAsk: { en: "What would you like in return?", bn: "বিনিময়ে কী চান?" },
  contributionHint: {
    en: "Entirely your call. Most drivers take the fuel share, but a coffee or nothing at all are perfectly good answers.",
    bn: "পুরোপুরি আপনার সিদ্ধান্ত। বেশিরভাগ চালক জ্বালানির ভাগ নেন, তবে এক কাপ কফি বা কিছুই না — দুটোই ঠিক আছে।",
  },
  modeCostShare: { en: "Share the fuel", bn: "জ্বালানির খরচ ভাগ" },
  modeInKind: { en: "Something small", bn: "ছোট কিছু" },
  modeNothing: { en: "Nothing at all", bn: "কিছুই না" },
  recommended: { en: "Recommended", bn: "প্রস্তাবিত" },
  inKindPlaceholder: { en: "e.g. a coffee", bn: "যেমন এক কাপ কফি" },

  // Contact exchange
  contactLabel: { en: "How can a colleague reach you?", bn: "সহকর্মী কীভাবে যোগাযোগ করবেন?" },
  contactHidden: { en: "Hidden until you accept", bn: "গ্রহণ করার আগ পর্যন্ত লুকানো" },
  contactShown: { en: "Shared with you", bn: "আপনার সঙ্গে শেয়ার করা হয়েছে" },
  callThem: { en: "Call", bn: "ফোন" },

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
  /*
    Bangla has no plural agreement here, so one string covers both. English
    does, and "1 colleagues going your way" was the first thing a colleague
    read on the screen that decides whether they trust the app.
  */
  resultsCount: { en: "colleagues going your way", bn: "জন সহকর্মী আপনার পথে যাচ্ছেন" },
  resultsCountOne: { en: "colleague going your way", bn: "জন সহকর্মী আপনার পথে যাচ্ছেন" },
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

  // Access
  signIn: { en: "Sign in", bn: "সাইন ইন" },
  workEmail: { en: "Work email", bn: "অফিসের ইমেইল" },
  yourName: { en: "Your name", bn: "আপনার নাম" },
  accessCode: { en: "Your code", bn: "আপনার কোড" },
  requestAccess: { en: "Request access", bn: "অ্যাক্সেস চান" },
  haveACode: { en: "I have a code", bn: "আমার কোড আছে" },
  needACode: { en: "I need a code", bn: "আমার কোড দরকার" },
  accessExplainer: {
    en: "Ekpothe is for colleagues only. Ask for access with your work email, and you'll be sent a code once it's approved.",
    bn: "একপথে শুধু সহকর্মীদের জন্য। অফিসের ইমেইল দিয়ে অ্যাক্সেস চান, অনুমোদনের পর কোড পাবেন।",
  },
  pendingApprovals: { en: "Waiting for approval", bn: "অনুমোদনের অপেক্ষায়" },
  approve: { en: "Approve", bn: "অনুমোদন" },
  codeIssued: { en: "Send them this code", bn: "এই কোডটি পাঠান" },
  codeOnce: {
    en: "Shown once. It is not stored and cannot be shown again.",
    bn: "একবারই দেখানো হয়। সংরক্ষণ করা হয় না, আবার দেখা যাবে না।",
  },
  noPending: { en: "Nobody is waiting.", bn: "কেউ অপেক্ষা করছেন না।" },

  // Admin
  admin: { en: "Admin", bn: "অ্যাডমিন" },

  // About
  about: { en: "About", bn: "পরিচিতি" },
  builtBy: { en: "Built for us, by Ruman", bn: "আমাদের জন্য, রুমানের তৈরি" },
  aboutBody: {
    en: "Ekpothe replaces the ride-sharing spreadsheet. Same idea, but it comes to you instead of waiting in a folder — and it works from your phone.",
    bn: "একপথে সেই রাইড শেয়ারিং স্প্রেডশিটের জায়গা নিয়েছে। ভাবনা একই, তবে এটি ফোল্ডারে অপেক্ষা না করে আপনার কাছে আসে — এবং ফোন থেকেই চলে।",
  },
  straplineBn: {
    en: "Going the same way? Share the ride, split the fuel.",
    bn: "একই পথে যাচ্ছেন? একসাথে যান, খরচ ভাগ করুন।",
  },
  exportExcel: { en: "Export to Excel", bn: "এক্সেলে ডাউনলোড" },
  exportHint: {
    en: "Rides, bookings, balances, impact and fuel prices. A snapshot — nothing reads it back.",
    bn: "রাইড, বুকিং, ব্যালেন্স, প্রভাব ও জ্বালানির দাম। এটি কেবল একটি স্ন্যাপশট।",
  },
  fuelRate: { en: "Fuel rate", bn: "জ্বালানির দাম" },
  fuelStale: {
    en: "This rate has not been confirmed for over 35 days. Confirm it is still correct, or enter the current gazetted rate.",
    bn: "৩৫ দিনের বেশি সময় ধরে এই দাম নিশ্চিত করা হয়নি। সঠিক থাকলে নিশ্চিত করুন, নাহলে বর্তমান দাম দিন।",
  },
  confirmRate: { en: "Still correct", bn: "এখনো সঠিক" },
  rateConfirmed: { en: "Confirmed today", bn: "আজ নিশ্চিত করা হয়েছে" },
  dailyCap: { en: "Rides per driver per day", bn: "দৈনিক রাইড সীমা" },
  ledger: { en: "Credit ledger", bn: "ক্রেডিট খাতা" },
  ledgerNotMoney: {
    en: "Credits are not money. They cannot be bought and cannot be cashed out — this is a record of who owes whom, settled outside the app.",
    bn: "ক্রেডিট টাকা নয়। কেনা বা নগদে রূপান্তর করা যায় না — কে কার কাছে ঋণী তার হিসাব মাত্র।",
  },
  incidents: { en: "Incidents", bn: "ঘটনা" },
  noIncidents: { en: "No open incidents.", bn: "কোনো খোলা ঘটনা নেই।" },
  metrics: { en: "This week", bn: "এই সপ্তাহ" },
  ridesPublished: { en: "Rides published", bn: "প্রকাশিত রাইড" },
  completedTrips: { en: "Completed trips", bn: "সম্পন্ন ট্রিপ" },
  zeroResults: { en: "Searches with no match", bn: "ফলাফলহীন সার্চ" },
  carTripsAvoided: { en: "Car trips avoided", bn: "কম হওয়া গাড়ির ট্রিপ" },
  legacyBaseline: { en: "vs 0.185/day legacy baseline", bn: "পুরোনো গড় ০.১৮৫/দিন এর তুলনায়" },

  // Ratings
  rateTrip: { en: "How was the ride?", bn: "যাত্রা কেমন ছিল?" },
  ratingAnonymous: { en: "Shown as an average only. Never attributed.", bn: "শুধু গড় দেখানো হয়। কে দিয়েছে জানানো হয় না।" },
  reportIssue: { en: "Report a problem", bn: "সমস্যা জানান" },
  submit: { en: "Submit", bn: "জমা দিন" },
  thanks: { en: "Thank you.", bn: "ধন্যবাদ।" },

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
