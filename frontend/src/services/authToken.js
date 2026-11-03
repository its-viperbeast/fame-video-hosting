// The session token lives in localStorage so it survives reloads. The key does
// not use the legacy "frame-" prefix that clearLegacyLocalData sweeps.
const KEY = "frame.auth.token";
let memory = "";
let memoryOnly = false;

export function getToken() {
  if (memoryOnly) return memory;
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return memory;
  }
}

export function setToken(token) {
  memory = token || "";
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
    memoryOnly = false;
  } catch {
    // Storage can be unavailable; the token stays in memory for this page only.
    memoryOnly = true;
  }
}

export const clearToken = () => setToken("");
