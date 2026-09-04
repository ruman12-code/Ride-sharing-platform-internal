/**
 * Turning on notifications, from the browser side.
 *
 * The permission prompt is asked for **only when a colleague taps the button**,
 * never on load. A prompt that appears before somebody knows what the app is
 * gets dismissed, and a dismissed prompt is close to permanent — the browser
 * will not ask again, and the colleague then never hears about a seat request.
 */

export type PushState = "unsupported" | "denied" | "off" | "on";

/**
 * VAPID keys travel as URL-safe base64; the Push API wants raw bytes backed by
 * a plain ArrayBuffer, so the buffer is allocated explicitly rather than left
 * to `Uint8Array.from`.
 */
const urlBase64ToUint8Array = (base64: string): Uint8Array<ArrayBuffer> => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
};

export const pushSupported = (): boolean =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const pushState = async (): Promise<PushState> => {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
};

/**
 * Register, ask, subscribe, and tell the server. Returns the resulting state.
 */
export const enablePush = async (vapidPublicKey: string): Promise<PushState> => {
  if (!pushSupported()) return "unsupported";

  const reg = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      // Required by every browser: a push that shows nothing is not allowed.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return res.ok ? "on" : "off";
};

export const disablePush = async (): Promise<PushState> => {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  }
  return "off";
};
