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

    let html = DS.header({
        eyebrow: 'Espansione Territoriale',
        title:   'Licenze Regionali',
        subtitle:`${totalOwned} / ${totalRegions} regioni attive · Copertura nazionale ${coveragePct}%`,
    });

    html += DS.kpiStrip([
        { label:'Regioni Attive',    val: totalOwned,                    color: totalOwned > 0 ? 'green' : '' },
        { label:'Copertura',         val: coveragePct + '%',             color: coveragePct >= 50 ? 'gold' : '' },
        { label:'Reputazione CEO',   val: (gameState.reputation||0) + '★' },
        { label:'Budget Disponibile',val: '€' + ((gameState.cash||0)/1000).toFixed(0) + 'k', color:'green' },
    ]);

    GROUPS.forEach(group => {
        html += `<div class="ds-eyebrow" style="margin:20px 0 10px">${group.icon} ${group.label}</div>
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
                    <div style="font-size:11px;font-weight:700;color:${owned ? '#d4af37' : 'var(--text)'}">${r.name}</div>
                    ${owned ? `<span class="ds-pill ds-pill--gold">ATTIVA</span>` : ''}
                </div>
                <div style="font-size:9px;color:${hasRep ? '#6b7280' : '#ef4444'};font-family:var(--font-mono)">
                    ${r.repReq}★ richiesta
                </div>
                ${r.bonusDesc ? `<div style="font-size:9px;color:#4b5563">${r.bonusDesc}</div>` : ''}
                <div style="margin-top:auto">
                    ${owned
                        ? `<div style="font-size:9px;color:#22c55e;font-weight:700;font-family:var(--font-mono)">✓ Licenza operativa</div>`
                        : r.price === 0 ? ''
                        : `<button onclick="buyRegion('${r.id}')"
                            class="ds-btn ds-btn--${canBuy ? 'gold' : 'ghost'}"
                            style="width:100%;justify-content:center;padding:6px;font-size:10px"
                            ${!canBuy ? 'disabled' : ''}>
                            ${!hasRep ? '🔒 ' : ''}€${(r.price/1000).toFixed(0)}k
                           </button>`
                    }
                </div>
            </div>`;
        });
        html += `</div>`;
    });

    container.innerHTML = html;
}


