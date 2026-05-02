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

window.currentSlotIndex   = null;
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
            companyName: d.companyName || 'Chauffeur Empire',
            companyLogo: d.companyLogo || '👁️',
            cash:        d.cash        || 0,
            reputation:  d.reputation  || 0,
            fleetSize:   (d.fleet || []).length,
            driverCount: (d.drivers || []).filter(x => x.id !== 'ceo').length,
            day:         d.day   || 1,
            month:       d.month || 1,
            ngp:         d.newGamePlusCount || 0,
            prestige:    d.prestige || 0,
        };
    } catch(e) { return null; }
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
    const key = SLOT_KEYS[window.currentSlotIndex];
    try {
        const save = {
            ...gameState,
            pendingRides: (gameState.pendingRides || []).map(r => {
                if (!r || !r.fromPoi) return null;
                return { id:r.id, fromPoi:r.fromPoi.id, toPoi:r.toPoi.id, tier:r.tier, price:r.price, duration:r.duration, elapsed:r.elapsed||0, driverId:r.driverId, hasIncident:r.hasIncident };
            }).filter(Boolean),
            activeRides: (gameState.activeRides || []).map(r => {
                if (!r || !r.fromPoi) return null;
                return { id:r.id, fromPoi:r.fromPoi.id, toPoi:r.toPoi.id, tier:r.tier, price:r.price, duration:r.duration, elapsed:r.elapsed||0, driverId:r.driverId };
            }).filter(Boolean),
            drivers: (gameState.drivers || []).map(d => ({
                ...d,
                queue: (d.queue || []).map(r => {
                    if (!r || !r.fromPoi) return null;
                    return { id:r.id, fromPoi:r.fromPoi.id, toPoi:r.toPoi.id, tier:r.tier, price:r.price, duration:r.duration, elapsed:r.elapsed||0 };
                }).filter(Boolean)
            }))
        };
        save._saveTimestamp = Date.now();
        // LocalStorage (fast, offline-safe)
        localStorage.setItem(key, JSON.stringify(save));
        // Auto-sync to file if folder is connected
        if (window.syncManager?.dirHandle) {
            window.syncManager.writeSlot(window.currentSlotIndex, save);
        }
        // Cloud save (fire-and-forget — don't block the game tick)
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
   ─────────────────────────────────────────────────────────────────
*/
const _CLOUD_MIN_INTERVAL_MS = 45_000;
const _lastCloudSaveTs = {};

function _updateCloudDot(state) {
    const dot = document.getElementById('cloud-sync-dot');
    if (!dot) return;
    dot.textContent = '☁';
    if (state === 'ok')  { dot.style.color = '#22c55e'; dot.title = '☁ Cloud sync OK'; }
    if (state === 'err') { dot.style.color = '#ef4444'; dot.title = '☁ Sync fallito (offline?)'; }
    if (state === 'busy'){ dot.style.color = '#f59e0b'; dot.title = '☁ Salvataggio cloud...'; }
    clearTimeout(dot._dim);
    dot._dim = setTimeout(() => { dot.style.opacity = '0.35'; }, 4000);
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
        else _updateCloudDot('ok');
    } catch(e) {
        console.warn('[SaveSystem] Cloud save failed (offline?):', e);
        _updateCloudDot('err');
    }
}

