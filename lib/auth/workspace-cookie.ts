/**
 * Name of the httpOnly cookie holding the user's active workspace id.
 * The cookie is a *preference*, never an authority: getSessionContext
 * re-verifies membership on every request and falls back to the user's
 * default workspace when the cookie is missing, stale, or forged.
 */
export const WORKSPACE_COOKIE = "aria-workspace";
