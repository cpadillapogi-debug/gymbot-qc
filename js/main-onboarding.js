/* ============================================================
   GYMBOT QC — ONBOARDING PAGE ENTRY POINT (Phase 11)
   ============================================================ */
import { ensureSeedDeveloper } from "./services/auth-service.js";
import { initOnboardingUI } from "./ui/onboarding-ui.js";

(async () => {
try{
  await ensureSeedDeveloper();
  await initOnboardingUI();
}catch(err){
  console.error("GymBot QC onboarding page failed to initialize:", err);
}
})();
