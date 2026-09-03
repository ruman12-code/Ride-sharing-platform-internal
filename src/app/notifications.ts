import type { Booking } from "../domain/entities/booking.js";
import type { Ride } from "../domain/entities/ride.js";
import type { User } from "../domain/entities/user.js";
import type { IsoDateTime } from "../domain/types.js";
import type { Notification } from "../ports/index.js";

/**
 * Notification composition.
 *
 * The previous tool did not fail for lack of features. It failed because it sat
 * in a SharePoint folder waiting to be opened, and nobody opened it. So the
 * rule here is absolute: **every core loop must be completable from the
 * notification itself.** A notification whose only action is "open the app" has
 * not solved anything.
 *
 * Every notification carries:
 *   - a stable `id`, so re-sending is a no-op rather than a second buzz
 *   - an `expiresAt`, so a stale prompt cannot be actioned after the fact
 *   - actions that complete the loop, not links that defer it
 */

const HOUR = 3_600_000;
const MINUTE = 60_000;

const DHAKA_OFFSET_MS = 6 * HOUR;

/**
 * Move an instant by a duration, and render it back in Dhaka time.
 *
 * The offset is preserved deliberately. Everything in this domain is ISO 8601
 * with an explicit +06:00, and a notification timestamp that silently came back
 * as +00:00 would be the same instant written in a form nobody here reads
 * correctly -- which is how the legacy date column became ambiguous in the
 * first place.
 */
const shift = (iso: IsoDateTime, ms: number): IsoDateTime =>
  `${new Date(Date.parse(iso) + ms + DHAKA_OFFSET_MS).toISOString().slice(0, 19)}+06:00`;

/** Local `HH:MM` from an offset-carrying instant, without re-zoning it. */
const hhmm = (iso: IsoDateTime): string => /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";

/**
 * T−14h: "Driving tomorrow? [Yes] [Not tomorrow] [Change]".
 *
 * Publishes a drafted ride without the driver opening anything. This is the
 * single most important notification in the product: it is what turns a
 * standing commute into a published seat with one tap.
 */
export const driverPublishPrompt = (
  ride: Ride,
  route: string,
): Notification => ({
  id: `publish-prompt:${ride.id}`,
  recipientId: ride.driverId,
  kind: "driver_publish_prompt",
  title: `Driving ${route} tomorrow ${hhmm(ride.departureAt)}?`,
  body: `Tap once and your ${ride.seatsTotal} ${
    ride.seatsTotal === 1 ? "seat" : "seats"
  } go live. No need to open anything.`,
  actions: [
    { id: `publish:${ride.id}`, label: `Yes, ${ride.seatsTotal} seats` },
    { id: `skip:${ride.id}`, label: "Not tomorrow" },
    { id: `edit:${ride.id}`, label: "Change" },
  ],
  expiresAt: ride.departureAt,
});

/** A rider's saved commute need just found supply. */
export const riderMatchFound = (
  ride: Ride,
  driver: User,
  riderId: string,
  route: string,
): Notification => ({
  id: `match:${ride.id}:${riderId}`,
  recipientId: riderId,
  kind: "rider_match_found",
  title: `${driver.displayName} is driving your route`,
  body: `${route}, tomorrow ${hhmm(ride.departureAt)}, Tk ${ride.costSharePerSeat}.`,
  actions: [
    { id: `request:${ride.id}`, label: "Request seat" },
    { id: `dismiss:${ride.id}`, label: "Not this time" },
  ],
  expiresAt: ride.departureAt,
});

/**
 * A seat request, answerable from the notification.
 *
 * Declining is silent and is never attributed: the rider is told the seat is
 * not available, not who declined them or why. In an office of under 150 people
 * an attributed decline is a lasting social cost, and the fear of it would stop
 * people asking at all.
 */
export const driverBookingRequest = (
  booking: Booking,
  ride: Ride,
  rider: User,
  boardZone: string,
): Notification => ({
  id: `booking-request:${booking.id}`,
  recipientId: ride.driverId,
  kind: "driver_booking_request",
  title: `${rider.displayName} wants a seat`,
  body: `Boarding at ${boardZone}, ${hhmm(ride.departureAt)}.`,
  actions: [
    { id: `accept:${booking.id}`, label: "Accept" },
    { id: `decline:${booking.id}`, label: "Decline" },
  ],
  expiresAt: ride.departureAt,
});

/**
 * T−45min, both sides.
 *
 * The main defence against no-shows, which are the highest-frequency failure
 * mode in commute carpooling: a driver waiting at a pickup point for somebody
 * who is not coming will not offer a seat again.
 */
export const reconfirm = (
  ride: Ride,
  recipientId: string,
  counterpartName: string,
): Notification => ({
  id: `reconfirm:${ride.id}:${recipientId}`,
  recipientId,
  kind: "reconfirm",
  title: `Still on for ${hhmm(ride.departureAt)}?`,
  body: `With ${counterpartName}. A quick yes saves them waiting.`,
  actions: [
    { id: `confirm:${ride.id}`, label: "Yes, on my way" },
    { id: `cancel:${ride.id}`, label: "Can't make it" },
  ],
  expiresAt: shift(ride.departureAt, 30 * MINUTE),
});

/** Post-trip rating, inline. Five taps, no app. */
export const postTripRating = (booking: Booking, rateeName: string): Notification => ({
  id: `rate:${booking.id}`,
  recipientId: booking.riderId,
  kind: "post_trip_rating",
  title: `How was the ride with ${rateeName}?`,
  body: "Tap a star. It stays anonymous.",
  actions: [1, 2, 3, 4, 5].map((n) => ({
    id: `rate:${booking.id}:${n}`,
    label: "★".repeat(n),
  })),
  expiresAt: shift(new Date().toISOString(), 72 * HOUR),
});

export interface DigestFacts {
  readonly savedTaka: number;
  readonly tripsTaken: number;
  readonly driversOnYourCorridor: number;
  readonly unfilledSeats: number;
}

/** Thursday digest: what you saved, who is driving next week, unfilled seats. */
export const weeklyDigest = (
  recipientId: string,
  facts: DigestFacts,
  sentOn: IsoDateTime,
): Notification => ({
  id: `digest:${recipientId}:${sentOn.slice(0, 10)}`,
  recipientId,
  kind: "weekly_digest",
  title: `You shared ${facts.tripsTaken} ${facts.tripsTaken === 1 ? "trip" : "trips"} this week`,
  body:
    `Tk ${facts.savedTaka} of fuel shared. ` +
    `${facts.driversOnYourCorridor} colleagues are driving your corridor next week` +
    (facts.unfilledSeats > 0 ? `, with ${facts.unfilledSeats} seats still empty.` : "."),
  actions: [{ id: "view-week", label: "See next week" }],
  expiresAt: shift(sentOn, 7 * 24 * HOUR),
});

/** When the T−14h publish prompt should be delivered for a given ride. */
export const publishPromptAt = (ride: Ride): IsoDateTime => shift(ride.departureAt, -14 * HOUR);

/** When the reconfirm prompt should be delivered. */
export const reconfirmAt = (ride: Ride): IsoDateTime => shift(ride.departureAt, -45 * MINUTE);
