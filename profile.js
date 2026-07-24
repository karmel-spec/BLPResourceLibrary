// ============================================================================
// Contributor dashboard: profile editor, uploads, my submissions, admin queue.
// Everything persists in Supabase (tables + storage) under the user's account.
// ============================================================================
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const CAT_LABEL = { parts: "PART", fixtures: "FIXTURE", player: "PLAYER",
    cabinet: "CABINET", research: "RESEARCH", video: "VIDEO" };
  const STATUS_LABEL = { pending: "IN REVIEW", approved: "PUBLISHED", rejected: "NOT PUBLISHED", archived: "ARCHIVED" };

  let profile = null; // my contributor row
  let newVersionOf = null; // submission being replaced when uploading a new version

  // Neutral head-and-shoulders placeholder (no photo yet / broken photo URL)
  const PHOTO_PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<rect width="100" height="100" fill="#e2e8ea"/>' +
    '<circle cx="50" cy="38" r="16" fill="#aab7bd"/>' +
    '<path d="M20 88 Q50 58 80 88" fill="#aab7bd"/></svg>');

  function sb() { return window.__supabase; }
  function uid() { return window.Auth.user()?.id; }

  function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  }

  // Broken/missing photo URLs fall back to the neutral placeholder.
  $("pfPhoto").addEventListener("error", () => {
    if (!$("pfPhoto").src.startsWith("data:")) $("pfPhoto").src = PHOTO_PLACEHOLDER;
  });

  // ---- boot -----------------------------------------------------------------
  window.Auth.onChange(async (user) => {
    $("dashSignedOut").hidden = !!user;
    if (!user) {
      ["dashProfile", "dashUpload", "dashMine", "dashAdmin"].forEach((id) => $(id).hidden = true);
      return;
    }
    if (!sb()) {
      $("dashSignedOut").hidden = false;
      $("dashSignedOut").querySelector("p").textContent =
        "The community backend isn't connected in this preview.";
      return;
    }
    profile = await window.Community.myProfile(user.id);
    fillProfileForm(user);
    $("dashProfile").hidden = false;
    $("dashUpload").hidden = !profile;      // profile first, then uploads
    $("dashMine").hidden = !profile;
    if (profile) loadMine();
    if (window.Auth.isAdmin()) { $("dashAdmin").hidden = false; loadQueue(); initNewsletter(); initActivityLog(); initBetaFeedback(); initPrintRequests(); }
  });
  $("dashSignIn").onclick = () => window.Auth.signIn();

  // Show the price field only when "Suggested price" is chosen.
  document.querySelectorAll('input[name="upPricing"]').forEach((r) =>
    r.addEventListener("change", () => {
      const v = document.querySelector('input[name="upPricing"]:checked').value;
      $("upPriceWrap").hidden = !(v === "paid" || v === "pwyw");
      $("upPriceLab").textContent = v === "paid" ? "Price" : "Suggested price";
    }));

  // ---- profile editor --------------------------------------------------------
  function fillProfileForm(user) {
    $("profHeading").textContent = profile ? "Your public profile" : "Create your public profile";
    $("pfName").value = profile?.name || user.name || "";
    $("pfCred").value = profile?.credential || "";
    $("pfLoc").value = profile?.location || "";
    $("pfSite").value = profile?.website || "";
    $("pfBio").value = profile?.bio || "";
    $("pfLinks").value = (profile?.links || [])
      .map((l) => `${l.label} ${l.url}`).join("\n");
    $("pfPay").value = (profile?.payment_links || [])
      .map((l) => `${l.label} ${l.url}`).join("\n");
    $("pfOffersPrint").checked = !!profile?.offers_print;
    $("pfCommunityPrint").checked = !!profile?.allow_community_print;
    $("pfPrintNotes").value = profile?.print_notes || "";
    $("pfAckPrintNetwork").checked = !!profile?.ack_print_network;
    const photo = photoUrl || profile?.photo_url || user.avatar || "";
    $("pfPhoto").src = photo || PHOTO_PLACEHOLDER;
    $("pfPhotoBtnText").textContent = photo ? "CHANGE PHOTO" : "ADD PHOTO";
    if (profile) {
      $("pfView").hidden = false;
      $("pfView").href = "contributor.html?id=" + profile.slug;
    }
  }

  let photoUrl = null; // set when a new photo is uploaded this session

  $("pfPhotoFile").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setStatus("pfStatus", "Uploading photo…");
    try {
      const path = `${uid()}/profile-${Date.now()}.${(f.name.split(".").pop() || "jpg").toLowerCase()}`;
      const { error } = await sb().storage.from("contributions").upload(path, f, { upsert: true });
      if (error) throw error;
      photoUrl = sb().storage.from("contributions").getPublicUrl(path).data.publicUrl;
      $("pfPhoto").src = photoUrl;
      $("pfPhotoBtnText").textContent = "CHANGE PHOTO";
      setStatus("pfStatus", "Photo ready — click SAVE PROFILE.");
    } catch (err) { setStatus("pfStatus", "Photo upload failed: " + err.message, true); }
  });

  $("pfSave").onclick = async () => {
    const name = $("pfName").value.trim();
    if (!name) return setStatus("pfStatus", "Please enter your name.", true);
    if (!$("pfAckPrintNetwork").checked)
      return setStatus("pfStatus", "Please check the print-network acknowledgment before saving.", true);
    setStatus("pfStatus", "Saving…");
    const parseLinks = (val) => val.split("\n").map((l) => l.trim()).filter(Boolean)
      .map((l) => { const i = l.indexOf(" ");
        return i < 0 ? { label: "LINK", url: l }
                     : { label: l.slice(0, i).toUpperCase(), url: l.slice(i + 1).trim() }; })
      .filter((l) => /^https?:\/\//.test(l.url));
    const links = parseLinks($("pfLinks").value);
    const payment_links = parseLinks($("pfPay").value);
    const row = {
      id: uid(),
      name,
      credential: $("pfCred").value.trim() || null,
      location: $("pfLoc").value.trim() || null,
      website: $("pfSite").value.trim() || null,
      bio: $("pfBio").value.trim() || null,
      links,
      payment_links,
      offers_print: $("pfOffersPrint").checked,
      allow_community_print: $("pfCommunityPrint").checked,
      print_notes: $("pfPrintNotes").value.trim() || null,
      ack_print_network: true,
    };
    if (photoUrl) row.photo_url = photoUrl;
    else if (!profile) row.photo_url = window.Auth.user().avatar || null;
    const wasNew = !profile;
    try {
      if (!profile) {
        // find a free slug: name, name-2, name-3…
        let slug = slugify(name) || "tech";
        for (let n = 2; n < 50; n++) {
          const { data } = await sb().from("contributors").select("id").eq("slug", slug).maybeSingle();
          if (!data) break;
          slug = slugify(name) + "-" + n;
        }
        row.slug = slug;
        const { data, error } = await sb().from("contributors").insert(row).select().single();
        if (error) throw error;
        profile = data;
      } else {
        delete row.id;
        const { data, error } = await sb().from("contributors")
          .update(row).eq("id", uid()).select().single();
        if (error) throw error;
        profile = data;
      }
      setStatus("pfStatus", "Saved ✓ Your profile is live.");
      if (window.Activity) window.Activity.log(wasNew ? "profile_created" : "profile_updated", (profile.name || name) + " (@" + profile.slug + ")");
      fillProfileForm(window.Auth.user());
      $("dashUpload").hidden = false;
      $("dashMine").hidden = false;
      loadMine();
    } catch (err) { setStatus("pfStatus", "Save failed: " + err.message, true); }
  };

  // ---- upload a contribution --------------------------------------------------
  $("upSubmit").onclick = async () => {
    const title = $("upTitle").value.trim();
    if (!title) return setStatus("upStatus", "Please give it a title.", true);
    const fileInput = $("upFiles");
    const youtube = normalizeYoutube($("upYoutube").value.trim());
    if (!fileInput.files.length && !youtube)
      return setStatus("upStatus", "Attach at least one file or a YouTube link.", true);

    const files = {};
    try {
      let done = 0;
      for (const f of fileInput.files) {
        setStatus("upStatus", `Uploading ${++done}/${fileInput.files.length}: ${f.name}…`);
        const ext = (f.name.split(".").pop() || "file").toLowerCase().replace("stp", "step");
        const path = `${uid()}/${Date.now()}-${slugify(title)}.${ext}`;
        const { error } = await sb().storage.from("contributions").upload(path, f);
        if (error) throw error;
        files[ext] = sb().storage.from("contributions").getPublicUrl(path).data.publicUrl;
      }
      let thumb_url = null;
      const t = $("upThumb").files[0];
      if (t) {
        setStatus("upStatus", "Uploading preview image…");
        const path = `${uid()}/${Date.now()}-thumb-${slugify(title)}.${(t.name.split(".").pop() || "jpg").toLowerCase()}`;
        const { error } = await sb().storage.from("contributions").upload(path, t);
        if (error) throw error;
        thumb_url = sb().storage.from("contributions").getPublicUrl(path).data.publicUrl;
      }
      setStatus("upStatus", "Submitting…");
      const pricing = document.querySelector('input[name="upPricing"]:checked')?.value || "free";
      if ((pricing === "paid" || pricing === "pwyw") && !$("upAckHonor").checked)
        return setStatus("upStatus", "Please check the honor-system acknowledgment to charge for this item.", true);
      const priceVal = parseFloat($("upPrice").value);
      const row = {
        contributor_id: uid(),
        title,
        category: $("upCat").value,
        maker: $("upMaker").value.trim() || null,
        description: $("upDesc").value.trim() || null,
        files, thumb_url, youtube: youtube || null,
        pricing,
        price: (pricing === "paid" || pricing === "pwyw") && priceVal > 0 ? priceVal : null,
        license: $("upLicense").value || null,
      };
      if (newVersionOf) {
        row.version = (newVersionOf.version || 1) + 1;
        row.replaces = newVersionOf.id;
        row.replace_action = document.querySelector('input[name="verAction"]:checked').value;
      }
      const { error } = await sb().from("submissions").insert(row);
      if (error) throw error;
      if (window.Activity) window.Activity.log("submission", title + (row.version ? ` (v${row.version})` : ""));
      notifyLibrarians(title + (row.version ? ` (v${row.version})` : ""));
      setStatus("upStatus", "Submitted ✓ The librarians will review it shortly.");
      ["upTitle", "upMaker", "upDesc", "upYoutube"].forEach((id) => $(id).value = "");
      fileInput.value = ""; $("upThumb").value = "";
      cancelNewVersion();
      loadMine();
    } catch (err) { setStatus("upStatus", "Upload failed: " + err.message, true); }
  };

  // Email the librarians about a new submission (fire-and-forget — a lost
  // notification must never break the submit flow; the queue is the backstop).
  function notifyLibrarians(title) {
    if (!CONFIG.NOTIFY_EMAIL) return;
    const me = window.Auth.user() || {};
    fetch(`https://formsubmit.co/ajax/${CONFIG.NOTIFY_EMAIL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: "Piano Technology Library — new submission to review",
        _template: "table",
        Title: title,
        Contributor: me.name || me.email || "Unknown",
        "Review it here": "https://pianotechnologylibrary.com/profile.html",
      }),
    }).catch(() => {});
  }

  function normalizeYoutube(url) {
    if (!url) return null;
    const m = url.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{6,})/);
    return m ? m[1] : null;
  }

  // ---- my submissions ----------------------------------------------------------
  async function loadMine() {
    const { data } = await sb().from("submissions").select("*")
      .eq("contributor_id", uid()).order("created_at", { ascending: false });
    $("mineList").innerHTML = (data || []).length
      ? data.map((s) => subRow(s, false)).join("")
      : `<div class="cm-empty">Nothing shared yet — your first contribution goes right above. 🔧</div>`;
    $("mineList").querySelectorAll("[data-newver]").forEach((b) =>
      b.onclick = () => startNewVersion((data || []).find((s) => s.id === b.dataset.newver)));
  }

  // ---- version control -----------------------------------------------------------
  // Pre-fills the upload form as "version N+1 of X" and asks what to do with
  // the old version (keep / archive / delete) once the new one is approved.
  function startNewVersion(s) {
    if (!s) return;
    newVersionOf = s;
    $("verLabel").textContent = "V" + ((s.version || 1) + 1);
    $("verTitle").textContent = s.title;
    $("verBanner").hidden = false;
    $("upTitle").value = s.title;
    $("upCat").value = s.category || "parts";
    $("upMaker").value = s.maker || "";
    $("upDesc").value = s.description || "";
    document.querySelector('input[name="verAction"][value="keep"]').checked = true;
    $("dashUpload").scrollIntoView({ behavior: "smooth" });
    setStatus("upStatus", "");
  }
  function cancelNewVersion() {
    newVersionOf = null;
    $("verBanner").hidden = true;
  }
  $("verCancel").onclick = () => {
    cancelNewVersion();
    ["upTitle", "upMaker", "upDesc"].forEach((id) => $(id).value = "");
  };

  // ---- admin queue ---------------------------------------------------------------
  async function loadQueue() {
    const { data } = await sb().from("submissions").select("*, contributors(name, slug)")
      .eq("status", "pending").order("created_at");
    $("adminList").innerHTML = (data || []).length
      ? data.map((s) => subRow(s, true)).join("")
      : `<div class="cm-empty">Queue is empty — nothing waiting for review.</div>`;
    $("adminList").querySelectorAll("[data-approve]").forEach((b) =>
      b.onclick = () => review(b.dataset.approve, "approved"));
    $("adminList").querySelectorAll("[data-reject]").forEach((b) =>
      b.onclick = () => review(b.dataset.reject, "rejected"));
  }

  async function review(id, status) {
    const { data: updated, error } = await sb().from("submissions")
      .update({ status, reviewed_at: new Date().toISOString() }).eq("id", id).select("title").maybeSingle();
    if (error) { alert("Update failed: " + error.message); return; }
    if (window.Activity) window.Activity.log(status === "approved" ? "approved" : "rejected", updated ? updated.title : ("#" + id));
    // Approving a new version applies the contributor's choice to the old one.
    if (status === "approved") {
      const { data: sub } = await sb().from("submissions")
        .select("replaces, replace_action").eq("id", id).single();
      if (sub && sub.replaces) {
        if (sub.replace_action === "archive") {
          await sb().from("submissions").update({ status: "archived" }).eq("id", sub.replaces);
        } else if (sub.replace_action === "delete") {
          await sb().from("submissions").delete().eq("id", sub.replaces);
        } // "keep": both versions stay live
      }
    }
    loadQueue(); loadMine();
  }

  function subRow(s, admin) {
    const links = Object.entries(s.files || {})
      .map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(k.toUpperCase())}</a>`).join(" ");
    const who = admin && s.contributors ? `<span class="sub-who">by ${esc(s.contributors.name)}</span>` : "";
    const ver = (s.version || 1) > 1 ? `<span class="ver-chip">V${s.version}</span> ` : "";
    const verNote = admin && s.replaces
      ? `<span class="mono sub-vernote">⬆ new version — old copy will be ${esc(s.replace_action || "kept")}${s.replace_action === "keep" ? "t" : "d"}</span>`
      : "";
    const actions = admin
      ? `<span class="sub-actions"><button class="au-btn primary" data-approve="${s.id}">APPROVE</button>
         <button class="au-btn" data-reject="${s.id}">REJECT</button></span>`
      : `<span class="sub-actions"><span class="sub-status s-${esc(s.status)}">${STATUS_LABEL[s.status] || esc(s.status)}</span>${
          s.status === "approved" ? `<button class="au-btn" data-newver="${s.id}">⬆ UPLOAD NEW VERSION</button>` : ""
        }</span>`;
    return `<div class="sub-row">
      ${s.thumb_url ? `<img class="sub-thumb" src="${esc(s.thumb_url)}" alt="">` : `<span class="sub-thumb none"></span>`}
      <div class="sub-main">
        <b>${ver}${esc(s.title)}</b>
        <span class="mono sub-meta">${CAT_LABEL[s.category] || "ITEM"}${s.maker ? " · " + esc(s.maker) : ""}${who ? " · " : ""}${who}</span>
        ${verNote}
        <span class="sub-links">${links}${s.youtube ? ` <a href="https://www.youtube.com/watch?v=${esc(s.youtube)}" target="_blank" rel="noopener">VIDEO</a>` : ""}</span>
      </div>
      ${actions}
    </div>`;
  }

  function setStatus(id, msg, isErr) {
    const el = $(id);
    el.textContent = msg;
    el.classList.toggle("err", !!isErr);
  }

  // ---- Newsletter prep (admins only) ---------------------------------------------
  // Builds a plain-text digest of everything added in the chosen period, can email
  // a review copy to the library inbox, and opens the admin's own mail client with
  // every member BCC'd — the admin approves and presses Send themselves.
  let nlSubscribers = [];
  function initNewsletter() {
    if (!window.Auth.isAdmin()) return;
    $("dashNews").hidden = false;

    $("nlBuild").onclick = async () => {
      setStatus("nlStatus", "Building…");
      const days = parseInt($("nlPeriod").value, 10);
      const cutoff = new Date(Date.now() - days * 864e5);
      const cutoffIso = cutoff.toISOString().slice(0, 10);

      // Founding-catalog items (data.js) + approved community submissions.
      const items = RESOURCES.filter((r) => r.dateAdded && r.dateAdded >= cutoffIso)
        .map((r) => ({ title: r.title, by: (CONTRIBUTORS[r.by] || {}).name || "the library", cat: r.cat, youtube: !!r.youtube }));
      const { data: subs } = await sb().from("submissions")
        .select("title, category, youtube, version, contributors(name)")
        .eq("status", "approved").gte("created_at", cutoff.toISOString());
      (subs || []).forEach((s) => items.push({
        title: (s.version || 1) > 1 ? `${s.title} (v${s.version})` : s.title,
        by: s.contributors ? s.contributors.name : "a community member",
        cat: s.category, youtube: !!s.youtube,
      }));

      const { data: people } = await sb().from("newsletter_subscribers").select("email");
      nlSubscribers = (people || []).map((p) => p.email);

      const period = days === 7 ? "week" : "month";
      const lines = items.map((i) => `  • ${i.title} — shared by ${i.by}${i.youtube ? " (video)" : ""}`);
      $("nlText").value =
`Hello from the Piano Technology Library!

${items.length ? `Here's what your fellow technicians added to the library this ${period}:` : `It's been a quiet ${period} at the library — but the full catalog is always open:`}

${lines.join("\n") || "  (no new items this period)"}

Browse everything, download files, and preview parts in 3D — free, always:
https://pianotechnologylibrary.com

Have something of your own to share? Every contribution is credited and linked to you:
https://pianotechnologylibrary.com/profile

Keep the craft alive,
Brigham Larson Pianos & the Piano Technology Library
(You're receiving this because you're a member of pianotechnologylibrary.com — reply to this email to unsubscribe.)`;

      $("nlEditWrap").hidden = false;
      $("nlAlert").hidden = false;
      $("nlSend").hidden = false;
      $("nlMeta").hidden = false;
      $("nlMeta").textContent = `${items.length} NEW ITEM${items.length === 1 ? "" : "S"} · ${nlSubscribers.length} MEMBER${nlSubscribers.length === 1 ? "" : "S"} ON THE LIST`;
      setStatus("nlStatus", "Draft ready — edit below, then send.");
    };

    $("nlAlert").onclick = async () => {
      setStatus("nlStatus", "Emailing the draft…");
      try {
        const r = await fetch(`https://formsubmit.co/ajax/${CONFIG.NOTIFY_EMAIL}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            _subject: "Piano Technology Library — newsletter draft ready to send",
            Draft: $("nlText").value,
            Members: String(nlSubscribers.length),
          }),
        });
        const j = await r.json();
        setStatus("nlStatus", j.success === "true" ? `Draft emailed to ${CONFIG.NOTIFY_EMAIL} ✓` : "Email failed — is the form activated?", j.success !== "true");
      } catch (e) { setStatus("nlStatus", "Email failed: " + e.message, true); }
    };

    $("nlSend").onclick = (e) => {
      if (!nlSubscribers.length) { e.preventDefault(); return setStatus("nlStatus", "No members on the list yet.", true); }
      const subject = "New at the Piano Technology Library";
      $("nlSend").href = `mailto:${CONFIG.NOTIFY_EMAIL}?bcc=${encodeURIComponent(nlSubscribers.join(","))}` +
        `&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent($("nlText").value)}`;
      setStatus("nlStatus", "Opening your mail app — members are BCC'd; review and press Send.");
    };
  }

  // ---- Activity log (admins only) ------------------------------------------------
  const LOG_META = {
    login:           { icon: "🔑", label: "Signed in" },
    email_signup:    { icon: "✉️", label: "Newsletter signup" },
    profile_created: { icon: "🧑‍🔧", label: "New contributor profile" },
    profile_updated: { icon: "✏️", label: "Profile updated" },
    submission:      { icon: "📤", label: "Item submitted" },
    approved:        { icon: "✅", label: "Item approved" },
    rejected:        { icon: "🚫", label: "Item rejected" },
    download:        { icon: "⬇️", label: "Download" },
    watch:           { icon: "▶️", label: "Watched video" },
  };
  let logFilter = "all";

  function initActivityLog() {
    $("dashLog").hidden = false;
    const filters = ["all", "login", "email_signup", "profile_created", "submission", "approved", "download"];
    $("logFilters").innerHTML = filters.map((f) =>
      `<button class="log-filter${f === logFilter ? " on" : ""}" data-f="${f}">${
        f === "all" ? "ALL" : (LOG_META[f] ? LOG_META[f].label.toUpperCase() : f.toUpperCase())
      }</button>`).join("");
    $("logFilters").querySelectorAll("[data-f]").forEach((b) =>
      b.onclick = () => { logFilter = b.dataset.f; loadLog(); });
    $("logRefresh").onclick = loadLog;
    loadLog();
  }

  async function loadLog() {
    $("logFilters").querySelectorAll("[data-f]").forEach((b) =>
      b.classList.toggle("on", b.dataset.f === logFilter));
    $("logList").innerHTML = `<div class="cm-empty">Loading…</div>`;
    let q = sb().from("activity_log").select("*").order("created_at", { ascending: false }).limit(200);
    if (logFilter !== "all") q = q.eq("type", logFilter);
    const { data, error } = await q;
    if (error) { $("logList").innerHTML = `<div class="cm-empty">Could not load the log: ${esc(error.message)}</div>`; return; }
    const rows = data || [];

    // Today's tally across everything (independent of the active filter).
    const { data: recent } = await sb().from("activity_log")
      .select("type, created_at").order("created_at", { ascending: false }).limit(500);
    const today = new Date().toISOString().slice(0, 10);
    const todays = (recent || []).filter((r) => (r.created_at || "").slice(0, 10) === today);
    const tally = {};
    todays.forEach((r) => { tally[r.type] = (tally[r.type] || 0) + 1; });
    $("logStats").textContent = todays.length
      ? "TODAY: " + Object.entries(tally).map(([t, n]) => `${n} ${(LOG_META[t] || {}).label || t}`).join(" · ")
      : "No activity yet today.";

    $("logList").innerHTML = rows.length
      ? rows.map(logRow).join("")
      : `<div class="cm-empty">No activity recorded${logFilter !== "all" ? " for this filter" : " yet"}.</div>`;
  }

  function logRow(r) {
    const m = LOG_META[r.type] || { icon: "•", label: r.type };
    const who = r.actor_name || r.actor_email || "A visitor";
    return `<div class="log-row">
      <span class="log-ic">${m.icon}</span>
      <div class="log-main">
        <span class="log-what"><b>${esc(m.label)}</b>${r.detail ? " — " + esc(r.detail) : ""}</span>
        <span class="mono log-who">${esc(who)}${r.actor_email && r.actor_name ? " · " + esc(r.actor_email) : ""}</span>
      </div>
      <span class="mono log-when">${fmtWhen(r.created_at)}</span>
    </div>`;
  }

  function fmtWhen(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
    return `${mon} ${d.getDate()}, ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
  }

  // ---- Beta feedback punch-list (admins only) ------------------------------------
  const FB_META = {
    bug:        { icon: "🐛", label: "Bug" },
    suggestion: { icon: "💡", label: "Suggestion" },
    feature:    { icon: "✨", label: "Feature idea" },
    design:     { icon: "🎨", label: "Design" },
    question:   { icon: "❓", label: "Question" },
    other:      { icon: "💬", label: "Other" },
  };
  let betaFilter = "open";

  function initBetaFeedback() {
    $("dashBeta").hidden = false;
    const filters = ["open", "done", "all"];
    $("betaFilters").innerHTML = filters.map((f) =>
      `<button class="log-filter${f === betaFilter ? " on" : ""}" data-bf="${f}">${f.toUpperCase()}</button>`).join("");
    $("betaFilters").querySelectorAll("[data-bf]").forEach((b) =>
      b.onclick = () => { betaFilter = b.dataset.bf; loadBeta(); });
    $("betaRefresh").onclick = loadBeta;
    loadBeta();
  }

  async function loadBeta() {
    $("betaFilters").querySelectorAll("[data-bf]").forEach((b) =>
      b.classList.toggle("on", b.dataset.bf === betaFilter));
    $("betaList").innerHTML = `<div class="cm-empty">Loading…</div>`;
    let q = sb().from("beta_feedback").select("*").order("created_at", { ascending: false }).limit(200);
    if (betaFilter !== "all") q = q.eq("status", betaFilter);
    const { data, error } = await q;
    if (error) { $("betaList").innerHTML = `<div class="cm-empty">Could not load feedback: ${esc(error.message)}</div>`; return; }
    const rows = data || [];
    $("betaList").innerHTML = rows.length
      ? rows.map(betaRow).join("")
      : `<div class="cm-empty">No ${betaFilter === "all" ? "" : betaFilter + " "}feedback${betaFilter === "open" ? " — you're all caught up! 🎉" : "."}</div>`;
    $("betaList").querySelectorAll("[data-done]").forEach((b) =>
      b.onclick = () => setBetaStatus(b.dataset.done, "done"));
    $("betaList").querySelectorAll("[data-reopen]").forEach((b) =>
      b.onclick = () => setBetaStatus(b.dataset.reopen, "open"));
  }

  function betaRow(r) {
    const m = FB_META[r.category] || { icon: "•", label: r.category };
    const who = r.actor_name || r.actor_email || "Anonymous";
    const done = r.status === "done";
    return `<div class="beta-row${done ? " done" : ""}">
      <span class="beta-ic">${m.icon}</span>
      <div class="beta-main">
        <span class="beta-cat mono">${esc(m.label.toUpperCase())}</span>
        <span class="beta-msg">${esc(r.message)}</span>
        <span class="mono beta-meta">${esc(who)}${r.actor_email && r.actor_name ? " · " + esc(r.actor_email) : ""} · ${esc(r.page || "")} · ${fmtWhen(r.created_at)}</span>
      </div>
      <button class="au-btn beta-toggle" ${done ? `data-reopen="${r.id}"` : `data-done="${r.id}"`}>${done ? "REOPEN" : "✓ DONE"}</button>
    </div>`;
  }

  async function setBetaStatus(id, status) {
    const { error } = await sb().from("beta_feedback").update({ status }).eq("id", id);
    if (error) { alert("Update failed: " + error.message); return; }
    loadBeta();
  }

  // ---- Print & ship requests (admins only) ---------------------------------------
  let prqFilter = "open";
  function initPrintRequests() {
    $("dashPrint").hidden = false;
    const filters = ["open", "done", "all"];
    $("prqFilters").innerHTML = filters.map((f) =>
      `<button class="log-filter${f === prqFilter ? " on" : ""}" data-prq="${f}">${f.toUpperCase()}</button>`).join("");
    $("prqFilters").querySelectorAll("[data-prq]").forEach((b) =>
      b.onclick = () => { prqFilter = b.dataset.prq; loadPrq(); });
    $("prqRefresh").onclick = loadPrq;
    loadPrq();
  }
  async function loadPrq() {
    $("prqFilters").querySelectorAll("[data-prq]").forEach((b) =>
      b.classList.toggle("on", b.dataset.prq === prqFilter));
    $("prqList").innerHTML = `<div class="cm-empty">Loading…</div>`;
    let q = sb().from("print_requests").select("*").order("created_at", { ascending: false }).limit(200);
    if (prqFilter !== "all") q = q.eq("status", prqFilter);
    const { data, error } = await q;
    if (error) { $("prqList").innerHTML = `<div class="cm-empty">Could not load requests: ${esc(error.message)}</div>`; return; }
    const rows = data || [];
    $("prqList").innerHTML = rows.length
      ? rows.map(prqRow).join("")
      : `<div class="cm-empty">No ${prqFilter === "all" ? "" : prqFilter + " "}print requests${prqFilter === "open" ? " — nothing waiting. 🖨" : "."}</div>`;
    $("prqList").querySelectorAll("[data-done]").forEach((b) => b.onclick = () => setPrqStatus(b.dataset.done, "done"));
    $("prqList").querySelectorAll("[data-reopen]").forEach((b) => b.onclick = () => setPrqStatus(b.dataset.reopen, "open"));
  }
  function prqRow(r) {
    const done = r.status === "done";
    const to = r.fulfiller === "maker" ? `Maker (${esc(r.contributor_slug || "")})` : "Print Partner network";
    return `<div class="beta-row${done ? " done" : ""}">
      <span class="beta-ic">🖨</span>
      <div class="beta-main">
        <span class="beta-cat mono">${esc(to)}${r.shipping_speed === "overnight" ? " · OVERNIGHT" : ""}</span>
        <span class="beta-msg"><b>${esc(r.item_title)}</b> ×${r.quantity || 1} · ${esc(r.material || "")}</span>
        <span class="mono beta-meta">${esc(r.requester_name || "")} · <a href="mailto:${esc(r.requester_email)}">${esc(r.requester_email)}</a> · ${fmtWhen(r.created_at)}</span>
        <span class="mono beta-meta">Ship to: ${esc(r.shipping_address || "")}</span>
        ${r.notes ? `<span class="mono beta-meta">Notes: ${esc(r.notes)}</span>` : ""}
      </div>
      <button class="au-btn beta-toggle" ${done ? `data-reopen="${r.id}"` : `data-done="${r.id}"`}>${done ? "REOPEN" : "✓ DONE"}</button>
    </div>`;
  }
  async function setPrqStatus(id, status) {
    const { error } = await sb().from("print_requests").update({ status }).eq("id", id);
    if (error) { alert("Update failed: " + error.message); return; }
    loadPrq();
  }
})();
