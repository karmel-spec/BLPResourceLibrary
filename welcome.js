// ============================================================================
// Welcome intake card + role-based view gating + verified-tech nav injection.
//
// First sign-in: a member intake card asks how the new member is tied to the
// piano technician community. Piano professionals (working tech, tech in
// training, shop/parts maker) keep the contributor features; everyone else
// gets a reader view — no contributor offers or "become a contributor"
// anywhere. The role lives in auth user_metadata (ptl_role) with a
// localStorage cache so the gate applies without waiting on the session.
//
// Also injects the TECH CHAT nav link — approved contributors and admins
// only; nobody else sees that the room exists.
// ============================================================================
(function () {
  const QUALIFIED = ["tech", "training", "shop"];
  const CACHE = "ptl_role";
  const CHAT_OK = "ptl_chat_ok";

  const cacheGet = () => { try { return localStorage.getItem(CACHE) || ""; } catch (e) { return ""; } };
  const cacheSet = (v) => { try { localStorage.setItem(CACHE, v); } catch (e) {} };

  // ---- role storage ----------------------------------------------------------
  async function metaRole() {
    if (!window.__supabase) return cacheGet();      // demo mode: cache only
    try {
      const { data } = await window.__supabase.auth.getSession();
      const m = (data && data.session && data.session.user.user_metadata) || null;
      if (!m) return cacheGet();
      if (m.ptl_role) cacheSet(m.ptl_role);
      return m.ptl_role || "";
    } catch (e) { return cacheGet(); }
  }

  async function saveRole(role) {
    cacheSet(role);
    if (window.__supabase) {
      try { await window.__supabase.auth.updateUser({ data: { ptl_role: role, ptl_onboarded: true } }); }
      catch (e) { console.error("welcome: role save failed", e); }
    }
    if (window.Activity) window.Activity.log("welcome_role", role);
    applyGate(role);
  }

  const isConsumerRole = (r) => !!r && !QUALIFIED.includes(r);

  // ---- the view gate ----------------------------------------------------------
  function applyGate(role) {
    const consumer = isConsumerRole(role) && !(window.Auth && window.Auth.isAdmin());
    document.body.classList.toggle("ptl-consumer", consumer);
    if (consumer) tidyConsumerView();
  }

  // CSS hides the blocks; loose "Contribute" footer links also drag a stray
  // "·" separator with them, so those are removed for real.
  function tidyConsumerView() {
    document.querySelectorAll('footer a[href*="profile.html"]').forEach((a) => {
      const prev = a.previousSibling;
      if (prev && prev.nodeType === 3) prev.textContent = prev.textContent.replace(/·\s*$/, " ");
      a.remove();
    });
    document.querySelectorAll(".au-user").forEach((a) => {
      a.href = "index.html#library";
      a.title = "";
    });
  }

  // ---- intake card -------------------------------------------------------------
  const ROLES = [
    { key: "tech",     ic: "🔧", label: "I'm a working piano technician", sub: "Tuning, repair, regulation, rebuilding — professionally" },
    { key: "training", ic: "📐", label: "I'm training to become a technician", sub: "Apprentice, student, or school program" },
    { key: "shop",     ic: "🏭", label: "I run a piano shop or make parts for the trade", sub: "Rebuilding business, dealer workshop, manufacturing" },
    { key: "teacher",  ic: "🎹", label: "I'm a piano teacher or musician", sub: "The playing side of the piano world" },
    { key: "owner",    ic: "🏠", label: "I own a piano", sub: "Enthusiast, caretaker, curious about the craft" },
    { key: "browsing", ic: "🔍", label: "Just exploring", sub: "Looking around — and welcome" },
  ];

  function modalEl() {
    let el = document.getElementById("welcomeCard");
    if (el) return el;
    el = document.createElement("div");
    el.id = "welcomeCard";
    el.className = "modal-backdrop wc-backdrop";
    el.hidden = true;
    el.innerHTML = `
      <div class="modal wc-modal">
        <div class="wc-head mono">MEMBER INTAKE CARD · ONE QUESTION</div>
        <h3 id="wcTitle">Welcome to the library</h3>
        <p class="wc-copy">So we can set up the right view for you — how are you tied
        to the piano technician community?</p>
        <div class="wc-opts" id="wcOpts">
          ${ROLES.map((r) => `
            <label class="wc-opt">
              <input type="radio" name="wcRole" value="${r.key}">
              <span class="wc-ic">${r.ic}</span>
              <span class="wc-txt"><b>${r.label}</b><small>${r.sub}</small></span>
            </label>`).join("")}
        </div>
        <button class="au-btn primary block" id="wcSave" disabled>SET UP MY LIBRARY</button>
        <div class="wc-done" id="wcDone" hidden></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener("change", () => {
      document.getElementById("wcSave").disabled = !el.querySelector("input[name=wcRole]:checked");
    });
    document.getElementById("wcSave").onclick = async () => {
      const pick = el.querySelector("input[name=wcRole]:checked");
      if (!pick) return;
      const btn = document.getElementById("wcSave");
      btn.disabled = true; btn.textContent = "SETTING UP…";
      await saveRole(pick.value);
      const done = document.getElementById("wcDone");
      document.getElementById("wcOpts").hidden = true;
      btn.hidden = true;
      if (QUALIFIED.includes(pick.value)) {
        done.innerHTML = `<p><b>Welcome, colleague.</b> The whole reading room is yours —
          and the <b>CONTRIBUTE</b> tab is your workbench: share your parts and know-how,
          apply for a verified contributor profile, even opt into the print partner network.</p>
          <div class="wc-actions"><a class="au-btn primary" href="profile.html">OPEN MY WORKBENCH</a>
          <button class="ag-later" id="wcClose1">Browse the library first</button></div>`;
      } else {
        done.innerHTML = `<p><b>Welcome in.</b> Browse the catalog, download files, watch
          the training library, rate what you use, and post part requests — it's all yours.</p>
          <div class="wc-actions"><button class="au-btn primary" id="wcClose2">START BROWSING</button></div>`;
      }
      done.hidden = false;
      const close = () => { el.hidden = true; };
      const c1 = document.getElementById("wcClose1"); if (c1) c1.onclick = close;
      const c2 = document.getElementById("wcClose2"); if (c2) c2.onclick = close;
    };
    return el;
  }

  function showCard() {
    const el = modalEl();
    // Reset to the question state on re-open (the "update my connection" path).
    el.querySelector("#wcOpts").hidden = false;
    const btn = el.querySelector("#wcSave");
    btn.hidden = false; btn.textContent = "SET UP MY LIBRARY";
    btn.disabled = !el.querySelector("input[name=wcRole]:checked");
    el.querySelector("#wcDone").hidden = true;
    const u = window.Auth && window.Auth.user();
    if (u && u.name) el.querySelector("#wcTitle").textContent =
      `Welcome to the library, ${String(u.name).split(" ")[0]}`;
    el.hidden = false;
  }

  // ---- verified-only chat link --------------------------------------------------
  function addChatNavLink() {
    const nav = document.getElementById("nav");
    if (!nav || nav.querySelector(".nav-chat")) return;
    const a = document.createElement("a");
    a.className = "nav-chat";
    a.href = "chat.html";
    a.textContent = "TECH CHAT";
    if (/chat(\.html)?$/.test(location.pathname)) a.classList.add("on");
    nav.insertBefore(a, nav.querySelector(".nav-beta") || nav.querySelector(".cta"));
  }

  async function chatAllowed(user) {
    if (!user) return false;
    if (window.Auth.isAdmin()) return true;
    try {
      const ok = sessionStorage.getItem(CHAT_OK);
      if (ok === "1") return true;
      if (ok === "0") return false;
    } catch (e) {}
    let allowed = false;
    if (window.__supabase) {
      const { data } = await window.__supabase.from("contributors")
        .select("status").eq("id", user.id).maybeSingle();
      allowed = !!(data && (data.status === "approved" || data.status == null));
    }
    try { sessionStorage.setItem(CHAT_OK, allowed ? "1" : "0"); } catch (e) {}
    return allowed;
  }
  window.Welcome = {
    show: showCard,
    role: metaRole,
    isConsumer: async () => isConsumerRole(await metaRole()),
    chatAllowed,
  };

  // ---- boot ----------------------------------------------------------------------
  if (window.Auth) window.Auth.onChange(async (user) => {
    if (!user) { document.body.classList.remove("ptl-consumer"); return; }
    const role = await metaRole();
    applyGate(role);
    if (!role) showCard();
    if (await chatAllowed(user)) addChatNavLink();
  });
})();
