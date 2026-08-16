/* ============================================================
   GYMBOT QC — ONBOARDING WIZARD UI (Phase 11)
   7-step "Getting Started" flow for new gym owners: create
   account, gym info, pricing, hours, test AI receptionist,
   review, start trial.

   Deliberately writes through the SAME services every other page
   uses (auth-service.registerGymOwner/login, gym-settings-service.
   saveBusinessSettings, subscription-service.getSubscription) —
   there is no parallel "onboarding data" model. That means a gym
   that finishes this wizard looks, to every other part of the
   app, exactly like one set up by hand through Business Settings.

   PERMISSION BOUNDARY: same as owner-ai-page-ui.js — this file
   must never import gemini-service.js or api-key-service.js.
   Step 5's "test" is the same static profile-text preview the AI
   Receptionist page already shows, not a live API call.
   ============================================================ */
import { ROUTES, ROLES } from "../config.js";
import { registerGymOwner, login, getSession } from "../services/auth-service.js";
import { saveBusinessSettings, getBusinessSettings } from "../services/gym-settings-service.js";
import { buildProfileText, profileCompleteness } from "../services/ai-profile-service.js";
import { startTrialWithPlan, getAllPlans } from "../services/subscription-service.js";
import { CONFIG } from "../config.js";
import { escapeHtml } from "../utils.js";

const STEP_LABELS = ["Account", "Gym Info", "Pricing", "Hours", "Test AI", "Review", "Launch"];
const TOTAL_STEPS = STEP_LABELS.length;

let currentStep = 1;
let furthestStep = 1;
let session = null; // set once step 1 completes (or immediately, for an already-logged-in owner)
let chosenPlanId = CONFIG.SUBSCRIPTION_DEFAULT_PLAN_ID; // picked in step 6's plan picker, applied when step 7 starts the trial

export function initOnboardingUI(){
  const existing = getSession();
  if(existing && existing.role === ROLES.DEVELOPER){
    window.location.replace(ROUTES.DASHBOARD);
    return;
  }
  if(existing && existing.role === ROLES.GYM_OWNER){
    // Already has an account — skip straight to gym setup instead of
    // asking them to register again.
    session = existing;
    currentStep = 2;
    furthestStep = 2;
    document.getElementById("wizardStep1").remove();
  }

  renderProgress();
  showStep(currentStep);
  wireNav();
}

function wireNav(){
  document.getElementById("wzBackBtn").addEventListener("click", () => {
    if(currentStep <= (session ? 2 : 1)) return;
    goToStep(currentStep - 1);
  });
  document.getElementById("wzNextBtn").addEventListener("click", handleNext);
}

function renderProgress(){
  const host = document.getElementById("wizardProgress");
  host.innerHTML = STEP_LABELS.map((label, idx) => {
    const stepNum = idx + 1;
    const cls = stepNum === currentStep ? "active" : stepNum < currentStep ? "done" : "";
    return `<div class="wizard-progress-step ${cls}" data-step="${stepNum}">
      <div class="dot">${stepNum < currentStep ? "" : stepNum}</div>
      <div class="label">${escapeHtml(label)}</div>
    </div>`;
  }).join("");
}

function showStep(n){
  document.querySelectorAll(".wizard-step").forEach(sec => {
    sec.classList.toggle("active", sec.id === `wizardStep${n}`);
  });
  document.getElementById("wzBackBtn").style.visibility = (n <= (session ? 2 : 1)) ? "hidden" : "visible";
  const nextBtn = document.getElementById("wzNextBtn");
  nextBtn.textContent = n === TOTAL_STEPS ? "Go to my dashboard" : n === TOTAL_STEPS - 1 ? "Start free trial" : "Continue";
  if(n === TOTAL_STEPS - 1){
    nextBtn.innerHTML = `Start free trial <span class="auth-spinner" aria-hidden="true"></span>`;
  }else if(n === TOTAL_STEPS){
    nextBtn.innerHTML = `Go to my dashboard <span class="auth-spinner" aria-hidden="true"></span>`;
  }else{
    nextBtn.innerHTML = `Continue <span class="auth-spinner" aria-hidden="true"></span>`;
  }

  if(n === 5) renderAiPreview();
  if(n === 6) renderReview();
  if(n === 7) startTrial(); // creates the Trialing record on the plan chosen in step 6 — see subscription-service.js
  renderProgress();
}

