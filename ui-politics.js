'use strict';
/* ui-politics.js — Chauffeur Empire
   renderTabPolitics: lobbying, decreti, macroeconomia. */

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

    const _inflColor = inflVal > 5 ? 'var(--em-red)' : inflVal < 2 ? 'var(--em-green)' : 'var(--em-gold)';
    const _rateColor = rateVal > 7 ? 'var(--em-red)' : rateVal < 3 ? 'var(--em-green)' : 'var(--em-gold)';

    const _pill = (t, c) => {
        const cls = c==='#c79a2a'||c==='gold' ? 'em-pill--gold'
            : c==='#1aa06a'||c==='green' ? 'em-pill--green'
            : c==='#db5746'||c==='red'   ? 'em-pill--red'
            : c==='#2f74c0'||c==='blue'  ? 'em-pill--blue'
            : 'em-pill--gray';
        return `<span class="em-pill ${cls}">${t}</span>`;
    };

    const lawsHtml = laws.map(l => {
        const owned     = active.includes(l.id);
        const canAfford = points >= l.pointsCost && (gameState.cash || 0) >= (l.cashCost || 0);
        return `
        <div class="em-card" style="padding:12px;margin-bottom:6px${owned ? ';border-color:rgba(199,154,42,.5)' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
                <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:700;margin-bottom:3px;color:${owned?'var(--em-gold)':'var(--em-ink)'}">${l.icon} ${l.name}${owned?' ✓':''}</div>
                    <div style="font-size:10px;color:var(--em-muted);line-height:1.4;margin-bottom:8px">${l.desc}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                        ${_pill(l.pointsCost + ' pt', points >= l.pointsCost ? '#c79a2a' : '#6a7480')}
                        ${l.cashCost ? _pill('€'+l.cashCost.toLocaleString('it'), (gameState.cash||0)>=l.cashCost?'#1aa06a':'#db5746') : ''}
                    </div>
                </div>
                <div style="flex-shrink:0;margin-top:2px">
                    ${owned
                        ? _pill('ATTIVA', '#1aa06a')
                        : `<button class="em-goldbtn" onclick="passLobbyLaw('${l.id}')" ${canAfford?'':'disabled'} style="${canAfford?'':'opacity:.45;cursor:not-allowed'}">Approva</button>`}
                </div>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `<div class="em"><div class="em-page em-wrap">

    <div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--em-line)">
        <div class="em-sec" style="margin-bottom:4px">Lobbying &amp; Economia</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div>
                <div style="font-size:20px;font-weight:800;letter-spacing:-.01em;margin-bottom:2px">Politica &amp; Decreti</div>
                <div style="font-size:11px;color:var(--em-muted)">${activeLaws} leggi attive · ${points} punti lobbying</div>
            </div>
            <button class="em-ghbtn" onclick="window.decreesRefresh(true).then(()=>window.renderTabPolitics())" style="font-family:monospace">↻ DECRETI</button>
        </div>
    </div>

    <div class="em-kpis" style="margin-bottom:16px">
        <div class="em-kpi">
            <div class="l">Inflazione</div>
            <div class="v" style="color:${_inflColor}">${inflPct}%</div>
        </div>
        <div class="em-kpi">
            <div class="l">Tasso BCE</div>
            <div class="v" style="color:${_rateColor}">${ratePct}%</div>
        </div>
        <div class="em-kpi">
            <div class="l">Pt Lobbying</div>
            <div class="v" style="color:${points>0?'var(--em-gold)':'var(--em-muted)'}">${points}</div>
        </div>
        <div class="em-kpi">
            <div class="l">Leggi Attive</div>
            <div class="v" style="color:${activeLaws>0?'var(--em-green)':'var(--em-muted)'}">${activeLaws}<span style="font-size:11px;color:var(--em-muted)">/${laws.length}</span></div>
        </div>
    </div>

    <div class="em-sec" style="margin-bottom:8px">Finanziamento Politico</div>
    <div class="em-card" style="padding:14px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div>
                <div style="font-size:12px;font-weight:700;margin-bottom:2px">Donazione Politica</div>
                <div style="font-size:10px;color:var(--em-muted)">1.000€ = 1 punto lobbying</div>
            </div>
            <div style="font-size:22px;font-weight:800;font-family:monospace;color:var(--em-gold)">${points} pt</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
            <input id="lobby-donate-amt" type="number" min="1000" step="5000" value="10000"
                style="flex:1;background:#0d1117;border:1px solid var(--em-line);border-radius:5px;padding:8px 12px;color:var(--em-ink);font-family:monospace;font-size:11px"
                placeholder="€ donazione">
            <button class="em-goldbtn" onclick="donateToLobby(document.getElementById('lobby-donate-amt').value)">Dona</button>
        </div>
    </div>

    <div class="em-sec" style="margin-bottom:8px">Leggi Disponibili</div>
    ${laws.length === 0
        ? `<div class="em-empty">Nessuna legge disponibile.</div>`
        : `<div style="margin-bottom:20px">${lawsHtml}</div>`}

    ${_renderDecreesSection(points)}
</div></div>`;
}
window.renderTabPolitics = renderTabPolitics;

function _renderDecreesSection(lobbyPoints) {
    const decrees = window._decreesState?.decrees || [];
    const passed  = window._decreesState?.activeDecrees || [];

    const passedHtml = passed.length === 0 ? '' : `
    <div class="em-card" style="padding:14px;margin-bottom:12px;border-color:rgba(26,160,106,.4)">
        <div class="em-sec" style="margin-bottom:8px;color:var(--em-green)">Decreti Attivi (${passed.length})</div>
        ${passed.map(d => `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(26,160,106,.12)">
            <span style="font-size:11px">${d.icon} ${d.title}</span>
            <span style="font-size:9px;color:var(--em-muted);font-family:monospace">${d.ends_at ? new Date(d.ends_at).toLocaleDateString('it-IT') : 'Permanente'}</span>
        </div>`).join('')}
    </div>`;

    let votingHtml = '';
    if (decrees.length === 0) {
        votingHtml = `<div class="em-empty">Nessun decreto in votazione — aggiorna tra qualche minuto.</div>`;
    } else {
        votingHtml = decrees.map(d => {
            const isPassed  = d.status === 'passed';
            const pct       = Math.min(100, Math.round((d.votes_current / d.votes_required) * 100));
            const myVotes   = d.my_votes || 0;
            const inputId   = `decree-pts-${d.id.substring(0, 8)}`;
            const countdownId = `decree-cd-${d.id.substring(0, 8)}`;
            const msLeft    = Math.max(0, new Date(d.expires_at) - Date.now());
            const cdColor   = msLeft < 3600000 ? 'var(--em-red)' : msLeft < 86400000 ? 'var(--em-amber)' : 'var(--em-muted)';

            const _fmtMs = ms => {
                const d2 = Math.floor(ms / 86400000), h2 = Math.floor((ms % 86400000) / 3600000), m2 = Math.floor((ms % 3600000) / 60000);
                if (d2 > 0) return `${d2}g ${h2}h rimasti`;
                if (h2 > 0) return `${h2}h ${m2}m rimasti`;
                if (m2 > 0) return `⚠ ${m2}m rimasti`;
                return `⚠ scade ora`;
            };

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

            return `
            <div class="em-card" style="padding:14px;margin-bottom:8px${isPassed?';border-color:rgba(26,160,106,.4)':''}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px">
                    <div style="flex:1;min-width:0">
                        <div style="font-size:11px;font-weight:700;color:${isPassed?'var(--em-green)':'var(--em-ink)'};margin-bottom:3px">${d.icon} ${d.title}${isPassed?' ✓':''}</div>
                        <div style="font-size:10px;color:var(--em-muted);line-height:1.4">${d.description||''}</div>
                        ${fxBadges.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">${fxBadges.map(b => `<span class="em-pill em-pill--blue">${b}</span>`).join('')}</div>` : ''}
                    </div>
                    <div style="flex-shrink:0;text-align:right">
                        ${isPassed
                            ? `<span class="em-pill em-pill--green">APPROVATO</span>`
                            : `<div id="${countdownId}" style="font-size:9px;color:${cdColor};font-family:monospace">${_fmtMs(msLeft)}</div>
                               ${myVotes > 0 ? `<div style="font-size:9px;color:var(--em-blue);margin-top:2px;font-family:monospace">Votato: ${myVotes}pt</div>` : ''}`}
                    </div>
                </div>
                <div style="margin-bottom:${isPassed?'0':'10px'}">
                    <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--em-muted);margin-bottom:4px;font-family:monospace">
                        <span>${d.votes_current}/${d.votes_required} voti</span>
                        <span>${pct}%</span>
                    </div>
                    <div class="em-prog">
                        <i style="width:${pct}%;background:${isPassed?'var(--em-green)':'var(--em-gold)'};transition:width .3s"></i>
                    </div>
                </div>
                ${!isPassed ? `<div style="display:flex;gap:8px;align-items:center">
                    <input id="${inputId}" type="number" min="1" max="${lobbyPoints}" value="1"
                        style="flex:1;background:#0d1117;border:1px solid var(--em-line);border-radius:5px;padding:7px 10px;color:var(--em-ink);font-family:monospace;font-size:11px"
                        placeholder="punti">
                    <button class="em-goldbtn" onclick="window.voteServerDecree('${d.id}', document.getElementById('${inputId}').value)" ${lobbyPoints < 1 ? 'disabled style="opacity:.45;cursor:not-allowed"' : ''}>Vota</button>
                </div>` : ''}
            </div>`;
        }).join('');
    }

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
                const d2 = Math.floor(ms / 86400000), h2 = Math.floor((ms % 86400000) / 3600000), m2 = Math.floor((ms % 3600000) / 60000);
                let txt, col;
                if (d2 > 0)      { txt = `${d2}g ${h2}h rimasti`; col = 'var(--em-muted)'; }
                else if (h2 > 0) { txt = `${h2}h ${m2}m rimasti`; col = 'var(--em-amber)'; }
                else if (m2 > 0) { txt = `⚠ ${m2}m rimasti`;      col = 'var(--em-red)'; }
                else             { txt = `⚠ scade ora`;            col = 'var(--em-red)'; }
                el.textContent = txt;
                el.style.color = col;
            });
            if (!anyAlive) clearInterval(window._decreesCountdownTimer);
        }, 60000);
    });

    return `
    <div class="em-sec" style="margin-bottom:8px">Decreti Server — Votazione Globale</div>
    <div style="font-size:11px;color:var(--em-muted);margin-bottom:12px;line-height:1.5">Vota con i tuoi punti lobbying. Al raggiungimento della soglia, l'effetto si applica a <strong>tutti</strong> i giocatori.</div>
    ${passedHtml}
    <div>${votingHtml}</div>`;
}
