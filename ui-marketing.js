'use strict';
/* ================================================================
   ui-marketing.js — Chauffeur Empire
   Marketing tab: Dual Brand system, tier campaigns, ROI tracker.
   Dipendenze: engine.js, dispatcher.js (gameState, _applyMarketingCampaign)
   ================================================================ */

function renderTabMarketing() {
    const container = document.getElementById('tab-container');

    // ── Tab state ─────────────────────────────────────────────────
    window._mktTier = window._mktTier || 'starter';

    // ── Brand gauges ──────────────────────────────────────────────
    const bv = gameState.brandVolume  || 0;
    const bp = gameState.brandPrestige || 0;

    const volEffect = bv >= 100 ? '+40% corse standard · Volume massimo!' :
                      bv >= 75  ? '+30% corse standard' :
                      bv >= 50  ? '+18% corse standard' :
                      bv >= 25  ? '+8% corse standard'  :
                      'Nessun bonus';
    const presEffect = bp >= 100 ? '+55% VIP · Diamond garantiti ogni 3gg' :
                       bp >= 75  ? '+40% spawn VIP' :
                       bp >= 50  ? '+25% VIP · Diamond eligibility migliorata' :
                       bp >= 25  ? '+10% spawn VIP' :
                       'Nessun bonus';

    const volEffectClass  = bv > 0  ? 'active' : '';
    const presEffectClass = bp > 0  ? 'active' : '';

    // ── Market conditions ─────────────────────────────────────────
    const ws = WEATHER_STATES.find(w => w.id === (gameState.weather || 'sole')) || WEATHER_STATES[0];
    const pending = gameState.pendingRides.length;
    const surgeLabel = pending >= 15 ? '🔥 Surge +35%' : pending >= 8 ? '⚡ Surge +15%' : '🟢 Prezzi standard';
    const surgeColor = pending >= 15 ? 'text-red-400' : pending >= 8 ? 'text-yellow-400' : 'text-green-400';

    // ── Pricing strategy ──────────────────────────────────────────
    const _ps = gameState.pricingStrategy || 'standard';

    // ── Active campaigns ──────────────────────────────────────────
    const activeCampaigns = gameState.activeCampaigns || [];
    const hasMarkDir = (gameState.staff || []).some(s => s.id === 'marketing_dir' || s.id === 'mktg');
    const maxSlots = hasMarkDir ? 2 : 1;

    // ── ROI data ──────────────────────────────────────────────────
    const campaignROI = gameState.campaignROI || {};

    // ─────────────────────────────────────────────────────────────
    // BUILD HTML
    // ─────────────────────────────────────────────────────────────
    let html = DS.header({
        eyebrow: 'Marketing & Brand',
        title:   'Brand Intelligence',
        subtitle: `Volume ${bv}/100 · Prestige ${bp}/100 · Campagne attive: ${activeCampaigns.length}/${maxSlots}`,
        actions: hasMarkDir ? DS.pill('Marketing Dir.', 'gold') : '',
    }) + DS.kpiStrip([
        { label: 'Brand Volume',  val: bv,  color: bv >= 75 ? 'green' : bv >= 25 ? 'gold' : '' },
        { label: 'Prestige',      val: bp,  color: bp >= 75 ? 'gold'  : bp >= 25 ? 'blue' : '' },
        { label: 'Surge',         val: surgeLabel },
        { label: 'Campagne',      val: `${activeCampaigns.length}/${maxSlots}`, color: activeCampaigns.length >= maxSlots ? 'red' : 'green' },
    ]);

    // ── 1. BRAND AWARENESS ────────────────────────────────────────
    html += `<div class="mkt-section-header">Brand Awareness</div>
    <div class="brand-gauge-wrap">
        <div class="brand-gauge">
            <div class="brand-gauge-label volume-label">
                <span>Volume</span>
                <span>${bv}/100</span>
            </div>
            <div class="brand-gauge-value vol-val">${bv}</div>
            <div class="brand-gauge-track">
                <div class="brand-gauge-bar volume-bar" style="width:${bv}%"></div>
            </div>
            <div class="brand-gauge-effect ${volEffectClass}">${volEffect}</div>
        </div>
        <div class="brand-gauge">
            <div class="brand-gauge-label prestige-label">
                <span>Prestige</span>
                <span>${bp}/100</span>
            </div>
            <div class="brand-gauge-value pres-val">${bp}</div>
            <div class="brand-gauge-track">
                <div class="brand-gauge-bar prestige-bar" style="width:${bp}%"></div>
            </div>
            <div class="brand-gauge-effect ${presEffectClass}">${presEffect}</div>
        </div>
    </div>`;

    // ── 2. SITUAZIONE MERCATO ─────────────────────────────────────
    html += `<div class="mkt-section-header">Situazione Mercato</div>
    <div class="grid grid-cols-2 gap-2 mb-4">
        <div class="hud-card text-center">
            <div class="text-2xl mb-1">${ws.icon}</div>
            <div class="text-[9px] text-gray-400">${ws.label}</div>
            <div class="text-[9px] font-bold text-yellow-400">Tariffe +${Math.round((ws.priceMult - 1) * 100)}%</div>
        </div>
        <div class="hud-card text-center flex flex-col justify-center">
            <div class="text-[10px] font-bold ${surgeColor}">${surgeLabel}</div>
            <div class="text-[9px] text-gray-500 mt-1">Corse in attesa: ${pending}</div>
        </div>
    </div>`;

    const season = typeof _getSeasonalMult === 'function' ? _getSeasonalMult() : null;
    if (season && season.priceMult !== 1.0) {
        html += `<div class="hud-card !border-gold/30 bg-gold/5 mb-3">
            <div class="text-[9px] text-gold font-bold uppercase mb-1">${season.name}</div>
            <div class="text-[9px] text-gray-300">Tariffe +${Math.round((season.priceMult - 1) * 100)}% · Volume corse ×${season.rideBonus.toFixed(1)}</div>
        </div>`;
    }

    // ── 3. STRATEGIA TARIFFARIA ───────────────────────────────────
    html += `<div class="mkt-section-header">Strategia Tariffaria</div>
    <div class="pricing-strategy-panel mb-4">
        <button onclick="setPricingStrategy('discount')" class="pricing-btn ${_ps === 'discount' ? 'pricing-btn-active' : ''}">
            <span class="pricing-btn-icon">📉</span>
            <span class="pricing-btn-label">Scontato</span>
            <span class="pricing-btn-sub">+30% corse · −20% guadagno</span>
        </button>
        <button onclick="setPricingStrategy('standard')" class="pricing-btn ${_ps === 'standard' ? 'pricing-btn-active' : ''}">
            <span class="pricing-btn-icon">⚖️</span>
            <span class="pricing-btn-label">Standard</span>
            <span class="pricing-btn-sub">Bilanciato</span>
        </button>
        <button onclick="setPricingStrategy('premium')" class="pricing-btn ${_ps === 'premium' ? 'pricing-btn-active' : ''}">
            <span class="pricing-btn-icon">💎</span>
            <span class="pricing-btn-label">Premium</span>
            <span class="pricing-btn-sub">−30% corse · +40% guadagno</span>
        </button>
    </div>`;

    // ── 4. CAMPAGNE ATTIVE ────────────────────────────────────────
    if (activeCampaigns.length > 0) {
        html += `<div class="mkt-section-header">Campagne Attive <span style="float:right;font-weight:400;color:#6b7280">Slot: ${activeCampaigns.length}/${maxSlots}</span></div>`;
        activeCampaigns.forEach(ac => {
            const camp = MARKETING_CAMPAIGNS.find(c => c.id === ac.id);
            if (!camp) return;
            const totalDays = ac.endsDay - ac.startDay;
            const daysLeft  = Math.max(0, ac.endsDay - gameState.day);
            const daysDone  = totalDays - daysLeft;
            const progress  = totalDays > 0 ? Math.min(100, Math.round((daysDone / totalDays) * 100)) : 0;
            const axisBadgeClass = camp.axis === 'volume' ? 'axis-volume' : camp.axis === 'prestige' ? 'axis-prestige' : 'axis-both';
            const axisLabel      = camp.axis === 'volume' ? 'Volume' : camp.axis === 'prestige' ? 'Prestige' : 'Entrambi';
            html += `<div class="campaign-card campaign-active tier-${camp.tier}">
                <div class="campaign-header">
                    <div class="campaign-name">${camp.icon} ${camp.name}
                        <span class="campaign-axis-badge ${axisBadgeClass}">${axisLabel}</span>
                    </div>
                    <span class="campaign-cost">−€${camp.dailyCost.toLocaleString('it-IT')}/g</span>
                </div>
                <div class="campaign-progress-wrap">
                    <div class="campaign-progress-bar" style="width:${progress}%"></div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
                    <div class="text-[8px] text-gray-500">Giorno ${daysDone} di ${totalDays} · termina G.${ac.endsDay}</div>
                    <button onclick="window._stopMarketingCampaign('${camp.id}')" style="font-size:8px;padding:3px 8px;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);border-radius:4px;cursor:pointer">🛑 Ferma</button>
                </div>
            </div>`;
        });
    } else {
        html += `<div class="mkt-section-header">Campagne Attive <span style="float:right;font-weight:400;color:#6b7280">Slot: 0/${maxSlots}</span></div>
        <div style="font-size:9px;color:#4b5563;font-style:italic;margin-bottom:10px;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">Nessuna campagna attiva. Seleziona una campagna qui sotto per avviarla.</div>`;
    }

    // ── 5. SELEZIONA CAMPAGNA — tier tabs ─────────────────────────
    html += `<div class="mkt-section-header">Seleziona Campagna</div>
    <div class="mkt-tier-tabs">
        <button class="mkt-tier-btn tier-starter ${window._mktTier === 'starter' ? 'active' : ''}" onclick="window._mktTier='starter';renderTabMarketing()">Starter</button>
        <button class="mkt-tier-btn tier-growth  ${window._mktTier === 'growth'  ? 'active' : ''}" onclick="window._mktTier='growth';renderTabMarketing()">Growth</button>
        <button class="mkt-tier-btn tier-empire  ${window._mktTier === 'empire'  ? 'active' : ''}" onclick="window._mktTier='empire';renderTabMarketing()">Empire</button>
    </div>`;

    const tierCampaigns = MARKETING_CAMPAIGNS.filter(c => c.tier === window._mktTier);
    tierCampaigns.forEach(camp => {
        const acEntry   = activeCampaigns.find(ac => ac.id === camp.id);
        const isActive  = !!acEntry;

        // Lock check
        const curBv = gameState.brandVolume  || 0;
        const curBp = gameState.brandPrestige || 0;
        const curRep = gameState.reputation  || 0;
        let isLocked = false;
        let lockReason = '';
        if (camp.tier === 'growth' && curBv < (camp.unlockBrand || 0) && curBp < (camp.unlockBrand || 0)) {
            isLocked = true;
            lockReason = `Richiede Brand Volume o Prestige ≥ ${camp.unlockBrand}`;
        } else if (camp.tier === 'empire') {
            const needBrand = camp.unlockBrand || 75;
            const needRep   = camp.unlockRep   || 0;
            if (curBv < needBrand && curBp < needBrand) {
                isLocked = true;
                lockReason = `Richiede Brand ≥ ${needBrand}`;
                if (needRep > 0) lockReason += ` e reputazione ≥ ${needRep.toFixed(1)}★`;
            } else if (needRep > 0 && curRep < needRep) {
                isLocked = true;
                lockReason = `Richiede reputazione ≥ ${needRep.toFixed(1)}★ (attuale: ${curRep.toFixed(1)}★)`;
            }
        }

        // Region lock check
        if (camp.regionLock === 'lombardia') {
            const hasLombardia = (gameState.unlockedRegions || []).includes('lombardia');
            if (!hasLombardia) {
                isLocked = true;
                lockReason = 'Richiede Licenza Lombardia attiva';
            }
        }

        const axisBadgeClass = camp.axis === 'volume' ? 'axis-volume' : camp.axis === 'prestige' ? 'axis-prestige' : 'axis-both';
        const axisLabel      = camp.axis === 'volume' ? 'Volume' : camp.axis === 'prestige' ? 'Prestige' : 'Entrambi';

        let cardClass = `campaign-card tier-${camp.tier}`;
        if (isActive)  cardClass += ' campaign-active';
        if (isLocked)  cardClass += ' campaign-locked';

        html += `<div class="${cardClass}">
            <div class="campaign-header">
                <div class="campaign-name">${camp.icon} ${camp.name}
                    <span class="campaign-axis-badge ${axisBadgeClass}">${axisLabel}</span>
                </div>
                <span class="campaign-cost">€${camp.dailyCost.toLocaleString('it-IT')}/giorno</span>
            </div>`;

        if (isLocked) {
            html += `<div class="campaign-desc">${camp.desc}</div>
                <div class="campaign-lock-reason">🔒 ${lockReason}</div>
            </div>`;
            return;
        }

        html += `<div class="campaign-desc">${camp.desc}</div>
            <div class="campaign-strat">${camp.stratDesc}</div>`;

        // Stats row
        const stats = [];
        stats.push(`<span class="campaign-stat">⏱ ${camp.duration}g</span>`);
        if (camp.volumeGain   > 0) stats.push(`<span class="campaign-stat stat-positive">📈 Vol +${camp.volumeGain}/g</span>`);
        if (camp.prestigeGain > 0) stats.push(`<span class="campaign-stat stat-positive">✨ Prest +${camp.prestigeGain}/g</span>`);
        if (camp.volumeBonus  > 0) stats.push(`<span class="campaign-stat stat-highlight">+${Math.round(camp.volumeBonus * 100)}% corse</span>`);
        if (camp.prestigeBonus > 0) stats.push(`<span class="campaign-stat stat-highlight">+${Math.round(camp.prestigeBonus * 100)}% VIP</span>`);
        if (camp.cooldown > 0)     stats.push(`<span class="campaign-stat">CD: ${camp.cooldown}g</span>`);
        html += `<div class="campaign-stats">${stats.join('')}</div>`;

        // Synergy
        if (camp.synergy) {
            const synCamp = MARKETING_CAMPAIGNS.find(c => c.id === camp.synergy);
            const synActive = activeCampaigns.some(ac => ac.id === camp.synergy);
            if (synCamp) {
                const synColor = synActive ? '#22c55e' : '#4b5563';
                html += `<div style="font-size:8px;color:${synColor};margin-bottom:8px">
                    ${synActive ? '⚡' : '○'} Sinergia: ${synCamp.name} +${Math.round(camp.synergyBonus * 100)}%${synActive ? ' (ATTIVA!)' : ''}
                </div>`;
            }
        }

        if (isActive && acEntry) {
            const totalDays = acEntry.endsDay - acEntry.startDay;
            const daysLeft  = Math.max(0, acEntry.endsDay - gameState.day);
            const daysDone  = totalDays - daysLeft;
            const progress  = totalDays > 0 ? Math.min(100, Math.round((daysDone / totalDays) * 100)) : 0;
            html += `<div class="campaign-progress-wrap"><div class="campaign-progress-bar" style="width:${progress}%"></div></div>
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div class="text-[8px] text-green-400 font-bold">▶ ATTIVA — ${daysLeft}g rimanenti</div>
                    <button onclick="window._stopMarketingCampaign('${camp.id}')" style="font-size:8px;padding:3px 8px;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);border-radius:4px;cursor:pointer">🛑 Ferma</button>
                </div>`;
        } else {
            const slotsFull = activeCampaigns.length >= maxSlots;
            const btnDisabled = slotsFull ? 'opacity:0.5;cursor:not-allowed' : 'cursor:pointer';
            const btnTitle = slotsFull ? `title="Slot pieni (${maxSlots}/${maxSlots})"` : '';
            html += `<button onclick="${slotsFull ? '' : `window._applyMarketingCampaign('${camp.id}')`}" ${btnTitle} style="width:100%;font-size:9px;font-weight:700;padding:6px;background:rgba(34,197,94,0.12);color:#22c55e;border:1px solid rgba(34,197,94,0.3);border-radius:6px;${btnDisabled}">▶ Avvia Campagna</button>`;
        }

        html += `</div>`;
    });

    // ── 6. ROI CAMPAGNA ───────────────────────────────────────────
    html += `<div class="mkt-roi-box">
        <div class="mkt-roi-title">ROI Campagna</div>`;

    const roiEntries = Object.entries(campaignROI).filter(([, v]) => v > 0);
    if (roiEntries.length === 0) {
        html += `<div style="font-size:9px;color:#374151;font-style:italic">Nessun dato ROI disponibile. Avvia una campagna per tracciare il ritorno sull'investimento.</div>`;
    } else {
        roiEntries.forEach(([campId, revenue]) => {
            const c = MARKETING_CAMPAIGNS.find(x => x.id === campId);
            const label = c ? `${c.icon} ${c.name}` : campId;
            html += `<div class="mkt-roi-row">
                <span class="mkt-roi-label">${label}</span>
                <span class="mkt-roi-value">+€${Math.round(revenue).toLocaleString('it-IT')}</span>
            </div>`;
        });
        const totalROI = roiEntries.reduce((s, [, v]) => s + v, 0);
        html += `<div class="mkt-roi-row" style="border-top:1px solid rgba(34,197,94,0.15);padding-top:6px;margin-top:4px">
            <span class="mkt-roi-label" style="color:#9ca3af;font-weight:700">TOTALE</span>
            <span class="mkt-roi-value" style="font-size:11px">+€${Math.round(totalROI).toLocaleString('it-IT')}</span>
        </div>`;
    }

    html += `</div>`;

    container.innerHTML = html;
}


window.renderTabMarketing = renderTabMarketing;
