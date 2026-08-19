/* ============================================================
   GYMBOT QC — SETUP UI
   Wires the "Connect API key" and "Gym info" panels to their
   services. Purely presentational glue — no storage or
   validation logic lives here.
   ============================================================ */
import { loadApiKey, saveApiKey, clearApiKey } from "../services/api-key-service.js";
import { loadGymInfo, saveGymInfo, resetGymInfo } from "../services/gym-info-service.js";
import { testGeminiConnection, FAILURE_REASON_LABEL } from "../services/gemini-service.js";

function setStatus(el, message, isOk){
  el.textContent = message;
  el.className = "status-line " + (isOk ? "ok" : "err");
}

export function initSetupUI(){
  const apiKeyInput = document.getElementById("apiKeyInput");
  const keyStatus = document.getElementById("keyStatus");
  const gymInfoInput = document.getElementById("gymInfoInput");
  const gymInfoStatus = document.getElementById("gymInfoStatus");
  const testConnectionBtn = document.getElementById("testConnectionBtn");
  const testConnectionStatus = document.getElementById("testConnectionStatus");

  // Prefill from storage.
  apiKeyInput.value = loadApiKey();
  gymInfoInput.value = loadGymInfo();

  document.getElementById("saveKeyBtn").addEventListener("click", () => {
    const { ok, reason } = saveApiKey(apiKeyInput.value);
    setStatus(keyStatus, ok ? "Key saved on this device." : reason, ok);
  });

  document.getElementById("clearKeyBtn").addEventListener("click", () => {
    clearApiKey();
    apiKeyInput.value = "";
    setStatus(keyStatus, "Key removed.", true);
  });

  document.getElementById("saveGymInfoBtn").addEventListener("click", () => {
    const { ok, reason } = saveGymInfo(gymInfoInput.value);
    setStatus(gymInfoStatus, ok ? "Saved — the bot will use this right away." : reason, ok);
  });

  document.getElementById("resetGymInfoBtn").addEventListener("click", () => {
    gymInfoInput.value = resetGymInfo();
    setStatus(gymInfoStatus, "Reset to the Commonwealth demo gym.", true);
  });

  if(testConnectionBtn && testConnectionStatus){
    testConnectionBtn.addEventListener("click", async () => {
      if(testConnectionBtn.disabled) return; // re-entrancy guard against rapid double-clicks
      testConnectionBtn.disabled = true;
      testConnectionBtn.textContent = "Testing...";
      setStatus(testConnectionStatus, "Checking connection...", true);

      try{
        // Test whatever's currently in the input, even if not saved yet —
        // an owner pasting a fresh key wants to know it works before saving.
        const result = await testGeminiConnection(apiKeyInput.value);
        setStatus(
          testConnectionStatus,
          result.ok ? "Connected! The AI Receptionist is ready." : (FAILURE_REASON_LABEL[result.reason] || "Couldn't connect."),
          result.ok
        );
      }catch(err){
        setStatus(testConnectionStatus, "Couldn't test the connection — please try again.", false);
        console.warn("[setup-ui] test connection failed", err);
      }finally{
        testConnectionBtn.disabled = false;
        testConnectionBtn.textContent = "Test connection";
      }
    });
  }
}
