'use strict';
/* ================================================================
   auth.js — Chauffeur Empire
   Core auth: _mmoBootSequence, _onAuthSuccess, _startHeartbeat,
   forceSyncFromCloud, authLogout, DOMContentLoaded bootstrap.
   Dipendenze: supabase-config.js, saveSystem.js, serverState.js,
   ui-landing.js (_showAuthOverlay)
   ================================================================ */

window.currentUser = null;

// ── ONE-TIME LEGACY KEY MIGRATION (olgaVision → chauffeurEmpire) ──
(function _migrateLegacyKeys() {
    const map = {
        'olgaVisionSlot_1':       'chauffeurEmpireSlot_1',
        'olgaVisionSlot_2':       'chauffeurEmpireSlot_2',
        'olgaVisionSlot_3':       'chauffeurEmpireSlot_3',
        'olgaVisionSave_v2':      'chauffeurEmpireSave_v2',
        'olgaVisionLang':         'chauffeurEmpireLang',
        'olgaVisionTutorialDone': 'chauffeurEmpireTutorialDone',
    };
    Object.entries(map).forEach(([old, neu]) => {
        const v = localStorage.getItem(old);
        if (v && !localStorage.getItem(neu)) { localStorage.setItem(neu, v); localStorage.removeItem(old); }
    });
})();


