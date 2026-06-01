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

    const _inflColor = inflVal > 5 ? '#db5746' : inflVal < 2 ? '#1aa06a' : '#c79a2a';
    const _rateColor = rateVal > 7 ? '#db5746' : rateVal < 3 ? '#1aa06a' : '#c79a2a';

    const _pill = (t, c) => `<span style="display:inline-flex;padding:2px 7px;border-radius:3px;font-size:8px;font-weight:700;font-family:monospace;background:${c}18;border:1px solid ${c}44;color:${c}">${t}</span>`;
    const _btn  = (t, fn, c, dis) => {
        const bg = c==='gold'?'#fff8e8':c==='green'?'#0d2116':c==='red'?'#1e0d0d':'#ffffff';
        const bd = c==='gold'?'#c79a2a':c==='green'?'#1a4731':c==='red'?'#471a1a':'#d6dee8';
        const tc = c==='gold'?'#c79a2a':c==='green'?'#1aa06a':c==='red'?'#db5746':'#6a7480';
        return `<button onclick="${dis?'':fn}" ${dis?'disabled':''} style="background:${bg};border:1px solid ${bd};color:${tc};padding:5px 12px;border-radius:4px;font-size:11px;font-weight:700;cursor:${dis?'not-allowed':'pointer'};opacity:${dis?.45:1};font-family:inherit;white-space:nowrap">${t}</button>`;
    };

    const lawsHtml = laws.map(l => {
        const owned     = active.includes(l.id);
        const canAfford = points >= l.pointsCost && (gameState.cash || 0) >= (l.cashCost || 0);
        return `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px;background:#ffffff;border:1px solid ${owned?'#c79a2a':'#d6dee8'};border-radius:6px;gap:12px">
            <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:700;color:${owned?'#c79a2a':'#1f2733'}">${l.icon} ${l.name}${owned?' ✓':''}</div>
                <div style="font-size:10px;color:#6a7480;margin-top:3px;line-height:1.4">${l.desc}</div>
                <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
                    ${_pill(l.pointsCost + ' pt', points >= l.pointsCost ? '#c79a2a' : '#6a7480')}
                    ${l.cashCost ? _pill('€'+l.cashCost.toLocaleString(), (gameState.cash||0)>=l.cashCost?'#1aa06a':'#db5746') : ''}
                </div>
            </div>
            <div style="flex-shrink:0;margin-top:2px">
                ${owned ? _pill('ATTIVA', '#1aa06a') : _btn('Approva', `passLobbyLaw('${l.id}')`, 'gold', !canAfford)}
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `
<div style="padding:16px;max-width:800px">

    <div style="padding-bottom:16px;border-bottom:1px solid #d6dee8;margin-bottom:16px">
        <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Lobbying & Economia</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div>
                <div style="font-size:20px;font-weight:700;color:#1f2733;letter-spacing:-.01em">Politica & Decreti</div>
                <div style="font-size:11px;color:#6a7480;margin-top:2px">${activeLaws} leggi attive · ${points} punti lobbying</div>
            </div>
            <button onclick="window.decreesRefresh(true).then(()=>window.renderTabPolitics())" style="background:#ffffff;border:1px solid #d6dee8;color:#6a7480;padding:5px 12px;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;font-family:monospace">↻ DECRETI</button>
        </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Inflazione</div>
            <div style="font-size:18px;font-weight:700;color:${_inflColor};font-family:monospace">${inflPct}%</div>
        </div>
        <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Tasso BCE</div>
            <div style="font-size:18px;font-weight:700;color:${_rateColor};font-family:monospace">${ratePct}%</div>
        </div>
        <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Pt Lobbying</div>
            <div style="font-size:18px;font-weight:700;color:${points>0?'#c79a2a':'#1f2733'};font-family:monospace">${points}</div>
        </div>
        <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Leggi Attive</div>
            <div style="font-size:18px;font-weight:700;color:${activeLaws>0?'#1aa06a':'#1f2733'};font-family:monospace">${activeLaws}<span style="font-size:11px;color:#6a7480">/${laws.length}</span></div>
        </div>
    </div>

    <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;font-weight:600">Finanziamento Politico</div>
    <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:14px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div>
                <div style="font-size:12px;font-weight:700;color:#1f2733">Donazione Politica</div>
                <div style="font-size:10px;color:#6a7480;margin-top:2px">1.000€ = 1 punto lobbying</div>
            </div>
            <div style="font-size:22px;font-weight:700;font-family:monospace;color:#c79a2a">${points} pt</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
            <input id="lobby-donate-amt" type="number" min="1000" step="5000" value="10000"
                style="flex:1;background:#f3f6f9;border:1px solid #d6dee8;border-radius:4px;padding:8px 12px;color:#1f2733;font-family:monospace;font-size:11px"
                placeholder="€ donazione">
            ${_btn('Dona', "donateToLobby(document.getElementById('lobby-donate-amt').value)", 'gold', false)}
        </div>
    </div>

    <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;font-weight:600">Leggi Disponibili</div>
    ${laws.length === 0
        ? `<div style="text-align:center;padding:20px;color:#6a7480;font-size:11px">Nessuna legge disponibile.</div>`
        : `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:24px" class="ce-stagger">${lawsHtml}</div>`}

    ${_renderDecreesSection(points)}
</div>`;
}
window.renderTabPolitics = renderTabPolitics;

function _renderDecreesSection(lobbyPoints) {
    const decrees = window._decreesState?.decrees || [];
    const passed  = window._decreesState?.activeDecrees || [];

    const _pill = (t, c) => `<span style="display:inline-flex;padding:2px 7px;border-radius:3px;font-size:8px;font-weight:700;font-family:monospace;background:${c}18;border:1px solid ${c}44;color:${c}">${t}</span>`;
    const _btn  = (t, fn, c, dis) => {
        const bg = c==='gold'?'#fff8e8':'#ffffff';
        const bd = c==='gold'?'#c79a2a':'#d6dee8';
        const tc = c==='gold'?'#c79a2a':'#6a7480';
        return `<button onclick="${dis?'':fn}" ${dis?'disabled':''} style="background:${bg};border:1px solid ${bd};color:${tc};padding:5px 12px;border-radius:4px;font-size:11px;font-weight:700;cursor:${dis?'not-allowed':'pointer'};opacity:${dis?.45:1};font-family:inherit">${t}</button>`;
    };

    const passedHtml = passed.length === 0 ? '' : `
    <div style="background:#0d2116;border:1px solid #1a4731;border-radius:6px;padding:14px;margin-bottom:12px">
        <div style="font-size:9px;color:#1aa06a;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;font-weight:600">Decreti Attivi (${passed.length})</div>
        ${passed.map(d => `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(63,185,80,0.12)">
            <span style="font-size:11px;color:#1f2733">${d.icon} ${d.title}</span>
            <span style="font-size:9px;color:#6a7480;font-family:monospace">${d.ends_at ? new Date(d.ends_at).toLocaleDateString('it-IT') : 'Permanente'}</span>
        </div>`).join('')}
    </div>`;

    let votingHtml = '';
    if (decrees.length === 0) {
        votingHtml = `<div style="text-align:center;padding:20px;color:#6a7480;font-size:11px;background:#ffffff;border:1px solid #d6dee8;border-radius:6px">Nessun decreto in votazione — aggiorna tra qualche minuto.</div>`;
    } else {
        votingHtml = decrees.map(d => {
            const isPassed  = d.status === 'passed';
            const pct       = Math.min(100, Math.round((d.votes_current / d.votes_required) * 100));
            const myVotes   = d.my_votes || 0;
            const inputId   = `decree-pts-${d.id.substring(0, 8)}`;
            const countdownId = `decree-cd-${d.id.substring(0, 8)}`;
            const msLeft    = Math.max(0, new Date(d.expires_at) - Date.now());
            const cdColor   = msLeft < 3600000 ? '#db5746' : msLeft < 86400000 ? '#e0922e' : '#6a7480';

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

            const barColor = isPassed ? '#1aa06a' : '#c79a2a';

            return `
            <div style="background:#ffffff;border:1px solid ${isPassed?'#1a4731':'#d6dee8'};border-radius:6px;padding:14px;margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px">
                    <div style="flex:1;min-width:0">
                        <div style="font-size:11px;font-weight:700;color:${isPassed?'#1aa06a':'#1f2733'}">${d.icon} ${d.title}${isPassed?' ✓':''}</div>
                        <div style="font-size:10px;color:#6a7480;margin-top:3px;line-height:1.4">${d.description||''}</div>
                        ${fxBadges.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">${fxBadges.map(b => _pill(b, '#2f74c0')).join('')}</div>` : ''}
                    </div>
                    <div style="flex-shrink:0;text-align:right">
                        ${isPassed
                            ? _pill('APPROVATO', '#1aa06a')
                            : `<div id="${countdownId}" style="font-size:9px;color:${cdColor};font-family:monospace">${_fmtMs(msLeft)}</div>
                               ${myVotes > 0 ? `<div style="font-size:9px;color:#2f74c0;margin-top:2px;font-family:monospace">Votato: ${myVotes}pt</div>` : ''}`}
                    </div>
                </div>
                <div style="margin-bottom:${isPassed?'0':'10px'}">
                    <div style="display:flex;justify-content:space-between;font-size:9px;color:#6a7480;margin-bottom:4px;font-family:monospace">
                        <span>${d.votes_current}/${d.votes_required} voti</span>
                        <span>${pct}%</span>
                    </div>
                    <div style="height:3px;background:#d6dee8;border-radius:2px;overflow:hidden">
                        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:2px;transition:width .3s"></div>
                    </div>
                </div>
                ${!isPassed ? `<div style="display:flex;gap:8px;align-items:center">
                    <input id="${inputId}" type="number" min="1" max="${lobbyPoints}" value="1"
                        style="flex:1;background:#f3f6f9;border:1px solid #d6dee8;border-radius:4px;padding:7px 10px;color:#1f2733;font-family:monospace;font-size:11px"
                        placeholder="punti">
                    ${_btn('Vota', `window.voteServerDecree('${d.id}', document.getElementById('${inputId}').value)`, 'gold', lobbyPoints < 1)}
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
                if (d2 > 0)      { txt = `${d2}g ${h2}h rimasti`; col = '#6a7480'; }
                else if (h2 > 0) { txt = `${h2}h ${m2}m rimasti`; col = '#e0922e'; }
                else if (m2 > 0) { txt = `⚠ ${m2}m rimasti`;      col = '#db5746'; }
                else             { txt = `⚠ scade ora`;            col = '#db5746'; }
                el.textContent = txt;
                el.style.color = col;
            });
            if (!anyAlive) clearInterval(window._decreesCountdownTimer);
        }, 60000);
    });

    return `
    <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;font-weight:600">Decreti Server — Votazione Globale</div>
    <div style="font-size:11px;color:#6a7480;margin-bottom:12px;line-height:1.5">Vota con i tuoi punti lobbying. Al raggiungimento della soglia, l'effetto si applica a <strong style="color:#1f2733">tutti</strong> i giocatori.</div>
    ${passedHtml}
    <div>${votingHtml}</div>`;
}
