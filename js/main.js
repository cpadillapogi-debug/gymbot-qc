/* ============================================================
   GYMBOT QC — MAIN
   Composition root: the only place that knows how every module
   fits together. Individual modules (chat-ui, booking-ui,
   dashboard-ui, ...) don't import each other's UI directly —
   main.js wires the hooks between them. This keeps each module
   swappable/testable in isolation.
   ============================================================ */
import { appState } from "./state.js";
import { initChatUI, appendMessage } from "./ui/chat-ui.js";
import { showBookingForm } from "./ui/booking-ui.js";
import { initDashboardUI } from "./ui/dashboard-ui.js";
import { initSetupUI } from "./ui/setup-ui.js";
import { initDemo } from "./demo.js";

function init(){
  initChatUI({ onBookingIntent: showBookingForm });
  initDashboardUI();
  initSetupUI();
  initDemo();

  // Greet the visitor.
  const greeting = "Hi po! Welcome to Commonwealth Fitness Hub 💪 Ask me about membership, trainers, or book a free trial.";
  appendMessage("bot", greeting);
  appState.set({ conversationHistory: appState.get("conversationHistory").concat([{ role:"bot", text: greeting }]) });
}

// Guard init itself so a single bad element lookup can't blank the page.
try{
  init();
}catch(err){
  console.error("GymBot QC failed to initialize cleanly:", err);
}
