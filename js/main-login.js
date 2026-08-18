/* ============================================================
   GYMBOT QC — LOGIN PAGE ENTRY POINT
   ============================================================ */
import { ensureSeedDeveloper } from "./services/auth-service.js";
import { initLoginUI } from "./ui/auth-ui.js";

(async () => {
try{
  await ensureSeedDeveloper();
  await initLoginUI();
}catch(err){
  console.error("GymBot QC login page failed to initialize:", err);
}
})();
