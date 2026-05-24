'use strict';
/* ui-politics.js — Chauffeur Empire
   renderTabPolitics: lobbying, decreti, macroeconomia.
   Dipendenze: engine.js, design-system.js */

function renderTabPolitics() {
    const container = document.getElementById('tab-container');
    const inflPct   = ((gameState.inflationRate || 0.020) * 100).toFixed(2);
    const ratePct   = ((gameState.interestRateBase || 0.045) * 100).toFixed(2);
    const points    = gameState.lobbyingPoints || 0;
    const active    = gameState.activeLobbyLaws || [];
    const laws      = typeof LOBBY_LAWS !== 'undefined' ? LOBBY_LAWS : [];
    const activeLaws= laws.filter(l => active.includes(l.id)).length;
    const inflVal   = parseFloat(inflPct);
    const rateVal   = parseFloat(ratePct);

    const inflColor = inflVal > 5 ? 'red' : inflVal < 2 ? 'green' : 'gold';
    const rateColor = rateVal > 7 ? 'red' : rateVal < 3 ? 'green' : 'gold';

    let lawsHtml = laws.map(l => {
        const owned = active.includes(l.id);
        const canAfford = points >= l.pointsCost && (gameState.cash || 0) >= (l.cashCost || 0);
        return `<div class="ds-card${owned ? ' ds-card--gold' : ''}" style="margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
                <div style="flex:1;min-width:0">
                    <div style="font-size:11px;font-weight:700;color:${owned?'var(--gold)':'var(--text)'}">${l.icon} ${l.name} ${owned?'✓':''}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:3px">${l.desc}</div>
                    <div style="display:flex;gap:12px;margin-top:6px">
                        ${DS.pill(l.pointsCost + ' pt', points >= l.pointsCost ? 'gold' : 'ghost')}
                        ${l.cashCost ? DS.pill('€'+l.cashCost.toLocaleString(), (gameState.cash||0)>=l.cashCost?'green':'red') : ''}
                    </div>
                </div>
                <div style="flex-shrink:0">
                    ${owned
                        ? DS.pill('ATTIVA', 'green')
                        : DS.btn({ label:'Approva', color:'gold', onclick:`passLobbyLaw('${l.id}')`, disabled:!canAfford, size:'sm' })}
                </div>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = DS.header({
        eyebrow: 'Lobbying & Economia',
        title:   'Politica & Decreti',
        subtitle:`${activeLaws} leggi attive · ${points} punti lobbying disponibili`,
        actions: DS.btn({ label:'↻ Decr.', color:'ghost', onclick:"window.decreesRefresh(true).then(()=>window.renderTabPolitics())", size:'sm' }),
    }) + DS.kpiStrip([
        { label:'Inflazione',     val: inflPct + '%',                             color: inflColor },
        { label:'Tasso BCE',      val: ratePct + '%',                             color: rateColor },
        { label:'Pt Lobbying',    val: points,                                    color: points > 0 ? 'gold' : '' },
        { label:'Leggi Attive',   val: activeLaws + ' / ' + laws.length,          color: activeLaws > 0 ? 'green' : '' },
    ]) + `
    <div class="ds-card" style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
                <div class="ds-eyebrow">Finanziamento Politico</div>
                <div style="font-size:11px;color:var(--text-muted)">1.000€ = 1 punto lobbying</div>
            </div>
            <div style="font-size:22px;font-weight:700;font-family:var(--font-mono);color:var(--gold)">${points} pt</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
            <input id="lobby-donate-amt" type="number" min="1000" step="5000" value="10000"
                style="flex:1;background:rgba(0,0,0,0.4);border:1px solid var(--border-sub);border-radius:6px;padding:8px 12px;color:var(--text);font-family:var(--font-mono);font-size:11px"
                placeholder="€ donazione">
            ${DS.btn({ label:'Dona', color:'gold', onclick:"donateToLobby(document.getElementById('lobby-donate-amt').value)" })}
        </div>
    </div>

    <div class="ds-eyebrow" style="margin:0 0 12px">⚖️ Leggi Disponibili</div>
    <div>${lawsHtml}</div>

    ${_renderDecreesSection(points)}`;
}
window.renderTabPolitics = renderTabPolitics;

function _renderDecreesSection(lobbyPoints) {
    const decrees = window._decreesState?.decrees || [];
    const passed  = window._decreesState?.activeDecrees || [];

    const passedHtml = passed.length === 0 ? '' : `
        <div class="ds-card ds-card--gold" style="margin-bottom:12px">
            <div class="ds-eyebrow" style="color:var(--green);margin-bottom:8px">✅ Decreti Attivi (${passed.length})</div>
            ${passed.map(d => `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span style="font-size:11px;color:var(--text)">${d.icon} ${d.title}</span>
                <span style="font-size:9px;color:var(--text-muted)">${d.ends_at ? 'Scade '+new Date(d.ends_at).toLocaleDateString('it-IT') : 'Permanente'}</span>
            </div>`).join('')}
        </div>`;

    let votingHtml = '';
    if (decrees.length === 0) {
        votingHtml = DS.empty({ icon:'📜', title:'Nessun decreto in votazione', body:'Aggiorna tra qualche minuto.' });
    } else {
        votingHtml = decrees.map(d => {
            const isPassed = d.status === 'passed';
            const pct = Math.min(100, Math.round((d.votes_current / d.votes_required) * 100));
            const myVotes = d.my_votes || 0;
            const inputId = `decree-pts-${d.id.substring(0, 8)}`;
            const msLeft   = Math.max(0, new Date(d.expires_at) - Date.now());
            const daysLeft = Math.floor(msLeft / 86400000);
            const hoursLeft= Math.floor((msLeft % 86400000) / 3600000);
            const minsLeft = Math.floor((msLeft % 3600000) / 60000);
            const countdownId = `decree-cd-${d.id.substring(0, 8)}`;
            const _fmtCountdown = (ms) => {
                const d2 = Math.floor(ms / 86400000);
                const h2 = Math.floor((ms % 86400000) / 3600000);
                const m2 = Math.floor((ms % 3600000) / 60000);
                if (d2 > 0) return `${d2}g ${h2}h rimasti`;
                if (h2 > 0) return `${h2}h ${m2}m rimasti`;
                if (m2 > 0) return `⚠ ${m2}m rimasti`;
                return `⚠ scade ora`;
            };
            const countdownText = _fmtCountdown(msLeft);
            const fxBadges = Object.entries(d.effects || {}).map(([k, v]) => {
                if (k === 'tipMult')         return `+${Math.round((v-1)*100)}% mance`;
                if (k === 'xpMult')          return `+${Math.round((v-1)*100)}% XP`;
                if (k === 'fuelCostMult')    return `${Math.round((v-1)*100)}% carb.`;
                if (k === 'maintenanceMult') return `${Math.round((v-1)*100)}% manutenzione`;
                if (k === 'taxRateMult')     return `${Math.round((v-1)*100)}% tasse`;
                if (k === 'vehiclePriceMult')return `${Math.round((v-1)*100)}% veicoli`;
                if (k === 'extraRidePct')    return `+${Math.round(v*100)}% corse`;
                return null;
            }).filter(Boolean);

            return `<div class="ds-card${isPassed?' ds-card--gold':''}" style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px">
                    <div style="flex:1;min-width:0">
                        <div style="font-size:11px;font-weight:700;color:${isPassed?'var(--green)':'var(--text)'}">${d.icon} ${d.title} ${isPassed?'✓':''}</div>
                        <div style="font-size:10px;color:var(--text-muted);margin-top:3px">${d.description||''}</div>
                        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
                            ${fxBadges.map(b => DS.pill(b, 'blue')).join('')}
                        </div>
                    </div>
                    <div style="flex-shrink:0;text-align:right">
                        ${isPassed
                            ? DS.pill('APPROVATO', 'green')
                            : `<div id="${countdownId}" style="font-size:9px;color:${msLeft < 3600000 ? 'var(--red)' : msLeft < 86400000 ? 'var(--orange)' : 'var(--text-muted)'}">${countdownText}</div>
                               ${myVotes > 0 ? `<div style="font-size:9px;color:var(--blue);margin-top:2px">Votato: ${myVotes}pt</div>` : ''}`}
                    </div>
                </div>
                <div style="margin-bottom:${isPassed?'0':'10px'}">
                    <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-muted);margin-bottom:4px">
                        <span>${d.votes_current}/${d.votes_required} voti</span>
                        <span>${pct}%</span>
                    </div>
                    ${DS.progress(pct, isPassed ? 'green' : 'gold')}
                </div>
                ${!isPassed ? `<div style="display:flex;gap:8px;align-items:center">
                    <input id="${inputId}" type="number" min="1" max="${lobbyPoints}" value="1"
                        style="flex:1;background:rgba(0,0,0,0.4);border:1px solid var(--border-sub);border-radius:6px;padding:7px 10px;color:var(--text);font-family:var(--font-mono);font-size:11px"
                        placeholder="punti">
                    ${DS.btn({ label:'Vota', color:'gold', onclick:`window.voteServerDecree('${d.id}', document.getElementById('${inputId}').value)`, disabled: lobbyPoints < 1, size:'sm' })}
                </div>` : ''}
            </div>`;
        }).join('');
    }

    // Wire up live countdown tickers after DOM injection (runs once per renderTabPolitics call)
    requestAnimationFrame(() => {
        if (window._decreesCountdownTimer) { clearInterval(window._decreesCountdownTimer); window._decreesCountdownTimer = null; }
        const decreeData = decrees.filter(d => d.status !== 'passed').map(d => ({
            id: `decree-cd-${d.id.substring(0, 8)}`,
            expires: new Date(d.expires_at).getTime(),
        }));
        if (!decreeData.length) return;
        window._decreesCountdownTimer = setInterval(() => {
            const now = Date.now();
            let anyAlive = false;
            decreeData.forEach(({ id, expires }) => {
                const el = document.getElementById(id);
                if (!el) return;
                anyAlive = true;
                const ms = Math.max(0, expires - now);
                const d2 = Math.floor(ms / 86400000);
                const h2 = Math.floor((ms % 86400000) / 3600000);
                const m2 = Math.floor((ms % 3600000) / 60000);
                let txt, col;
                if (d2 > 0)      { txt = `${d2}g ${h2}h rimasti`; col = 'var(--text-muted)'; }
                else if (h2 > 0) { txt = `${h2}h ${m2}m rimasti`; col = 'var(--orange)'; }
                else if (m2 > 0) { txt = `⚠ ${m2}m rimasti`;      col = 'var(--red)'; }
                else             { txt = `⚠ scade ora`;            col = 'var(--red)'; }
                el.textContent = txt;
                el.style.color = col;
            });
            if (!anyAlive) clearInterval(window._decreesCountdownTimer);
        }, 60000);
    });

    return `<div class="ds-eyebrow" style="margin:24px 0 12px">📜 Decreti Server — Votazione Globale</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Vota con i tuoi punti lobbying. Al raggiungimento della soglia, l'effetto si applica a <strong>tutti</strong> i giocatori.</div>
      ${passedHtml}
      ${votingHtml}`;
}


