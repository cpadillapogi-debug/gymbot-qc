/* ============================================================
   GYMBOT QC — STORAGE INSTANCES
   Shared StorageAdapter instances, pre-wired to CONFIG's key
   map. Import from here everywhere — never `new StorageAdapter()`
   a second time elsewhere.

   Two backends:
     - `storage`       -> localStorage. Survives closing the tab/
                          browser. Used for app data (leads, gym
                          info, users/gyms) and for "remembered"
                          sessions.
     - `sessionStorage` -> window.sessionStorage. Cleared when the
                          tab closes. Used for sessions where the
                          user did NOT check "Remember me".
   ============================================================ */
import { CONFIG } from "./config.js";
import { StorageAdapter } from "./storage-adapter.js";

export const storage = new StorageAdapter(CONFIG.STORAGE_KEYS, window.localStorage);
export const sessionStorageAdapter = new StorageAdapter(CONFIG.STORAGE_KEYS, window.sessionStorage);
