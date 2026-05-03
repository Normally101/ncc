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

// ── CLOUD SYNC: pull all slots for this user into localStorage ────
async function _syncSlotsFromCloud(userId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('game_saves')
            .select('slot_index, game_state, updated_at')
            .eq('user_id', userId);
        if (error || !data) return;
        let imported = 0;
        data.forEach(row => {
            const key      = `chauffeurEmpireSlot_${row.slot_index + 1}`; // was olgaVisionSlot_ (bug)
            const cloudTs  = new Date(row.updated_at).getTime();
            const localRaw = localStorage.getItem(key);
            if (localRaw) {
                try {
                    const local = JSON.parse(localRaw);
                    if ((local._saveTimestamp || 0) >= cloudTs) return; // local is newer
                } catch(e) {}
            }
            localStorage.setItem(key, JSON.stringify(row.game_state));
            localStorage.setItem(`_cloudSyncTs_${row.slot_index}`, new Date(row.updated_at).getTime().toString());
            imported++;
        });
        console.log(`[Auth] Cloud sync: ${imported} slot aggiornati da cloud, ${data.length - imported} già aggiornati.`);
    } catch(e) {
        console.warn('[Auth] Cloud sync failed (offline?):', e);
    }
}

// ── FORCE PULL FROM CLOUD (callable from slot selector) ──────────
window.forceSyncFromCloud = async function() {
    if (!window.currentUser) return;
    const dot = document.getElementById('cloud-sync-dot');
    if (dot) { dot.textContent = '☁'; dot.style.color = '#f59e0b'; dot.title = 'Sincronizzazione in corso...'; }
    await _syncSlotsFromCloud(window.currentUser.id);
    if (dot) { dot.textContent = '☁'; dot.style.color = '#22c55e'; dot.title = 'Cloud sync OK'; }
    if (typeof window.showSlotSelector === 'function') window.showSlotSelector();
};

// ── ON SUCCESSFUL AUTH ────────────────────────────────────────────
async function _onAuthSuccess(user) {
    window.currentUser = user;
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
        overlay.querySelector('.auth-card').innerHTML =
            `<div class="ss-main-logo">👁️</div>
             <p style="color:#22c55e;font-family:'Orbitron',sans-serif;font-size:13px;margin-top:12px">Sincronizzazione cloud...</p>`;
    }
    await _syncSlotsFromCloud(user.id);
    if (overlay) overlay.remove();
    if (typeof window.showSlotSelector === 'function') window.showSlotSelector();
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
