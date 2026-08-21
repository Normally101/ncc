'use strict';
/* ui-ops.js — renderTabRegions, buyHRAutomation */

function renderTabRegions() {
    const container = document.getElementById('tab-container');
    const GROUPS = [
        { label:'Nord Italia',  icon:'🏔️', ids:['emilia','liguria','piemonte','lombardia','veneto','friuli','trentino','valle_aosta'] },
        { label:'Centro Italia',icon:'📍', ids:['lazio','umbria','marche','abruzzo','molise','toscana'] },
        { label:'Sud Italia',   icon:'🌶️', ids:['campania','puglia','basilicata','calabria'] },
        { label:'Isole',        icon:'🏝️', ids:['sicilia','sardegna'] },
    ];

    const allRegions = Object.values(REGIONS || {});
    const totalOwned = allRegions.filter(r => (gameState.unlockedRegions||[]).includes(r.id)).length;
    const totalRegions = allRegions.length;
    const coveragePct = totalRegions > 0 ? Math.round(totalOwned / totalRegions * 100) : 0;

    const _kpiColor = (c) => c === 'green' ? '#1aa06a' : c === 'gold' ? '#c79a2a' : c === 'red' ? '#db5746' : c === 'blue' ? '#2f74c0' : '#1f2733';
    let html = `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #21262d">
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Espansione Territoriale</div>
        <div style="font-size:20px;font-weight:700;color:#e6edf3">Licenze Regionali</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px">${totalOwned} / ${totalRegions} regioni attive · Copertura nazionale ${coveragePct}%</div>
    </div>`;

    html += `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Regioni Attive</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${totalOwned > 0 ? '#1aa06a' : '#1f2733'}">${totalOwned}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Copertura</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${coveragePct >= 50 ? '#c79a2a' : '#1f2733'}">${coveragePct}%</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Reputazione CEO</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:#e6edf3">${(gameState.reputation||0)}★</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Budget Disponibile</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:#1aa06a">€${((gameState.cash||0)/1000).toFixed(0)}k</div>
        </div>
    </div>`;

    GROUPS.forEach(group => {
        html += `<div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin:20px 0 10px">${group.icon} ${group.label}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:8px">`;

        group.ids.forEach(rid => {
            const r = REGIONS[rid];
            if (!r) return;
            const owned     = (gameState.unlockedRegions||[]).includes(r.id);
            const hasRep    = (gameState.reputation||0) >= r.repReq;
            const canAfford = (gameState.cash||0) >= r.price;
            const canBuy    = hasRep && canAfford && !owned;

            const borderColor = owned ? 'rgba(212,175,55,0.4)' : hasRep ? 'rgba(0,0,0,0.08)' : 'rgba(239,68,68,0.35)';
            const bgColor     = owned ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.92)';

            html += `<div style="background:${bgColor};border:1px solid ${borderColor};border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:6px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="font-size:11px;font-weight:700;color:${owned ? '#c79a2a' : 'var(--text)'}">${r.name}</div>
                    ${owned ? `<span style="font-size:9px;font-weight:700;color:#c79a2a;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.3);border-radius:4px;padding:2px 6px">ATTIVA</span>` : ''}
                </div>
                <div style="font-size:9px;color:${hasRep ? '#6a7480' : '#db5746'};font-family:var(--font-mono)">
                    ${r.repReq}★ richiesta
                </div>
                ${r.bonusDesc ? `<div style="font-size:9px;color:#6b7280">${r.bonusDesc}</div>` : ''}
                <div style="margin-top:auto">
                    ${owned
                        ? `<div style="font-size:9px;color:#1aa06a;font-weight:700;font-family:var(--font-mono)">✓ Licenza operativa</div>`
                        : r.price === 0 ? ''
                        : `<button ${ceAct('buyRegion', [r.id])}
                            style="width:100%;justify-content:center;padding:6px;font-size:10px;border-radius:4px;cursor:pointer;${canBuy ? 'background:#161b228e8;border:1px solid #c79a2a;color:#c79a2a' : 'background:#161b22;border:1px solid #21262d;color:#6b7280;opacity:.6'}"
                            ${!canBuy ? 'disabled' : ''}>
                            ${!hasRep ? '🔒 ' : ''}€${(r.price/1000).toFixed(0)}k
                           </button>`
                    }
                </div>
            </div>`;
        });
        html += `</div>`;
    });

    container.innerHTML = `<div class="em em-page"><div class="em-wrap">` + html + `</div></div>`;
}


window.buyHRAutomation = function() {
    const cost = 5, days = 7;
    if (!window.CE_money.spendDC(cost, 'buy_hr_automation')) return;

    const currentExpiry = gameState.hrAutomationExpiresAt ? new Date(gameState.hrAutomationExpiresAt).getTime() : Date.now();
    const baseTime = Math.max(Date.now(), currentExpiry);
    gameState.hrAutomationExpiresAt = new Date(baseTime + days * 86400000).toISOString();

    // Resolve all drivers already on strike
    let resolved = 0;
    (gameState.drivers || []).forEach(d => {
        if (d.isOnStrike) {
            d.isOnStrike = false;
            d.status = 'idle';
            d.satisfaction = Math.max(d.satisfaction || 0, 55);
            d.morale = Math.min(100, (d.morale || 50) + 20);
            resolved++;
        }
    });

    const resolvedMsg = resolved > 0
        ? ` ${resolved} autist${resolved === 1 ? 'a' : 'i'} in sciopero ${resolved === 1 ? 'è stato richiamato' : 'sono stati richiamati'} al lavoro.`
        : '';
    showBigEvent('🤝', 'Gestione Sindacale HR Attivata!',
        `Il sistema HR gestirà automaticamente gli scioperi per i prossimi ${days} giorni.${resolvedMsg}`);

    updateUI();
    if (typeof renderTabStaff === 'function') renderTabStaff();
    if (typeof saveGame === 'function') saveGame();
};

window.renderTabRegions = renderTabRegions;
