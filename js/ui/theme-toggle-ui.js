/* ============================================================
   GYMBOT QC — THEME TOGGLE (Phase 3)
   Dark/light mode. Dark is the brand default (see base.css);
   light is an override applied via [data-theme="light"] on
   <html>. Persisted globally (not per-gym) — it's a device
   preference, not business data, so it lives under its own
   top-level storage key rather than inside Business Settings.
   ============================================================ */
import { storage } from "../storage.js";

const STORAGE_KEY = "theme";

export function getStoredTheme(){
  const saved = storage.get(STORAGE_KEY, null);
  return (saved === "light" || saved === "dark") ? saved : "dark";
}

export function applyTheme(theme){
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
}

/** Applies the saved (or default) theme immediately, then wires up a toggle button. */
export function initThemeToggle(buttonEl){
  let theme = getStoredTheme();
  applyTheme(theme);
  updateButtonLabel(buttonEl, theme);

  if(!buttonEl) return;
  buttonEl.addEventListener("click", () => {
    theme = theme === "light" ? "dark" : "light";
    applyTheme(theme);
    storage.set(STORAGE_KEY, theme);
    updateButtonLabel(buttonEl, theme);
  });
}

function updateButtonLabel(buttonEl, theme){
  if(!buttonEl) return;
  buttonEl.textContent = theme === "light" ? "🌙 Dark" : "☀️ Light";
  buttonEl.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
}
