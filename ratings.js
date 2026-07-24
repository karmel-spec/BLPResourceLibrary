// ============================================================================
// Ratings — 1-5 stars on items, and contributor averages derived from them.
// Community trust signal: because nobody vets quality centrally, ratings tell
// technicians which files and makers to prioritize. Anyone signed-in can rate
// (one rating per item per person, changeable). Exposes window.Ratings:
//   load()          -> fetch all ratings once (cached)
//   avg(id)/count(id)/mine(id)
//   rate(id,stars)  -> upsert my rating
//   refreshChips()  -> fill every [data-rate-id] chip on the page
//   forContributor(ids) -> {avg,count} across a contributor's item ids
// ============================================================================
(function () {
  let byItem = {};   // id -> { sum, count }
  let mine = {};     // id -> my stars
  let loaded = null;

  function sb() { return window.__supabase || null; }
  async function waitClient(ms = 8000) {
    const t = Date.now();
    while (!sb()) {
      if (typeof SUPABASE_READY === "undefined" || !SUPABASE_READY || Date.now() - t > ms) return null;
      await new Promise((r) => setTimeout(r, 100));
    }
    return sb();
  }

  function load() {
    if (loaded) return loaded;
    loaded = (async () => {
      const client = await waitClient();
      if (!client) return;
      try {
        const { data } = await client.from("ratings").select("item_ref, user_id, stars");
        byItem = {}; mine = {};
        const me = window.Auth && window.Auth.user && window.Auth.user();
        (data || []).forEach((r) => {
          const b = byItem[r.item_ref] || (byItem[r.item_ref] = { sum: 0, count: 0 });
          b.sum += r.stars; b.count++;
          if (me && r.user_id === me.id) mine[r.item_ref] = r.stars;
        });
      } catch (e) { /* table may not exist yet — chips just stay empty */ }
    })();
    return loaded;
  }

  function avg(id) { const b = byItem[id]; return b ? b.sum / b.count : 0; }
  function count(id) { const b = byItem[id]; return b ? b.count : 0; }
  function myStars(id) { return mine[id] || 0; }

  async function rate(id, stars) {
    const me = window.Auth && window.Auth.user && window.Auth.user();
    const client = sb();
    if (!me || !client) return false;
    const prev = mine[id] || 0;
    const { error } = await client.from("ratings")
      .upsert({ item_ref: id, user_id: me.id, stars }, { onConflict: "item_ref,user_id" });
    if (error) return false;
    const b = byItem[id] || (byItem[id] = { sum: 0, count: 0 });
    if (prev) { b.sum += stars - prev; } else { b.sum += stars; b.count++; }
    mine[id] = stars;
    if (window.Activity) window.Activity.log("rating", `${id}: ${stars}★`);
    refreshChips();
    return true;
  }

  function starsHtml(a) {
    const full = Math.round(a);
    return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
  }

  function refreshChips() {
    document.querySelectorAll("[data-rate-id]").forEach((el) => {
      const id = el.dataset.rateId;
      const n = count(id);
      if (!n) { el.textContent = ""; el.title = "Not rated yet"; return; }
      el.innerHTML = `<span class="stars">${starsHtml(avg(id))}</span> ${avg(id).toFixed(1)} (${n})`;
      el.title = `${avg(id).toFixed(1)} out of 5 from ${n} rating${n === 1 ? "" : "s"}`;
    });
  }

  function forContributor(ids) {
    let sum = 0, n = 0;
    ids.forEach((id) => { const b = byItem[id]; if (b) { sum += b.sum; n += b.count; } });
    return { avg: n ? sum / n : 0, count: n };
  }

  window.Ratings = { load, avg, count, mine: myStars, rate, refreshChips, forContributor, starsHtml };
  load().then(refreshChips);
})();
