/*
 * Service worker — the part that lets a notification arrive when Ekpothe is
 * closed.
 *
 * Deliberately minimal. It does not cache the app, intercept requests, or do
 * anything else a service worker can do, because every one of those is a way
 * for a colleague to end up looking at a stale version of a page that is
 * telling them about a seat. Its only job is to show a push and to open the
 * app when tapped.
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = { title: "Ekpothe", body: "", path: "/" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Grouped by path so a second message about the same thing replaces the
      // first rather than stacking up on the lock screen.
      tag: payload.path,
      renotify: true,
      data: { path: payload.path },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.path || "/";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus a tab that is already open rather than opening a second one.
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(path);
          return;
        }
      }
      await self.clients.openWindow(path);
    })(),
  );
});
