'use strict';
/* ui-help.js — Chauffeur Empire
   renderTabHelp, renderCurrentTab.
   Dipendenze: engine.js */

// ══════════════════════════════════════════════════════════════════
// TAB AIUTO & SUPPORTO
// ══════════════════════════════════════════════════════════════════

function renderTabHelp() {
    const container = document.getElementById('tab-container');
    const cfg = window.GAME_CONFIG || {};
    const email = cfg.SUPPORT_EMAIL || 'support@chauffeurempire.com';
    const userId = window.currentUser?.id || 'N/D';
    const companyName = (gameState.companyName || 'La tua azienda');
    const bugSubject = encodeURIComponent(`Bug Report — ID: ${userId}`);
    const generalSubject = encodeURIComponent(`Supporto — ${companyName}`);
    const build = new Date().toLocaleDateString('it-IT', { month:'short', year:'numeric' });

    container.innerHTML = `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #21262d">
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Centro Assistenza</div>
        <div style="font-size:20px;font-weight:700;color:#e6edf3">Supporto &amp; Documentazione</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px">Risposta garantita entro 24h · Build ${build}</div>
    </div>` + `

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">

        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px">Contatto Diretto</div>
            <div style="font-size:13px;font-weight:700;color:#e6edf3;margin-bottom:6px">📧 Email Ufficiale</div>
            <div style="font-size:11px;color:#6b7280;margin-bottom:12px">Il team risponde entro 24h nei giorni lavorativi. Includi sempre il tuo ID compagnia.</div>
            <a href="mailto:${email}" style="display:inline-flex;text-decoration:none;background:#1a1608;border:1px solid #c79a2a;color:#c79a2a;padding:5px 12px;border-radius:4px;font-size:10px;cursor:pointer">
                ✉ ${email}
            </a>
        </div>

        <div style="background:rgba(248,81,73,0.04);border:1px solid rgba(248,81,73,0.2);border-radius:6px;padding:16px">
            <div style="font-size:9px;color:#db5746;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px">Segnalazione Bug</div>
            <div style="font-size:13px;font-weight:700;color:#e6edf3;margin-bottom:6px">🐛 Report Tecnico</div>
            <div style="font-size:11px;color:#6b7280;margin-bottom:8px">ID Compagnia pre-compilato nell'oggetto. Descrivi il bug nella mail.</div>
            <div style="font-size:9px;font-family:monospace;color:#6b7280;margin-bottom:12px;word-break:break-all">${userId}</div>
            <a href="mailto:${email}?subject=${bugSubject}" style="display:inline-flex;text-decoration:none;width:100%;justify-content:center;background:#161b22;border:1px solid #f0c4bd;color:#db5746;padding:5px 12px;border-radius:4px;font-size:10px;cursor:pointer;box-sizing:border-box">
                🐛 Apri Email — Segnala Bug
            </a>
        </div>
    </div>

    <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:16px;margin-bottom:20px">
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px">Domande Frequenti</div>
        <div style="display:flex;flex-direction:column;gap:0">
            ${[
                { q:'Come recupero la password?',  a:`Usa il link "Password dimenticata" nella schermata di login. Il link è valido 30 minuti.` },
                { q:'I miei progressi sono salvati?', a:`Sì. Il gioco usa salvataggio cloud automatico su Supabase. I dati vengono sincronizzati ogni volta che esegui un\'azione.` },
                { q:'Come funziona la classifica?', a:`Si aggiorna ogni volta che un giocatore completa un\'azione (corsa, acquisto, ecc). Mostra il patrimonio liquido totale.` },
                { q:'Posso giocare su più dispositivi?', a:`Sì, il salvataggio cloud ti permette di continuare su qualsiasi browser. Usa le stesse credenziali.` },
                { q:'Problemi con i pagamenti DC?', a:`Scrivi all\'email di supporto con oggetto "Pagamento DC" e il tuo ID compagnia. Verifichiamo entro 4h.` },
            ].map((faq, i) => `
            <div style="padding:12px 0;border-bottom:1px solid var(--border-sub);cursor:pointer"
                 onclick="this.querySelector('.faq-a').style.display=this.querySelector('.faq-a').style.display==='none'?'block':'none'">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="font-size:11px;font-weight:600;color:var(--text)">${faq.q}</div>
                    <span style="color:var(--text-muted);font-size:14px">⌄</span>
                </div>
                <div class="faq-a" style="display:none;margin-top:8px;font-size:11px;color:var(--text-muted);line-height:1.5">${faq.a}</div>
            </div>`).join('')}
        </div>
    </div>

    <div style="text-align:center;padding:16px;background:#161b22;border-radius:10px;border:1px solid #21262d">
        <div style="font-size:9px;color:var(--text-dim);font-family:var(--font-mono)">
            CHAUFFEUR EMPIRE · ${cfg.GAME_URL || 'chauffeurempire.com'} · Build ${build}
        </div>
        <div style="margin-top:8px;display:flex;gap:12px;justify-content:center">
            <a href="terms.html" target="_blank" style="font-size:9px;color:var(--text-muted);text-decoration:none">Termini</a>
            <a href="privacy.html" target="_blank" style="font-size:9px;color:var(--text-muted);text-decoration:none">Privacy</a>
            <a href="rules.html" target="_blank" style="font-size:9px;color:var(--text-muted);text-decoration:none">Regole</a>
        </div>
    </div>`;
}
window.renderTabHelp = renderTabHelp;

// Re-render whatever tab is currently active (used by lang.js setLang)
window.renderCurrentTab = function() {
    if (typeof _activeTab !== 'undefined' && _activeTab) {
        window.switchTab(_activeTab);
    }
};

// ── SMART HUB ────────────────────────────────────────────────────
