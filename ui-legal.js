'use strict';
/* ui-legal.js — Chauffeur Empire
   renderTabLegal: gestione multe e contenzioso legale.
   Dipendenze: engine.js, design-system.js */

function renderTabLegal() {
    const container = document.getElementById('tab-container');
    const hasLegal  = (gameState.staff||[]).some(s => s.id === 'legal');
    const pending   = (gameState.activeFines || []).filter(f => f.status === 'pending');
    const resolved  = (gameState.activeFines || []).filter(f => f.status !== 'pending');
    const successRate = hasLegal ? 70 : 35;
    const totalFines = pending.reduce((s, f) => s + (f.amount||0), 0);
    const gameHour  = gameState.day * 24 + gameState.hour;

    let html = DS.header({
        eyebrow: 'Compliance & Diritto',
        title:   'Ufficio Legale',
        subtitle:`${pending.length} sanzione${pending.length !== 1 ? 'i' : ''} in attesa · Rischio esposizione €${totalFines.toLocaleString()}`,
    }) + DS.kpiStrip([
        { label:'Status Studio',  val: hasLegal ? 'ATTIVO' : 'ASSENTE',       color: hasLegal ? 'green' : 'red' },
        { label:'Tasso Successo', val: successRate + '%',                       color: successRate >= 70 ? 'green' : 'red' },
        { label:'Sanzioni Aperte',val: pending.length,                          color: pending.length > 0 ? 'red' : 'green' },
        { label:'Esposizione',    val: '€' + totalFines.toLocaleString(),       color: totalFines > 0 ? 'red' : 'green' },
    ]);

    if (!hasLegal) {
        html += `<div class="ds-card ds-card--alert" style="margin-bottom:20px">
            <div style="font-size:11px;font-weight:700;color:var(--red);margin-bottom:4px">⚠ Nessun Avvocato in Staff</div>
            <div style="font-size:11px;color:var(--text-muted)">Tasso di contestazione automatica: solo 35%. Assumi un Avvocato nel tab Staff per salire al 70%.</div>
        </div>`;
    }

    html += `<div class="ds-eyebrow" style="margin:0 0 12px">⚖️ Sanzioni Attive (${pending.length})</div>`;

    if (pending.length === 0) {
        html += DS.empty({ icon:'✅', title:'Nessuna sanzione in sospeso', body:'La tua flotta è in regola. Continua così.' });
    } else {
        pending.forEach(f => {
            const hoursLeft = Math.max(0, (f.expiresAt || 0) - gameHour);
            html += `<div class="ds-card ds-card--alert" style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
                    <div>
                        <div style="font-size:12px;font-weight:700;color:var(--text)">${f.desc}</div>
                        <div style="font-size:10px;color:var(--text-muted);margin-top:3px">👤 ${f.driverName} · Scade in ${hoursLeft}h</div>
                    </div>
                    <div style="font-size:16px;font-weight:700;font-family:var(--font-mono);color:var(--red)">€${(f.amount||0).toLocaleString()}</div>
                </div>
                <div style="display:flex;gap:8px">
                    ${DS.btn({ label:`Paga €${(f.amount||0).toLocaleString()}`, color:'red',  onclick:`payFine(${f.id})` })}
                    ${DS.btn({ label:`Contesta (${successRate}%)`,              color:'blue', onclick:`contestFine(${f.id})` })}
                </div>
            </div>`;
        });
    }

    if (resolved.length > 0) {
        html += `<div class="ds-eyebrow" style="margin:20px 0 12px">📁 Archivio (${resolved.length})</div>`;
        html += DS.table(
            [
                { label:'Descrizione', key:'desc' },
                { label:'Autista',     key:'driverName' },
                { label:'Importo',     key:'amount', align:'right', render: r => `<span style="font-family:var(--font-mono)">€${(r.amount||0).toLocaleString()}</span>` },
                { label:'Esito',       key:'status',  align:'center', render: r => {
                    const labels = { paid:'Pagata', contested_won:'Annullata ✓', contested_lost:'Ricorso Perso', contested_reduced:'Ridotta', expired_paid:'Scaduta (Pagata)' };
                    const colors = { contested_won:'green', paid:'red', expired_paid:'red', contested_lost:'', contested_reduced:'orange' };
                    const label = labels[r.status] || r.status;
                    const color = colors[r.status] || '';
                    return DS.pill(label, color || 'ghost');
                }},
            ],
            resolved.slice(-10).reverse()
        );
    }

    container.innerHTML = html;

    const fineDot = document.getElementById('fine-dot');
    if (fineDot) fineDot.classList.toggle('hidden', pending.length === 0);
}
window.renderTabLegal = renderTabLegal;