function goToStep(n){
  currentStep = n;
  furthestStep = Math.max(furthestStep, n);
  showStep(currentStep);
}

function showAlert(message, kind){
  const el = document.getElementById("wizardAlert");
  el.textContent = message;
  el.className = "wizard-alert show" + (kind === "success" ? " success" : "");
}
function hideAlert(){
  const el = document.getElementById("wizardAlert");
  el.className = "wizard-alert";
  el.textContent = "";
}
function setLoading(isLoading){
  const btn = document.getElementById("wzNextBtn");
  btn.disabled = isLoading;
  btn.setAttribute("data-loading", isLoading ? "true" : "false");
}

function handleNext(){
  hideAlert();
  if(currentStep === 1) return handleStep1();
  if(currentStep === 2) return handleStep2();
  if(currentStep === 3) return handleStep3();
  if(currentStep === 4) return handleStep4();
  if(currentStep === 5) return goToStep(6);
  if(currentStep === 6) return goToStep(7);
  if(currentStep === 7) return window.location.replace(ROUTES.DASHBOARD_OWNER);
}

/* ---------- Step 1: account ---------- */
function handleStep1(){
  const gymName = document.getElementById("wzGymName").value;
  const email = document.getElementById("wzEmail").value;
  const password = document.getElementById("wzPassword").value;
  const confirmPassword = document.getElementById("wzConfirmPassword").value;

  setLoading(true);
  setTimeout(() => {
    const result = registerGymOwner({ gymName, email, password, confirmPassword });
    if(!result.ok){
      setLoading(false);
      showAlert(result.error, "error");
      return;
    }
    const loginResult = login({ email, password, rememberMe: true });
    setLoading(false);
    if(!loginResult.ok){
      // Extremely unlikely right after a successful register, but never
      // strand the visitor on a dead end — send them to log in manually.
      window.location.replace(`${ROUTES.LOGIN}?registered=1`);
      return;
    }
    session = getSession();
    goToStep(2);
  }, 350);
}

/* ---------- Step 2: gym info ---------- */
function handleStep2(){
  if(!session) return goToStep(1);
  // gymName is only ever collected in step 1 — for an owner who already
  // had an account (step 1 skipped, its input never existed), the
  // gymName key must be omitted entirely rather than sent as `undefined`,
  // since saveBusinessSettings() merges over the existing record and
  // Object.assign would still overwrite gymName with an explicit
  // `undefined` key otherwise.
  const gymNameInput = document.getElementById("wzGymName");
  const fields = {
    address: document.getElementById("wzAddress").value,
    contactNumber: document.getElementById("wzContactNumber").value,
    description: document.getElementById("wzDescription").value,
    welcomeMessage: document.getElementById("wzWelcomeMessage").value
  };
  if(gymNameInput) fields.gymName = gymNameInput.value;

  const result = saveBusinessSettings(session.gymId, fields);
  if(!result.ok){
    showAlert(result.reason, "error");
    return;
  }
  goToStep(3);
}

/* ---------- Step 3: pricing ---------- */
function handleStep3(){
  const result = saveBusinessSettings(session.gymId, {
    membershipFee: document.getElementById("wzMembershipFee").value,
    walkInFee: document.getElementById("wzWalkInFee").value,
    studentDiscount: document.getElementById("wzStudentDiscount").value,
    ptRate: document.getElementById("wzPtRate").value
  });
  if(!result.ok){
    showAlert(result.reason, "error");
    return;
  }
  goToStep(4);
}

/* ---------- Step 4: hours ---------- */
function handleStep4(){
  const result = saveBusinessSettings(session.gymId, {
    hours: document.getElementById("wzHours").value,
    trainerAvailable: document.getElementById("wzTrainerAvailable").checked ? "yes" : "no",
    freeTrialAvailable: document.getElementById("wzFreeTrialAvailable").checked ? "yes" : "no",
    parkingAvailable: document.getElementById("wzParkingAvailable").checked ? "yes" : "no"
  });
  if(!result.ok){
    showAlert(result.reason, "error");
    return;
  }
  goToStep(5);
}

