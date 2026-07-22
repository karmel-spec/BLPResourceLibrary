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
  const STATUS_LABEL = { pending: "IN REVIEW", approved: "PUBLISHED", rejected: "NOT PUBLISHED" };

  let profile = null; // my contributor row

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
    if (window.Auth.isAdmin()) { $("dashAdmin").hidden = false; loadQueue(); }
  });
  $("dashSignIn").onclick = () => window.Auth.signIn();

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
    setStatus("pfStatus", "Saving…");
    const links = $("pfLinks").value.split("\n").map((l) => l.trim()).filter(Boolean)
      .map((l) => { const i = l.indexOf(" ");
        return i < 0 ? { label: "LINK", url: l }
                     : { label: l.slice(0, i).toUpperCase(), url: l.slice(i + 1).trim() }; })
      .filter((l) => /^https?:\/\//.test(l.url));
    const row = {
      id: uid(),
      name,
      credential: $("pfCred").value.trim() || null,
      location: $("pfLoc").value.trim() || null,
      website: $("pfSite").value.trim() || null,
      bio: $("pfBio").value.trim() || null,
      links,
    };
    if (photoUrl) row.photo_url = photoUrl;
    else if (!profile) row.photo_url = window.Auth.user().avatar || null;
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
      const { error } = await sb().from("submissions").insert({
        contributor_id: uid(),
        title,
        category: $("upCat").value,
        maker: $("upMaker").value.trim() || null,
        description: $("upDesc").value.trim() || null,
        files, thumb_url, youtube: youtube || null,
      });
      if (error) throw error;
      setStatus("upStatus", "Submitted ✓ The librarians will review it shortly.");
      ["upTitle", "upMaker", "upDesc", "upYoutube"].forEach((id) => $(id).value = "");
      fileInput.value = ""; $("upThumb").value = "";
      loadMine();
    } catch (err) { setStatus("upStatus", "Upload failed: " + err.message, true); }
  };

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
  }

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
    const { error } = await sb().from("submissions")
      .update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
    if (error) alert("Update failed: " + error.message);
    loadQueue(); loadMine();
  }

  function subRow(s, admin) {
    const links = Object.entries(s.files || {})
      .map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(k.toUpperCase())}</a>`).join(" ");
    const who = admin && s.contributors ? `<span class="sub-who">by ${esc(s.contributors.name)}</span>` : "";
    const actions = admin
      ? `<span class="sub-actions"><button class="au-btn primary" data-approve="${s.id}">APPROVE</button>
         <button class="au-btn" data-reject="${s.id}">REJECT</button></span>`
      : `<span class="sub-status s-${esc(s.status)}">${STATUS_LABEL[s.status] || esc(s.status)}</span>`;
    return `<div class="sub-row">
      ${s.thumb_url ? `<img class="sub-thumb" src="${esc(s.thumb_url)}" alt="">` : `<span class="sub-thumb none"></span>`}
      <div class="sub-main">
        <b>${esc(s.title)}</b>
        <span class="mono sub-meta">${CAT_LABEL[s.category] || "ITEM"}${s.maker ? " · " + esc(s.maker) : ""}${who ? " · " : ""}${who}</span>
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
})();