// Force an immediate cloud write (bypasses debounce) — used after major actions
window.forceCloudSave = function() {
    if (window.currentSlotIndex === null) return;
    _lastCloudSaveTs[window.currentSlotIndex] = 0; // reset debounce
    if (typeof window.saveCurrentSlot === 'function') window.saveCurrentSlot();
};

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
            onclick="window._selectedLogoSS='${l}'; document.querySelectorAll('.logo-opt-btn').forEach(b=>b.classList.remove('active')); this.classList.add('active')">
            ${l}
        </button>`
    ).join('');

    const colorGrid = BRAND_COLORS.map((c, i) =>
        `<button class="brand-color-btn ${i === 0 ? 'active' : ''}"
            style="background:${c.value}"
            title="${c.name}"
            onclick="window._selectedColorSS='${c.value}'; document.querySelectorAll('.brand-color-btn').forEach(b=>b.classList.remove('active')); this.classList.add('active'); document.getElementById('ss-color-preview').style.color='${c.value}'">
        </button>`
    ).join('');

    overlay.innerHTML = `
    <div class="ss-bg">
        <div class="ss-setup-card">
            <div class="ss-setup-title">Fondazione Impero</div>
            <div class="ss-setup-sub">Slot ${slotIndex + 1} · Nuova Partita</div>

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
                <button onclick="window.showSlotSelector()" class="ss-btn-secondary">← Indietro</button>
                <button onclick="_confirmNewGame(${slotIndex})" class="ss-btn-primary">Fonda Azienda →</button>
            </div>
        </div>
    </div>`;
}

function _confirmNewGame(slotIndex) {
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
    if (typeof window._startGameWithSlot === 'function') window._startGameWithSlot(slotIndex, true);
}
window._confirmNewGame = _confirmNewGame;

// ── MAIN SLOT SELECTOR ───────────────────────────────────────────
window.showSlotSelector = function() {
    const existing = document.getElementById('ss-overlay');
    if (existing) existing.remove();

    function _cashLabel(c) {
        if (c >= 1e9) return `€${(c/1e9).toFixed(2)}B`;
        if (c >= 1e6) return `€${(c/1e6).toFixed(2)}M`;
        if (c >= 1e3) return `€${Math.floor(c/1e3)}k`;
        return `€${Math.floor(c)}`;
    }

    const slotCards = [0,1,2].map(i => {
        const meta = _getSlotMeta(i);
        if (!meta) {
            return `
            <div class="ss-slot ss-slot-empty" onclick="window.startNewGameSlot(${i})" title="Slot ${i+1}: Nuovo Impero">
                <div class="ss-empty-plus">+</div>
                <div class="ss-empty-label">Slot ${i + 1}</div>
                <div class="ss-empty-sub">Nuovo Impero</div>
            </div>`;
        }
        const monthStr = MONTHS_SS[(meta.month||1)-1] || 'Gen';
        const ngpBadge = meta.ngp > 0 ? `<span class="ss-ngp-badge">♾️ NGP×${meta.ngp}</span>` : '';
        return `
        <div class="ss-slot ss-slot-occupied" onclick="window.loadExistingSlot(${i})" title="Entra in ${meta.companyName}">
            <div class="ss-slot-logo">${meta.companyLogo}</div>
            <div class="ss-slot-name">${meta.companyName}</div>
            ${ngpBadge}
            <div class="ss-slot-stats">
                <div class="ss-stat"><span class="ss-stat-lbl">Liquidità</span><span class="ss-stat-val" style="color:#22c55e">${_cashLabel(meta.cash)}</span></div>
                <div class="ss-stat"><span class="ss-stat-lbl">Reputazione</span><span class="ss-stat-val" style="color:#d4af37">${meta.reputation.toFixed(1)}★</span></div>
                <div class="ss-stat"><span class="ss-stat-lbl">Flotta</span><span class="ss-stat-val" style="color:#00f2ff">${meta.fleetSize} auto</span></div>
                <div class="ss-stat"><span class="ss-stat-lbl">Autisti</span><span class="ss-stat-val" style="color:#a78bfa">${meta.driverCount}</span></div>
                <div class="ss-stat"><span class="ss-stat-lbl">Giorno</span><span class="ss-stat-val" style="color:#9ca3af">${meta.day} ${monthStr}</span></div>
            </div>
            <div class="ss-slot-actions" onclick="event.stopPropagation()">
                <button onclick="window.loadExistingSlot(${i})" class="ss-btn-primary ss-btn-sm">Entra ↗</button>
                <button onclick="window.deleteSlot(${i})" class="ss-btn-danger ss-btn-sm">🗑</button>
            </div>
        </div>`;
    }).join('');

    // Current macro indicator
    const inflPct   = typeof gameState !== 'undefined' && gameState.inflationRate
        ? (gameState.inflationRate * 100).toFixed(1)
        : '2.0';
    const ratePct   = typeof gameState !== 'undefined' && gameState.interestRateBase
        ? (gameState.interestRateBase * 100).toFixed(1)
        : '4.5';

    const overlay = document.createElement('div');
    overlay.id    = 'ss-overlay';
    overlay.innerHTML = `
    <div class="ss-bg">
        <div class="ss-inner">
            <div class="ss-header">
                <div class="ss-main-logo">👁️</div>
                <h1 class="ss-title">CHAUFFEUR EMPIRE</h1>
                <p class="ss-subtitle">Scegli il tuo Impero</p>
                <div class="ss-edition">Global Tycoon · Multi-Profile · v1.0</div>
            </div>

            <div class="ss-grid">${slotCards}</div>

            <div class="ss-sync-bar">
                <div class="ss-sync-left">
                    <button class="ss-btn-secondary ss-sync-btn ss-cloud-btn"
                        onclick="window.forceSyncFromCloud && window.forceSyncFromCloud()"
                        title="Scarica i salvataggi più recenti dal cloud Supabase">
                        ☁ Ricarica da Cloud
                    </button>
                    <button class="ss-btn-secondary ss-sync-btn ss-cloud-btn"
                        onclick="window.forceCloudSave && window.forceCloudSave(); this.textContent='✓ Salvato!'; setTimeout(()=>this.textContent='☁ Salva ora',2000)"
                        title="Forza un salvataggio immediato sul cloud">
                        ☁ Salva ora
                    </button>
                    <span class="ss-sync-sep">·</span>
                    <button id="sync-folder-btn" class="ss-btn-secondary ss-sync-btn"
                        onclick="window.syncManager?.selectFolder()">📁 Git Sync</button>
                    <button class="ss-btn-secondary ss-sync-btn"
                        onclick="window.syncManager?.importAll()" title="Importa save da file (post git pull)">📥</button>
                    <button class="ss-btn-secondary ss-sync-btn"
                        onclick="window.syncManager?.exportAll()" title="Esporta save su file (pre git push)">📤</button>
                </div>
                <div id="sync-folder-info" class="ss-sync-info">
                    ${window.currentUser ? `☁ Account: ${window.currentUser.email}` : 'Collega la cartella per Git sync.'}
                </div>
            </div>

            <div class="ss-macro-bar">
                <span class="ss-macro-item">📈 Inflazione: <b>${inflPct}%</b></span>
                <span class="ss-macro-sep">·</span>
                <span class="ss-macro-item">🏦 Tasso BCE: <b>${ratePct}%</b></span>
                <span class="ss-macro-sep">·</span>
                <span class="ss-macro-item">🌍 Mercati globali aperti</span>
            </div>
            <div class="ss-logout-row">
                <button onclick="window.authLogout()" class="ss-btn-danger ss-btn-sm">⏻ Logout</button>
                ${window.currentUser ? `<span class="ss-user-label">${window.currentUser.email}</span>` : ''}
            </div>
        </div>
    </div>`;
    document.body.appendChild(overlay);

    // Legacy save migration (one-time offer)
    const legacy = localStorage.getItem(LEGACY_KEY);
    const hasAnySlot = SLOT_KEYS.some(k => localStorage.getItem(k));
    if (legacy && !hasAnySlot) {
        setTimeout(() => {
            if (confirm('Trovato un salvataggio precedente (v2). Vuoi importarlo nello Slot 1?')) {
                localStorage.setItem(SLOT_KEYS[0], legacy);
                localStorage.removeItem(LEGACY_KEY);
                window.showSlotSelector();
            }
        }, 600);
    }
};

window.startNewGameSlot = function(slotIndex) {
    const overlay = document.getElementById('ss-overlay');
    if (overlay) _showCompanySetup(slotIndex);
};

window.loadExistingSlot = function(slotIndex) {
    window.currentSlotIndex = slotIndex;
    const overlay = document.getElementById('ss-overlay');
    if (overlay) overlay.remove();
    if (typeof window._startGameWithSlot === 'function') window._startGameWithSlot(slotIndex, false);
};

// Bootstrap is handled by auth.js (showSlotSelector called after auth check)
