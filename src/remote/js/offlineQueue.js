/**
 * BellePoule Modern - File hors-ligne de la tablette arbitre (IndexedDB), extraite de referee.html (#1401)
 * Script classique : `OfflineQueueInline` est global pour referee.html. Servi en /js/offlineQueue.js (CSP 'self').
 * Testée par refereeOfflineQueue.test.ts. Licensed under GPL-3.0
 */
// ─── Queue hors-ligne (IndexedDB) ───────────────────────────────────────
class OfflineQueueInline {
  constructor() {
    this.db = null;
    this.DB_NAME = 'bellepoule-offline';
    this.DB_VERSION = 1;
    this.STORE_NAME = 'actions';
    this._ready = this._init();
  }

  _init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = e => {
        this.db = e.target.result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  _tx(mode) {
    return this.db.transaction(this.STORE_NAME, mode).objectStore(this.STORE_NAME);
  }

  async addAction(type, payload) {
    await this._ready;
    const action = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      type,
      payload,
      timestamp: Date.now(),
      // Départage des actions de la même milliseconde
      seq: ++OfflineQueueInline.seq,
      retries: 0,
    };
    return new Promise((resolve, reject) => {
      const req = this._tx('readwrite').put(action);
      req.onsuccess = () => resolve(action);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllActions() {
    await this._ready;
    return new Promise((resolve, reject) => {
      const req = this._tx('readonly').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async removeAction(id) {
    await this._ready;
    return new Promise((resolve, reject) => {
      const req = this._tx('readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getQueueSize() {
    await this._ready;
    return new Promise((resolve, reject) => {
      const req = this._tx('readonly').count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Rejoue la file vers le serveur, en un seul lot, dans l'ordre chronologique.
   * - getAll() trie par clé (UUID aléatoire) : on retrie par horodatage.
   * - score_save porte un score absolu : seul le dernier par match compte,
   *   les précédents sont supprimés (un ancien score ne peut plus écraser
   *   le récent si son envoi échoue puis réussit plus tard).
   * - Un seul sync à la fois (reconnexion + bouton manuel simultanés).
   */
  async sync(endpoint) {
    if (this._syncing) return { synced: 0, failed: 0 };
    this._syncing = true;
    try {
      const actions = (await this.getAllActions()).sort(
        (a, b) => a.timestamp - b.timestamp || (a.seq || 0) - (b.seq || 0)
      );
      const latestScore = new Map();
      for (const a of actions) {
        if (a.type === 'score_save' && a.payload && a.payload.matchId) {
          latestScore.set(a.payload.matchId, a.id);
        }
      }
      const pending = [];
      for (const a of actions) {
        const matchId = a.type === 'score_save' && a.payload ? a.payload.matchId : null;
        if (matchId && latestScore.get(matchId) !== a.id) await this.removeAction(a.id);
        else pending.push(a);
      }
      const batch = pending.slice(0, OfflineQueueInline.BATCH_SIZE);
      if (batch.length === 0) return { synced: 0, failed: 0 };

      let resp;
      try {
        resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actions: batch }),
        });
      } catch {
        return { synced: 0, failed: batch.length };
      }
      if (!resp.ok) return { synced: 0, failed: batch.length };
      const data = await resp.json().catch(() => ({}));
      const ok = new Set(
        (Array.isArray(data.results) ? data.results : []).filter(r => r && r.success).map(r => r.id)
      );
      let synced = 0;
      for (const a of batch) {
        if (ok.has(a.id)) {
          await this.removeAction(a.id);
          synced++;
        }
      }
      return { synced, failed: batch.length - synced };
    } finally {
      this._syncing = false;
    }
  }

  isOnline() {
    return navigator.onLine;
  }
}
// État du badge de synchronisation : 'online' | 'offline' | 'failed'
OfflineQueueInline.badgeState = (online, failed) =>
  !online ? 'offline' : failed ? 'failed' : 'online';
OfflineQueueInline.seq = 0;
OfflineQueueInline.BATCH_SIZE = 50;

if (typeof module !== 'undefined' && module.exports) module.exports = OfflineQueueInline;
