/* ============================================================
   GYMBOT QC — AUTH UI
   Form wiring for login.html and register.html. Every actual
   decision (is this email valid, does this password match a
   user, what session gets issued) lives in auth-service.js —
   this module only reads inputs, shows/hides error state, and
   redirects on success.
   ============================================================ */
import { ROUTES } from "../config.js";
import { login, registerGymOwner, getSeedDeveloperHint } from "../services/auth-service.js";
import { redirectIfAuthenticated, roleHome } from "../auth-guard.js";

function showAlert(el, message, kind){
  el.textContent = message;
  el.className = "auth-alert show" + (kind === "success" ? " success" : "");
}
function hideAlert(el){
  el.className = "auth-alert";
  el.textContent = "";
}
function setLoading(button, isLoading){
  button.disabled = isLoading;
  button.setAttribute("data-loading", isLoading ? "true" : "false");
}

export function initLoginUI(){
  if(redirectIfAuthenticated()) return; // already logged in — bounced to dashboard

  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");
  const rememberInput = document.getElementById("loginRemember");
  const submitBtn = document.getElementById("loginSubmit");
  const alertEl = document.getElementById("loginAlert");
  const hintEl = document.getElementById("devHint");

  const hint = getSeedDeveloperHint();
  if(hintEl){
    hintEl.innerHTML = `Demo Master Admin login — <code>${hint.email}</code> / <code>${hint.password}</code>`;
  }

  // Prefill the email field if we redirected here after registering.
  const params = new URLSearchParams(window.location.search);
  if(params.get("registered") === "1"){
    showAlert(alertEl, "Account created — please log in.", "success");
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    if(submitBtn.disabled) return; // re-entrancy guard: blocks a double Enter/click while a login is in flight
    hideAlert(alertEl);
    setLoading(submitBtn, true);

    // Simulate the latency of a real auth request so the loading
    // state is visible and this swaps cleanly for a fetch() later.
    setTimeout(() => {
      const result = login({
        email: emailInput.value,
        password: passwordInput.value,
        rememberMe: rememberInput.checked
      });

      setLoading(submitBtn, false);

      if(!result.ok){
        showAlert(alertEl, result.error, "error");
        return;
      }

      // Only trust the `redirect` param if it points at this
      // visitor's own role home — otherwise a stale/shared link
      // (or someone hand-editing the URL) could bounce a Gym
      // Owner onto the Developer dashboard's route.
      const ownHome = roleHome(result.user.role);
      const requested = params.get("redirect");
      const redirectTarget = (requested === ROUTES.DASHBOARD || requested === ROUTES.DASHBOARD_OWNER)
        ? (requested === ownHome ? requested : ownHome)
        : ownHome;
      window.location.replace(redirectTarget);
    }, 400);
  });
}

export function initRegisterUI(){
  if(redirectIfAuthenticated()) return;

  const form = document.getElementById("registerForm");
  const gymNameInput = document.getElementById("registerGymName");
  const emailInput = document.getElementById("registerEmail");
  const passwordInput = document.getElementById("registerPassword");
  const confirmInput = document.getElementById("registerConfirmPassword");
  const submitBtn = document.getElementById("registerSubmit");
  const alertEl = document.getElementById("registerAlert");

  form.addEventListener("submit", e => {
    e.preventDefault();
    if(submitBtn.disabled) return; // re-entrancy guard: blocks a double Enter/click while a submit is in flight
    hideAlert(alertEl);
    setLoading(submitBtn, true);

    setTimeout(() => {
      const result = registerGymOwner({
        gymName: gymNameInput.value,
        email: emailInput.value,
        password: passwordInput.value,
        confirmPassword: confirmInput.value
      });

      setLoading(submitBtn, false);

      if(!result.ok){
        showAlert(alertEl, result.error, "error");
        return;
      }

      window.location.replace(`${ROUTES.LOGIN}?registered=1`);
    }, 400);
  });
}
