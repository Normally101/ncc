'use strict';
/* ================================================================
   auth.js — Chauffeur Empire · Supabase Auth + Cloud Slot Sync
   Redirect URL: https://www.chauffeurempire.com
   ================================================================ */

window.currentUser = null;

// ── ONE-TIME LEGACY KEY MIGRATION (olgaVision → chauffeurEmpire) ──
(function _migrateLegacyKeys() {
    const keyMap = {
        'olgaVisionSlot_1':       'chauffeurEmpireSlot_1',
        'olgaVisionSlot_2':       'chauffeurEmpireSlot_2',
        'olgaVisionSlot_3':       'chauffeurEmpireSlot_3',
        'olgaVisionSave_v2':      'chauffeurEmpireSave_v2',
        'olgaVisionLang':         'chauffeurEmpireLang',
        'olgaVisionTutorialDone': 'chauffeurEmpireTutorialDone',
    };
    Object.entries(keyMap).forEach(([old, neu]) => {
        const val = localStorage.getItem(old);
        if (val && !localStorage.getItem(neu)) {
            localStorage.setItem(neu, val);
            localStorage.removeItem(old);
        }
    });
})();

// ── LOAD SINGLE CLOUD SAVE → START GAME OR SETUP ─────────────────
async function _loadSaveAndStart(userId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('game_saves')
            .select('game_state, updated_at')
            .eq('user_id', userId)
            .eq('slot_index', 0)
            .maybeSingle();

        if (error) {
            // Surface the real Supabase error so the user can fix it
            const msg = error.message || JSON.stringify(error);
            console.error('[Auth] Cloud load error:', error);
            if (msg.includes('does not exist') || error.code === '42P01') {
                console.error('[Auth] ⚠ La tabella game_saves non esiste su Supabase. Esegui il CREATE TABLE nell\'SQL Editor.');
            }
            if (typeof showNotification === 'function') {
                showNotification(`☁ Errore cloud: ${msg.slice(0, 80)}`, 'error');
            }
        }

        if (data?.game_state) {
            const cloudTs  = new Date(data.updated_at).getTime();
            const localRaw = localStorage.getItem('chauffeurEmpireSlot_1');
            let useCloud = true;
            if (localRaw) {
                try {
                    const local = JSON.parse(localRaw);
                    if ((local._saveTimestamp || 0) >= cloudTs) useCloud = false;
                } catch(e) {}
            }
            if (useCloud) {
                localStorage.setItem('chauffeurEmpireSlot_1', JSON.stringify(data.game_state));
                localStorage.setItem('_cloudSyncTs_0', cloudTs.toString());
                console.log('[Auth] Save caricato dal cloud.');
            } else {
                console.log('[Auth] Save locale più recente del cloud — usato locale.');
            }
        }
    } catch(e) {
        console.warn('[Auth] Fetch cloud fallito (offline?):', e);
    }

    window.currentSlotIndex = 0;
    const localRaw = localStorage.getItem('chauffeurEmpireSlot_1');
    if (localRaw) {
        window._startGameWithSlot(0, false);
        // Push leaderboard immediately on login — don't wait for the 45s auto-save
        try {
            const localSave = JSON.parse(localRaw);
            if (typeof window.pushLeaderboardNow === 'function') {
                window.pushLeaderboardNow(localSave);
            }
        } catch(e) {}
    } else {
        // Nuovo utente — mostra setup azienda
        if (typeof window.showNewGameSetup === 'function') {
            window.showNewGameSetup();
        }
    }
}

// ── FORCE PULL (bottone ☁ nell'header) ────────────────────────────
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
        if (error) { console.error('[Auth] forceSyncFromCloud error:', error); if (typeof _updateCloudDot === 'function') _updateCloudDot('err'); return; }
        if (data?.game_state) {
            localStorage.setItem('chauffeurEmpireSlot_1', JSON.stringify(data.game_state));
            localStorage.setItem('_cloudSyncTs_0', new Date(data.updated_at).getTime().toString());
            if (typeof _updateCloudDot === 'function') _updateCloudDot('ok');
            if (typeof showNotification === 'function') showNotification('☁ Save aggiornato dal cloud!', 'success');
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
             <p style="color:#22c55e;font-family:'Orbitron',sans-serif;font-size:13px;margin-top:12px">Caricamento Impero...</p>`;
    }
    await _loadSaveAndStart(user.id);
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

    // Submit on Enter
    overlay.addEventListener('keydown', e => {
        if (e.key === 'Enter') window._authLogin();
    });
}

function _setAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
}

function _setAuthLoading(loading) {
    const loginBtn  = document.getElementById('auth-login-btn');
    const signupBtn = document.getElementById('auth-signup-btn');
    if (loginBtn)  loginBtn.disabled  = loading;
    if (signupBtn) signupBtn.disabled = loading;
    if (loginBtn)  loginBtn.textContent = loading ? '...' : 'Accedi →';
}

window._authLogin = async function() {
    const email    = document.getElementById('auth-email')?.value?.trim();
    const password = document.getElementById('auth-password')?.value;
    if (!email || !password) { _setAuthError('Inserisci email e password.'); return; }
    _setAuthError('');
    _setAuthLoading(true);
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
    _setAuthError('');
    _setAuthLoading(true);
    try {
        const { data, error } = await window.supabaseClient.auth.signUp({ email, password });
        if (error) { _setAuthError(_translateAuthError(error.message)); _setAuthLoading(false); return; }
        // Supabase may require email confirmation — if session is null, inform user
        if (!data.session) {
            _setAuthError('');
            const errEl = document.getElementById('auth-error');
            if (errEl) {
                errEl.textContent = '✅ Registrazione inviata! Controlla la tua email per confermare l\'account, poi accedi.';
                errEl.style.display = 'block';
                errEl.style.color = '#22c55e';
            }
            _setAuthLoading(false);
            return;
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

// ── LOGOUT (available globally) ───────────────────────────────────
window.authLogout = async function() {
    await window.supabaseClient.auth.signOut();
    window.currentUser = null;
    // Clear localStorage slots so next user starts fresh on this device
    ['chauffeurEmpireSlot_1','chauffeurEmpireSlot_2','chauffeurEmpireSlot_3'].forEach(k => localStorage.removeItem(k));
    location.reload();
};

// ── BOOTSTRAP ────────────────────────────────────────────────────
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
