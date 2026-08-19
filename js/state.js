/* ============================================================
   GYMBOT QC — APP STATE
   Single in-memory source of truth for the whole page. UI
   modules read from it and subscribe to changes instead of
   reaching into each other's DOM or globals directly.

   This is intentionally minimal (no reducers/middleware) —
   right size for a single-page vanilla app. If the app grows
   real routing or nested state, this is the file to expand.
   ============================================================ */

class AppState {
  constructor(initial){
    this._state = Object.assign({
      conversationHistory: [],   // [{role:'user'|'bot', text:string}]
      isWaitingForReply: false,  // guards double-sends while the bot is "typing"
      demoRunning: false,
      leads: [],                 // mirrors storage; UI renders off this
      gymInfo: "",
      apiKey: "",
      // Phase 4
      conversationMemory: { name: null, phone: null, preferredTime: null, goal: null }, // session-only, see conversation-memory-service.js
      isOnline: true,             // mirrored from connectivity-service.js so chat-ui can reflect it in the header
      fallbackNoticeShown: false  // show the "having trouble connecting" system note once per session, not on every failed reply
    }, initial || {});
    this._listeners = new Set();
  }

  /** @returns {*} the whole state, or one key if provided */
  get(key){
    return key === undefined ? { ...this._state } : this._state[key];
  }

  /** Shallow-merges `partial` into state and notifies subscribers. */
  set(partial){
    this._state = Object.assign({}, this._state, partial);
    this._listeners.forEach(fn => {
      try{ fn(this._state); }catch(err){ console.error("[AppState] listener threw:", err); }
    });
  }

  /** @returns {Function} unsubscribe */
  subscribe(fn){
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
}

export const appState = new AppState();
