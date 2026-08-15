/* ============================================================
   GYMBOT QC — GYM INFO SERVICE
   Business logic for the gym's info text: what the bot is
   allowed to know and say. Pure logic + storage calls only —
   no DOM here.
   ============================================================ */
import { storage } from "../storage.js";
import { DEFAULT_GYM_INFO, CONFIG } from "../config.js";
import { clampText } from "../utils.js";
import { getMasterPromptTemplate, buildSystemPromptFromTemplate } from "./dev-console-service.js";

export function loadGymInfo(){
  const saved = storage.get("gymInfo", null);
  return (saved && saved.trim().length > 0) ? saved : DEFAULT_GYM_INFO;
}

export function saveGymInfo(text){
  if(typeof text !== "string" || text.trim().length === 0){
    return { ok:false, reason:"Gym info can't be empty." };
  }
  const ok = storage.set("gymInfo", clampText(text, CONFIG.GYM_INFO_MAX_LEN));
  return { ok, reason: ok ? null : "Couldn't save — check browser storage settings." };
}

export function resetGymInfo(){
  storage.set("gymInfo", DEFAULT_GYM_INFO);
  return DEFAULT_GYM_INFO;
}

// Phase 9: the literal template moved to dev-console-service.js
// (DEFAULT_MASTER_PROMPT_TEMPLATE) so the Developer Console's Master
// System Prompt Editor can override it. getMasterPromptTemplate() falls
// back to that exact same default text when nothing has been saved yet,
// so behavior for every existing gym is unchanged until a Developer
// edits it from the console.
export function buildSystemPrompt(gymInfo, memorySummary){
  const template = getMasterPromptTemplate();
  return buildSystemPromptFromTemplate(template, gymInfo, memorySummary);
}
