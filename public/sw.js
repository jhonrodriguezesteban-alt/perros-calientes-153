// Service worker de Bendito: muestra las notificaciones (ventas, cierres,
// solicitudes) y abre la app en el módulo que corresponde al tocarlas.
self.addEventListener("push", (event) => {
  let aviso = { titulo: "Bendito Perro Caliente", cuerpo: "", url: "/panel", tipo: "" };
  try {
    aviso = { ...aviso, ...event.data.json() };
  } catch {
    if (event.data) aviso.cuerpo = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.cuerpo,
      icon: "/marca/icono-192.png",
      badge: "/marca/icono-192.png",
      tag: aviso.tipo === "venta" ? undefined : aviso.tipo || undefined,
      data: { url: aviso.url || "/panel" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/panel", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ("focus" in v) {
          v.navigate(url);
          return v.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
