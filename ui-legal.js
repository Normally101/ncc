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

    let html = `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #21262d">
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Compliance &amp; Diritto</div>
        <div style="font-size:20px;font-weight:700;color:#e6edf3">Ufficio Legale</div>
        <div style="font-size:11px;color:#8b949e;margin-top:4px">${pending.length} sanzione${pending.length !== 1 ? 'i' : ''} in attesa · Rischio esposizione €${totalFines.toLocaleString()}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Status Studio</div>
            <div style="font-size:16px;font-weight:700;font-family:monospace;color:${hasLegal ? '#3fb950' : '#f85149'}">${hasLegal ? 'ATTIVO' : 'ASSENTE'}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Tasso Successo</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${successRate >= 70 ? '#3fb950' : '#f85149'}">${successRate}%</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Sanzioni Aperte</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${pending.length > 0 ? '#f85149' : '#3fb950'}">${pending.length}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Esposizione</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${totalFines > 0 ? '#f85149' : '#3fb950'}">€${totalFines.toLocaleString()}</div>
        </div>
    </div>`;

    if (!hasLegal) {
        html += `<div style="background:rgba(248,81,73,0.04);border:1px solid rgba(248,81,73,0.2);border-radius:6px;padding:16px;margin-bottom:20px">
            <div style="font-size:11px;font-weight:700;color:#f85149;margin-bottom:4px">⚠ Nessun Avvocato in Staff</div>
            <div style="font-size:11px;color:#8b949e">Tasso di contestazione automatica: solo 35%. Assumi un Avvocato nel tab Staff per salire al 70%.</div>
        </div>`;
    }

    html += `<div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin:0 0 12px">⚖️ Sanzioni Attive (${pending.length})</div>`;

    if (pending.length === 0) {
        html += `<div style="text-align:center;padding:40px 0"><div style="font-size:32px;margin-bottom:10px">✅</div><div style="font-size:14px;font-weight:600;color:#e6edf3">Nessuna sanzione in sospeso</div><div style="font-size:11px;color:#8b949e;margin-top:4px">La tua flotta è in regola. Continua così.</div></div>`;
    } else {
        pending.forEach(f => {
            const hoursLeft = Math.max(0, (f.expiresAt || 0) - gameHour);
            html += `<div style="background:rgba(248,81,73,0.04);border:1px solid rgba(248,81,73,0.2);border-radius:6px;padding:16px;margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
                    <div>
                        <div style="font-size:12px;font-weight:700;color:var(--text)">${f.desc}</div>
                        <div style="font-size:10px;color:var(--text-muted);margin-top:3px">👤 ${f.driverName} · Scade in ${hoursLeft}h</div>
                    </div>
                    <div style="font-size:16px;font-weight:700;font-family:var(--font-mono);color:var(--red)">€${(f.amount||0).toLocaleString()}</div>
                </div>
                <div style="display:flex;gap:8px">
                    <button onclick="payFine(${f.id})" style="background:#2d0d0d;border:1px solid #5a1a1a;color:#f85149;padding:5px 12px;border-radius:4px;font-size:10px;cursor:pointer;transition:opacity .15s" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">Paga €${(f.amount||0).toLocaleString()}</button>
                    <button onclick="contestFine(${f.id})" style="background:#0d1b2d;border:1px solid #1a3a5a;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:10px;cursor:pointer;transition:opacity .15s" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">Contesta (${successRate}%)</button>
                </div>
            </div>`;
        });
    }

    if (resolved.length > 0) {
        const _TH = t => `<th style="padding:7px 14px;font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:600;text-align:left;border-bottom:1px solid #21262d;white-space:nowrap">${t}</th>`;
        const _THR = t => `<th style="padding:7px 14px;font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:600;text-align:right;border-bottom:1px solid #21262d;white-space:nowrap">${t}</th>`;
        const _THC = t => `<th style="padding:7px 14px;font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:600;text-align:center;border-bottom:1px solid #21262d;white-space:nowrap">${t}</th>`;
        const _pillStatus = (r) => {
            const labels = { paid:'Pagata', contested_won:'Annullata ✓', contested_lost:'Ricorso Perso', contested_reduced:'Ridotta', expired_paid:'Scaduta (Pagata)' };
            const colors = { contested_won:'#3fb950', paid:'#f85149', expired_paid:'#f85149', contested_lost:'#8b949e', contested_reduced:'#d4af37' };
            const bgs    = { contested_won:'rgba(63,185,80,0.12)', paid:'rgba(248,81,73,0.12)', expired_paid:'rgba(248,81,73,0.12)', contested_lost:'rgba(139,148,158,0.12)', contested_reduced:'rgba(212,175,55,0.12)' };
            const label = labels[r.status] || r.status;
            const c = colors[r.status] || '#8b949e';
            const bg = bgs[r.status] || 'rgba(139,148,158,0.12)';
            return `<span style="font-size:9px;font-weight:700;color:${c};background:${bg};border:1px solid ${c};border-radius:4px;padding:2px 6px">${label}</span>`;
        };
        html += `<div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin:20px 0 12px;padding-bottom:8px;border-bottom:1px solid #21262d">📁 Archivio (${resolved.length})</div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;overflow:hidden;margin-bottom:16px">
            <table style="width:100%;border-collapse:collapse">
                <thead><tr>${_TH('Descrizione')}${_TH('Autista')}${_THR('Importo')}${_THC('Esito')}</tr></thead>
                <tbody>
                    ${resolved.slice(-10).reverse().map(r => `<tr style="border-bottom:1px solid #161b22">
                        <td style="padding:8px 14px;font-size:11px;color:#e6edf3">${r.desc}</td>
                        <td style="padding:8px 14px;font-size:11px;color:#e6edf3">${r.driverName}</td>
                        <td style="padding:8px 14px;font-size:11px;color:#e6edf3;text-align:right;font-family:monospace">€${(r.amount||0).toLocaleString()}</td>
                        <td style="padding:8px 14px;text-align:center">${_pillStatus(r)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
    }

    container.innerHTML = html;

    const fineDot = document.getElementById('fine-dot');
    if (fineDot) fineDot.style.display = pending.length === 0 ? 'none' : '';
}
window.renderTabLegal = renderTabLegal;
