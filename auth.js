'use strict';
/* ================================================================
   auth.js — Chauffeur Empire · MMO Boot Sequence
   Architecture: Server-Authoritative (Supabase is single source of truth)

   Boot priority:
     1. Supabase `companies` table   → cash, reputation    (always authoritative)
     2. Supabase `game_saves` table  → simulation state    (day, weather, investments…)
     3. LocalStorage                 → write-through cache ONLY (never read as primary)

   The old "local newer than cloud" timestamp comparison is gone.
   If the server is unavailable, the game shows an error — no stale local fallback.
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

    if (cloudSimState || hasLocalCache) {
        if (!cloudSimState && hasLocalCache) {
            // Offline or game_saves unavailable — using stale cache as emergency fallback
            console.warn('[Auth] Phase 4 ⚠ Avvio con cache locale (cloud non disponibile).');
            if (typeof showNotification === 'function') showNotification('⚠ Avvio offline — sincronizza appena possibile.', 'error');
        }
        window._startGameWithSlot(0, false);
    } else if (hasCompanyRow) {
        // Player has an MMO company but no simulation blob → start fresh simulation
        console.log('[Auth] Phase 4 → Company MMO esistente, nessuna sim — avvio fresca.');
        window._startGameWithSlot(0, true);
    } else {
        // Truly new player — show company setup form
        console.log('[Auth] Phase 4 → Nuovo giocatore — mostra setup azienda.');
        console.groupEnd();
        if (typeof window.showNewGameSetup === 'function') window.showNewGameSetup();
        return;
    }

    // ── Phase 5: Override simulation cash with authoritative server value ──
    // The companies table is always authoritative for cash / reputation.
    // This runs AFTER engine.js loads the JSON blob so we always win.
    if (serverReady) {
        window.ServerState.bridgeToGameState();
        console.log('[Auth] Phase 5 ✅ Cash autoritativo dal server applicato:',
            '€' + (window.ServerState.getCompany()?.cash || '?'));
    }

    console.log('[Auth] ✅ Boot MMO completato.');
    console.groupEnd();
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
        overlay.querySelector('.auth-card').innerHTML =
            `<div class="ss-main-logo">👁️</div>
             <p style="color:#22c55e;font-family:'Orbitron',sans-serif;font-size:13px;margin-top:12px">Connessione all'Impero…</p>`;
    }

    await _mmoBootSequence(user.id);

    if (overlay) overlay.remove();
}


// ── AUTH OVERLAY UI ───────────────────────────────────────────────
function _showAuthOverlay() {
    const existing = document.getElementById('auth-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.innerHTML = `
    <div class="auth-card">
        <div class="ss-main-logo" style="font-size:48px">👁️</div>
        <h1 class="ss-title" style="font-size:clamp(22px,4vw,32px);margin:10px 0 2px">CHAUFFEUR EMPIRE</h1>
        <p class="ss-subtitle" style="margin-bottom:24px">Accedi al tuo Impero</p>
        <div class="auth-form">
            <input id="auth-email"    type="email"    placeholder="Email"    class="ss-input" autocomplete="email">
            <input id="auth-password" type="password" placeholder="Password (min 6 caratteri)" class="ss-input" autocomplete="current-password">
            <div id="auth-error" class="auth-error"></div>
            <div class="ss-btn-row" style="margin-top:4px">
                <button id="auth-login-btn"  class="ss-btn-primary"   onclick="window._authLogin()">Accedi →</button>
                <button id="auth-signup-btn" class="ss-btn-secondary" onclick="window._authSignup()">Registrati</button>
            </div>
            <p class="auth-hint">Nuovo account? Premi Registrati con email e password.</p>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('keydown', e => { if (e.key === 'Enter') window._authLogin(); });
}

function _setAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
}

function _setAuthLoading(loading) {
    const loginBtn  = document.getElementById('auth-login-btn');
    const signupBtn = document.getElementById('auth-signup-btn');
    if (loginBtn)  { loginBtn.disabled = loading; loginBtn.textContent = loading ? '…' : 'Accedi →'; }
    if (signupBtn)   signupBtn.disabled = loading;
}

window._authLogin = async function() {
    const email    = document.getElementById('auth-email')?.value?.trim();
    const password = document.getElementById('auth-password')?.value;
    if (!email || !password) { _setAuthError('Inserisci email e password.'); return; }
    _setAuthError(''); _setAuthLoading(true);
    try {
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
        if (error) { _setAuthError(_translateAuthError(error.message)); _setAuthLoading(false); return; }
        await _onAuthSuccess(data.user);
    } catch(e) { _setAuthError('Errore di connessione. Riprova.'); _setAuthLoading(false); }
};

window._authSignup = async function() {
    const email    = document.getElementById('auth-email')?.value?.trim();
    const password = document.getElementById('auth-password')?.value;
    if (!email || !password) { _setAuthError('Inserisci email e password.'); return; }
    if (password.length < 6) { _setAuthError('Password troppo corta (minimo 6 caratteri).'); return; }
    _setAuthError(''); _setAuthLoading(true);
    try {
        const { data, error } = await window.supabaseClient.auth.signUp({ email, password });
        if (error) { _setAuthError(_translateAuthError(error.message)); _setAuthLoading(false); return; }
        if (!data.session) {
            const errEl = document.getElementById('auth-error');
            if (errEl) {
                errEl.textContent = '✅ Registrazione inviata! Controlla la tua email per confermare, poi accedi.';
                errEl.style.display = 'block'; errEl.style.color = '#22c55e';
            }
            _setAuthLoading(false); return;
        }
        await _onAuthSuccess(data.user);
    } catch(e) { _setAuthError('Errore di connessione. Riprova.'); _setAuthLoading(false); }
};

function _translateAuthError(msg) {
    if (!msg) return 'Errore sconosciuto.';
    const m = msg.toLowerCase();
    if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Credenziali errate. Controlla email e password.';
    if (m.includes('email not confirmed')) return 'Email non confermata. Controlla la tua casella.';
    if (m.includes('user already registered')) return 'Email già registrata. Prova ad accedere.';
    if (m.includes('password')) return 'Password troppo corta (minimo 6 caratteri).';
    if (m.includes('rate limit')) return 'Troppi tentativi. Attendi qualche minuto.';
    return msg;
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
