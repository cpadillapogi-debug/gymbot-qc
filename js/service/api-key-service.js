/* ============================================================
   GYMBOT QC — API KEY SERVICE
   ============================================================ */
import { storage } from "../storage.js";

export function loadApiKey(){
  return storage.get("apiKey", "");
}

export function saveApiKey(rawValue){
  const value = (rawValue || "").trim();
  if(!value){
    return { ok:false, reason:"Please paste a key first." };
  }
  const ok = storage.set("apiKey", value);
  return { ok, reason: ok ? null : "Couldn't save — check browser storage settings." };
}

export function clearApiKey(){
  return storage.remove("apiKey");
}
