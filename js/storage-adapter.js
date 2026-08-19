/* ============================================================
   GYMBOT QC — STORAGE ADAPTER
   The only module allowed to touch window.localStorage directly.
   Everything else (services, UI) goes through this. That means:
     - swapping localStorage for IndexedDB or a server API later
       touches ONE file, not every feature.
     - every read/write is wrapped, so a corrupted value, a full
       quota, or a browser with storage disabled never crashes
       the page — callers just get their fallback back.
   Keys are logical names (see CONFIG.STORAGE_KEYS) resolved to
   the real localStorage key internally, so features never
   hard-code raw key strings.
   ============================================================ */

export class StorageAdapter {
  /**
   * @param {Record<string,string>} keyMap logical name -> real storage key
   * @param {Storage} [backend] window.localStorage (default) or window.sessionStorage.
   *   Swapping this is also the seam for a future server-backed adapter —
   *   every caller goes through get/set/getJSON/setJSON, never the backend directly.
   */
  constructor(keyMap, backend){
    this._keyMap = keyMap || {};
    this._backend = backend || window.localStorage;
  }

  _resolve(logicalKey){
    return this._keyMap[logicalKey] || logicalKey;
  }

  get(logicalKey, fallback = null){
    try{
      const raw = this._backend.getItem(this._resolve(logicalKey));
      return (raw === null || raw === undefined) ? fallback : raw;
    }catch(err){
      console.warn("[StorageAdapter] read failed for", logicalKey, err);
      return fallback;
    }
  }

  set(logicalKey, value){
    try{
      this._backend.setItem(this._resolve(logicalKey), value);
      return true;
    }catch(err){
      console.warn("[StorageAdapter] write failed for", logicalKey, err);
      return false;
    }
  }

  remove(logicalKey){
    try{
      this._backend.removeItem(this._resolve(logicalKey));
      return true;
    }catch(err){
      console.warn("[StorageAdapter] remove failed for", logicalKey, err);
      return false;
    }
  }

  /**
   * @param {string} logicalKey
   * @param {*} fallback returned on missing/corrupt/wrong-shape data
   * @param {{requireArray?: boolean}} [opts]
   */
  getJSON(logicalKey, fallback = null, opts = {}){
    const raw = this.get(logicalKey, null);
    if(raw === null) return fallback;
    try{
      const parsed = JSON.parse(raw);
      if(opts.requireArray && !Array.isArray(parsed)) return fallback;
      return parsed;
    }catch(err){
      console.warn("[StorageAdapter] corrupted JSON for", logicalKey, "— resetting.", err);
      return fallback;
    }
  }

  setJSON(logicalKey, value){
    try{
      return this.set(logicalKey, JSON.stringify(value));
    }catch(err){
      console.warn("[StorageAdapter] stringify failed for", logicalKey, err);
      return false;
    }
  }
}
