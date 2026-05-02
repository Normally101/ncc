'use strict';
/* ================================================================
   syncManager.js — Chauffeur Empire · Cross-Device Save Sync v1.0
   Uses File System Access API to write slot_N.json files to the
   game folder so they can be committed to Git and pulled on any device.
   ================================================================ */

const _SYNC_DB    = 'chauffeurEmpireSync';
const _SYNC_STORE = 'dirHandle';
const _SLOT_FILES = ['slot_1.json', 'slot_2.json', 'slot_3.json'];

// ── Simple FNV-like hash for save integrity ───────────────────────
function _simpleHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h * 16777619) >>> 0;
    }
    return h.toString(16);
}

function _addChecksum(data) {
    const copy = { ...data, _checksum: undefined };
    const hash = _simpleHash(JSON.stringify(copy));
    return { ...data, _checksum: hash };
}

function _verifyChecksum(data) {
    if (!data._checksum) return true; // legacy save — skip
    const stored = data._checksum;
    const copy = { ...data, _checksum: undefined };
    const expected = _simpleHash(JSON.stringify(copy));
    return stored === expected;
}

// ── IndexedDB: persist directory handle across page reloads ───────
function _openSyncDB() {
    return new Promise((res, rej) => {
        const req = indexedDB.open(_SYNC_DB, 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore(_SYNC_STORE);
        req.onsuccess = e => res(e.target.result);
        req.onerror   = rej;
    });
}

async function _persistHandle(handle) {
    const db = await _openSyncDB();
    const tx = db.transaction(_SYNC_STORE, 'readwrite');
    tx.objectStore(_SYNC_STORE).put(handle, 'main');
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
}

async function _restoreHandle() {
    const db = await _openSyncDB();
    const tx = db.transaction(_SYNC_STORE, 'readonly');
    return new Promise((res, rej) => {
        const req = tx.objectStore(_SYNC_STORE).get('main');
        req.onsuccess = () => res(req.result || null);
        req.onerror   = rej;
    });
}

// ── MAIN syncManager OBJECT ───────────────────────────────────────
window.syncManager = {
    dirHandle: null,
    _supported: typeof window.showDirectoryPicker === 'function',

    // Call on page load — restores saved handle if permission still granted
    async init() {
        if (!this._supported) return;
        try {
            const saved = await _restoreHandle();
            if (!saved) return;
            const perm = await saved.queryPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
                this.dirHandle = saved;
                console.log('[SyncManager] Cartella ricollegata:', saved.name);
            }
            // If 'prompt', permission expired — user must click to reconnect
        } catch (e) { /* handle was invalidated */ }
        this._updateBtn();
    },

    // Called by button click — requires user gesture
    async selectFolder() {
        if (!this._supported) {
            alert('Il tuo browser non supporta la File System Access API.\nUsa Chrome o Edge per il sync automatico.');
            return;
        }
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
            this.dirHandle = handle;
            await _persistHandle(handle);
            this._updateBtn();
            this._notify('📁 Cartella collegata! I save verranno scritti in automatico.', 'success');
        } catch (e) {
            if (e.name !== 'AbortError') console.error('[SyncManager] selectFolder:', e);
        }
    },

    // Re-request permission if it expired (needs user gesture)
    async reconnect() {
        if (!this.dirHandle) return this.selectFolder();
        try {
            const perm = await this.dirHandle.requestPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
                this._notify('🔗 Sync ricollegato!', 'success');
                this._updateBtn();
            }
        } catch (e) { this.selectFolder(); }
    },

    // Write a slot save to disk as slot_N.json
    async writeSlot(index, saveData) {
        if (!this.dirHandle) return;
        try {
            const perm = await this.dirHandle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') return; // don't auto-prompt in background
            const fileName = _SLOT_FILES[index];
            if (!fileName) return;
            const fh = await this.dirHandle.getFileHandle(fileName, { create: true });
            const writable = await fh.createWritable();
            await writable.write(JSON.stringify(_addChecksum(saveData), null, 2));
            await writable.close();
        } catch (e) {
            console.warn('[SyncManager] writeSlot failed:', e);
        }
    },

    // Read a slot JSON file from disk (returns parsed object or null)
    async readSlot(index) {
        if (!this.dirHandle) return null;
        try {
            const fh   = await this.dirHandle.getFileHandle(_SLOT_FILES[index]);
            const file = await fh.getFile();
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (!_verifyChecksum(parsed)) {
                console.warn(`[SyncManager] Checksum mismatch in ${_SLOT_FILES[index]} — file may be corrupted`);
                this._notify(`⚠️ Slot ${index + 1}: checksum non valido. File potrebbe essere corrotto.`, 'error');
            }
            return parsed;
        } catch (e) {
            return null; // file doesn't exist yet
        }
    },

    // Import all slot files from disk → localStorage (smart merge by timestamp)
    async importAll() {
        if (!this.dirHandle) {
            await this.selectFolder();
            if (!this.dirHandle) return;
        }
        let imported = 0;
        for (let i = 0; i < 3; i++) {
            const fileData = await this.readSlot(i);
            if (!fileData) continue;
            const lsKey  = `chauffeurEmpireSlot_${i + 1}`;
            const lsRaw  = localStorage.getItem(lsKey);
            if (lsRaw) {
                // Pick whichever is newer by _saveTimestamp
                try {
                    const lsData = JSON.parse(lsRaw);
                    const lsTs   = lsData._saveTimestamp || 0;
                    const fTs    = fileData._saveTimestamp || 0;
                    if (lsTs >= fTs) continue; // localStorage is already newer
                } catch (e) { /* ignore parse error, overwrite */ }
            }
            localStorage.setItem(lsKey, JSON.stringify(fileData));
            imported++;
        }
        const msg = imported > 0
            ? `📥 ${imported} slot importati da file (versione più recente).`
            : '✅ I save locali sono già aggiornati.';
        this._notify(msg, 'success');
        // Refresh slot selector UI
        if (typeof window.showSlotSelector === 'function') window.showSlotSelector();
    },

    // Export all localStorage slots → disk files
    async exportAll() {
        if (!this.dirHandle) {
            await this.selectFolder();
            if (!this.dirHandle) return;
        }
        const SLOT_KEYS = ['chauffeurEmpireSlot_1', 'chauffeurEmpireSlot_2', 'chauffeurEmpireSlot_3'];
        let exported = 0;
        for (let i = 0; i < 3; i++) {
            const raw = localStorage.getItem(SLOT_KEYS[i]);
            if (!raw) continue;
            try {
                const data = JSON.parse(raw);
                data._saveTimestamp = data._saveTimestamp || Date.now();
                await this.writeSlot(i, data);
                exported++;
            } catch (e) { console.warn('[SyncManager] exportAll slot', i, e); }
        }
        this._notify(`📤 ${exported} slot esportati su file. Ora puoi fare git push!`, 'success');
    },

    _updateBtn() {
        const btn  = document.getElementById('sync-folder-btn');
        const info = document.getElementById('sync-folder-info');
        if (btn) {
            if (this.dirHandle) {
                btn.textContent = `📁 ${this.dirHandle.name}`;
                btn.style.borderColor = 'rgba(34,197,94,0.5)';
                btn.style.color = '#22c55e';
                btn.onclick = () => window.syncManager.reconnect();
            } else {
                btn.textContent = '📁 Collega Cartella';
                btn.style.borderColor = '';
                btn.style.color = '';
                btn.onclick = () => window.syncManager.selectFolder();
            }
        }
        if (info) {
            info.textContent = this.dirHandle
                ? `Sync attivo → ${this.dirHandle.name}/slot_N.json`
                : 'Collega la cartella del gioco per abilitare il sync Git.';
            info.style.color = this.dirHandle ? '#22c55e' : '#6b7280';
        }
    },

    _notify(msg, type) {
        if (typeof showNotification === 'function') {
            showNotification(msg, type);
        } else {
            console.log('[SyncManager]', msg);
        }
    }
};

// Auto-init on load (restore handle silently)
window.addEventListener('DOMContentLoaded', () => {
    window.syncManager.init();
});
