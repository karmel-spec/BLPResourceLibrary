// ============================================================================
// Comments / feedback — per-resource threads.
// Real mode: Supabase table `comments`. Demo mode: localStorage (local only).
// Exposes window.Comments: { open(id,title), count(id), refreshBadges() }
// ============================================================================
(function () {
  const DEMO_KEY = "ptl_comments";
  let cache = {};          // { resourceId: [ {id,resource_id,user_name,user_avatar,body,created_at,user_email} ] }
  let openId = null, openTitle = "";

  const sb = () => window.__supabase;

  function fmt(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  // ---- Load -----------------------------------------------------------------
  async function loadAll() {
    cache = {};
    if (window.Auth && window.Auth.ready && sb()) {
      const { data, error } = await sb().from("comments").select("*").order("created_at", { ascending: true });
      if (!error && data) data.forEach((c) => (cache[c.resource_id] ||= []).push(c));
    } else {
      try { cache = JSON.parse(localStorage.getItem(DEMO_KEY)) || {}; } catch (e) { cache = {}; }
    }
    refreshBadges();
    if (openId) renderModal();
  }

  function saveDemo() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(cache)); } catch (e) {} }

  // ---- Mutations ------------------------------------------------------------
  async function post(resourceId, body) {
    const u = window.Auth.user();
    if (!u || !body.trim()) return;
    if (window.Auth.ready && sb()) {
      const { error } = await sb().from("comments").insert({
        resource_id: resourceId, body: body.trim(),
        user_name: u.name, user_avatar: u.avatar, user_email: u.email,
      });
      if (error) { alert("Could not post: " + error.message); return; }
      await loadAll();
    } else {
      (cache[resourceId] ||= []).push({
        id: "d" + Date.now(), resource_id: resourceId, body: body.trim(),
        user_name: u.name, user_avatar: u.avatar, user_email: u.email,
        created_at: new Date().toISOString(),
      });
      saveDemo(); refreshBadges(); renderModal();
    }
  }

  async function remove(comment) {
    if (window.Auth.ready && sb()) {
      const { error } = await sb().from("comments").delete().eq("id", comment.id);
      if (error) { alert("Could not delete: " + error.message); return; }
      await loadAll();
    } else {
      const arr = cache[comment.resource_id] || [];
      cache[comment.resource_id] = arr.filter((c) => c.id !== comment.id);
      saveDemo(); refreshBadges(); renderModal();
    }
  }

  // ---- Badges on cards ------------------------------------------------------
  function count(id) { return (cache[id] || []).length; }
  function refreshBadges() {
    document.querySelectorAll(".feedback-btn").forEach((b) => {
      const n = count(b.dataset.id);
      const span = b.querySelector(".fb-n");
      if (span) span.textContent = n ? `(${n})` : "";
    });
  }

  // ---- Modal ----------------------------------------------------------------
  const modal = () => document.getElementById("commentModal");
  function open(id, title) { openId = id; openTitle = title; renderModal(); modal().hidden = false; document.body.style.overflow = "hidden"; }
  function close() { modal().hidden = true; openId = null; document.body.style.overflow = ""; }

  function renderModal() {
    if (!openId) return;
    document.getElementById("cmId").textContent = openId;
    document.getElementById("cmTitle").textContent = openTitle;
    const list = document.getElementById("cmList");
    const items = cache[openId] || [];
    const u = window.Auth.user();
    list.innerHTML = items.length
      ? items.map((c) => {
          const canDel = u && (u.email === c.user_email || window.Auth.isAdmin());
          return `<div class="cm-item">
            <img class="cm-av" src="${c.user_avatar || ""}" alt="" onerror="this.style.visibility='hidden'">
            <div class="cm-body">
              <div class="cm-meta"><b>${esc(c.user_name)}</b><span>${fmt(c.created_at)}</span>
                ${canDel ? `<button class="cm-del" data-del="${c.id}">delete</button>` : ""}</div>
              <p>${esc(c.body)}</p>
            </div></div>`;
        }).join("")
      : `<div class="cm-empty">No feedback yet — be the first to share notes, tips, or a question about this item.</div>`;

    list.querySelectorAll(".cm-del").forEach((btn) => {
      btn.onclick = () => {
        const c = (cache[openId] || []).find((x) => String(x.id) === btn.dataset.del);
        if (c && confirm("Delete this comment?")) remove(c);
      };
    });

    const form = document.getElementById("cmForm");
    if (u) {
      form.innerHTML = `<textarea id="cmText" rows="3" placeholder="Share feedback, a tip, or a question…"></textarea>
        <div class="cm-actions"><span class="cm-as">Commenting as <b>${esc(u.name)}</b></span>
        <button class="au-btn primary" id="cmSubmit">POST FEEDBACK</button></div>`;
      document.getElementById("cmSubmit").onclick = () => {
        const t = document.getElementById("cmText");
        if (t.value.trim()) post(openId, t.value);
        t.value = "";
      };
    } else {
      const label = window.Auth.ready ? "Sign in with Google to leave feedback" : "Sign in to leave feedback";
      form.innerHTML = `<button class="au-btn primary block" id="cmSignIn">${label}</button>`;
      document.getElementById("cmSignIn").onclick = () => window.Auth.signIn();
    }
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // ---- Wiring ---------------------------------------------------------------
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".feedback-btn");
    if (btn) { e.preventDefault(); open(btn.dataset.id, btn.dataset.title || btn.dataset.id); }
    if (e.target.id === "modalClose" || e.target.id === "commentModal") close();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal().hidden) close(); });

  window.Comments = { open, count, refreshBadges, reload: loadAll };

  // Reload when auth changes (so the form + delete buttons update).
  if (window.Auth) window.Auth.onChange(() => { refreshBadges(); if (openId) renderModal(); });
  loadAll();
})();
