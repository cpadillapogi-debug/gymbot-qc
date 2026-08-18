/* ============================================================
   GYMBOT QC — OWNER-FACING BACKUP SERVICE (Phase 17)
   A scoped, gym-owner-safe version of the Developer console's
   exportBackup()/importBackup() in dev-console-service.js.

   WHY A SEPARATE FILE INSTEAD OF REUSING THE DEVELOPER ONE:
   dev-console-service.js's backup is the ENTIRE browser's storage —
   every gym, every user record (including password hashes), every
   Developer-only setting. That's correct for a Developer restoring
   their whole install, but handing that same export/import to a Gym
   Owner would leak every other gym's data into their downloaded file,
   and let them overwrite the whole users/gyms table from a backup.
   This file only ever touches ONE gym's own data:
     - businessSettings[gymId]   (gym-settings-service.js)
     - gymPlatformConfig[gymId]  (gym-config-service.js)
     - leads scoped to gymId     (leads-service.js)
   `gymInfo` (the freeform bot-info text) is deliberately left out of
   this backup: it's stored as a single global string in this codebase
   (see gym-info-service.js), not actually keyed per gym, so including
   it here would be misleading in a multi-gym install.
   ============================================================ */
import { CONFIG } from "../config.js";
import { getBusinessSettings, saveBusinessSettings } from "./gym-settings-service.js";
import { getGymPlatformConfig, saveGymPlatformConfig } from "./gym-config-service.js";
import { getLeads, replaceLeadsForGym } from "./leads-service.js";

/** @param {string} gymId
 *  @returns {object} a JSON-safe backup of just this gym's own data. */
export function exportOwnerBackup(gymId){
  return {
    exportedAt: new Date().toISOString(),
    appVersion: CONFIG.APP_VERSION,
    gymId,
    scope: "single-gym", // lets importOwnerBackup() reject a Developer full-install file at a glance
    data: {
      businessSettings: getBusinessSettings(gymId),
      gymPlatformConfig: getGymPlatformConfig(gymId),
      leads: getLeads(gymId)
    }
  };
}

/**
 * Restores a backup previously produced by exportOwnerBackup() for THIS
 * gymId — every restored lead is re-tagged with gymId regardless of what
 * the file says (see leads-service.js's replaceLeadsForGym()), so this
 * can never be used to inject data into, or read data meant for, a
 * different gym. Caller (the UI) owns the "are you sure, this replaces
 * your current leads" confirmation — this function overwrites unconditionally
 * once called.
 * @returns {{ok:boolean, reason?:string}}
 */
export function importOwnerBackup(gymId, backupObject){
  if(!gymId){
    return { ok:false, reason:"No gym selected." };
  }
  if(!backupObject || typeof backupObject !== "object" || !backupObject.data || typeof backupObject.data !== "object"){
    return { ok:false, reason:"That file doesn't look like a GymBot QC backup." };
  }
  if(backupObject.scope && backupObject.scope !== "single-gym"){
    return { ok:false, reason:"That looks like a full Developer backup file, not a gym data backup — it can't be restored here." };
  }

  const { businessSettings, gymPlatformConfig, leads } = backupObject.data;

  try{
    if(businessSettings && typeof businessSettings === "object"){
      saveBusinessSettings(gymId, businessSettings);
    }
    if(gymPlatformConfig && typeof gymPlatformConfig === "object"){
      saveGymPlatformConfig(gymId, gymPlatformConfig);
    }
    if(Array.isArray(leads)){
      replaceLeadsForGym(gymId, leads);
    }
  }catch(err){
    return { ok:false, reason:"Restore failed while writing data. Some fields may not have been restored." };
  }

  return { ok:true };
}
