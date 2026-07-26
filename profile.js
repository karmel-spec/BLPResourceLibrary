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
      ["dashProfile", "dashUpload", "dashBulk", "dashMine", "dashAdmin", "dashPending", "dashApps", "dashConsumer"].forEach((id) => $(id).hidden = true);
      return;
    }
    if (!sb()) {
      $("dashSignedOut").hidden = false;
      $("dashSignedOut").querySelector("p").textContent =
        "The community backend isn't connected in this preview.";
      return;
    }
    profile = await window.Community.myProfile(user.id);
    // Library members who aren't piano professionals get a reader view — no
    // contributor application (role from the welcome intake card, welcome.js).
    if (!profile && !window.Auth.isAdmin() && window.Welcome && await window.Welcome.isConsumer()) {
      $("dashConsumer").hidden = false;
      const redo = $("dashRedo");
      if (redo) redo.onclick = () => window.Welcome.show();
      return;
    }
    $("dashConsumer").hidden = true;
    fillProfileForm(user);
    $("dashProfile").hidden = false;
    // Uploads open only for APPROVED contributors (piano professionals,
    // verified by a librarian). Legacy rows without a status count as approved.
    const approved = profile && (profile.status === "approved" || profile.status == null);
    const pending = profile && profile.status === "pending";
    $("dashPending").hidden = !pending;
    if (profile && profile.status === "declined") {
      $("dashPending").hidden = false;
      $("dashPending").querySelector("h2").textContent = "Application not approved";
      $("dashPending").querySelector("p").innerHTML =
        "A librarian couldn't verify your professional credentials. If that's a mistake, add more detail above (PTG #, shop website) and save again, or email <a href='mailto:info@brighamlarsonpianos.com'>info@brighamlarsonpianos.com</a>.";
    }
    $("dashUpload").hidden = !approved;
    $("dashBulk").hidden = !approved;
    $("dashMine").hidden = !profile;
    if (profile) loadMine();
    if (window.Auth.isAdmin()) { $("dashAdmin").hidden = false; loadQueue(); initNewsletter(); initActivityLog(); initBetaFeedback(); initPrintRequests(); loadApps(); }
  });
  $("dashSignIn").onclick = () => window.Auth.signIn();

  $("pfPrintPartner").addEventListener("change", () => { $("ppDetails").hidden = !$("pfPrintPartner").checked; });

  // The bulk block reuses the single-upload tag vocabulary (one source of truth).
  const bkGrid = $("bkTagGrid");
  if (bkGrid) bkGrid.innerHTML = document.querySelector("#dashUpload .tag-grid").innerHTML.replaceAll('class="upTag"', 'class="bkTag"');

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
    $("pfCreds").value = profile?.credentials_note || "";
    const orgs = profile?.memberships || [];
    document.querySelectorAll(".pfOrg").forEach((c) => c.checked = orgs.includes(c.value));
    const certs = profile?.certifications || [];
    document.querySelectorAll(".pfCert").forEach((c) => c.checked = certs.includes(c.value));
    $("pfYears").value = profile?.years_experience ?? "";
    // Payment links unlock after approval
    const isApproved = profile && (profile.status === "approved" || profile.status == null);
    const payLabel = $("pfPay").closest("label");
    payLabel.hidden = !isApproved;
    if (payLabel.nextElementSibling) payLabel.nextElementSibling.hidden = !isApproved;
    $("pfLinks").value = (profile?.links || [])
      .map((l) => `${l.label} ${l.url}`).join("\n");
    $("pfPay").value = (profile?.payment_links || [])
      .map((l) => `${l.label} ${l.url}`).join("\n");
    $("pfOffersPrint").checked = !!profile?.offers_print;
    $("pfCommunityPrint").checked = !!profile?.allow_community_print;
    $("pfPrintNotes").value = profile?.print_notes || "";
    $("pfPrintPartner").checked = !!profile?.print_partner;
    $("ppDetails").hidden = !profile?.print_partner;
    const eq = profile?.print_equipment || [];
    $("pfEqFdm").checked = eq.includes("fdm");
    $("pfEqResin").checked = eq.includes("resin");
    $("pfEqCncWood").checked = eq.includes("cnc-wood");
    $("pfEqCncMetal").checked = eq.includes("cnc-metal");
    $("pfPrintRegion").value = profile?.print_region || "";
    $("pfPrintFrom").value = profile?.print_from ?? "";
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
      credentials_note: $("pfCreds").value.trim() || null,
      memberships: [...document.querySelectorAll(".pfOrg:checked")].map((c) => c.value),
      certifications: [...document.querySelectorAll(".pfCert:checked")].map((c) => c.value),
      years_experience: parseInt($("pfYears").value, 10) || null,
      email: window.Auth.user().email || null,
      links,
      payment_links,
      offers_print: $("pfOffersPrint").checked,
      allow_community_print: $("pfCommunityPrint").checked,
      print_notes: $("pfPrintNotes").value.trim() || null,
      print_partner: $("pfPrintPartner").checked,
      print_equipment: [["fdm","pfEqFdm"],["resin","pfEqResin"],["cnc-wood","pfEqCncWood"],["cnc-metal","pfEqCncMetal"]]
        .filter(([,id]) => $(id).checked).map(([k]) => k),
      print_region: $("pfPrintRegion").value.trim() || null,
      print_from: parseFloat($("pfPrintFrom").value) || null,
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
        const { error } = await sb().from("contributors").insert(row);
        if (error) throw error;
      } else {
        delete row.id;
        const { error } = await sb().from("contributors").update(row).eq("id", uid());
        if (error) throw error;
      }
      // Re-read through my_profile() — returning=representation would trip the
      // column privacy grants, and the fresh row has all our own fields anyway.
      profile = await window.Community.myProfile(uid());
      const nowApproved = profile.status === "approved" || profile.status == null;
      setStatus("pfStatus", nowApproved ? "Saved ✓ Your profile is live."
        : "Application received ✓ An approved member of the Piano Technology Library community will review your request — you'll get an approval email or a request for more information shortly.");
      if (wasNew && !nowApproved) {
        const orgsTxt = [...document.querySelectorAll(".pfOrg:checked")].map((c) => c.value).join(", ") || "none";
        const certsTxt = [...document.querySelectorAll(".pfCert:checked")].map((c) => c.value).join(", ") || "none";
        notifyLibrarians(`NEW CONTRIBUTOR APPLICATION: ${name} · Member of: ${orgsTxt} · Certs: ${certsTxt} · ${$("pfYears").value || "?"} yrs` +
          (($("pfCreds").value.trim()) ? ` · ${$("pfCreds").value.trim().slice(0, 120)}` : ""));
      }
      if (window.Activity) window.Activity.log(wasNew ? "profile_created" : "profile_updated", (profile.name || name) + " (@" + profile.slug + ")");
      fillProfileForm(window.Auth.user());
      const ap = profile.status === "approved" || profile.status == null;
      $("dashUpload").hidden = !ap;
      $("dashBulk").hidden = !ap;
      $("dashPending").hidden = ap;
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
      const tags = [...new Set([
        ...[...document.querySelectorAll(".upTag:checked")].map((c) => c.value),
        ...$("upTagsExtra").value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      ])];
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
        tags,
        distribution: document.querySelector('input[name="upDist"]:checked')?.value || "download",
      };
      if (newVersionOf) {
        row.version = (newVersionOf.version || 1) + 1;
        row.replaces = newVersionOf.id;
        row.replace_action = document.querySelector('input[name="verAction"]:checked').value;
      }
      let { error } = await sb().from("submissions").insert(row);
      if (error && /tags|distribution/i.test(error.message || "")) {
        // tag/distribution columns not migrated yet — submit without them
        delete row.tags; delete row.distribution;
        ({ error } = await sb().from("submissions").insert(row));
      }
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
    $("mineList").querySelectorAll("[data-edit]").forEach((b) =>
      b.onclick = () => openEdit((data || []).find((s) => String(s.id) === String(b.dataset.edit))));
  }

  // ---- edit an existing item ---------------------------------------------------
  // Title, description, tags, video, pricing, license, distribution — the files
  // themselves are replaced through the "upload new version" flow instead.
  let editingId = null;
  function editEl() {
    let el = document.getElementById("itemEdit");
    if (el) return el;
    el = document.createElement("div");
    el.id = "itemEdit";
    el.className = "modal-backdrop";
    el.hidden = true;
    el.innerHTML = `
      <div class="modal ie-modal">
        <button class="modal-close" id="ieClose" aria-label="Close">×</button>
        <div class="modal-head"><div class="mono mh-id">EDIT ITEM</div><h3 id="ieHeading"></h3></div>
        <div class="dash-fields ie-fields">
          <label>Title<input id="ieTitle" type="text"></label>
          <label>Maker / brand <span class="opt">(optional)</span><input id="ieMaker" type="text"></label>
          <label>Description<textarea id="ieDesc" rows="3"></textarea></label>
          <label>Video link <span class="opt">(optional — a YouTube how-to or demo)</span><input id="ieYoutube" type="url" placeholder="https://youtube.com/watch?v=…"></label>
          <div class="tag-block">
            <div class="pc-lab">Search tags</div>
            <div class="tag-grid" id="ieTagGrid"></div>
            <label>Extra tags <span class="opt">(comma-separated)</span><input id="ieTagsExtra" type="text"></label>
          </div>
          <div class="dash-row">
            <label>Pricing<select id="iePricing">
              <option value="free">Free</option>
              <option value="tip">Free + tip jar</option>
              <option value="pwyw">Pay what you want</option>
              <option value="paid">Set a price</option>
            </select></label>
            <label>Price (USD) <span class="opt">(if priced)</span><input id="iePrice" type="number" min="0" step="1"></label>
          </div>
          <div class="dash-row">
            <label>License<select id="ieLicense">
              <option value="personal">Personal / professional use — no redistribution</option>
              <option value="commercial">Commercial use OK</option>
              <option value="noresale">Use freely, but no reselling the file</option>
              <option value="cc0">Public domain (CC0) — do anything</option>
              <option value="">Not specified</option>
            </select></label>
            <label>Availability<select id="ieDist">
              <option value="download">Download</option>
              <option value="print-only">Print &amp; ship only (no download)</option>
            </select></label>
          </div>
          <div class="dash-actions">
            <button class="au-btn primary" id="ieSave">SAVE CHANGES</button>
            <span id="ieStatus" class="dash-status"></span>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector("#ieTagGrid").innerHTML =
      document.querySelector("#dashUpload .tag-grid").innerHTML.replaceAll('class="upTag"', 'class="ieTag"');
    const close = () => { el.hidden = true; };
    el.querySelector("#ieClose").onclick = close;
    el.addEventListener("click", (e) => { if (e.target === el) close(); });
    el.querySelector("#ieSave").onclick = saveEdit;
    return el;
  }

  const CURATED_TAGS = () => [...document.querySelectorAll("#dashUpload .upTag")].map((c) => c.value);
  function openEdit(s) {
    if (!s) return;
    const el = editEl();
    editingId = s.id;
    el.querySelector("#ieHeading").textContent = s.title;
    $("ieTitle").value = s.title || "";
    $("ieMaker").value = s.maker || "";
    $("ieDesc").value = s.description || "";
    $("ieYoutube").value = s.youtube ? `https://www.youtube.com/watch?v=${s.youtube}` : "";
    const tags = Array.isArray(s.tags) ? s.tags : [];
    const curated = CURATED_TAGS();
    el.querySelectorAll(".ieTag").forEach((c) => c.checked = tags.includes(c.value));
    $("ieTagsExtra").value = tags.filter((t) => !curated.includes(t)).join(", ");
    $("iePricing").value = ["free", "tip", "pwyw", "paid"].includes(s.pricing) ? s.pricing : "free";
    $("iePrice").value = s.price ?? "";
    $("ieLicense").value = s.license || "";
    $("ieDist").value = s.distribution === "print-only" ? "print-only" : "download";
    $("ieStatus").textContent = "";
    el.hidden = false;
  }

  async function saveEdit() {
    const title = $("ieTitle").value.trim();
    if (!title) return setStatus("ieStatus", "The item needs a title.", true);
    const pricing = $("iePricing").value;
    const priceVal = parseFloat($("iePrice").value);
    const tags = [...new Set([
      ...[...document.querySelectorAll(".ieTag:checked")].map((c) => c.value),
      ...$("ieTagsExtra").value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    ])];
    const patch = {
      title,
      maker: $("ieMaker").value.trim() || null,
      description: $("ieDesc").value.trim() || null,
      youtube: normalizeYoutube($("ieYoutube").value.trim()) || null,
      pricing,
      price: (pricing === "paid" || pricing === "pwyw") && priceVal > 0 ? priceVal : null,
      license: $("ieLicense").value || null,
      tags,
      distribution: $("ieDist").value,
    };
    setStatus("ieStatus", "Saving…");
    let { error } = await sb().from("submissions").update(patch).eq("id", editingId);
    if (error && /tags|distribution/i.test(error.message || "")) {
      delete patch.tags; delete patch.distribution;
      ({ error } = await sb().from("submissions").update(patch).eq("id", editingId));
    }
    if (error) return setStatus("ieStatus", "Save failed: " + error.message, true);
    setStatus("ieStatus", "Saved ✓ Changes are live in the catalog.");
    if (window.Activity) window.Activity.log("submission", `edited: ${title}`);
    loadMine();
    setTimeout(() => { const el = document.getElementById("itemEdit"); if (el) el.hidden = true; }, 900);
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
      : `<span class="sub-actions"><span class="sub-status s-${esc(s.status)}">${STATUS_LABEL[s.status] || esc(s.status)}</span><button class="au-btn" data-edit="${s.id}">✎ EDIT</button>${
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

  // ---- Bulk upload -----------------------------------------------------------------
  // Groups selected files by basename (flange.step + flange.stl -> one item),
  // uploads every file to storage, and inserts one submission per group with
  // the shared defaults. Progress bar tracks per-file uploads.
  function bulkGroups() {
    const groups = {};
    for (const f of $("bkFiles").files) {
      const base = f.name.replace(/\.[^.]+$/, "");
      (groups[base] = groups[base] || []).push(f);
    }
    return groups;
  }
  function prettyTitle(base) {
    return base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  $("bkFiles").addEventListener("change", () => {
    const groups = bulkGroups();
    const names = Object.keys(groups);
    $("bkPreview").hidden = !names.length;
    $("bkPreview").innerHTML = names.length
      ? `<b>${names.length} item${names.length === 1 ? "" : "s"}</b> from ${$("bkFiles").files.length} files:<br>` +
        names.map((n) => `• ${prettyTitle(n)} <span>(${groups[n].map((f) => f.name.split(".").pop().toUpperCase()).join(", ")})</span>`).join("<br>")
      : "";
  });
  $("bkSubmit").onclick = async () => {
    const groups = bulkGroups();
    const names = Object.keys(groups);
    if (!names.length) return setStatus("bkStatus", "Pick some files first.", true);
    const pricing = $("bkPricing").value;
    const priceVal = parseFloat($("bkPrice").value);
    if ((pricing === "paid") && !(priceVal > 0)) return setStatus("bkStatus", "Enter a price, or switch pricing to Free.", true);
    const totalFiles = $("bkFiles").files.length;
    let doneFiles = 0, ok = 0, failed = [];
    $("bkBarWrap").hidden = false; $("bkFill").style.width = "0%";
    $("bkSubmit").disabled = true;
    for (const base of names) {
      try {
        const files = {};
        for (const f of groups[base]) {
          const ext = (f.name.split(".").pop() || "file").toLowerCase().replace("stp", "step");
          const path = `${uid()}/${Date.now()}-${slugify(base)}.${ext}`;
          setStatus("bkStatus", `Uploading ${prettyTitle(base)} (${++doneFiles}/${totalFiles})…`);
          const { error } = await sb().storage.from("contributions").upload(path, f);
          if (error) throw error;
          files[ext] = sb().storage.from("contributions").getPublicUrl(path).data.publicUrl;
          $("bkFill").style.width = Math.round((doneFiles / totalFiles) * 100) + "%";
        }
        const bkTags = [...new Set([
          ...[...document.querySelectorAll(".bkTag:checked")].map((c) => c.value),
          ...($("bkTagsExtra").value || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
        ])];
        const bkRow = {
          contributor_id: uid(), title: prettyTitle(base),
          category: $("bkCat").value, maker: $("bkMaker").value.trim() || null,
          description: null, files,
          pricing, price: (pricing === "paid" || pricing === "pwyw") && priceVal > 0 ? priceVal : null,
          license: $("bkLicense").value || null,
          tags: bkTags,
        };
        let { error } = await sb().from("submissions").insert(bkRow);
        if (error && /tags/i.test(error.message || "")) {
          delete bkRow.tags;
          ({ error } = await sb().from("submissions").insert(bkRow));
        }
        if (error) throw error;
        ok++;
      } catch (err) { failed.push(prettyTitle(base) + " (" + err.message + ")"); }
    }
    $("bkSubmit").disabled = false;
    $("bkFill").style.width = "100%";
    if (ok) {
      notifyLibrarians(`Bulk upload: ${ok} item${ok === 1 ? "" : "s"}`);
      if (window.Activity) window.Activity.log("submission", `bulk: ${ok} items`);
    }
    setStatus("bkStatus", failed.length
      ? `${ok} submitted ✓ — ${failed.length} failed: ${failed.join("; ")}`
      : `All ${ok} item${ok === 1 ? "" : "s"} submitted ✓ The librarians will review them shortly.`, !!failed.length);
    if (ok) { $("bkFiles").value = ""; $("bkPreview").hidden = true; loadMine(); }
  };

  // ---- Contributor applications (admins only) --------------------------------------
  let appsById = {};
  async function loadApps() {
    $("dashApps").hidden = false;
    // Application PII (email, credentials) comes through the admin-only
    // security-definer function; direct select is the pre-migration fallback.
    let { data, error } = await sb().rpc("admin_pending_applications");
    if (error) ({ data, error } = await sb().from("contributors")
      .select("id, name, slug, credentials_note, website, created_at, status, memberships, certifications, years_experience, email")
      .eq("status", "pending").order("created_at"));
    if (error) { $("appsList").innerHTML = `<div class="cm-empty">${esc(error.message)}</div>`; return; }
    data = (data || []).filter((c) => c.status === "pending");
    appsById = {};
    data.forEach((c) => { appsById[c.id] = c; });
    $("appsList").innerHTML = (data || []).length ? data.map((c) => `
      <div class="sub-row">
        <div class="sub-main">
          <b>${esc(c.name)}</b>
          <span class="mono sub-meta">APPLIED ${esc((c.created_at || "").slice(0, 10))}${c.website ? " · " + esc(c.website) : ""}</span>
          <span class="sub-links">Member of: ${(c.memberships || []).join(", ") || "—"} · Certs: ${(c.certifications || []).join(", ") || "—"} · ${c.years_experience != null ? c.years_experience + " yrs" : "yrs ?"}${c.credentials_note ? " · " + esc(c.credentials_note) : ""}</span>
        </div>
        <span class="sub-actions">
          <button class="au-btn primary" data-appok="${c.id}">✓ APPROVE</button>
          <button class="au-btn" data-appno="${c.id}">DECLINE</button>
        </span>
      </div>`).join("") : `<div class="cm-empty">No applications waiting — new contributors will appear here.</div>`;
    $("appsList").querySelectorAll("[data-appok]").forEach((b) => b.onclick = () => decideApp(b.dataset.appok, "approved"));
    $("appsList").querySelectorAll("[data-appno]").forEach((b) => b.onclick = () => decideApp(b.dataset.appno, "declined"));
  }
  async function decideApp(id, status) {
    const row = appsById[id] || {};
    const { error } = await sb().from("contributors")
      .update({ status, verified_at: status === "approved" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) { alert("Update failed: " + error.message); return; }
    if (window.Activity) window.Activity.log(status === "approved" ? "contributor_approved" : "contributor_declined", id);
    // Open a prefilled email so the applicant hears back (sent from the admin's own mail).
    if (row && row.email) {
      const first = (row.name || "").split(" ")[0];
      const mail = status === "approved"
        ? `mailto:${row.email}?subject=${encodeURIComponent("You're approved — Piano Technology Library")}&body=${encodeURIComponent(`Hi ${first},\n\nYour contributor request at pianotechnologylibrary.com is approved — uploads are now open on your dashboard:\nhttps://pianotechnologylibrary.com/profile\n\nWelcome, and thanks for helping the craft.\n\n— Piano Technology Library`)}`
        : `mailto:${row.email}?subject=${encodeURIComponent("Your Piano Technology Library contributor request")}&body=${encodeURIComponent(`Hi ${first},\n\nThanks for your contributor request at pianotechnologylibrary.com. Before we can approve it, could you share a bit more about your professional background — association memberships, certifications, your shop or website?\n\nJust reply to this email.\n\n— Piano Technology Library`)}`;
      window.open(mail, "_blank");
    }
    loadApps();
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

Browse everything, download files, and preview parts in 3D:
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
        ${r.screenshot && /^data:image\//.test(r.screenshot) ? `<span class="beta-shot"><a href="${r.screenshot}" target="_blank" rel="noopener"><img src="${r.screenshot}" alt="Screenshot" title="Open full size"></a></span>` : ""}
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
