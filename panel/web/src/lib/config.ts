/**
 * Fixed convention, not user-configurable: the note the `/` route renders
 * as the dashboard (plan §11.2). Ships in the base package at
 * `vault-template/panel/home.md`; a vault that deletes or never creates
 * it gets an empty-state fallback instead of an error (HomeRoute.tsx).
 */
export const HOME_DASHBOARD_PATH = "panel/home.md";