// ════════════════════════════════════════════════════════════════
// MMO BOOT SEQUENCE
// Called once after every successful login or session restore.
// ════════════════════════════════════════════════════════════════
async function _mmoBootSequence(userId) {
    console.group('[Auth] 🚀 MMO Boot Sequence');

    // ── Phase 1: Server-Authoritative state (MMO schema) ──────────
    let serverReady = false;
    let hasCompanyRow = false;

    if (window.ServerState) {
        try {
            const state = await window.ServerState.init(window.supabaseClient);
            serverReady = true;
            hasCompanyRow = !!state.company;
            console.log('[Auth] Phase 1 ✅ ServerState pronto —',
                hasCompanyRow ? `company: ${state.company.company_name}, cash: €${state.company.cash}` : 'nessuna company row');

            // Ensure company row exists (idempotent: ON CONFLICT updates only company_name)
            if (!hasCompanyRow) {
                const companyName = window._pendingCompanyName || 'Chauffeur Empire';
                const created = await window.ServerState.initCompany(companyName);
                hasCompanyRow = !!created;
                console.log('[Auth] Phase 1 → Company creata:', created?.company_name);
            }
        } catch(e) {
            // Tables may not exist yet if SQL migration hasn't been run.
            // Non-fatal: fall through using legacy flow only.
            console.warn('[Auth] Phase 1 ⚠ ServerState fallito (tabelle MMO assenti?):', e.message);
        }
    }

    // ── Phase 2: Simulation state from cloud game_saves ───────────
    // The server is ALWAYS the source of truth — no timestamp comparison.
    let cloudSimState = null;
    let simLoadError  = false;

    try {
        const { data, error } = await window.supabaseClient
            .from('game_saves')
            .select('game_state, updated_at')
            .eq('user_id', userId)
            .eq('slot_index', 0)
            .maybeSingle();

        if (error) {
            const msg = error.message || JSON.stringify(error);
            if (msg.includes('does not exist') || error.code === '42P01') {
                console.warn('[Auth] Phase 2 ⚠ Tabella game_saves assente — avvio fresh.');
            } else {
                console.error('[Auth] Phase 2 ✗ game_saves fetch error:', msg);
                if (typeof showNotification === 'function') showNotification(`☁ Errore cloud: ${msg.slice(0, 80)}`, 'error');
                simLoadError = true;
            }
        } else {
            cloudSimState = data?.game_state || null;
            if (cloudSimState) {
                console.log('[Auth] Phase 2 ✅ Simulazione caricata dal cloud —',
                    new Date(data.updated_at).toLocaleString('it-IT'));
            } else {
                console.log('[Auth] Phase 2 → Nessun save simulazione sul server.');
            }
        }
    } catch(e) {
        console.warn('[Auth] Phase 2 ⚠ game_saves fetch fallito (offline?):', e.message);
        // Offline: tolerate and continue — Phase 3 will use cache if present
    }

    // ── Phase 3: Hydrate localStorage cache (write-through only) ──
    // localStorage is a WRITE-THROUGH CACHE: we write to it here so
    // engine.js can read via its existing loadGame() call. It is never
    // used as an independent source of truth.
    window.currentSlotIndex = 0;

    if (cloudSimState) {
        // Cloud data always overwrites the local cache — no timestamp comparison.
        localStorage.setItem('chauffeurEmpireSlot_1', JSON.stringify(cloudSimState));
        localStorage.removeItem('_cloudSyncTs_0'); // timestamp comparison era is over
    }
    // If cloud fetch failed (simLoadError or offline), we may have a stale cache.
    // That cache is used only as a temporary fallback — player will see a warning.

    // ── Phase 4: Start game engine ─────────────────────────────────
    const hasLocalCache = !!localStorage.getItem('chauffeurEmpireSlot_1');
    const _clearLocalCache = () =>
        ['chauffeurEmpireSlot_1','chauffeurEmpireSlot_2','chauffeurEmpireSlot_3'].forEach(k => localStorage.removeItem(k));

    if (cloudSimState) {
        // ── Happy path: cloud save exists → load it ──────────────────
        console.log('[Auth] Phase 4 → Carico save dal cloud.');
        window._startGameWithSlot(0, false);

    } else if (!simLoadError) {
        // ── Cloud responded OK but has no save ───────────────────────
        // localStorage cannot be trusted (stale from a previous account/DB state).
        // Always discard it.
        _clearLocalCache();
        console.log('[Auth] Phase 4 → Cloud OK, nessun save — cancello cache locale.');

        // If Phase 1 failed to create the company row, retry now
        if (!hasCompanyRow && window.ServerState) {
            try {
                const created = await window.ServerState.initCompany(
                    window._pendingCompanyName || 'Chauffeur Empire'
                );
                if (created) hasCompanyRow = true;
                console.log('[Auth] Phase 4 → Company creata (retry):', created?.company_name);
            } catch(e) {
                console.warn('[Auth] Phase 4 ⚠ initCompany retry fallita:', e.message);
            }
        }

        if (hasCompanyRow) {
            console.log('[Auth] Phase 4 → Avvio partita fresca.');
            window._startGameWithSlot(0, true);
        } else {
            console.log('[Auth] Phase 4 → Nessuna company row — mostra setup azienda.');
            console.groupEnd();
            if (typeof window.showNewGameSetup === 'function') window.showNewGameSetup();
            return;
        }

    } else {
        // ── Cloud error (offline / network issue) ────────────────────
        // Fall back to localStorage as emergency, or show setup if nothing available.
        if (hasLocalCache) {
            console.warn('[Auth] Phase 4 ⚠ Avvio offline con cache locale.');
            if (typeof showNotification === 'function') showNotification('⚠ Avvio offline — sincronizza appena possibile.', 'error');
            window._startGameWithSlot(0, false);
        } else if (hasCompanyRow) {
            window._startGameWithSlot(0, true);
        } else {
            console.groupEnd();
            if (typeof window.showNewGameSetup === 'function') window.showNewGameSetup();
            return;
        }
    }

    // ── Phase 5: Override simulation cash with authoritative server value ──
    // The companies table is always authoritative for cash / reputation.
    // This runs AFTER engine.js loads the JSON blob so we always win.
    if (serverReady) {
        window.ServerState.bridgeToGameState();
        console.log('[Auth] Phase 5 ✅ Cash autoritativo dal server applicato:',
            '€' + (window.ServerState.getCompany()?.cash || '?'));
    }

    // ── Phase 6: Process offline gains ────────────────────────────
    if (serverReady) {
        try {
            const { data: gains, error: gainsErr } = await window.supabaseClient
                .rpc('rpc_process_offline_gains');
            if (!gainsErr && gains?.ok && gains.hours_processed > 0.05 && gains.earned_cash > 0) {
                console.log('[Auth] Phase 6 ✅ Guadagni offline:', gains);
                window.ServerState.bridgeToGameState();
                _showOfflineGainsModal(gains);
            } else {
                console.log('[Auth] Phase 6 → Nessun guadagno offline significativo.');
            }
        } catch(e) {
            console.warn('[Auth] Phase 6 ⚠ rpc_process_offline_gains fallita:', e.message);
        }
    }

    // ── Heartbeat: aggiorna last_active_at ogni 60 secondi ────────
    _startHeartbeat();

    console.log('[Auth] ✅ Boot MMO completato.');
    console.groupEnd();
}

