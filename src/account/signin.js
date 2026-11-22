import "../ui/chrome.js";
import "./signin.css";
import { DEMO, signIn, session } from "./session.js";

if (session()) location.replace("/os.html");
const form = document.getElementById("signin");
const email = document.getElementById("email");
const pw = document.getElementById("password");
const err = document.getElementById("err");
const go = document.getElementById("go");

document.getElementById("fill").addEventListener("click", () => {
  email.value = DEMO.email; pw.value = DEMO.password; err.textContent = ""; go.focus();
});
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!signIn(email.value, pw.value)) {
    err.textContent = "Those aren't the demo credentials. Use demo@welos.ae and welos-demo, or press Fill demo credentials.";
    form.classList.remove("shake"); void form.offsetWidth; form.classList.add("shake");
    return;
  }
  err.textContent = "";
  go.classList.add("busy"); go.disabled = true;
  setTimeout(() => location.assign("/os.html"), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650);
});
