// Mounts the WELOS AI sidebar on any page. Open it with [data-ai-open] or a link to #ai.
import React from "react";
import { createRoot } from "react-dom/client";
import AdvisorSidebar from "./AdvisorSidebar.jsx";
import "./sidebar.css";

function mount() {
  if (document.getElementById("welos-ai-root")) return;
  const host = document.createElement("div");
  host.id = "welos-ai-root";
  document.body.appendChild(host);
  createRoot(host).render(<AdvisorSidebar />);
  // pages without their own WELOS AI button get a slim edge tab
  setTimeout(() => {
    if (document.querySelector("[data-ai-open]")) return;
    const tab = document.createElement("button");
    tab.type = "button"; tab.className = "wai-edge"; tab.setAttribute("data-ai-open", ""); tab.setAttribute("aria-label", "Open WELOS AI");
    tab.innerHTML = "<i></i><span>WELOS AI</span>";
    document.body.appendChild(tab);
  }, 900);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
