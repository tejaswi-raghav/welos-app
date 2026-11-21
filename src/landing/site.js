// Landing entry: design system, 3D story, hero conditions, sections, WELOS AI.
import "../design/tokens.css";
import "./landing.css";
import { mountHero } from "./hero.js";
import { mountSections } from "./sections.js";
import { icon } from "../design/icons.js";

// static markup marks icons with data-ico; draw them once
document.querySelectorAll("[data-ico]").forEach((el) => { el.innerHTML = icon(el.dataset.ico); });
import "../explore/why.js";

mountHero();
mountSections();

// WELOS AI (React) loads when idle, or at once if someone asks for it first
let ai = null;
const loadAI = () => (ai ||= import("../ai/mount.jsx"));
document.addEventListener("click", (e) => {
  const t = e.target.closest?.("[data-ai-open]");
  if (!t || document.getElementById("welos-ai-root")) return;
  e.preventDefault(); e.stopPropagation();
  loadAI().then(() => setTimeout(() => t.click(), 60));
}, true);
const idle = (fn, t) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: t }) : setTimeout(fn, 200));
idle(loadAI, 2500);

// the 3D story loads after first paint; it is the heaviest part of the page
const loadStory = () => import("../explore/main.js").catch((e) => {
  console.warn("3D story unavailable:", e?.message || e);
  document.body.classList.add("no-gl");
  document.getElementById("veil")?.classList.add("gone");
});
if ("requestIdleCallback" in window) requestIdleCallback(loadStory, { timeout: 600 }); else setTimeout(loadStory, 60);

// header: mark the section in view
const links = [...document.querySelectorAll('.nav-links a[href^="#"]')];
const targets = links.map((a) => document.querySelector(a.getAttribute("href")));
const mark = () => {
  const y = innerHeight * 0.35;
  let cur = null;
  targets.forEach((s, i) => { if (s && s.getBoundingClientRect().top < y && !s.classList.contains("panel")) cur = links[i]; });
  links.forEach((a) => a.toggleAttribute("aria-current", a === cur));
  document.body.classList.toggle("scrolled", scrollY > 8);
};
addEventListener("scroll", mark, { passive: true }); mark();
