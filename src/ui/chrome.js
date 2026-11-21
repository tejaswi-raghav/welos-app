// Runtime for the shared chrome: mobile menu, reveal-on-scroll, WebGL capability flag.
import "./base.css";
import "../ai/mount.jsx";
import { webglAvailable } from "./gl.js";

if (!webglAvailable()) document.documentElement.classList.add("no-gl");

const head = document.getElementById("site-head");
const btn = head?.querySelector(".menu-btn");
btn?.addEventListener("click", () => {
  const open = !head.hasAttribute("data-open");
  head.toggleAttribute("data-open", open);
  btn.setAttribute("aria-expanded", String(open));
});
addEventListener("keydown", (e) => { if (e.key === "Escape" && head?.hasAttribute("data-open")) { head.removeAttribute("data-open"); btn?.setAttribute("aria-expanded", "false"); } });

export function observeReveals(root = document) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
  root.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
}
observeReveals();

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
