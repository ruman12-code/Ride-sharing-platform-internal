import type { Booking, CounterfactualMode, SettlementMode } from "../domain/entities/booking.js";
import type { Ride } from "../domain/entities/ride.js";

/**
 * The browser's view of the pilot server.
 *
 * Every call reports whether a server was there at all, so the same build can
 * run two ways: against the pilot server, where colleagues genuinely see each
 * other's rides, and as a standalone demo with seeded data and no backend.
 *
 * `undefined` means "no server" and is not an error — it is how the demo build
 * knows to fall back. A failed *request* to a server that does exist is an
 * error, and is surfaced.
 */

export interface ApiResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: string;
  /** True when there is no pilot server behind this build. */
  readonly offline?: boolean;
}

const request = async <T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> => {
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (res.status === 404) return { ok: false, offline: true };
    if (res.status === 204) return { ok: true };
    const body = (await res.json()) as T & { error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? "Something went wrong." };
    return { ok: true, value: body };
  } catch {
    // A network failure against a build that has no server is simply the demo
    // build; against a real one the caller retries or shows the cached view.
    return { ok: false, offline: true };
  }
};

export const api = {
  async rides(): Promise<ApiResult<{ rides: Ride[] }>> {
    return request("/api/rides");
  },

  async myBookings(): Promise<ApiResult<{ bookings: Booking[] }>> {
    return request("/api/bookings");
  },

  async publish(ride: Omit<Ride, "id" | "rowVersion" | "seatsAvailable" | "driverId" | "status">): Promise<ApiResult<Ride>> {
    return request("/api/rides", { method: "POST", body: JSON.stringify(ride) });
  },

  async book(input: {
    rideId: string; boardZoneId: string; alightZoneId: string; seats: number;
    counterfactualMode: CounterfactualMode; settlementMode: SettlementMode;
    idempotencyKey: string;
  }): Promise<ApiResult<Booking>> {
    return request("/api/bookings", { method: "POST", body: JSON.stringify(input) });
  },

  async complete(bookingId: string): Promise<ApiResult<{ ok: boolean }>> {
    return request("/api/complete", { method: "POST", body: JSON.stringify({ bookingId }) });
  },

  async zeroResult(q: {
    originZoneId: string; destinationZoneId: string; targetTime: string;
    windowMinutes: number; seats: number; alert: boolean;
  }): Promise<ApiResult<void>> {
    return request("/api/zero-result", { method: "POST", body: JSON.stringify(q) });
  },

  async people(): Promise<ApiResult<{ people: { id: string; displayName: string; department: string; reliabilityScore: number }[] }>> {
    return request("/api/people");
  },

  async me(): Promise<ApiResult<{ userId: string; displayName: string; role: string }>> {
    return request("/api/me");
  },
};
