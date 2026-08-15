/* ============================================================
   GYMBOT QC — REGISTER PAGE ENTRY POINT
   ============================================================ */
import { ensureSeedDeveloper } from "./services/auth-service.js";
import { initRegisterUI } from "./ui/auth-ui.js";

try{
  ensureSeedDeveloper();
  initRegisterUI();
}catch(err){
  console.error("GymBot QC register page failed to initialize:", err);
}
