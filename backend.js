// ============================================================================
// Community data layer — contributors & approved submissions from Supabase.
// Exposes window.Community:
//   load()                 -> fetches contributors + approved submissions once
//   contributors           -> { slug: profileObject } merged into CONTRIBUTORS
//   resources              -> submissions mapped to catalog-resource objects
//   myProfile(uid)         -> contributor row for a user id (or null)
// Static-site friendly: if Supabase isn't ready, everything resolves empty.
// ============================================================================
(function () {
  const VALID_CATS = ["parts", "fixtures", "player", "cabinet", "research", "video"];

  function client() {
    return window.__supabase || null;
  }

  // auth.js creates window.__supabase after an async CDN import, so at
  // page-parse time it usually doesn't exist yet. Wait for it (bounded).
  async function waitForClient(ms = 8000) {
    const start = Date.now();
    while (!client()) {
      if (typeof SUPABASE_READY === "undefined" || !SUPABASE_READY || Date.now() - start > ms) return null;
      await new Promise((r) => setTimeout(r, 100));
    }
    return client();
  }

  function profileFromRow(row) {
    return {
      id: row.id,
      name: row.name,
      credential: row.credential || "",
      location: row.location || "",
      since: "",
      photo: row.photo_url || "",
      bio: row.bio || "",
      website: row.website || "",
      links: Array.isArray(row.links) ? row.links : [],
      community: true,
    };
  }

  function resourceFromRow(row, slugById) {
    const cat = VALID_CATS.includes(row.category) ? row.category : "parts";
    const files = row.files && typeof row.files === "object" ? row.files : {};
    const r = {
      id: "PTL-C" + row.id,
      cat,
      title: row.title,
      maker: row.maker || "Community Contribution",
      desc: row.description || "",
      formats: Object.keys(files).map((k) => k.toUpperCase()),
      by: slugById[row.contributor_id] || null,
      dateAdded: (row.created_at || "").slice(0, 10),
      community: true,
    };
    if (Object.keys(files).length) r.files = files;
    if (row.thumb_url) r.thumb = row.thumb_url;
    if (row.youtube) { r.youtube = row.youtube; r.sub = r.sub || "community"; }
    return r;
  }

  let loaded = null;

  window.Community = {
    contributors: {},
    resources: [],

    load() {
      if (loaded) return loaded;
      loaded = (async () => {
        const sb = await waitForClient();
        if (!sb) return window.Community;
        try {
          const [{ data: contribs }, { data: subs }] = await Promise.all([
            sb.from("contributors").select("*"),
            sb.from("submissions").select("*").eq("status", "approved")
              .order("created_at", { ascending: false }),
          ]);
          const slugById = {};
          (contribs || []).forEach((c) => {
            slugById[c.id] = c.slug;
            window.Community.contributors[c.slug] = profileFromRow(c);
          });
          window.Community.resources =
            (subs || []).map((s) => resourceFromRow(s, slugById));
          // Merge community contributors into the global registry so bylines
          // and profile pages resolve them exactly like founding contributors.
          if (typeof CONTRIBUTORS === "object") {
            for (const [slug, p] of Object.entries(window.Community.contributors)) {
              if (!CONTRIBUTORS[slug]) CONTRIBUTORS[slug] = p;
            }
          }
        } catch (e) {
          console.error("Community load failed:", e);
        }
        return window.Community;
      })();
      return loaded;
    },

    async myProfile(uid) {
      const sb = client();
      if (!sb || !uid) return null;
      const { data } = await sb.from("contributors").select("*").eq("id", uid).maybeSingle();
      return data || null;
    },
  };
})();
