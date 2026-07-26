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

  // The public directory never needs application PII (email, credentials_note,
  // memberships…) — and once the privacy grants run, selecting those columns
  // anonymously is refused outright.
  const PUBLIC_CONTRIB_COLS = "id,name,slug,credential,location,website,bio,photo_url,links," +
    "payment_links,pricing_mode,offers_print,allow_community_print,print_notes,print_partner," +
    "print_equipment,print_region,print_from,status,verified_at,created_at";

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
      payment_links: Array.isArray(row.payment_links) ? row.payment_links : [],
      status: row.status || "approved",
      offers_print: !!row.offers_print,
      allow_community_print: !!row.allow_community_print,
      print_notes: row.print_notes || "",
      print_partner: !!row.print_partner,
      print_equipment: Array.isArray(row.print_equipment) ? row.print_equipment : [],
      print_region: row.print_region || "",
      print_from: row.print_from != null ? Number(row.print_from) : null,
      approved_printers: Array.isArray(row.approved_printers) ? row.approved_printers : [],
      community: true,
    };
  }

  function resourceFromRow(row, slugById) {
    const cat = VALID_CATS.includes(row.category) ? row.category : "parts";
    const files = row.files && typeof row.files === "object" ? row.files : {};
    const r = {
      id: "PTL-C" + row.id,
      cat,
      title: (row.version || 1) > 1 ? `${row.title} (v${row.version})` : row.title,
      maker: row.maker || "Community Contribution",
      desc: row.description || "",
      formats: Object.keys(files).map((k) => k.toUpperCase()),
      by: slugById[row.contributor_id] || null,
      dateAdded: (row.created_at || "").slice(0, 10),
      pricing: ["free", "tip", "pwyw", "paid"].includes(row.pricing) ? row.pricing : "free",
      price: row.price != null ? Number(row.price) : null,
      license: row.license || null,
      print_price: row.print_price != null ? Number(row.print_price) : null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      distribution: row.distribution === "print-only" ? "print-only" : "download",
      community: true,
    };
    if (Object.keys(files).length) r.files = files;
    if (row.thumb_url) r.thumb = row.thumb_url;
    if (row.youtube) {
      if (cat === "video") { r.youtube = row.youtube; r.sub = r.sub || "community"; }
      else r.video = row.youtube; // how-to video attached to a downloadable item
    }
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
          // approved_printers may not be migrated yet — retry without it
          let contribRes = await sb.from("contributors").select(PUBLIC_CONTRIB_COLS + ",approved_printers");
          if (contribRes.error) contribRes = await sb.from("contributors").select(PUBLIC_CONTRIB_COLS);
          const [{ data: contribs }, { data: subs }] = await Promise.all([
            Promise.resolve(contribRes),
            sb.from("submissions").select("*").eq("status", "approved")
              .order("created_at", { ascending: false }),
          ]);
          const slugById = {};
          (contribs || []).forEach((c) => {
            slugById[c.id] = c.slug;
            // Only verified (approved) contributors appear publicly; legacy
            // rows without a status were grandfathered as approved.
            if (!c.status || c.status === "approved") {
              window.Community.contributors[c.slug] = profileFromRow(c);
            }
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
      // Own full row (incl. application fields) comes through the security-definer
      // my_profile() function; direct select works as a pre-migration fallback.
      let { data, error } = await sb.rpc("my_profile");
      if (!error && Array.isArray(data)) return data[0] || null;
      ({ data } = await sb.from("contributors").select("*").eq("id", uid).maybeSingle());
      return data || null;
    },
  };
})();
