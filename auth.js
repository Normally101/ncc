'use strict';
/* ================================================================
   auth.js — Olga Vision · Supabase Auth + Cloud Slot Sync
   ================================================================ */

window.currentUser = null;

// ── CLOUD SYNC: pull all slots for this user into localStorage ────
async function _syncSlotsFromCloud(userId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('game_saves')
            .select('slot_index, game_state, updated_at')
            .eq('user_id', userId);
        if (error || !data) return;
        data.forEach(row => {
            const key      = `olgaVisionSlot_${row.slot_index + 1}`;
            const cloudTs  = new Date(row.updated_at).getTime();
            const localRaw = localStorage.getItem(key);
            if (localRaw) {
                try {
                    const local = JSON.parse(localRaw);
                    if ((local._saveTimestamp || 0) >= cloudTs) return; // local is newer
                } catch(e) {}
            }
            localStorage.setItem(key, JSON.stringify(row.game_state));
        });
    } catch(e) {
        console.warn('[Auth] Cloud sync failed (offline?):', e);
    }
}

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

// ── AUTH OVERLAY UI (Landing Page MMO) ───────────────────────────
function _showAuthOverlay() {
    const existing = document.getElementById('auth-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.innerHTML = `
    <div class="lp-page">

        <!-- ══ HERO ══════════════════════════════════════════════ -->
        <section class="lp-hero">

            <!-- Sinistra: Copywriting -->
            <div class="lp-copy">
                <div class="lp-monogram">OV</div>
                <h1 class="lp-headline">DOMINA LE STRADE.<br>COSTRUISCI IL TUO IMPERO.</h1>
                <p class="lp-tagline">Il simulatore gestionale MMO dove ogni corsa, ogni autista e ogni investimento determinano il tuo potere. Fonda la tua compagnia di Chauffeur e scala la vetta globale.</p>
                <div class="lp-badges">
                    <div class="lp-badge">🏆 Classifica <span>live</span></div>
                    <div class="lp-badge">🚗 <span>20+</span> Veicoli di lusso</div>
                    <div class="lp-badge">⚡ Economia <span>dinamica</span></div>
                    <div class="lp-badge">💾 Salvataggio <span>cloud</span></div>
                </div>
            </div>

            <!-- Destra: Login glassmorphism -->
            <div class="lp-form-col">
                <div class="lp-glass-card">
                    <div class="lp-card-eyebrow">Olga Vision Agency</div>
                    <div class="lp-card-title">Accedi al tuo Impero</div>
                    <div class="auth-form">
                        <input id="auth-email"    type="email"    placeholder="Email"
                               class="ss-input" autocomplete="email">
                        <input id="auth-password" type="password" placeholder="Password (min 6 caratteri)"
                               class="ss-input" autocomplete="current-password">
                        <div id="auth-error" class="auth-error"></div>
                        <button id="auth-login-btn"  class="lp-btn-primary"
                                onclick="window._authLogin()">Accedi →</button>
                        <button id="auth-signup-btn" class="lp-btn-secondary"
                                onclick="window._authSignup()">Crea Account Gratis</button>
                        <p class="auth-hint">Nuovo? Premi "Crea Account" per registrarti con email e password.</p>
                    </div>
                </div>
            </div>
        </section>

        <!-- ══ STATS BAR ══════════════════════════════════════════ -->
        <section class="lp-stats">
            <div class="lp-stat">
                <div class="lp-stat-icon">🌍</div>
                <div class="lp-stat-val" id="lp-stat-players">0</div>
                <div class="lp-stat-label">Giocatori Attivi</div>
            </div>
            <div class="lp-stat">
                <div class="lp-stat-icon">🚕</div>
                <div class="lp-stat-val" id="lp-stat-rides">0</div>
                <div class="lp-stat-label">Corse Completate</div>
            </div>
            <div class="lp-stat">
                <div class="lp-stat-icon">💼</div>
                <div class="lp-stat-val">€1.2 Mld</div>
                <div class="lp-stat-label">Fatturato Globale</div>
            </div>
        </section>

        <!-- ══ FEATURES ═══════════════════════════════════════════ -->
        <section class="lp-features">
            <div class="lp-feat-card">
                <span class="lp-feat-icon">🚗</span>
                <div class="lp-feat-title">Costruisci la tua Flotta</div>
                <div class="lp-feat-desc">Acquista veicoli di lusso, dalle berline premium alle Mercedes S-Class presidenziali. Ogni auto apre contratti esclusivi e nuovi mercati ad alto margine.</div>
            </div>
            <div class="lp-feat-card">
                <span class="lp-feat-icon">🤝</span>
                <div class="lp-feat-title">Gestisci lo Staff</div>
                <div class="lp-feat-desc">Assumi autisti con skill uniche — Velocità, Carisma, Efficienza. Ottimizza i turni, monitora la fatica e incassa commissioni anche mentre sei offline.</div>
            </div>
            <div class="lp-feat-card">
                <span class="lp-feat-icon">⚔️</span>
                <div class="lp-feat-title">Schiaccia la Concorrenza</div>
                <div class="lp-feat-desc">Scala la classifica globale, conquista le regioni con licenze esclusive e lancia guerre di prezzo contro i tuoi rivali. Solo uno comanda le strade.</div>
            </div>
        </section>

        <footer class="lp-footer">
            © Olga Vision Agency · Tycoon Edition &nbsp;·&nbsp; Solo per uso privato
        </footer>
    </div>`;
    document.body.appendChild(overlay);

    // Submit on Enter
    overlay.addEventListener('keydown', e => {
        if (e.key === 'Enter') window._authLogin();
    });

    // Countup animation for live stats
    _animateLpCounters();
}

function _animateLpCounters() {
    [
        { id: 'lp-stat-players', end: 1402  },
        { id: 'lp-stat-rides',   end: 45930 },
    ].forEach(({ id, end }) => {
        const el = document.getElementById(id);
        if (!el) return;
        let v = 0;
        const step = Math.ceil(end / 55);
        const tick = () => {
            v = Math.min(v + step, end);
            el.textContent = v.toLocaleString('it-IT');
            if (v < end) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
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
    ['olgaVisionSlot_1','olgaVisionSlot_2','olgaVisionSlot_3'].forEach(k => localStorage.removeItem(k));
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
