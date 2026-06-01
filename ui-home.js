'use strict';

// ── helpers ──────────────────────────────────────────────────────────
function _homeEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _homeLevel(prestige) {
    const tiers = [
        { min:0,    label:'Autista',       next:'Imprenditore' },
        { min:1,    label:'Imprenditore',  next:'Manager' },
        { min:5,    label:'Manager',       next:'Direttore' },
        { min:15,   label:'Direttore',     next:'Magnate' },
        { min:30,   label:'Magnate',       next:'Tycoon' },
        { min:60,   label:'Tycoon',        next:'Emperor' },
        { min:100,  label:'Emperor',       next:'Leggenda' },
        { min:200,  label:'Leggenda',      next:null },
    ];
    let level = tiers[0];
    for (const t of tiers) { if ((prestige||0) >= t.min) level = t; }
    return level;
}

function _homeCashFmt(n) {
    if (n >= 1e9) return '€' + (n/1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '€' + (n/1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '€' + (n/1000).toFixed(1) + 'k';
    return '€' + Math.floor(n);
}

// ── main render — eRepublik-modern "EM" kit (vedi style.css .em*) ──────
window.renderTabHome = function() {
    const c = document.getElementById('tab-container');
    if (!c) return;
    const gs = gameState;

    // KPI data
    const todayEarn  = gs.todayEarnings || 0;
    const earnFmt    = _homeCashFmt(todayEarn);
    const yesterday  = gs.yesterdayEarnings || 0;
    let deltaTxt = 'nessun dato ieri', deltaColor = '#98a1ae';
    if (yesterday > 0) {
        const d = Math.round(((todayEarn - yesterday) / yesterday) * 100);
        deltaColor = d >= 0 ? '#1aa06a' : '#db5746';
        deltaTxt   = `${d >= 0 ? '▲' : '▼'} ${d >= 0 ? '+' : ''}${d}% vs ieri`;
    }

    const activeRides  = gs.activeRides  || [];
    const pendingRides = gs.pendingRides || [];
    const activeTrips  = gs.activeTrips  || [];
    const totalActive  = activeRides.length + activeTrips.length;
    const totalPending = pendingRides.length;

    const rep      = (gs.reputation || 0).toFixed(2);
    const repTrend = gs.reputation >= 4.5 ? 'stabile' : (gs.reputation >= 3.5 ? 'in crescita' : 'in calo');
    const level    = _homeLevel(gs.prestige);
    const driversOnDuty = (gs.drivers||[]).filter(d => d.status === 'busy' || d.status === 'idle');

    // tier → tile colors
    const TIER = {
        ultra:    { bg:'#f7eccd', ic:'#b8881c', bd:'#9a7212', lab:'Ultra' },
        vip:      { bg:'#ece4f7', ic:'#6f53b8', bd:'#6f53b8', lab:'VIP' },
        business: { bg:'#dfeaf7', ic:'#2f74c0', bd:'#2f74c0', lab:'Business' },
        standard: { bg:'#eef1f5', ic:'#6a7480', bd:'#6a7480', lab:'Std' },
        contract: { bg:'#f7eccd', ic:'#b8881c', bd:'#9a7212', lab:'B2B' },
    };
    const carSVG = col => `<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="1.7"><path d="M5 11l1.5-4.2A2 2 0 0 1 8.4 5.4h7.2a2 2 0 0 1 1.9 1.4L19 11M5.5 11h13v5h-13z"/><circle cx="8" cy="13.5" r="1.1"/><circle cx="16" cy="13.5" r="1.1"/></svg>`;

    // active rides rows
    const ridesRows = activeRides.slice(0, 6).map(ride => {
        const driver   = (gs.drivers||[]).find(d => d.id === ride.driverId);
        const dname    = _homeEsc(driver ? driver.name : '—');
        const fromName = _homeEsc(ride.fromPoi?.name || ride.originName || '—');
        const toName   = _homeEsc(ride.toPoi?.name   || ride.destinationName || '—');
        const price    = ride.sellingPrice || ride.price || 0;
        const pct      = ride.duration > 0 ? Math.min(100, Math.round((ride.elapsed / ride.duration) * 100)) : 0;
        const t        = TIER[ride.tier] || TIER.standard;
        return `<div class="em-lrow">
  <div class="em-th" style="background:${t.bg}">${carSVG(t.ic)}</div>
  <div style="flex:1;min-width:0">
    <div class="em-lt" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fromName} → ${toName}</div>
    <div class="em-lm">
      <span>${dname}</span>
      <span class="em-bd" style="background:${t.bg};color:${t.bd}">${t.lab}</span>
      <span style="flex:1;display:flex;align-items:center;gap:6px;min-width:80px"><span class="em-bar"><i style="width:${pct}%;background:${t.ic}"></i></span><span style="color:var(--em-dim)">${pct}%</span></span>
    </div>
  </div>
  <div class="em-price">${_homeCashFmt(price)}</div>
</div>`;
    }).join('');

    const ridesEmpty = totalActive === 0
        ? `<div class="em-empty">Nessuna corsa attiva — vai al <span class="em-link" onclick="switchTab('corse')">Dispatch Center</span> per assegnare corse</div>`
        : '';

    // notifications feed
    const emails = (gs.emails||[]).slice().reverse().slice(0, 6);
    const evIcon = (col, path) => `<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="1.7">${path}</svg>`;
    const MAIL = '<path d="M8 7h8M8 11h8M8 15h5M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2z"/>';
    const notifRows = emails.length ? emails.map(e => {
        const subj = (e.subject || e.type || '').toLowerCase();
        let bg='#e7f0fb', ic='#2f74c0', type='Messaggio', path=MAIL;
        if (subj.includes('vip'))                                   { bg='#fff3cf'; ic='#c79a2a'; type='VIP';     path='<path d="M12 3.5l2.5 5 5.5.8-4 3.9.95 5.5L12 16.1 7.1 18.7 8 13.2 4 9.3l5.5-.8z"/>'; }
        else if (subj.includes('multa')||subj.includes('fine'))     { bg='#fde8e4'; ic='#db5746'; type='Multa';   path='<path d="M12 3l9 16H3zM12 9v5M12 16.5v.5"/>'; }
        else if (subj.includes('contratto')||subj.includes('contract')) { bg='#e7f0fb'; ic='#2f74c0'; type='Contratto'; path=MAIL; }
        else if (subj.includes('manutenzione')||subj.includes('repair')) { bg='#eef1f5'; ic='#6a7480'; type='Manutenzione'; path='<path d="M14 7a3 3 0 0 1-4 4l-5 5 2 2 5-5a3 3 0 0 1 4-4z"/>'; }
        else if (subj.includes('borsa')||subj.includes('stock'))    { bg='#e7f6ee'; ic='#15885a'; type='Borsa';   path='<path d="M3 12h4l3 8 4-16 3 8h4"/>'; }
        else if (subj.includes('provincia')||subj.includes('region'))   { bg='#e7f6ee'; ic='#15885a'; type='Provincia'; path='<path d="M9 4l6 2 5-2v14l-5 2-6-2-5 2V6z"/>'; }
        const desc = _homeEsc((e.subject || e.type || '').replace(/_/g,' ').slice(0, 46));
        return `<div class="em-ev"><div class="em-evi" style="background:${bg}">${evIcon(ic, path)}</div><div><div class="em-evt">${type}</div><div class="em-evd">${desc}</div></div></div>`;
    }).join('') : `<div class="em-empty">Nessuna notifica recente</div>`;

    // queue (pending rides) — center extra card, real data
    const queueRows = (pendingRides||[]).slice()
        .sort((a,b) => ((b.sellingPrice||b.price||0) - (a.sellingPrice||a.price||0)))
        .slice(0,4).map(ride => {
            const fromName = _homeEsc(ride.fromPoi?.name || ride.originName || '—');
            const toName   = _homeEsc(ride.toPoi?.name   || ride.destinationName || '—');
            const price    = ride.sellingPrice || ride.price || 0;
            const t        = TIER[ride.tier] || TIER.standard;
            return `<div class="em-lrow">
  <div class="em-th" style="background:${t.bg}">${carSVG(t.ic)}</div>
  <div style="flex:1;min-width:0"><div class="em-lt" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fromName} → ${toName}</div><div class="em-lm"><span class="em-bd" style="background:${t.bg};color:${t.bd}">${t.lab}</span><span>in attesa di assegnazione</span></div></div>
  <div class="em-price">${_homeCashFmt(price)}</div>
</div>`;
        }).join('');
    const queueCard = totalPending > 0
        ? `<div class="em-card" style="margin-top:7px"><div class="em-ch"><span class="t">In coda</span><span class="a" style="color:var(--em-muted)">${totalPending} corse</span></div>${queueRows}<div style="padding:8px 11px;border-top:1px solid var(--em-line2)"><span class="em-link" onclick="switchTab('corse')">Vai al Dispatch →</span></div></div>`
        : '';

    // drivers mini-section — right card, real data
    const D_ST = { busy:['In corsa','#1aa06a'], idle:['Libero','#2f74c0'], resting:['Riposo','#98a1ae'], academy:['Accademia','#7c5fc9'] };
    const driverMiniRows = (gs.drivers||[]).slice(0,4).map(d => {
        const s = D_ST[d.status] || ['—','#98a1ae'];
        return `<div class="em-ev" style="align-items:center"><span style="width:8px;height:8px;border-radius:50%;background:${s[1]};flex-shrink:0"></span><div style="flex:1"><div class="em-evt">${_homeEsc(d.name)}</div></div><span style="font-size:10px;font-weight:700;color:${s[1]}">${s[0]}</span></div>`;
    }).join('');
    const driverMiniSection = (gs.drivers||[]).length
        ? `<div class="em-ch" style="border-top:1px solid var(--em-line2)"><span class="t">Autisti</span><span class="a">${driversOnDuty.length} attivi</span></div>${driverMiniRows}`
        : '';

    const tsNow = new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });

    c.innerHTML = `
<div class="em em-home"><div class="em-wrap">

  <div class="em-kpis">
    <div class="em-kpi"><div class="l">Guadagno Oggi</div><div class="v" style="color:#1aa06a" data-countup="${todayEarn}" data-fmt="eur">${earnFmt}</div><div class="s" style="color:${deltaColor}">${deltaTxt}</div></div>
    <div class="em-kpi"><div class="l">Corse Attive</div><div class="v" data-countup="${totalActive}" data-fmt="int">${totalActive}</div><div class="s">${totalPending} in attesa</div></div>
    <div class="em-kpi"><div class="l">Rating Medio</div><div class="v" style="color:#c79a2a" data-countup="${gs.reputation||0}" data-fmt="float2">${rep}</div><div class="s">▲ ${repTrend}</div></div>
    <div class="em-kpi"><div class="l">Livello</div><div class="v" style="font-size:17px;color:#2f74c0">${_homeEsc(level.label)}</div><div class="s">${level.next ? 'Prossimo: ' + level.next : 'Massimo'}</div></div>
  </div>

  <div class="em-grid2">

    <div>
      <div class="em-banner">
        <div><div class="bt">Sfida Settimanale</div><h2>Corse Premium</h2><div class="pb"><i style="width:55%"></i></div></div>
        <div class="cd"><div class="n">02:22:39</div><div class="l">al prossimo premio</div></div>
      </div>
      <div style="margin-top:7px">${(typeof window.renderDailyOrdersHTML==='function') ? window.renderDailyOrdersHTML() : ''}</div>
      <div class="em-card" style="margin-top:7px">
        <div class="em-ch"><span class="t">Corse in Corso</span><span class="a">● Live</span></div>
        ${ridesEmpty || ridesRows}
        <div style="display:flex;gap:8px;padding:9px 11px;border-top:1px solid var(--em-line2)">
          <button class="em-gbtn" style="flex:1" onclick="switchTab('corse')">Assegna corse</button>
          <button class="em-bbtn" onclick="switchTab('corse')">Vedi tutte</button>
        </div>
      </div>
      ${queueCard}
    </div>

    <div class="em-card">
      <div class="em-ch"><span class="t">Mondo NCC</span><span class="a" style="color:var(--em-green)">● ${(typeof window._worldOnline==='function')?window._worldOnline():0} online</span></div>
      ${(typeof window.renderWorldFeedHTML==='function') ? window.renderWorldFeedHTML(7) : notifRows}
    </div>

    <div class="em-card" style="margin-top:7px">
      <div class="em-ch"><span class="t">La tua azienda</span><span class="a">${driversOnDuty.length} autisti attivi</span></div>
      <div class="em-contract">
        <div class="ct">Contratto del giorno</div><div class="cs">Transfer premium aeroportuale</div>
        <div class="cr"><span class="cc">0 / 25</span><button class="em-bbtn" style="margin-left:auto" onclick="switchTab('b2b')">Accetta →</button></div>
      </div>
      ${driverMiniSection}
    </div>

  </div>

  <div style="text-align:right;margin-top:8px;font-size:9.5px;color:var(--em-dim);font-family:'Inter',sans-serif">aggiornato ${tsNow}</div>

</div></div>`;
};

// Live auto-refresh — single persistent interval
if (!window._homeTimer) {
    window._homeTimer = setInterval(function() {
        try {
            const title = document.getElementById('panel-title');
            if (title && title.innerText.includes('Command Center')) {
                window.renderTabHome();
            }
        } catch(e) {}
    }, 5000);
}
