// ============================================================================
// Activity log — records site events to the `activity_log` table.
// Only admins (Brigham + Karmel + the two gmails) can READ it (RLS); anyone
// can write (so signed-out downloads/signups are captured). Every call is
// fire-and-forget — logging must never block or break a user action.
// Exposes window.Activity.log(type, detail).
// ============================================================================
(function () {
  function sb() { return window.__supabase || null; }

  window.Activity = {
    log(type, detail) {
      const client = sb();
      if (!client) return;
      const u = (window.Auth && window.Auth.user && window.Auth.user()) || null;
      try {
        client.from("activity_log").insert({
          type,
          detail: detail ? String(detail).slice(0, 300) : null,
          actor_email: u ? u.email : null,
          actor_name: u ? u.name : null,
          page: location.pathname,
        }).then(() => {}, () => {});
      } catch (e) { /* never throw from logging */ }
    },
  };

  // Downloads / watches happen on any catalog page — capture them centrally.
  document.addEventListener("click", (e) => {
    const dl = e.target.closest(".dl a.dl-file");
    if (dl) {
      const card = dl.closest(".pc");
      const title = card ? (card.querySelector("h3")?.textContent || "") : "";
      const kind = (dl.textContent || "").replace(/[^A-Z0-9]/g, "") || "FILE";
      window.Activity.log("download", `${kind} · ${title}`.trim());
      return;
    }
    const watch = e.target.closest(".dl a.r");
    if (watch && /watch/i.test(watch.textContent)) {
      const card = watch.closest(".pc");
      window.Activity.log("watch", card ? (card.querySelector("h3")?.textContent || "") : "");
    }
  });
})();
