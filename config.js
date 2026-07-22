// ============================================================================
// Piano Technology Library — configuration
// ----------------------------------------------------------------------------
// To enable real Google sign-in and shared comments, create a free Supabase
// project (https://supabase.com), then paste your Project URL and anon key
// below and follow SUPABASE_SETUP.md. Until then the site runs in DEMO MODE:
// sign-in and comments work locally in your browser only (nothing is shared).
// ============================================================================

const CONFIG = {
  SUPABASE_URL: "https://fjyydcsxauwogtgswfss.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_LRy1fJSiABmkGHxYd8MqMQ__0q37nEn",

  // Library owners/moderators. Signing in with one of these emails unlocks
  // admin features: the private "trusted by" stat and the submission queue.
  ADMIN_EMAILS: ["brigham@brighamlarsonpianos.com", "karmel.larson@gmail.com"],
  ADMIN_EMAIL: "brigham@brighamlarsonpianos.com", // legacy alias
};

// True once real Supabase credentials have been filled in above.
const SUPABASE_READY =
  !CONFIG.SUPABASE_URL.includes("YOUR-PROJECT") &&
  !CONFIG.SUPABASE_ANON_KEY.includes("YOUR-ANON");