function _showOfflineGainsModal(gains) {
    const existing = document.getElementById('offline-gains-modal');
    if (existing) existing.remove();

    const h    = gains.hours_processed;
    const cash = gains.earned_cash;
    const hLabel = h >= 1 ? `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m` : `${Math.round(h * 60)} minuti`;
    const energyLine = gains.energy_restored > 0
        ? `<p style="color:#60a5fa;font-size:11px;margin:4px 0 0">🛌 Auto-Rest: +${gains.energy_restored}% energia CEO recuperata</p>`
        : '';

    const modal = document.createElement('div');
    modal.id = 'offline-gains-modal';
    modal.style.cssText = `
        position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;
        display:flex;align-items:center;justify-content:center;
        background:rgba(0,0,0,0.75);backdrop-filter:blur(6px)`;
    modal.innerHTML = `
    <div style="
        background:rgba(8,8,20,0.97);border:1px solid rgba(212,175,55,0.5);
        border-radius:20px;padding:32px 36px;max-width:380px;width:90%;
        box-shadow:0 0 60px rgba(212,175,55,0.15);text-align:center;
        font-family:'Roboto Mono',monospace">
        <div style="font-size:40px;margin-bottom:12px">💼</div>
        <h2 style="color:#d4af37;font-family:'Orbitron',sans-serif;font-size:15px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.1em">Mentre eri via…</h2>
        <p style="color:#9ca3af;font-size:10px;margin:0 0 18px;text-transform:uppercase;letter-spacing:0.08em">I tuoi autisti hanno lavorato</p>
        <div style="background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.2);border-radius:12px;padding:16px;margin-bottom:18px">
            <div style="color:#6b7280;font-size:9px;text-transform:uppercase;margin-bottom:4px">Durata offline</div>
            <div style="color:#e5e7eb;font-size:18px;font-weight:700">${hLabel}</div>
        </div>
        <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:12px;padding:16px;margin-bottom:18px">
            <div style="color:#6b7280;font-size:9px;text-transform:uppercase;margin-bottom:4px">Guadagnato</div>
            <div style="color:#22c55e;font-size:26px;font-weight:700;font-family:'Orbitron',sans-serif">+€${cash.toLocaleString('it-IT')}</div>
            ${energyLine}
        </div>
        <button onclick="document.getElementById('offline-gains-modal').remove()"
            style="background:linear-gradient(135deg,#d4af37,#b8962e);color:#000;border:none;
            border-radius:10px;padding:10px 28px;font-weight:700;font-size:12px;
            cursor:pointer;width:100%;font-family:'Orbitron',sans-serif;letter-spacing:0.05em">
            Ottimo! Continua →
        </button>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

let _heartbeatTimer = null;
function _startHeartbeat() {
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    _heartbeatTimer = setInterval(async () => {
        if (!window.currentUser || !window.supabaseClient) return;
        try {
            await window.supabaseClient.rpc('rpc_ping');
        } catch(e) { /* silent — offline */ }
    }, 60000);
}


// ── FORCE SYNC FROM CLOUD (bottone ☁ nell'header) ─────────────────
// Pulls fresh simulation state from cloud and re-applies authoritative
// MMO financial data on top.
window.forceSyncFromCloud = async function() {
    if (!window.currentUser) return;
    if (typeof _updateCloudDot === 'function') _updateCloudDot('busy');
    try {
        const { data, error } = await window.supabaseClient
            .from('game_saves')
            .select('game_state, updated_at')
            .eq('user_id', window.currentUser.id)
            .eq('slot_index', 0)
            .maybeSingle();

        if (error) {
            console.error('[Auth] forceSyncFromCloud error:', error);
            if (typeof _updateCloudDot === 'function') _updateCloudDot('err');
            return;
        }

        if (data?.game_state) {
            // Write-through: cloud overwrites cache unconditionally
            localStorage.setItem('chauffeurEmpireSlot_1', JSON.stringify(data.game_state));

            // Re-apply authoritative financial data from MMO schema
            if (window.ServerState?.isReady()) {
                window.ServerState.bridgeToGameState();
            }

            if (typeof _updateCloudDot === 'function') _updateCloudDot('ok');
            if (typeof showNotification === 'function') showNotification('☁ Stato sincronizzato dal server!', 'success');
            if (typeof updateUI === 'function') updateUI();
        } else {
            if (typeof _updateCloudDot === 'function') _updateCloudDot('ok');
        }
    } catch(e) {
        console.error('[Auth] forceSyncFromCloud exception:', e);
        if (typeof _updateCloudDot === 'function') _updateCloudDot('err');
    }
};


// ── ON SUCCESSFUL AUTH ────────────────────────────────────────────
async function _onAuthSuccess(user) {
    window.currentUser = user;
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
        const card = overlay.querySelector('.lp-glass-card');
        if (card) card.innerHTML = `
            <div style="text-align:center;padding:48px 20px">
                <div style="font-size:2.5rem;margin-bottom:16px">👁️</div>
                <p style="color:#22c55e;font-family:'Orbitron',sans-serif;font-size:13px;margin:0;letter-spacing:.07em">CONNESSIONE ALL'IMPERO…</p>
            </div>`;
    }

    await _mmoBootSequence(user.id);

    if (typeof window.p2pInit === 'function') window.p2pInit();
    if (typeof window.b2bInit === 'function') window.b2bInit();
    if (typeof window.tourismInit === 'function') window.tourismInit();
    if (typeof window.auctionsInit === 'function') window.auctionsInit();
    if (typeof window.driverSkillsInit === 'function') window.driverSkillsInit();
    if (typeof window.globalEventsInit === 'function') window.globalEventsInit();
    if (typeof window.decreesRefresh === 'function') window.decreesRefresh(true);
    if (typeof window.shadowInit === 'function') window.shadowInit();
    if (typeof window.cryptoInit === 'function') window.cryptoInit();
    if (typeof window.realWeatherInit === 'function') window.realWeatherInit();
    if (typeof window.hqInit === 'function') window.hqInit();

    if (overlay) overlay.remove();

    // Chiama hook opzionali registrati da moduli late-loaded (es. push-notifications.js)
    (window._onAuthSuccessHooks || []).forEach(fn => { try { fn(user); } catch {} });
}

// ── LOGOUT ────────────────────────────────────────────────────────
window.authLogout = async function() {
    await window.supabaseClient.auth.signOut();
    window.currentUser = null;
    // Clear the local cache — next user starts with a clean slate on this device
    ['chauffeurEmpireSlot_1','chauffeurEmpireSlot_2','chauffeurEmpireSlot_3'].forEach(k => localStorage.removeItem(k));
    location.reload();
};

// ── BOOTSTRAP ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session?.user) {
            await _onAuthSuccess(session.user);
        } else {
            _showAuthOverlay();
        }
    } catch(e) {
        console.error('[Auth] getSession failed:', e);
        _showAuthOverlay();
    }
});
