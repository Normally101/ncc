'use strict';

// ── helpers ──────────────────────────────────────────────────────────
function _homeEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _homeAvatarColor(name) {
    let h = 0;
    for (let i = 0; i < (name||'').length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
    const palette = ['#6366f1','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#3b82f6','#10b981','#f97316'];
    return palette[Math.abs(h) % palette.length];
}

function _homeInitials(name) {
    const parts = (name||'?').split(' ').filter(Boolean);
    return parts.length >= 2 ? (parts[0][0]+parts[1][0]).toUpperCase() : (name||'?').slice(0,2).toUpperCase();
}

function _homeTierBadge(tier) {
    const map = {
        ultra:    { label:'ULTRA',    color:'#f59e0b', bg:'rgba(245,158,11,0.15)',  border:'rgba(245,158,11,0.35)' },
        vip:      { label:'VIP',      color:'#a78bfa', bg:'rgba(167,139,250,0.15)', border:'rgba(167,139,250,0.35)' },
        business: { label:'BUSINESS', color:'#22d3ee', bg:'rgba(34,211,238,0.12)',  border:'rgba(34,211,238,0.30)' },
        standard: { label:'STD',      color:'#94a3b8', bg:'rgba(148,163,184,0.10)', border:'rgba(148,163,184,0.20)' },
        contract: { label:'CONTRACT', color:'#d4af37', bg:'rgba(212,175,55,0.12)',  border:'rgba(212,175,55,0.28)' },
    };
    const t = map[tier] || map.standard;
    return `<span style="font-size:8px;font-weight:700;font-family:'Roboto Mono',monospace;padding:3px 7px;border-radius:4px;letter-spacing:0.06em;background:${t.bg};color:${t.color};border:1px solid ${t.border}">${t.label}</span>`;
}

function _homeLevel(prestige, cash) {
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

// ── main render ───────────────────────────────────────────────────────
window.renderTabHome = function() {
    const c = document.getElementById('tab-container');
    if (!c) return;
    const gs = gameState;

    // ── KPI data ─────────────────────────────────────────────────────
    const todayEarn = gs.todayEarnings || 0;
    const earnFmt   = _homeCashFmt(todayEarn);

    // yesterday comparison
    const yesterdayEarn = gs.yesterdayEarnings || 0;
    let earnDeltaHTML;
    if (yesterdayEarn > 0) {
        const delta = Math.round(((todayEarn - yesterdayEarn) / yesterdayEarn) * 100);
        const sign  = delta >= 0 ? '+' : '';
        earnDeltaHTML = `<span style="color:${delta>=0?'#4ade80':'#f87171'};font-size:11px">${delta>=0?'▲':'▼'} ${sign}${delta}% vs ieri (${_homeCashFmt(yesterdayEarn)})</span>`;
    } else {
        earnDeltaHTML = `<span style="color:var(--text-dim);font-size:11px">nessun dato precedente</span>`;
    }

    const activeRides  = gs.activeRides  || [];
    const pendingRides = gs.pendingRides || [];
    const activeTrips  = gs.activeTrips  || [];
    const totalActive  = activeRides.length + activeTrips.length;
    const totalPending = pendingRides.length;

    const rep = (gs.reputation || 0).toFixed(2);
    const repTrend = gs.reputation >= 4.5 ? 'stabile' : (gs.reputation >= 3.5 ? 'in crescita' : 'in calo');
    const repColor = gs.reputation >= 4.0 ? '#4ade80' : (gs.reputation >= 3.0 ? '#f59e0b' : '#f87171');

    const level = _homeLevel(gs.prestige, gs.cash);
    const levelColor = gs.prestige >= 100 ? '#f59e0b' : (gs.prestige >= 30 ? '#a78bfa' : '#60a5fa');

    // ── Active rides rows ─────────────────────────────────────────────
    const ridesRows = activeRides.slice(0, 6).map(ride => {
        const driver  = (gs.drivers||[]).find(d => d.id === ride.driverId);
        const dname   = _homeEsc(driver ? driver.name : '—');
        const car     = driver ? (gs.fleet||[]).find(v => v.id === driver.assignedCarId) : null;
        const carLabel = car ? _homeEsc((car.brand||'') + ' ' + (car.model||'')) : '—';

        const fromName = _homeEsc(ride.fromPoi?.name || ride.originName || '—');
        const toName   = _homeEsc(ride.toPoi?.name   || ride.destinationName || '—');

        const price    = ride.sellingPrice || ride.price || 0;
        const priceFmt = _homeCashFmt(price);

        const pct      = ride.duration > 0 ? Math.min(100, Math.round((ride.elapsed / ride.duration) * 100)) : 0;
        const msLeft   = Math.max(0, (ride.duration||0) - (ride.elapsed||0));
        const minLeft  = Math.ceil(msLeft / 60000);
        const etaLabel = minLeft > 0 ? minLeft + 'min' : 'arr.';

        const tierBadge = _homeTierBadge(ride.tier || 'standard');
        const progressColor = ride.tier === 'ultra' ? '#f59e0b' : (ride.tier === 'vip' ? '#a78bfa' : '#22d3ee');

        return `
<tr class="ce-table-row" style="border-bottom:1px solid rgba(255,255,255,0.05)">
  <td style="padding:10px 14px">
    <div style="font-size:12px;font-weight:600;color:var(--text)">${dname}</div>
    <div style="font-size:10px;color:var(--text-dim);margin-top:1px">${carLabel}</div>
  </td>
  <td style="padding:10px 14px">
    <div style="font-size:11px;color:var(--text-muted)">${fromName}</div>
    <div style="font-size:11px;color:var(--text);margin-top:2px">→ ${toName}</div>
  </td>
  <td style="padding:10px 14px">
    <div style="font-size:11px;color:var(--text-muted)">${ride.vipClientId ? '⭐ VIP' : (ride.isContract ? '🤝 B2B' : '—')}</div>
  </td>
  <td style="padding:10px 14px">${tierBadge}</td>
  <td style="padding:10px 14px;font-family:'Roboto Mono',monospace;font-size:12px;font-weight:700;color:#4ade80">${priceFmt}</td>
  <td style="padding:10px 20px 10px 14px;min-width:130px">
    <div style="display:flex;align-items:center;gap:8px">
      <div class="ce-progress-bar" style="flex:1">
        <div class="ce-progress-fill" style="width:${pct}%;background:${progressColor}"></div>
      </div>
      <span style="font-size:9px;color:var(--text-dim);white-space:nowrap;font-family:'Roboto Mono',monospace">${pct}% · ${etaLabel}</span>
    </div>
  </td>
</tr>`;
    }).join('');

    const ridesEmpty = totalActive === 0 ? `
<tr><td colspan="6" style="padding:28px;text-align:center;color:var(--text-dim);font-size:12px">
  Nessuna corsa attiva — vai al <span style="color:var(--gold);cursor:pointer" onclick="switchTab('corse')">Dispatch Center</span> per assegnare corse
</td></tr>` : '';

    // ── Drivers list ──────────────────────────────────────────────────
    const driversOnDuty = (gs.drivers||[]).filter(d => d.status === 'busy' || d.status === 'idle');
    const totalDrivers  = (gs.drivers||[]).length;
    const driverRows = (gs.drivers||[]).slice(0, 8).map(d => {
        const avatarColor = _homeAvatarColor(d.name);
        const initials    = _homeInitials(d.name);
        const car   = (gs.fleet||[]).find(v => v.id === d.assignedCarId);
        const carLbl = car ? _homeEsc((car.brand||'')+ ' ' +(car.model||'')) : 'Nessun veicolo';
        const fatigue = Math.round(d.fatigue || 0);
        const fatigueColor = fatigue > 75 ? '#f87171' : (fatigue > 50 ? '#f59e0b' : '#4ade80');

        let statusLabel, statusColor;
        if (d.status === 'busy')  { statusLabel = 'In corsa'; statusColor = '#4ade80'; }
        else if (d.status === 'resting') { statusLabel = 'Riposo'; statusColor = '#94a3b8'; }
        else if (d.status === 'academy') { statusLabel = 'Accademia'; statusColor = '#a78bfa'; }
        else { statusLabel = 'Libero'; statusColor = '#60a5fa'; }

        return `
<div class="ce-table-row" style="display:grid;grid-template-columns:36px 1fr auto auto;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid rgba(255,255,255,0.05)">
  <div class="ce-avatar" style="width:34px;height:34px;border-radius:50%;background:${avatarColor};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
  <div style="min-width:0">
    <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_homeEsc(d.name)}</div>
    <div style="font-size:10px;color:var(--text-dim);margin-top:1px">Stanchezza: <span style="color:${fatigueColor}">${fatigue}%</span></div>
  </div>
  <div style="font-size:10px;color:var(--text-dim);text-align:right;white-space:nowrap">${_homeEsc(carLbl)}</div>
  <div style="font-size:9px;font-weight:700;padding:3px 8px;border-radius:20px;white-space:nowrap;background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40">${statusLabel}</div>
</div>`;
    }).join('');

    // ── Notifications feed ────────────────────────────────────────────
    const emails = (gs.emails||[]).slice().reverse().slice(0, 8);
    const notifRows = emails.length > 0 ? emails.map(e => {
        let icon = '📩', eventType = 'Messaggio', desc = '';
        const subj = (e.subject||e.type||'');
        if (subj.includes('contratto') || subj.includes('contract'))  { icon='🤝'; eventType='Contratto'; }
        else if (subj.includes('multa') || subj.includes('fine'))     { icon='⚖️'; eventType='Multa'; }
        else if (subj.includes('manutenzione') || subj.includes('repair')) { icon='🔧'; eventType='Manutenzione'; }
        else if (subj.includes('rival') || subj.includes('competitor'))    { icon='🦅'; eventType='Rivale'; }
        else if (subj.includes('vip'))                                 { icon='⭐'; eventType='VIP'; }
        else if (subj.includes('provincia') || subj.includes('region'))    { icon='🗺️'; eventType='Provincia'; }
        else if (subj.includes('borsa') || subj.includes('stock'))    { icon='📈'; eventType='Borsa'; }
        else if (subj.includes('diamond') || subj.includes('diamante'))    { icon='💎'; eventType='Diamond'; }
        else if (subj.includes('award') || subj.includes('premio'))   { icon='🏆'; eventType='Premio'; }
        desc = _homeEsc((e.subject || e.type || '').replace(/_/g,' ').slice(0,55));
        const hh = String(e.hour ?? '').padStart(2,'0');
        const mm = String(e.minute ?? '').padStart(2,'0');
        const timeLabel = (e.hour != null) ? `${hh}:${mm}` : '';
        return `
<div class="ce-notif-row" style="display:grid;grid-template-columns:28px 1fr auto;align-items:start;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.05);animation-delay:${emails.indexOf(e)*40}ms">
  <span style="font-size:16px">${icon}</span>
  <div>
    <span style="font-size:11px;font-weight:700;color:var(--text)">${eventType}</span>
    <span style="font-size:11px;color:var(--text-muted)"> — ${desc}</span>
  </div>
  <div style="font-size:10px;color:var(--text-dim);white-space:nowrap;font-family:'Roboto Mono',monospace">${timeLabel}</div>
</div>`;
    }).join('') : `<div style="padding:28px;text-align:center;font-size:12px;color:var(--text-dim)">Nessuna notifica recente</div>`;

    // ── Render ────────────────────────────────────────────────────────
    // Update last-refresh timestamp in header (if already rendered, patch live)
    const existingTs = c.querySelector('#home-ts');
    const tsNow = new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

    c.innerHTML = `
<div style="height:100%;overflow-y:auto;overflow-x:hidden;padding-bottom:60px;background:var(--bg)">

  <!-- Section header -->
  <div class="ce-panel-header" style="padding:16px 20px 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.06)">
    <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:var(--text-muted);font-family:'Roboto Mono',monospace">📊 Panoramica Live</span>
    <span id="home-ts" style="font-size:9px;color:var(--text-dim);font-family:'Roboto Mono',monospace">🔄 ${tsNow}</span>
  </div>

  <!-- 4 KPI cards -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-bottom:1px solid rgba(255,255,255,0.06)">

    <!-- Guadagno Oggi -->
    <div class="ce-kpi-card" style="padding:20px 22px;border-right:1px solid rgba(255,255,255,0.06)">
      <div style="font-size:22px;margin-bottom:8px;position:relative;z-index:1">💰</div>
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--text-muted);font-family:'Roboto Mono',monospace;margin-bottom:6px;position:relative;z-index:1">Guadagno Oggi</div>
      <div class="ce-kpi-value" style="font-size:28px;font-weight:700;color:#4ade80;font-family:'Roboto Mono',monospace;line-height:1;position:relative;z-index:1" data-countup="${todayEarn}" data-fmt="eur">${earnFmt}</div>
      <div style="margin-top:8px;position:relative;z-index:1">${earnDeltaHTML}</div>
    </div>

    <!-- Corse Attive -->
    <div class="ce-kpi-card" style="padding:20px 22px;border-right:1px solid rgba(255,255,255,0.06)">
      <div style="font-size:22px;margin-bottom:8px;position:relative;z-index:1">🚀</div>
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--text-muted);font-family:'Roboto Mono',monospace;margin-bottom:6px;position:relative;z-index:1">Corse Attive</div>
      <div class="ce-kpi-value" style="font-size:28px;font-weight:700;color:var(--text);font-family:'Roboto Mono',monospace;line-height:1;position:relative;z-index:1" data-countup="${totalActive}" data-fmt="int">${totalActive}</div>
      <div style="margin-top:8px;font-size:11px;color:var(--text-dim);position:relative;z-index:1">${totalPending} in attesa</div>
    </div>

    <!-- Rating Medio -->
    <div class="ce-kpi-card" style="padding:20px 22px;border-right:1px solid rgba(255,255,255,0.06)">
      <div style="font-size:22px;margin-bottom:8px;position:relative;z-index:1">⭐</div>
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--text-muted);font-family:'Roboto Mono',monospace;margin-bottom:6px;position:relative;z-index:1">Rating Medio</div>
      <div class="ce-kpi-value" style="font-size:28px;font-weight:700;color:${repColor};font-family:'Roboto Mono',monospace;line-height:1;position:relative;z-index:1" data-countup="${gs.reputation||0}" data-fmt="float2">${rep}</div>
      <div style="margin-top:8px;font-size:11px;color:var(--text-dim);position:relative;z-index:1">▲ ${repTrend}</div>
    </div>

    <!-- Livello -->
    <div class="ce-kpi-card" style="padding:20px 22px">
      <div style="font-size:22px;margin-bottom:8px;position:relative;z-index:1">🏆</div>
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--text-muted);font-family:'Roboto Mono',monospace;margin-bottom:6px;position:relative;z-index:1">Livello</div>
      <div style="font-size:24px;font-weight:700;color:${levelColor};line-height:1;position:relative;z-index:1">${_homeEsc(level.label)}</div>
      <div style="margin-top:8px;font-size:11px;color:var(--text-dim);position:relative;z-index:1">${level.next ? 'Prossimo: ' + level.next : '🌟 Massimo raggiunto'}</div>
    </div>

  </div>

  <!-- Active rides table -->
  <div class="ce-glass" style="margin:16px 16px 0;overflow:hidden">
    <div class="ce-panel-header" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(0,0,0,0.28);border-bottom:1px solid rgba(255,255,255,0.06)">
      <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--text-muted);font-family:'Roboto Mono',monospace">Corse in Corso</span>
      <span class="ce-badge-live" style="font-size:8px;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(34,197,94,0.15);color:#4ade80;border:1px solid rgba(34,197,94,0.3)">● LIVE</span>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:rgba(255,255,255,0.02)">
          <th style="padding:8px 14px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);font-family:'Roboto Mono',monospace;text-align:left">Autista</th>
          <th style="padding:8px 14px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);font-family:'Roboto Mono',monospace;text-align:left">Percorso</th>
          <th style="padding:8px 14px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);font-family:'Roboto Mono',monospace;text-align:left">Cliente</th>
          <th style="padding:8px 14px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);font-family:'Roboto Mono',monospace;text-align:left">Tier</th>
          <th style="padding:8px 14px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);font-family:'Roboto Mono',monospace;text-align:left">Valore</th>
          <th style="padding:8px 14px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);font-family:'Roboto Mono',monospace;text-align:left">Progresso</th>
        </tr>
      </thead>
      <tbody>
        ${ridesEmpty || ridesRows}
      </tbody>
    </table>
  </div>

  <!-- Bottom: drivers + notifications -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px">

    <!-- Drivers -->
    <div class="ce-glass ce-section-fade" style="overflow:hidden;animation-delay:80ms">
      <div class="ce-panel-header" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(0,0,0,0.28);border-bottom:1px solid rgba(255,255,255,0.06)">
        <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--text-muted);font-family:'Roboto Mono',monospace">Autisti</span>
        <span style="font-size:9px;font-weight:700;color:#4ade80">${driversOnDuty.length} ATTIVI</span>
      </div>
      ${driverRows || '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-dim)">Nessun autista — assumine uno nello <span style="color:var(--gold);cursor:pointer" onclick="switchTab(\'staff\')">Staff & HR</span></div>'}
    </div>

    <!-- Notifications -->
    <div class="ce-glass ce-section-fade" style="overflow:hidden;animation-delay:140ms">
      <div class="ce-panel-header" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(0,0,0,0.28);border-bottom:1px solid rgba(255,255,255,0.06)">
        <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--text-muted);font-family:'Roboto Mono',monospace">Notifiche</span>
        <span style="font-size:9px;color:var(--text-dim)">Oggi</span>
      </div>
      ${notifRows}
    </div>

  </div>

</div>`;
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
