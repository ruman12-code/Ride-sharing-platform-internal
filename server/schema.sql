-- Ekpothe — standalone pilot schema.
--
-- SQLite, because a pilot for under 150 people needs a file, not a cluster.
-- The same port interfaces the SharePoint adapter will implement sit on top of
-- this, so moving to SharePoint later replaces one directory and touches no
-- business logic.
--
-- rowVersion columns carry the optimistic concurrency the legacy workbook
-- lacked. Every seat mutation is a conditional UPDATE that checks the version,
-- so two colleagues booking the last seat cannot both succeed.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  displayName      TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  department       TEXT NOT NULL DEFAULT '',
  officeLocation   TEXT NOT NULL DEFAULT '',
  -- Access state. Nobody reaches the app on 'pending': a colleague asks, an
  -- administrator who recognises the name approves, and only then is a code
  -- issued. A stranger who finds the URL gets no further than the request form.
  status           TEXT NOT NULL DEFAULT 'pending',
  approvedBy       TEXT,
  approvedAt       TEXT,
  -- How a colleague is reached once a driver has accepted them. Never listed,
  -- never searchable, never exported. See domain/policy/contact-exchange.ts.
  contactKind      TEXT,
  contactValue     TEXT,
  phone            TEXT,
  photoUrl         TEXT,
  role             TEXT NOT NULL DEFAULT 'member',
  reliabilityScore INTEGER NOT NULL DEFAULT 100,
  isSuspended      INTEGER NOT NULL DEFAULT 0,
  createdAt        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rides (
  id               TEXT PRIMARY KEY,
  profileId        TEXT,
  driverId         TEXT NOT NULL REFERENCES users(id),
  zoneSequence     TEXT NOT NULL,          -- JSON array of zone ids, ordered
  departureAt      TEXT NOT NULL,          -- ISO 8601 with explicit +06:00
  seatsTotal       INTEGER NOT NULL,
  seatsAvailable   INTEGER NOT NULL,       -- server-computed, never client-set
  costSharePerSeat INTEGER NOT NULL,
  fuelPriceId      TEXT NOT NULL,
  fuelRatePerKm    REAL NOT NULL,
  distanceKm       REAL NOT NULL,
  pickupPoints     TEXT NOT NULL DEFAULT '[]',
  vehicle          TEXT NOT NULL,
  preferences      TEXT NOT NULL,
  notes            TEXT,
  status           TEXT NOT NULL,
  rowVersion       INTEGER NOT NULL DEFAULT 1,
  provenance       TEXT,
  createdAt        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rides_departure ON rides(departureAt);
CREATE INDEX IF NOT EXISTS idx_rides_driver    ON rides(driverId);
CREATE INDEX IF NOT EXISTS idx_rides_status    ON rides(status);

CREATE TABLE IF NOT EXISTS bookings (
  id                 TEXT PRIMARY KEY,
  rideId             TEXT NOT NULL REFERENCES rides(id),
  riderId            TEXT NOT NULL REFERENCES users(id),
  boardZoneId        TEXT NOT NULL,
  alightZoneId       TEXT NOT NULL,
  seats              INTEGER NOT NULL,
  status             TEXT NOT NULL,
  amount             INTEGER NOT NULL,
  settlementMode     TEXT NOT NULL,
  counterfactualMode TEXT NOT NULL,
  idempotencyKey     TEXT NOT NULL,
  rowVersion         INTEGER NOT NULL DEFAULT 1,
  createdAt          TEXT NOT NULL,
  -- Makes a double-tap on a slow connection a no-op at the storage layer, not
  -- merely in application code.
  UNIQUE (riderId, idempotencyKey)
);
CREATE INDEX IF NOT EXISTS idx_bookings_ride  ON bookings(rideId);
CREATE INDEX IF NOT EXISTS idx_bookings_rider ON bookings(riderId);

CREATE TABLE IF NOT EXISTS commute_profiles (
  id                   TEXT PRIMARY KEY,
  driverId             TEXT NOT NULL REFERENCES users(id),
  originZoneId         TEXT NOT NULL,
  destinationZoneId    TEXT NOT NULL,
  viaZoneIds           TEXT NOT NULL DEFAULT '[]',
  departureWindowStart TEXT NOT NULL,
  departureWindowEnd   TEXT NOT NULL,
  daysOfWeek           TEXT NOT NULL,
  seatsOffered         INTEGER NOT NULL,
  vehicle              TEXT NOT NULL,
  isActive             INTEGER NOT NULL DEFAULT 1,
  validUntil           TEXT NOT NULL,
  autoPublish          INTEGER NOT NULL DEFAULT 0,
  createdAt            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger (
  id           TEXT PRIMARY KEY,
  bookingId    TEXT NOT NULL REFERENCES bookings(id),
  fromUserId   TEXT NOT NULL REFERENCES users(id),
  toUserId     TEXT NOT NULL REFERENCES users(id),
  amount       INTEGER NOT NULL,
  createdAt    TEXT NOT NULL,
  reversedBy   TEXT,
  settledBatch TEXT,
  -- One entry per booking. Completing a trip twice must not double the credit.
  UNIQUE (bookingId)
);

CREATE TABLE IF NOT EXISTS feedback (
  bookingId TEXT NOT NULL REFERENCES bookings(id),
  raterId   TEXT NOT NULL REFERENCES users(id),
  rateeId   TEXT NOT NULL REFERENCES users(id),
  rating    INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  tags      TEXT NOT NULL DEFAULT '[]',
  comment   TEXT,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (bookingId, raterId)
);

CREATE TABLE IF NOT EXISTS incidents (
  id          TEXT PRIMARY KEY,
  bookingId   TEXT NOT NULL,
  reporterId  TEXT NOT NULL REFERENCES users(id),
  category    TEXT NOT NULL,
  severity    TEXT NOT NULL,
  description TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  assignedTo  TEXT,
  resolvedAt  TEXT,
  createdAt   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fuel_prices (
  id            TEXT PRIMARY KEY,
  fuelType      TEXT NOT NULL,
  pricePerLitre INTEGER NOT NULL,
  effectiveFrom TEXT NOT NULL,
  source        TEXT NOT NULL,
  confirmedAt   TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id        TEXT PRIMARY KEY,
  actorId   TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entityId  TEXT NOT NULL,
  action    TEXT NOT NULL,
  before    TEXT,
  after     TEXT,
  at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entityId);

-- Zero-result searches are the demand map: intent that never found supply,
-- which is exactly the quantity the legacy file could not tell us about.
CREATE TABLE IF NOT EXISTS zero_result_searches (
  id                TEXT PRIMARY KEY,
  searcherId        TEXT NOT NULL,
  originZoneId      TEXT NOT NULL,
  destinationZoneId TEXT NOT NULL,
  targetTime        TEXT NOT NULL,
  windowMinutes     INTEGER NOT NULL,
  seats             INTEGER NOT NULL,
  at                TEXT NOT NULL,
  convertedToStandingDemand INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS standing_demand (
  id                TEXT PRIMARY KEY,
  riderId           TEXT NOT NULL REFERENCES users(id),
  originZoneId      TEXT NOT NULL,
  destinationZoneId TEXT NOT NULL,
  targetTime        TEXT NOT NULL,
  windowMinutes     INTEGER NOT NULL,
  createdAt         TEXT NOT NULL,
  isActive          INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS consents (
  userId        TEXT NOT NULL REFERENCES users(id),
  policyVersion TEXT NOT NULL,
  grantedAt     TEXT NOT NULL,
  scopes        TEXT NOT NULL DEFAULT '[]',
  withdrawnAt   TEXT,
  PRIMARY KEY (userId, policyVersion)
);

-- Single-use invite codes.
--
-- Issued by an administrator to one named colleague after approving them, and
-- consumed on first use. This is what binds a session to a person: a shared
-- passphrase proves somebody knows a secret, whereas a code issued to one email
-- and usable once proves it is that colleague.
--
-- Stored as a scrypt hash. A copy of the database therefore does not hand
-- anybody a working code.
CREATE TABLE IF NOT EXISTS invite_codes (
  id        TEXT PRIMARY KEY,
  userId    TEXT NOT NULL REFERENCES users(id),
  codeHash  TEXT NOT NULL,
  salt      TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  usedAt    TEXT
);
CREATE INDEX IF NOT EXISTS idx_invite_user ON invite_codes(userId);

-- Rate limiting for the public request form, so a stranger who finds the URL
-- cannot fill the pending queue with noise.
CREATE TABLE IF NOT EXISTS request_attempts (
  id        TEXT PRIMARY KEY,
  ipHash    TEXT NOT NULL,
  at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_at ON request_attempts(at);

-- Every release of a colleague's contact details, so "who has my number?" has
-- an answer rather than an assumption.
CREATE TABLE IF NOT EXISTS contact_reveals (
  id        TEXT PRIMARY KEY,
  bookingId TEXT NOT NULL,
  viewerId  TEXT NOT NULL,
  subjectId TEXT NOT NULL,
  at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token     TEXT PRIMARY KEY,
  userId    TEXT NOT NULL REFERENCES users(id),
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL
);