/* ---------- Step 5: test AI receptionist ---------- */
function renderAiPreview(){
  const settings = getBusinessSettings(session.gymId);
  const preview = buildProfileText(settings);
  document.getElementById("wzAiPreview").textContent = preview || "Nothing set yet.";

  const completeness = profileCompleteness(settings);
  const missingHost = document.getElementById("wzAiMissing");
  missingHost.innerHTML = completeness.missing.length > 0
    ? `<p class="wizard-step-sub">Optional — fill these in later for a stronger AI Receptionist: ${completeness.missing.map(escapeHtml).join(", ")}.</p>`
    : `<p class="wizard-step-sub">Looks complete — the AI Receptionist has everything it needs.</p>`;
}

/* ---------- Step 6: review ---------- */
function renderReview(){
  const settings = getBusinessSettings(session.gymId);
  const rows = [
    ["Gym name", settings.gymName, 2],
    ["Address", settings.address, 2],
    ["Contact number", settings.contactNumber, 2],
    ["Monthly membership", settings.membershipFee, 3],
    ["Walk-in rate", settings.walkInFee, 3],
    ["Operating hours", settings.hours, 4],
    ["Free trial available", settings.freeTrialAvailable === "yes" ? "Yes" : "No", 4]
  ];
  document.getElementById("wzReviewList").innerHTML = rows.map(([label, value, step]) => `
    <li>
      <span>${escapeHtml(label)}</span>
      <span>${escapeHtml(value || "—")} <a href="#" class="edit-link" data-step="${step}">Edit</a></span>
    </li>
  `).join("");

  document.querySelectorAll("#wzReviewList .edit-link").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      goToStep(Number(link.dataset.step));
    });
  });

  renderPlanChoice();
}

/** Renders the plan picker as the same plan-card look the Subscription
 *  page uses, defaulting to whatever chosenPlanId currently is
 *  (CONFIG.SUBSCRIPTION_DEFAULT_PLAN_ID the first time this runs). */
function renderPlanChoice(){
  const host = document.getElementById("wzPlanChoice");
  if(!host) return;

  host.innerHTML = getAllPlans().map(plan => `
    <div class="owner-plan-card wizard-plan-card ${plan.id === chosenPlanId ? "owner-plan-card-current" : ""}" data-plan-id="${plan.id}" role="button" tabindex="0">
      <div class="owner-plan-card-name">${escapeHtml(plan.name)}${plan.id === chosenPlanId ? " ✓" : ""}</div>
      <div class="owner-plan-card-price">₱${plan.priceMonthly.toLocaleString()}<span>/month</span></div>
      <p class="wizard-step-sub" style="margin:4px 0 0;">${escapeHtml(plan.blurb)}</p>
    </div>
  `).join("");

  host.querySelectorAll(".wizard-plan-card").forEach(card => {
    const select = () => {
      chosenPlanId = card.dataset.planId;
      renderPlanChoice();
    };
    card.addEventListener("click", select);
    card.addEventListener("keydown", e => {
      if(e.key === "Enter" || e.key === " "){ e.preventDefault(); select(); }
    });
  });
}

/* ---------- Step 7: start trial ----------
   Creates the Trialing record on whichever plan was chosen in step 6's
   picker (falls back to CONFIG.SUBSCRIPTION_DEFAULT_PLAN_ID if the
   picker was somehow never rendered) — see subscription-service.js's
   startTrialWithPlan(). Also fills in step 7's summary text so it
   reflects the actual chosen plan instead of a hardcoded one. */
function startTrial(){
  const sub = startTrialWithPlan(session.gymId, chosenPlanId);
  const plan = getAllPlans().find(p => p.id === sub.planId) || getAllPlans()[0];
  const summaryEl = document.getElementById("wzTrialSummary");
  if(summaryEl){
    summaryEl.textContent = `${CONFIG.SUBSCRIPTION_TRIAL_DAYS} days on the ${plan.name} plan, no card required. Cancel anytime from your Subscription page.`;
  }
}
