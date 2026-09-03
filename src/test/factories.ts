import type { Ride, Vehicle } from "../domain/entities/ride.js";
import type { User } from "../domain/entities/user.js";

export const vehicle = (over: Partial<Vehicle> = {}): Vehicle => ({
  type: "car",
  model: "Toyota Axio",
  colour: "Silver",
  plateLast4: "4417",
  ratedKmPerLitre: 12,
  fuelType: "octane",
  ...over,
});

export const ride = (over: Partial<Ride> = {}): Ride => ({
  id: "ride-1",
  driverId: "u-driver",
  zoneSequence: ["uttara", "khilkhet", "banani", "gulshan-2"],
  departureAt: "2026-09-04T07:45:00+06:00",
  seatsTotal: 1,
  seatsAvailable: 1,
  costSharePerSeat: 70,
  fuelPriceId: "fp-octane-2026-06",
  fuelRatePerKm: 16.917,
  distanceKm: 14,
  pickupPoints: [{ zoneId: "khilkhet", label: "Khilkhet flyover foot", walkingMinutes: 4 }],
  vehicle: vehicle(),
  preferences: { womenOnly: false, ac: true, luggage: false, quiet: false },
  status: "published",
  rowVersion: 1,
  ...over,
});

export const user = (over: Partial<User> = {}): User => ({
  id: "u-1",
  displayName: "Nusrat Jahan",
  email: "nusrat@example.org",
  department: "Programmes",
  officeLocation: "Gulshan-2",
  role: "member",
  reliabilityScore: 100,
  creditBalance: 0,
  isSuspended: false,
  ...over,
});
