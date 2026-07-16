// ============================================================================
// Auth — Google sign-in via Supabase, with a local DEMO fallback.
// Exposes window.Auth: { user(), isAdmin(), signIn(), signOut(), onChange(fn),
//                         ready (bool: true = real Supabase, false = demo) }
// ============================================================================
(function () {
  let supabase = null;
  let currentUser = null;              // { name, email, avatar }
  const listeners = [];

  const DEMO_USER_KEY = "ptl_demo_user";
  const notify = () => listeners.forEach((fn) => fn(currentUser));

  function isAdmin() {
    return !!currentUser && currentUser.email &&
           currentUser.email.toLowerCase() === CONFIG.ADMIN_EMAIL.toLowerCase();
  }

  // ---- Real Supabase mode ---------------------------------------------------
  async function initSupabase() {
    const { createClient } = await import(
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
    );
    supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    window.__supabase = supabase; // used by comments.js

    const { data } = await supabase.auth.getSession();
    setFromSession(data.session);

    supabase.auth.onAuthStateChange((_e, session) => setFromSession(session));
  }

  function setFromSession(session) {
    if (session && session.user) {
      const u = session.user;
      currentUser = {
        id: u.id,
        name: u.user_metadata.full_name || u.user_metadata.name || u.email,
        email: u.email,
        avatar: u.user_metadata.avatar_url || u.user_metadata.picture || "",
      };
    } else {
      currentUser = null;
    }
    notify();
  }

  // ---- Demo mode (no backend) ----------------------------------------------
  function initDemo() {
    try {
      const saved = localStorage.getItem(DEMO_USER_KEY);
      if (saved) currentUser = JSON.parse(saved);
    } catch (e) { /* ignore */ }
    notify();
  }

  function demoSignIn() {
    const email = (prompt(
      "DEMO SIGN-IN (local only)\n\nEnter an email to sign in with. " +
      "Use the admin email to preview owner-only features:\n" +
      CONFIG.ADMIN_EMAIL, ""
    ) || "").trim();
    if (!email) return;
    const name = (prompt("Display name?", email.split("@")[0]) || email.split("@")[0]).trim();
    currentUser = {
      id: "demo-" + email.toLowerCase(),
      name, email,
      avatar: "https://ui-avatars.com/api/?background=9e2020&color=fff&name=" +
              encodeURIComponent(name),
    };
    try { localStorage.setItem(DEMO_USER_KEY, JSON.stringify(currentUser)); } catch (e) {}
    notify();
  }

  function demoSignOut() {
    currentUser = null;
    try { localStorage.removeItem(DEMO_USER_KEY); } catch (e) {}
    notify();
  }

  // ---- Public API -----------------------------------------------------------
  window.Auth = {
    ready: SUPABASE_READY,
    user: () => currentUser,
    isAdmin,
    onChange: (fn) => { listeners.push(fn); if (currentUser !== undefined) fn(currentUser); },
    signIn: async () => {
      if (SUPABASE_READY) {
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.href },
        });
      } else {
        demoSignIn();
      }
    },
    signOut: async () => {
      if (SUPABASE_READY) await supabase.auth.signOut();
      else demoSignOut();
    },
  };

  // ---- Header auth widget ----------------------------------------------------
  function renderAuthSlot(user) {
    const slot = document.getElementById("authSlot");
    if (!slot) return;
    if (user) {
      slot.innerHTML =
        `<span class="au-user"><img src="${user.avatar || ""}" alt="" onerror="this.style.display='none'">` +
        `<span class="au-name">${user.name}</span></span>` +
        `<button class="au-btn" id="authSignOut">SIGN OUT</button>`;
      document.getElementById("authSignOut").onclick = () => window.Auth.signOut();
    } else {
      // Signed out: keep the nav clean — sign-in is offered contextually via
      // the auth gate the first time the visitor takes an action.
      slot.innerHTML = SUPABASE_READY ? "" :
        `<span class="au-demo" title="Add Supabase keys to enable real Google login">DEMO</span>`;
    }
  }
  window.Auth.onChange(renderAuthSlot);

  // ---- Auth gate: sign-in popup on first action ------------------------------
  // Browsing is always free. The first time a visitor tries to DO something —
  // download a file, open a model in Fusion, watch a video, leave feedback —
  // we ask them to sign in so contributions and downloads have a name on them.
  function gateEl() {
    let el = document.getElementById("authGate");
    if (el) return el;
    el = document.createElement("div");
    el.id = "authGate";
    el.className = "modal-backdrop authgate";
    el.hidden = true;
    el.innerHTML = `
      <div class="modal ag-modal">
        <button class="modal-close" id="agClose" aria-label="Close">×</button>
        <div class="ag-head mono">MEMBER CHECK-IN</div>
        <h3 id="agTitle">Sign in to continue</h3>
        <p class="ag-copy">The library is free, forever. We ask for a quick sign-in
        before <b id="agAction">downloads</b> so shared knowledge carries a name —
        the same reason every card credits its contributor.</p>
        <button class="au-btn primary block" id="agSignIn">${SUPABASE_READY ? "SIGN IN WITH GOOGLE" : "SIGN IN (DEMO)"}</button>
        <button class="ag-later" id="agLater">Keep browsing instead</button>
      </div>`;
    document.body.appendChild(el);
    const close = () => { el.hidden = true; };
    el.querySelector("#agClose").onclick = close;
    el.querySelector("#agLater").onclick = close;
    el.addEventListener("click", (e) => { if (e.target === el) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.hidden) close(); });
    el.querySelector("#agSignIn").onclick = async () => { await window.Auth.signIn(); };
    return el;
  }

  function showGate(actionLabel) {
    const el = gateEl();
    el.querySelector("#agAction").textContent = actionLabel;
    el.hidden = false;
  }
  window.Auth.showGate = showGate;

  // Close the gate automatically once signed in (demo mode signs in in-place;
  // OAuth mode returns via redirect where user() is already set).
  window.Auth.onChange((u) => { const el = document.getElementById("authGate"); if (u && el) el.hidden = true; });

  // Intercept first actions while signed out (capture phase beats other handlers).
  document.addEventListener("click", (e) => {
    if (window.Auth.user()) return;
    const dl = e.target.closest(".dl a");
    const fb = e.target.closest(".feedback-btn");
    if (!dl && !fb) return;
    e.preventDefault();
    e.stopPropagation();
    showGate(fb ? "leaving feedback" :
      dl.classList.contains("r") && dl.textContent.includes("WATCH") ? "watching videos" :
      dl.classList.contains("r") ? "opening models" : "downloads");
  }, true);

  // ---- Boot -----------------------------------------------------------------
  if (SUPABASE_READY) {
    initSupabase().catch((e) => {
      console.error("Supabase init failed, falling back to demo:", e);
      window.Auth.ready = false;
      initDemo();
    });
  } else {
    initDemo();
  }
})();
