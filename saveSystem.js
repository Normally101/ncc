'use strict';
/* ================================================================
   saveSystem.js — Chauffeur Empire · Multi-Profile Save System v1.0
   ================================================================ */

const SLOT_KEYS   = ['chauffeurEmpireSlot_1', 'chauffeurEmpireSlot_2', 'chauffeurEmpireSlot_3'];
const LEGACY_KEY  = 'chauffeurEmpireSave_v2';

const SLOT_LOGOS   = ['👁️','🦅','🏛️','💎','🐺','🔱','⚡','🌙','🔥','🦁','🐉','🌊'];
const MONTHS_SS    = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const BRAND_COLORS = [
    { name:'Oro',        value:'#d4af37' },
    { name:'Blu Reale',  value:'#00f2ff' },
    { name:'Porpora',    value:'#a855f7' },
    { name:'Scarlatto',  value:'#ef4444' },
    { name:'Smeraldo',   value:'#22c55e' },
    { name:'Bronzo',     value:'#cd7f32' },
    { name:'Platino',    value:'#e5e4e2' },
    { name:'Rosa Gold',  value:'#f4a460' },
];

window.currentSlotIndex   = 0;   // single save per account — always slot 0
window._selectedLogoSS    = SLOT_LOGOS[0];
window._selectedColorSS   = BRAND_COLORS[0].value;

// ── SLOT METADATA (light read — no full deserialize) ─────────────
function _getSlotMeta(index) {
    const raw = localStorage.getItem(SLOT_KEYS[index]);
    if (!raw) return null;
    try {
        const d = JSON.parse(raw);
        return {
            index,
            companyName:   d.companyName || 'Chauffeur Empire',
            companyLogo:   d.companyLogo || '👁️',
            cash:          d.cash        || 0,
            reputation:    d.reputation  || 0,
            fleetSize:     (d.fleet || []).length,
            driverCount:   (d.drivers || []).filter(x => x.id !== 'ceo').length,
            day:           d.day   || 1,
            month:         d.month || 1,
            ngp:           d.newGamePlusCount || 0,
            prestige:      d.prestige || 0,
            saveTimestamp: d._saveTimestamp || 0,
            cloudSyncTs:   parseInt(localStorage.getItem(`_cloudSyncTs_${index}`) || '0', 10),
        };
    } catch(e) { return null; }
}

function _fmtTs(ms) {
    if (!ms) return null;
    const d = new Date(ms);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return time;
    const day = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    return `${day} ${time}`;
}

// ── CROSS-SLOT RIVALS (other slots become competitors) ────────────
window.getSharedSlotRivals = function() {
    const rivals = [];
    SLOT_KEYS.forEach((key, i) => {
        if (i === window.currentSlotIndex) return;
        const raw = localStorage.getItem(key);
        if (!raw) return;
        try {
            const d = JSON.parse(raw);
            rivals.push({
                id:          `slot_${i}`,
                name:        (d.companyName || 'Chauffeur Empire') + ` ⊞`,
                rep:         d.reputation || 0,
                cash:        d.cash || 0,
                fleet:       (d.fleet || []).length,
                drivers:     (d.drivers || []).filter(x => x.id !== 'ceo').length,
                missions:    null,
                isSlotRival: true,
                slotIndex:   i,
                logo:        d.companyLogo || '👁️',
            });
        } catch(e) {}
    });
    return rivals;
};

// ── SAVE TO CURRENT SLOT ─────────────────────────────────────────
window.saveCurrentSlot = function() {
    if (window.currentSlotIndex === null) return;
    // BUG 3 fix: while a reset/logout is in progress, suppress saving so the
    // beforeunload/autosave handlers can't re-upload the stale state we are
    // deliberately wiping (the catch-22 that made resets never stick).
    if (window._suppressCloudSave) return;
    const key = SLOT_KEYS[window.currentSlotIndex];
    try {
        const save = {
            ...gameState,
            pendingRides: (gameState.pendingRides || []).map(r => typeof _serializeRide === 'function' ? _serializeRide(r) : null).filter(Boolean),
            activeRides:  (gameState.activeRides  || []).map(r => typeof _serializeRide === 'function' ? _serializeRide(r) : null).filter(Boolean),
            drivers: (gameState.drivers || []).map(d => ({
                ...d,
                queue: (d.queue || []).map(r => typeof _serializeRide === 'function' ? _serializeRide(r) : null).filter(Boolean)
            }))
        };
        save._saveTimestamp = Date.now();
        // Stamp the owning company id so boot can detect an orphaned save (one
        // left behind after the companies row was reset) and discard it.
        save._companyId = (window.ServerState && window.ServerState.getCompany)
            ? (window.ServerState.getCompany()?.id || gameState._companyId || null)
            : (gameState._companyId || null);
        // Ensure cash is always stored as integer to prevent bigint cast errors in SQL
        save.cash = Math.floor(save.cash || 0);
        // Cloud is the single source of truth — no localStorage write
        _cloudSaveSlot(window.currentSlotIndex, save);
    } catch(e) { console.error('[SaveSystem] Save failed:', e); }
};

