/* ============================================================
   GYMBOT QC — DEMO MODE
   A short scripted sequence so a gym owner sees the full value
   in under a minute, without needing a live API key.
   ============================================================ */
import { DEMO_SCRIPT, DEMO_GYM_ID } from "./config.js";
import { delay } from "./utils.js";
import { appState } from "./state.js";
import { appendMessage, showTypingIndicator, removeTypingIndicator } from "./ui/chat-ui.js";
import { saveLead } from "./services/leads-service.js";
import { getLeads } from "./services/leads-service.js";
import { showToast } from "./ui/toast-ui.js";

export function initDemo(){
  const demoBtn = document.getElementById("runDemoBtn");
  demoBtn.addEventListener("click", runDemo);
}

async function runDemo(){
  if(appState.get("demoRunning")) return;
  appState.set({ demoRunning: true });

  const demoBtn = document.getElementById("runDemoBtn");
  demoBtn.disabled = true;
  demoBtn.textContent = "Running demo...";

  // The whole scripted sequence runs inside try/finally: it's a loop of
  // several awaited steps touching the DOM and localStorage, and without
  // this guard any single unexpected error (a missing #chat element, a
  // storage write failure) would leave demoRunning stuck true and the
  // button disabled for the rest of the visitor's session.
  try{
    document.getElementById("chat").scrollIntoView({ behavior:"smooth", block:"start" });
    await delay(500);

    for(const step of DEMO_SCRIPT){
      if(step.role === "booking"){
        saveLead(Object.assign({ gymId: DEMO_GYM_ID, source: "Demo" }, step.data));
        appState.set({ leads: getLeads(DEMO_GYM_ID) });
        await delay(500);
        continue;
      }
      if(step.role === "bot"){
        showTypingIndicator();
        await delay(700);
        removeTypingIndicator();
      }
      appendMessage(step.role, step.text);
      await delay(step.role === "system" ? 400 : 900);
    }
    showToast("Demo complete — dashboard updated on the right.");
  }catch(err){
    removeTypingIndicator();
    showToast("The demo hit a snag — please try again.");
    console.warn("[demo] runDemo failed", err);
  }finally{
    demoBtn.disabled = false;
    demoBtn.textContent = "▶ Run 60-Second Gym Owner Demo";
    appState.set({ demoRunning: false });
  }
}
