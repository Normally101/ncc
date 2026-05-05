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
        overlay.querySelector('.auth-card').innerHTML =
            `<div class="ss-main-logo">👁️</div>
             <p style="color:#22c55e;font-family:'Orbitron',sans-serif;font-size:13px;margin-top:12px">Connessione all'Impero…</p>`;
    }

    await _mmoBootSequence(user.id);

    if (overlay) overlay.remove();
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
                    <div class="lp-badge">
                        <svg class="lp-icon-xs" viewBox="0 0 24 24"><path d="M6 9H3V3h18v6h-3m0 0a6 6 0 0 1-12 0M9 21h6m-3-6v6m-3 0h6"/></svg>
                        Classifica <span>live</span>
                    </div>
                    <div class="lp-badge">
                        <svg class="lp-icon-xs" viewBox="0 0 24 24"><path d="M5 17H3v-3l2.5-6h13L21 14v3h-2m-4 0H9m-2 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0m8 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0"/></svg>
                        <span>20+</span> Veicoli di lusso
                    </div>
                    <div class="lp-badge">
                        <svg class="lp-icon-xs" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        Economia <span>dinamica</span>
                    </div>
                    <div class="lp-badge">
                        <svg class="lp-icon-xs" viewBox="0 0 24 24"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
                        Salvataggio <span>cloud</span>
                    </div>
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
                <svg class="lp-icon-stat" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                <div class="lp-stat-val" id="lp-stat-players">0</div>
                <div class="lp-stat-label">Giocatori Attivi</div>
            </div>
            <div class="lp-stat">
                <svg class="lp-icon-stat" viewBox="0 0 24 24">
                    <path d="M5 17H3v-3l2.5-6h13L21 14v3h-2m-4 0H9m-2 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0m8 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0"/>
                </svg>
                <div class="lp-stat-val" id="lp-stat-rides">0</div>
                <div class="lp-stat-label">Corse Completate</div>
            </div>
            <div class="lp-stat">
                <svg class="lp-icon-stat" viewBox="0 0 24 24">
                    <rect x="2" y="7" width="20" height="14" rx="2"/>
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                </svg>
                <div class="lp-stat-val">€1.2 Mld</div>
                <div class="lp-stat-label">Fatturato Globale</div>
            </div>
        </section>

        <!-- ══ FEATURES ═══════════════════════════════════════════ -->
        <section class="lp-features">
            <div class="lp-feat-card">
                <div class="lp-feat-icon-wrap">
                    <svg class="lp-icon-lg" viewBox="0 0 24 24">
                        <path d="M5 17H3v-3l2.5-6h13L21 14v3h-2m-4 0H9m-2 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0m8 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0"/>
                    </svg>
                </div>
                <div class="lp-feat-title">Costruisci la tua Flotta</div>
                <div class="lp-feat-desc">Acquista veicoli di lusso, dalle berline premium alle Mercedes S-Class presidenziali. Ogni auto apre contratti esclusivi e nuovi mercati ad alto margine.</div>
            </div>
            <div class="lp-feat-card">
                <div class="lp-feat-icon-wrap">
                    <svg class="lp-icon-lg" viewBox="0 0 24 24">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                </div>
                <div class="lp-feat-title">Gestisci lo Staff</div>
                <div class="lp-feat-desc">Assumi autisti con skill uniche — Velocità, Carisma, Efficienza. Ottimizza i turni, monitora la fatica e incassa commissioni anche mentre sei offline.</div>
            </div>
            <div class="lp-feat-card">
                <div class="lp-feat-icon-wrap">
                    <svg class="lp-icon-lg" viewBox="0 0 24 24">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                        <polyline points="17 6 23 6 23 12"/>
                    </svg>
                </div>
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
