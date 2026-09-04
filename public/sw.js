self.addEventListener("push", (event) => {
  let payload = { title: "Pulso Público", body: "Há uma atualização legislativa.", url: "/alertas" };
  try { payload = { ...payload, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    data: { url: payload.url },
    tag: payload.url,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = new URL(event.notification.data?.url || "/alertas", self.location.origin);
  const url = requestedUrl.origin === self.location.origin
    ? requestedUrl.toString()
    : new URL("/alertas", self.location.origin).toString();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => client.url === url);
    return existing ? existing.focus() : clients.openWindow(url);
  }));
});