async function renderTabProvinces() {
    const container = document.getElementById('tab-container');
    container.innerHTML = `<div class="text-[10px] text-gray-500 text-center py-6">Caricamento mappa territoriale…</div>`;

    let provinces = [], regions = [], influence = {};
    try {
        const snap = await window.ServerState.getTerritorySnapshot();
        if (!snap) throw new Error('snapshot nullo');
        provinces = snap.provinces || [];
        regions   = snap.regions   || [];
        influence = snap.influence  || {};
    } catch(e) {
        container.innerHTML = `<div class="text-red-400 text-xs p-4">Errore caricamento territorio: ${e.message}</div>`;
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
    <div class="mb-3 hud-card !border-gold/30 bg-gold/5">
        <div class="text-[10px] text-gold font-bold uppercase tracking-widest mb-1">🏴 Guerra Territoriale</div>
        <div class="text-[9px] text-gray-400 leading-relaxed">
            Ogni corsa che parte o arriva in una provincia ti guadagna <b class="text-white">+10 Punti Influenza</b>.
            Raggiungi la soglia per lanciare un'OPA (120% del valore). Chi controlla >50% delle province di una regione
            diventa <b class="text-yellow-300">Governatore</b> e percepisce l'1% su ogni corsa nella regione.
        </div>
    </div>`;

    // Render by region
    Object.entries(byRegion).forEach(([regionId, provs]) => {
        const reg = regionMap[regionId] || { name: regionId, governor_company: null };
        const myCount  = myOwnedCount[regionId]  || 0;
        const total    = totalCount[regionId]     || 0;
        const amGov    = reg.governor_company === myCompanyName;
        const govLabel = reg.governor_company
            ? `<span class="text-yellow-300">👑 ${reg.governor_company}</span>`
            : `<span class="text-gray-600">— nessun governatore</span>`;

        html += `
        <div class="mb-4">
            <div class="flex items-center justify-between mb-2 px-1">
                <div class="text-[9px] font-bold text-gray-300 uppercase tracking-widest">${reg.name}</div>
                <div class="text-[8px] text-gray-500">
                    ${govLabel}
                    ${amGov ? ' <span class="text-[7px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1 rounded">TU SEI GOVERNATORE</span>' : ''}
                    · ${myCount}/${total} province
                </div>
            </div>
            <div class="space-y-2">`;

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
            <div class="hud-card ${isOwned ? '!border-gold/60 bg-gold/5' : isFree ? '!border-green-500/30 bg-green-950/10' : '!border-white/10'}">
                <div class="flex justify-between items-start mb-1">
                    <div>
                        <span class="text-[10px] font-bold text-white">${p.name}</span>
                        ${isOwned ? '<span class="ml-1 text-[7px] bg-gold/20 text-gold border border-gold/30 px-1 rounded">TUA</span>' : ''}
                        ${isFree  ? '<span class="ml-1 text-[7px] bg-green-500/20 text-green-400 border border-green-500/30 px-1 rounded">LIBERA</span>' : ''}
                        ${amGov && !isOwned ? '<span class="ml-1 text-[7px] bg-yellow-500/10 text-yellow-500 border border-yellow-600/30 px-1 rounded">+1% regionale</span>' : ''}
                    </div>
                    <div class="text-right">
                        <div class="text-[10px] font-bold text-gold">€${(p.current_value||0).toLocaleString()}</div>
                        <div class="text-[7px] text-gray-600">tassa: ${taxPct}%</div>
                    </div>
                </div>

                ${!isOwned && !isFree ? `<div class="text-[8px] text-gray-400 mb-1">Proprietario: <span class="text-blue-300">${p.owner_company}</span></div>` : ''}

                <!-- Barra influenza -->
                <div class="mb-1">
                    <div class="flex justify-between text-[7px] text-gray-500 mb-0.5">
                        <span>Influenza</span>
                        <span class="${infUnlocked ? 'text-green-400' : 'text-gray-500'}">${myInf}/${threshold} ${infUnlocked ? '✅' : ''}</span>
                    </div>
                    <div class="fuel-bar-bg">
                        <div class="fuel-bar-fill" style="width:${infPct}%;background:${infUnlocked ? '#22c55e' : infPct > 60 ? '#f59e0b' : '#6b7280'}"></div>
                    </div>
                    ${!infUnlocked ? `<div class="text-[7px] text-gray-600 mt-0.5">Completa corse da/verso questa provincia per aumentare l'influenza</div>` : ''}
                </div>

                ${isOwned ? `
                <div class="text-[8px] text-green-400 bg-green-950/20 border border-green-500/20 rounded px-2 py-1">
                    ✅ Percepisci il ${taxPct}% su ogni corsa provinciale${amGov ? ` + 1% come Governatore di ${reg.name}` : ''}
                </div>` : infUnlocked ? `
                <div class="flex gap-1 mt-1">
                    <input id="offer-${p.id}" type="number" min="${minOffer}" step="10000"
                        class="flex-1 bg-black/40 border border-white/20 rounded px-2 py-1 text-[8px] text-white"
                        placeholder="Offerta min. €${minOffer.toLocaleString()}">
                    <button onclick="window.doAcquireProvince('${p.id}')" class="btn-gold !text-[7px] !py-1 !px-2 shrink-0">🏴 OPA</button>
                </div>
                <div class="text-[7px] text-gray-600 mt-0.5">Min: €${minOffer.toLocaleString()} · Vecchio proprietario riceve 80%</div>` : `
                <div class="text-[7px] text-gray-600 mt-1 italic">🔒 Raggiungi ${threshold} punti influenza per sbloccare l'OPA</div>`}
            </div>`;
        });

        html += `</div></div>`;
    });

    container.innerHTML = html;
}

window.buyHRAutomation = async function() {
    const cost = 5, days = 7;
    if ((gameState.driverCoins || 0) < cost) {
        showNotification(`Driver Coins insufficienti (servono ${cost} DC)`, 'error');
        return;
    }
    const result = await window.ServerState?.buyHRAutomation(cost, days);
    if (!result?.success) return;

    gameState.hrAutomationExpiresAt = result.expires_at;
    gameState.driverCoins = Math.max(0, (gameState.driverCoins || 0) - cost);

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
