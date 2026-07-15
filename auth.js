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
      const label = SUPABASE_READY ? "SIGN IN WITH GOOGLE" : "SIGN IN";
      slot.innerHTML = `<button class="au-btn primary" id="authSignIn">${label}</button>` +
        (SUPABASE_READY ? "" : `<span class="au-demo" title="Add Supabase keys to enable real Google login">DEMO</span>`);
      document.getElementById("authSignIn").onclick = () => window.Auth.signIn();
    }
  }
  window.Auth.onChange(renderAuthSlot);

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
