'use strict';
/* ui-ops.js — renderTabRegions, renderTabProvinces */

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


async function renderTabProvinces() {
    const container = document.getElementById('tab-container');
    container.innerHTML = `<div style="font-size:10px;color:#6b7280;text-align:center;padding:24px 0">Caricamento mappa territoriale…</div>`;

    let provinces = [], regions = [], influence = {};
    try {
        const snap = await window.ServerState.getTerritorySnapshot();
        if (!snap) throw new Error('snapshot nullo');
        provinces = snap.provinces || [];
        regions   = snap.regions   || [];
        influence = snap.influence  || {};
    } catch(e) {
        try { console.warn('[Ops] territory load error', e && (e.message || e)); } catch {}
        container.innerHTML = `<div style="color:#db5746;font-size:11px;padding:16px">Impossibile caricare il territorio, riprova.</div>`;
        return;
    }

    // Build region lookup
    const regionMap = {};
    regions.forEach(r => { regionMap[r.id] = r; });

    // Count provinces per region owned by me
    const myCompanyName = gameState.companyName || '';
    const myOwnedCount  = {}; // regionId → count
    const totalCount    = {}; // regionId → total
    provinces.forEach(p => {
        totalCount[p.region_id] = (totalCount[p.region_id] || 0) + 1;
        if (p.owner_company === myCompanyName) {
            myOwnedCount[p.region_id] = (myOwnedCount[p.region_id] || 0) + 1;
        }
    });

    // Group by region for display
    const byRegion = {};
    provinces.forEach(p => {
        if (!byRegion[p.region_id]) byRegion[p.region_id] = [];
        byRegion[p.region_id].push(p);
    });

    let html = `
    <div style="background:rgba(212,175,55,0.05);border:1px solid rgba(212,175,55,0.3);border-radius:6px;padding:12px 16px;margin-bottom:12px">
        <div style="font-size:10px;color:#c79a2a;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">🏴 Guerra Territoriale</div>
        <div style="font-size:9px;color:#6b7280;line-height:1.5">
            Ogni corsa che parte o arriva in una provincia ti guadagna <b style="color:#e6edf3">+10 Punti Influenza</b>.
            Raggiungi la soglia per lanciare un'OPA (120% del valore). Chi controlla &gt;50% delle province di una regione
            diventa <b style="color:#c79a2a">Governatore</b> e percepisce l'1% su ogni corsa nella regione.
        </div>
    </div>`;

    // Render by region
    Object.entries(byRegion).forEach(([regionId, provs]) => {
        const reg = regionMap[regionId] || { name: regionId, governor_company: null };
        const myCount  = myOwnedCount[regionId]  || 0;
        const total    = totalCount[regionId]     || 0;
        const amGov    = reg.governor_company === myCompanyName;
        const govLabel = reg.governor_company
            ? `<span style="color:#c79a2a">👑 ${reg.governor_company}</span>`
            : `<span style="color:#6b7280">— nessun governatore</span>`;

        html += `
        <div style="margin-bottom:16px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:0 4px">
                <div style="font-size:9px;font-weight:700;color:#4d6480;text-transform:uppercase;letter-spacing:.08em">${reg.name}</div>
                <div style="font-size:8px;color:#6b7280">
                    ${govLabel}
                    ${amGov ? ' <span style="font-size:7px;background:rgba(234,179,8,0.2);color:#facc15;border:1px solid rgba(234,179,8,0.3);padding:1px 4px;border-radius:3px">TU SEI GOVERNATORE</span>' : ''}
                    · ${myCount}/${total} province
                </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">`;

        provs.forEach(p => {
            const isOwned   = p.owner_company === myCompanyName;
            const isFree    = !p.owner_id;
            const myInf     = influence[p.id] || 0;
            const threshold = p.required_influence || 500;
            const infPct    = Math.min(100, Math.round((myInf / threshold) * 100));
            const infUnlocked = myInf >= threshold;
            const minOffer  = Math.ceil((p.current_value || 0) * 1.20);
            const taxPct    = ((p.transit_tax_pct || 0.025) * 100).toFixed(1);

            html += `
            <div style="background:#161b22;border:1px solid ${isOwned ? 'rgba(212,175,55,0.6)' : isFree ? 'rgba(63,185,80,0.3)' : '#d6dee8'};border-radius:6px;padding:12px 14px;${isOwned ? 'background:rgba(212,175,55,0.05)' : isFree ? 'background:rgba(0,63,30,0.1)' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
                    <div>
                        <span style="font-size:10px;font-weight:700;color:#e6edf3">${p.name}</span>
                        ${isOwned ? '<span style="margin-left:4px;font-size:7px;background:rgba(212,175,55,0.2);color:#c79a2a;border:1px solid rgba(212,175,55,0.3);padding:1px 4px;border-radius:3px">TUA</span>' : ''}
                        ${isFree  ? '<span style="margin-left:4px;font-size:7px;background:rgba(63,185,80,0.2);color:#1aa06a;border:1px solid rgba(63,185,80,0.3);padding:1px 4px;border-radius:3px">LIBERA</span>' : ''}
                        ${amGov && !isOwned ? '<span style="margin-left:4px;font-size:7px;background:rgba(234,179,8,0.1);color:#c79a2a;border:1px solid rgba(234,179,8,0.3);padding:1px 4px;border-radius:3px">+1% regionale</span>' : ''}
                    </div>
                    <div style="text-align:right">
                        <div style="font-size:10px;font-weight:700;color:#c79a2a">€${(p.current_value||0).toLocaleString()}</div>
                        <div style="font-size:7px;color:#6b7280">tassa: ${taxPct}%</div>
                    </div>
                </div>

                ${!isOwned && !isFree ? `<div style="font-size:8px;color:#6b7280;margin-bottom:4px">Proprietario: <span style="color:#2f74c0">${p.owner_company}</span></div>` : ''}

                <div style="margin-bottom:4px">
                    <div style="display:flex;justify-content:space-between;font-size:7px;color:#6b7280;margin-bottom:2px">
                        <span>Influenza</span>
                        <span style="color:${infUnlocked ? '#1aa06a' : '#6a7480'}">${myInf}/${threshold} ${infUnlocked ? '✅' : ''}</span>
                    </div>
                    <div class="fuel-bar-bg">
                        <div class="fuel-bar-fill" style="width:${infPct}%;background:${infUnlocked ? '#1aa06a' : infPct > 60 ? '#e0922e' : '#6a7480'}"></div>
                    </div>
                    ${!infUnlocked ? `<div style="font-size:7px;color:#6b7280;margin-top:2px">Completa corse da/verso questa provincia per aumentare l'influenza</div>` : ''}
                </div>

                ${isOwned ? `
                <div style="font-size:8px;color:#1aa06a;background:rgba(0,63,30,0.2);border:1px solid rgba(63,185,80,0.2);border-radius:4px;padding:4px 8px">
                    ✅ Percepisci il ${taxPct}% su ogni corsa provinciale${amGov ? ` + 1% come Governatore di ${reg.name}` : ''}
                </div>` : infUnlocked ? `
                <div style="display:flex;gap:4px;margin-top:4px">
                    <input id="offer-${p.id}" type="number" min="${minOffer}" step="10000"
                        style="flex:1;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:4px 8px;font-size:8px;color:#e6edf3"
                        placeholder="Offerta min. €${minOffer.toLocaleString()}">
                    <button ${ceAct('doAcquireProvince', [p.id])} style="background:#161b228e8;border:1px solid #c79a2a;color:#c79a2a;padding:4px 8px;border-radius:4px;font-size:7px;cursor:pointer;white-space:nowrap">🏴 OPA</button>
                </div>
                <div style="font-size:7px;color:#6b7280;margin-top:2px">Min: €${minOffer.toLocaleString()} · Vecchio proprietario riceve 80%</div>` : `
                <div style="font-size:7px;color:#6b7280;margin-top:4px;font-style:italic">🔒 Raggiungi ${threshold} punti influenza per sbloccare l'OPA</div>`}
            </div>`;
        });

        html += `</div></div>`;
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

window.doAcquireProvince = async function(provinceId) {
    const input = document.getElementById(`offer-${provinceId}`);
    const offer = parseInt(input?.value, 10);
    if (!offer || offer <= 0) { showNotification('Inserisci un\'offerta valida', 'error'); return; }
    if (gameState.cash < offer) { showNotification('Fondi insufficienti', 'error'); return; }
    const result = await window.ServerState?.acquireProvince(provinceId, offer);
    if (result?.success) {
        showBigEvent('🏴', `${result.province_name} Conquistata!`, `Investimento: €${offer.toLocaleString()}`);
        renderTabProvinces();
    }
};

// ─── REAL ESTATE TAB ────────────────────────────────────────────────────────

window.renderTabRegions   = renderTabRegions;
window.renderTabProvinces = renderTabProvinces;
