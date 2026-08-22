'use strict';
/* ui-help.js — Chauffeur Empire
   renderTabHelp, renderCurrentTab.
   Dipendenze: engine.js */

function renderTabHelp() {
    const container = document.getElementById('tab-container');
    const cfg = window.GAME_CONFIG || {};
    const email = cfg.SUPPORT_EMAIL || 'support@chauffeurempire.com';
    const userId = window.currentUser?.id || 'N/D';
    const companyName = (gameState.companyName || 'La tua azienda');
    const bugSubject = encodeURIComponent(`Bug Report — ID: ${userId}`);
    const build = new Date().toLocaleDateString('it-IT', { month:'short', year:'numeric' });

    container.innerHTML = `<div class="em"><div class="em-page em-wrap">

    <div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--em-line)">
        <div class="em-sec" style="margin-bottom:4px">Centro Assistenza</div>
        <div style="font-size:20px;font-weight:800;margin-bottom:2px">Supporto &amp; Documentazione</div>
        <div style="font-size:11px;color:var(--em-muted)">Risposta garantita entro 24h · Build ${build}</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">

        <div class="em-card" style="padding:14px">
            <div class="em-sec" style="margin-bottom:10px">Contatto Diretto</div>
            <div style="font-size:13px;font-weight:700;margin-bottom:6px">📧 Email Ufficiale</div>
            <div style="font-size:11px;color:var(--em-muted);margin-bottom:12px;line-height:1.5">Il team risponde entro 24h nei giorni lavorativi. Includi sempre il tuo ID compagnia.</div>
            <a href="mailto:${email}" style="text-decoration:none">
                <button class="em-goldbtn">✉ ${email}</button>
            </a>
        </div>

        <div class="em-card" style="padding:14px;border-color:rgba(219,87,70,.35)">
            <div class="em-sec" style="margin-bottom:10px;color:var(--em-red)">Segnalazione Bug</div>
            <div style="font-size:13px;font-weight:700;margin-bottom:6px">🐛 Report Tecnico</div>
            <div style="font-size:11px;color:var(--em-muted);margin-bottom:8px;line-height:1.5">ID Compagnia pre-compilato nell'oggetto. Descrivi il bug nella mail.</div>
            <div style="font-size:9px;font-family:monospace;color:var(--em-muted);margin-bottom:12px;word-break:break-all">${userId}</div>
            <a href="mailto:${email}?subject=${bugSubject}" style="text-decoration:none;display:block">
                <button class="em-redbtn" style="width:100%;box-sizing:border-box">🐛 Apri Email — Segnala Bug</button>
            </a>
        </div>
    </div>

    <div class="em-card" style="margin-bottom:14px">
        <div class="em-ch"><span class="t">Domande Frequenti</span></div>
        <div style="padding:0 11px">
            ${[
                { q:'Come recupero la password?',      a:`Usa il link "Password dimenticata" nella schermata di login. Il link è valido 30 minuti.` },
                { q:'I miei progressi sono salvati?',  a:`Sì. Il gioco usa salvataggio cloud automatico su Supabase. I dati vengono sincronizzati ogni volta che esegui un'azione.` },
                { q:'Come funziona la classifica?',    a:`Si aggiorna ogni volta che un giocatore completa un'azione (corsa, acquisto, ecc). Mostra il patrimonio liquido totale.` },
                { q:'Posso giocare su più dispositivi?', a:`Sì, il salvataggio cloud ti permette di continuare su qualsiasi browser. Usa le stesse credenziali.` },
                { q:'Problemi con i pagamenti DC?',    a:`Scrivi all'email di supporto con oggetto "Pagamento DC" e il tuo ID compagnia. Verifichiamo entro 4h.` },
            ].map(faq => `
            <div style="padding:11px 0;border-bottom:1px solid var(--em-line);cursor:pointer"
                 ${ceAct('ceToggleFa', [])}>
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="font-size:11px;font-weight:700">${faq.q}</div>
                    <span style="color:var(--em-muted);font-size:14px">⌄</span>
                </div>
                <div class="fa" style="display:none;margin-top:7px;font-size:11px;color:var(--em-muted);line-height:1.5">${faq.a}</div>
            </div>`).join('')}
        </div>
    </div>

    <div class="em-card" style="padding:14px;text-align:center">
        <div class="em-sec">CHAUFFEUR EMPIRE · ${cfg.GAME_URL || 'chauffeurempire.com'} · Build ${build}</div>
        <div style="margin-top:8px;display:flex;gap:14px;justify-content:center">
            <a href="terms.html"   target="_blank" style="font-size:9px;color:var(--em-muted);text-decoration:none">Termini</a>
            <a href="privacy.html" target="_blank" style="font-size:9px;color:var(--em-muted);text-decoration:none">Privacy</a>
            <a href="rules.html"   target="_blank" style="font-size:9px;color:var(--em-muted);text-decoration:none">Regole</a>
        </div>
    </div>

</div></div>`;
}
window.renderTabHelp = renderTabHelp;

window.renderCurrentTab = function() {
    if (typeof _activeTab !== 'undefined' && _activeTab) {
        window.switchTab(_activeTab);
    }
};
window.__mutUnificato = function () {};
