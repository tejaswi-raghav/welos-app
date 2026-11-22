// Demo-only session. There is no authentication backend: the demo credentials are
// published on the sign-in page and checked in the browser.
export const DEMO = Object.freeze({ email: "demo@welos.ae", password: "welos-demo", name: "Demo Owner" });
const KEY = "welos.demo.session";

export function signIn(email, password) {
  if (String(email).trim().toLowerCase() !== DEMO.email || password !== DEMO.password) return false;
  try { sessionStorage.setItem(KEY, JSON.stringify({ email: DEMO.email, name: DEMO.name, at: Date.now() })); } catch { /* storage unavailable: still allow the demo */ }
  return true;
}
export function session() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return null; }
}
export function signOut() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
