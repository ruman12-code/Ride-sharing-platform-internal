import type { Booking } from "../../domain/entities/booking.js";
import type { Ride } from "../../domain/entities/ride.js";
import type { User } from "../../domain/entities/user.js";
import type { DomainError, Id, IsoDate, IsoDateTime, Result } from "../../domain/types.js";
import { domainError, err, ok } from "../../domain/types.js";
import type {
  BookingStore,
  Clock,
  Notification,
  Notifier,
  RideFilter,
  RideStore,
  UserDirectory,
} from "../../ports/index.js";

/**
 * In-memory adapters for development and test.
 *
 * `saveWithVersion` implements the same compare-and-swap contract the
 * SharePoint adapter will implement with an ETag. Keeping the semantics
 * identical here is what lets the concurrency test be meaningful: if the test
 * passes against this store it is exercising the real control, not a mock that
 * agrees with itself.
 */

/** Await this to yield the event loop, interleaving concurrent operations. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export class InMemoryRideStore implements RideStore {
  private readonly rows = new Map<Id, Ride>();
  /** When true, insert a yield inside the CAS to widen the race window. */
  public interleave = false;

  constructor(seed: readonly Ride[] = []) {
    for (const r of seed) this.rows.set(r.id, r);
  }

  async get(id: Id): Promise<Ride | undefined> {
    // Snapshot first, then yield. Two concurrent callers therefore both observe
    // the pre-write state and genuinely race, which is what makes the
    // concurrency tests exercise the CAS rather than accidentally serialise.
    const row = this.rows.get(id);
    if (this.interleave) await tick();
    return row;
  }

  async list(filter?: RideFilter): Promise<readonly Ride[]> {
    let out = [...this.rows.values()];
    if (filter?.driverId) out = out.filter((r) => r.driverId === filter.driverId);
    if (filter?.status) out = out.filter((r) => r.status === filter.status);
    if (filter?.fromDate) out = out.filter((r) => r.departureAt >= filter.fromDate!);
    if (filter?.toDate) out = out.filter((r) => r.departureAt <= `${filter.toDate!}T23:59:59+06:00`);
    return out.sort((a, b) => (a.departureAt < b.departureAt ? -1 : 1));
  }

  async create(ride: Ride): Promise<Ride> {
    this.rows.set(ride.id, ride);
    return ride;
  }

  async saveWithVersion(
    ride: Ride,
    expectedRowVersion: number,
  ): Promise<Result<Ride, DomainError>> {
    // Read, compare and write with NO await in between.
    //
    // This matters more than it looks. An earlier draft yielded between the
    // read and the comparison, which let every concurrent caller observe the
    // same version and all pass the check -- reintroducing the exact
    // read-modify-write race the CAS exists to close. A compare-and-swap that
    // is not atomic is not a compare-and-swap. Callers interleave at `get`
    // instead, which is where the real race lives.
    const current = this.rows.get(ride.id);
    if (!current) return err(domainError("NOT_FOUND", "Ride not found."));
    if (current.rowVersion !== expectedRowVersion) {
      return err(
        domainError("CONCURRENCY_CONFLICT", "Someone else just changed this ride.", {
          expected: expectedRowVersion,
          actual: current.rowVersion,
        }),
      );
    }
    this.rows.set(ride.id, ride);
    return ok(ride);
  }
}

/**
 * A store that reproduces the legacy defect, for one test only.
 *
 * It ignores the expected version and always writes — the `lastRow + 1`
 * behaviour in TypeScript. The concurrency test runs against both stores and
 * asserts that this one loses a seat while the real one does not. Without this,
 * the test could pass for the wrong reason and nobody would know.
 */
export class LastWriteWinsRideStore extends InMemoryRideStore {
  override async saveWithVersion(ride: Ride): Promise<Result<Ride, DomainError>> {
    await this.create(ride);
    return ok(ride);
  }
}

export class InMemoryBookingStore implements BookingStore {
  private readonly rows = new Map<Id, Booking>();

  async get(id: Id): Promise<Booking | undefined> {
    return this.rows.get(id);
  }

  async listForRide(rideId: Id): Promise<readonly Booking[]> {
    return [...this.rows.values()].filter((b) => b.rideId === rideId);
  }

  async listForRider(riderId: Id): Promise<readonly Booking[]> {
    return [...this.rows.values()].filter((b) => b.riderId === riderId);
  }

  async create(booking: Booking): Promise<Booking> {
    this.rows.set(booking.id, booking);
    return booking;
  }

  async saveWithVersion(
    booking: Booking,
    expectedRowVersion: number,
  ): Promise<Result<Booking, DomainError>> {
    const current = this.rows.get(booking.id);
    if (!current) return err(domainError("NOT_FOUND", "Booking not found."));
    if (current.rowVersion !== expectedRowVersion) {
      return err(domainError("CONCURRENCY_CONFLICT", "That booking just changed."));
    }
    this.rows.set(booking.id, booking);
    return ok(booking);
  }
}

export class InMemoryUserDirectory implements UserDirectory {
  constructor(private readonly users: readonly User[]) {}
  async get(id: Id): Promise<User | undefined> {
    return this.users.find((u) => u.id === id);
  }
  async list(): Promise<readonly User[]> {
    return this.users;
  }
}

/** A clock frozen at a fixed instant, so tests never depend on wall time. */
export class FixedClock implements Clock {
  constructor(private instant: IsoDateTime) {}
  now(): IsoDateTime {
    return this.instant;
  }
  today(): IsoDate {
    return this.instant.slice(0, 10) as IsoDate;
  }
  set(instant: IsoDateTime): void {
    this.instant = instant;
  }
}

/** Captures notifications so tests can assert on what a colleague would receive. */
export class RecordingNotifier implements Notifier {
  public readonly sent: Notification[] = [];
  async send(n: Notification): Promise<void> {
    // Idempotent by id: re-sending the same notification is a no-op, matching
    // the contract the Teams and Outlook adapters must honour.
    if (this.sent.some((s) => s.id === n.id)) return;
    this.sent.push(n);
  }
}
