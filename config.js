// ============================================================================
// Piano Technology Library — configuration
// ----------------------------------------------------------------------------
// To enable real Google sign-in and shared comments, create a free Supabase
// project (https://supabase.com), then paste your Project URL and anon key
// below and follow SUPABASE_SETUP.md. Until then the site runs in DEMO MODE:
// sign-in and comments work locally in your browser only (nothing is shared).
// ============================================================================

const CONFIG = {
  // Custom domain (active July 22, 2026) — the Google consent screen shows this
  // instead of the raw supabase.co project address. The default
  // fjyydcsxauwogtgswfss.supabase.co domain also keeps working.
  SUPABASE_URL: "https://api.pianotechnologylibrary.com",
  SUPABASE_ANON_KEY: "sb_publishable_LRy1fJSiABmkGHxYd8MqMQ__0q37nEn",

  // Library owners/moderators. Signing in with one of these emails unlocks
  // admin features: the private "trusted by" stat and the submission queue.
  // NOT a login gate — anyone can sign in. These two only get the moderation
  // queue + backend controls.
  ADMIN_EMAILS: ["brigham@brighamlarsonpianos.com", "karmel@brighamlarsonpianos.com", "brighamlarson@gmail.com", "karmel.larson@gmail.com"],
  ADMIN_EMAIL: "brigham@brighamlarsonpianos.com", // legacy alias

  // Where "new submission — please review" alert emails go (via formsubmit.co).
  NOTIFY_EMAIL: "info@brighamlarsonpianos.com",

  // Print & ship: where requests are routed (BLP is the anchor fulfiller), and
  // the starting price BLP quotes from when it fulfills a print itself.
  PRINT_EMAIL: "info@brighamlarsonpianos.com",
  PRINT_BASE_FROM: 75,
};

// True once real Supabase credentials have been filled in above.
const SUPABASE_READY =
  !CONFIG.SUPABASE_URL.includes("YOUR-PROJECT") &&
  !CONFIG.SUPABASE_ANON_KEY.includes("YOUR-ANON");