// ── CLOUD SAVE (debounced: max 1 write/slot every 45s) ───────────
/*
   Required Supabase SQL (run once in SQL Editor):
   ─────────────────────────────────────────────────────────────────
   CREATE TABLE IF NOT EXISTS public.game_saves (
       id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
       slot_index  integer NOT NULL CHECK (slot_index IN (0, 1, 2)),
       game_state  jsonb NOT NULL DEFAULT '{}',
       updated_at  timestamptz NOT NULL DEFAULT now(),
       UNIQUE (user_id, slot_index)
   );
   ALTER TABLE public.game_saves ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users manage own saves" ON public.game_saves
       FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

   -- Tabella leaderboard (colonne esatte come da Supabase dashboard)
   CREATE TABLE IF NOT EXISTS public.leaderboard (
       user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
       company_name  text NOT NULL DEFAULT 'Chauffeur Empire',
       owner_name    text NOT NULL DEFAULT '',
       liquid_assets bigint NOT NULL DEFAULT 0,
       reputation    numeric(10,2) NOT NULL DEFAULT 0,
       fleet_count   int4 NOT NULL DEFAULT 0,
       last_active   timestamptz NOT NULL DEFAULT now()
   );
   ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;
   -- Esegui in SQL Editor per fixare le RLS policy:
   DROP POLICY IF EXISTS "Anyone can read leaderboard" ON public.leaderboard;
   DROP POLICY IF EXISTS "Users update own leaderboard row" ON public.leaderboard;
   CREATE POLICY "Public leaderboard read" ON public.leaderboard
       FOR SELECT TO anon, authenticated USING (true);
   CREATE POLICY "Users manage own leaderboard row" ON public.leaderboard
       FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
   ─────────────────────────────────────────────────────────────────
*/
const _CLOUD_MIN_INTERVAL_MS = 4_000;
const _lastCloudSaveTs = {};

function _updateCloudDot(state) {
    const dot = document.getElementById('cloud-sync-dot');
    if (!dot) return;
    dot.textContent = '☁';
    dot.classList.remove('syncing');
    if (state === 'ok')  { dot.style.color = '#22c55e'; dot.title = '☁ Cloud sync OK — clicca per forzare'; }
    if (state === 'err') { dot.style.color = '#ef4444'; dot.title = '☁ Sync fallito — controlla la connessione'; }
    if (state === 'busy'){ dot.style.color = '#f59e0b'; dot.title = '☁ Sincronizzazione in corso...'; dot.classList.add('syncing'); }
    clearTimeout(dot._dim);
    dot._dim = setTimeout(() => { if (!dot.classList.contains('syncing')) dot.style.opacity = '0.35'; }, 4000);
    dot.style.opacity = '1';
}

