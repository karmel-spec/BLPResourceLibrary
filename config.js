// ============================================================================
// Piano Technology Library — configuration
// ----------------------------------------------------------------------------
// To enable real Google sign-in and shared comments, create a free Supabase
// project (https://supabase.com), then paste your Project URL and anon key
// below and follow SUPABASE_SETUP.md. Until then the site runs in DEMO MODE:
// sign-in and comments work locally in your browser only (nothing is shared).
// ============================================================================

const CONFIG = {
  SUPABASE_URL: "https://tlkbvniiaqwxmgewhxvx.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_CMh8EW_QljOHFzWRhGvGcg_OV2zmNtV",

  // The library owner. When signed in with this email you see admin-only
  // features (e.g. the private "trusted by" stat and its make-public toggle).
  ADMIN_EMAIL: "brigham@brighamlarsonpianos.com",
};

// True once real Supabase credentials have been filled in above.
const SUPABASE_READY =
  !CONFIG.SUPABASE_URL.includes("YOUR-PROJECT") &&
  !CONFIG.SUPABASE_ANON_KEY.includes("YOUR-ANON");