async function _cloudSaveSlot(slotIndex, saveData) {
    if (!window.currentUser || !window.supabaseClient) return;
    const now = Date.now();
    if (_lastCloudSaveTs[slotIndex] && (now - _lastCloudSaveTs[slotIndex]) < _CLOUD_MIN_INTERVAL_MS) return;
    _lastCloudSaveTs[slotIndex] = now;
    _updateCloudDot('busy');
    try {
        const { error } = await window.supabaseClient.from('game_saves').upsert({
            user_id:    window.currentUser.id,
            slot_index: slotIndex,
            game_state: saveData,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,slot_index' });
        if (error) { console.warn('[SaveSystem] Cloud upsert error:', error); _updateCloudDot('err'); }
        else {
            localStorage.setItem(`_cloudSyncTs_${slotIndex}`, Date.now().toString());
            _updateCloudDot('ok');
            _upsertLeaderboard(saveData);
        }
    } catch(e) {
        console.warn('[SaveSystem] Cloud save failed (offline?):', e);
        _updateCloudDot('err');
    }
}

// ── LEADERBOARD UPSERT (shared by auto-save, login push, forceUpdate) ─
async function _upsertLeaderboard(saveData) {
    if (!window.currentUser || !window.supabaseClient) return;
    const userId = window.currentUser.id;
    // Column names must match the Supabase table exactly
    const payload = {
        user_id:      userId,
        company_name: saveData.companyName || 'Chauffeur Empire',
        owner_name:   saveData.companyName || saveData.ceoName || window.currentUser.email || '',
        liquid_assets: Math.floor(saveData.cash || 0),
        reputation:   saveData.reputation || 0,
        fleet_count:  (saveData.fleet || []).length,
        last_active:  new Date().toISOString(),
    };
    try {
        const { error } = await window.supabaseClient
            .from('leaderboard')
            .upsert(payload, { onConflict: 'user_id' });
        if (error) console.warn('[Leaderboard] upsert error:', error.code);
    } catch(e) {
        console.warn('[Leaderboard] network error:', e.message);
    }
}

// ── PUBLIC API ───────────────────────────────────────────────────
window.pushLeaderboardNow = function(saveData) {
    _upsertLeaderboard(saveData || (typeof gameState !== 'undefined' ? gameState : {}));
};

window.forceLeaderboardUpdate = function() {
    const data = typeof gameState !== 'undefined' ? gameState : {};
    _upsertLeaderboard(data);
};

// Force an immediate cloud write (bypasses debounce) — used after major actions
window.forceCloudSave = function() {
    if (window.currentSlotIndex === null) return;
    _lastCloudSaveTs[window.currentSlotIndex] = 0; // reset debounce
    if (typeof window.saveCurrentSlot === 'function') window.saveCurrentSlot();
};

// On browser close: force one last cloud write so mobile picks it up immediately
window.addEventListener('beforeunload', () => {
    if (window.currentSlotIndex === null || !window.currentUser) return;
    _lastCloudSaveTs[window.currentSlotIndex] = 0; // bypass debounce
    window.saveCurrentSlot(); // localStorage write is synchronous; cloud fires async
});

// ── DELETE SLOT ──────────────────────────────────────────────────
window.deleteSlot = function(index) {
    if (!confirm(`Eliminare il salvataggio nello Slot ${index + 1}? Questa azione è irreversibile.`)) return;
    localStorage.removeItem(SLOT_KEYS[index]);
    // Cloud delete
    if (window.currentUser && window.supabaseClient) {
        window.supabaseClient.from('game_saves')
            .delete()
            .eq('user_id', window.currentUser.id)
            .eq('slot_index', index)
            .then(({ error }) => { if (error) console.warn('[SaveSystem] Cloud delete failed:', error); });
    }
    window.showSlotSelector();
};

// ── COMPANY SETUP SCREEN ─────────────────────────────────────────
function _showCompanySetup(slotIndex) {
    const overlay = document.getElementById('ss-overlay');
    if (!overlay) return;
    window._selectedLogoSS  = SLOT_LOGOS[0];
    window._selectedColorSS = BRAND_COLORS[0].value;

    const logoGrid = SLOT_LOGOS.map((l, i) =>
        `<button class="logo-opt-btn ${i === 0 ? 'active' : ''}"
            ${ceAct('ceSetActive', ['_selectedLogoSS', null, l, '.logo-opt-btn'])}>
            ${l}
        </button>`
    ).join('');

    const colorGrid = BRAND_COLORS.map((c, i) =>
        `<button class="brand-color-btn ${i === 0 ? 'active' : ''}"
            style="background:${c.value}"
            title="${c.name}"
            ${ceAct('ceSetBrandColor', [c.value])}>
        </button>`
    ).join('');

    overlay.innerHTML = `
    <div class="ss-bg">
        <div class="ss-setup-card">
            <div class="ss-setup-title">Fondazione Impero</div>
            <div class="ss-setup-sub">Nuovo Account · Prima Partita</div>

            <div class="ss-field">
                <label class="ss-label">Nome Azienda</label>
                <input id="ss-company-name" type="text" maxlength="28"
                    value="Chauffeur Empire" class="ss-input" spellcheck="false">
            </div>

            <div class="ss-field">
                <label class="ss-label">Logo Aziendale</label>
                <div class="ss-logo-grid">${logoGrid}</div>
            </div>

            <div class="ss-field">
                <label class="ss-label">Colore Brand <span id="ss-color-preview" style="color:${BRAND_COLORS[0].value};font-weight:bold">●</span></label>
                <div class="ss-color-grid">${colorGrid}</div>
            </div>

            <div class="ss-btn-row">
                <button ${ceAct('authLogout', [])} class="ss-btn-secondary">← Logout</button>
                <button ${ceAct('_confirmNewGame', [0])} class="ss-btn-primary">Fonda Azienda →</button>
            </div>
        </div>
    </div>`;
}

async function _confirmNewGame(slotIndex) {
    const nameEl = document.getElementById('ss-company-name');
    const name   = (nameEl?.value?.trim()) || 'Chauffeur Empire';
    const logo   = window._selectedLogoSS || '👁️';

    localStorage.removeItem(SLOT_KEYS[slotIndex]);
    window.currentSlotIndex        = slotIndex;
    window._pendingCompanyName     = name;
    window._pendingCompanyLogo     = logo;
    window._pendingCompanyColor    = window._selectedColorSS || '#d4af37';

    const overlay = document.getElementById('ss-overlay');
    if (overlay) overlay.remove();

    // Guarantee the Supabase companies row exists before starting — idempotent ON CONFLICT
    if (window.ServerState) {
        try { await window.ServerState.initCompany(name); } catch(e) { /* non-fatal */ }
    }

    if (typeof window._startGameWithSlot === 'function') window._startGameWithSlot(slotIndex, true);
}
window._confirmNewGame = _confirmNewGame;

// ── NEW GAME SETUP (single save per account) ─────────────────────
window.showNewGameSetup = function() {
    const existing = document.getElementById('ss-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'ss-overlay';
    overlay.innerHTML = '<div class="ss-bg"></div>';
    document.body.appendChild(overlay);
    _showCompanySetup(0); // always slot 0
};

// ── RESET GAME (accessible from Hub) ─────────────────────────────
window.resetGame = async function() {
    if (!confirm('Reimposta il tuo Impero? Tutti i progressi verranno eliminati definitivamente.\n\nQuesta azione è irreversibile.')) return;
    // BUG 3 fix: stop the game loop and block any further saves so the
    // beforeunload/autosave handlers cannot re-upload the state we are wiping.
    window._suppressCloudSave = true;
    try { if (typeof gameState !== 'undefined' && gameState) gameState.paused = true; } catch(e) {}
    // Clear local cache
    localStorage.removeItem('chauffeurEmpireSlot_1');
    localStorage.removeItem('chauffeurEmpireSlot_2');
    // Clear tutorial key so it shows again after reset
    localStorage.removeItem('chauffeurEmpireTutorialDone_v3');
    localStorage.removeItem('chauffeurEmpireTutorialDone_v2');
    localStorage.removeItem('chauffeurEmpireSlot_3');
    localStorage.removeItem('_cloudSyncTs_0');
    try {
        if (window.currentUser && window.supabaseClient) {
            // Delete the simulation blob
            await window.supabaseClient.from('game_saves')
                .delete()
                .eq('user_id', window.currentUser.id)
                .eq('slot_index', 0);
            // Reset the authoritative server cash back to the starting amount (€0 —
            // Zero-to-Hero "fondo del barile") so the fresh game doesn't inherit the
            // old company balance. Must match engine.js default + rpc_init_company.
            if (window.ServerState && typeof window.ServerState.syncCash === 'function') {
                try { await window.ServerState.syncCash(0); } catch(e) {}
            }
        }
    } catch(e) {
        console.warn('[SaveSystem] resetGame cloud cleanup error:', e);
    }
    location.reload();
};

// ── COMPAT STUBS (kept for any lingering references) ──────────────
window.showSlotSelector  = window.showNewGameSetup; // redirect
window.startNewGameSlot  = () => window.showNewGameSetup();
window.loadExistingSlot  = () => window._startGameWithSlot(0, false);
// window.deleteSlot è definita sopra con la firma corretta deleteSlot(index) — stub rimosso
