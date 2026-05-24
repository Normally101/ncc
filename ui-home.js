'use strict';

window.renderTabHome = function() {
    const c = document.getElementById('tab-container');
    if (!c) return;

    const gs = gameState;
    const esc = window.CE_Sec ? window.CE_Sec.escHtml : function(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

    // --- stats
    const cashFmt = gs.cash >= 1e6
        ? '€' + (gs.cash/1e6).toFixed(2) + 'M'
        : '€' + Math.floor(gs.cash).toLocaleString('it-IT');

    const driversOn  = (gs.drivers||[]).filter(d => d.status === 'driving').length;
    const driversOff = (gs.drivers||[]).filter(d => d.status === 'resting').length;
    const driversRdy = (gs.drivers||[]).filter(d => d.status === 'idle').length;
    const totalDrivers = (gs.drivers||[]).length;

    const fleetTotal   = (gs.fleet||[]).length;
    const fleetWorking = (gs.fleet||[]).filter(v => v.driverId).length;

    const activeRides  = (gs.activeRides||[]).length + (gs.activeTrips||[]).length;
    const pendingRides = (gs.pendingRides||[]).length;

    const repFmt  = (gs.reputation||0).toFixed(1);
    const energyPct = Math.round((gs.energy||0));
    const prestige  = gs.prestige || 0;

    const todayEarn = gs.todayEarnings || 0;
    const earnFmt   = todayEarn >= 1000 ? '€' + (todayEarn/1000).toFixed(1) + 'k' : '€' + Math.floor(todayEarn);

    // hour/minute display
    const hh = String(gs.hour   || 0).padStart(2,'0');
    const mm = String(gs.minute || 0).padStart(2,'0');

    // day / month
    const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    const monthName = months[(gs.month||1)-1] || '';

    // login streak
    const streak = gs.loginStreak || 0;
    const streakDays = [];
    for (let i = 1; i <= 7; i++) {
        if (i < streak % 7 || (streak >= 7 && i < 7)) streakDays.push('done');
        else if (i === (streak % 7 || 7)) streakDays.push('today');
        else streakDays.push('');
    }
    // simplify: last N days
    const streakCapped = Math.min(streak, 7);
    const streakHTML = Array.from({length:7}, (_,i) => {
        const cls = i < streakCapped ? 'done' : '';
        return `<div class="home-streak-day ${cls}"></div>`;
    }).join('');

    // --- alerts
    const alerts = [];
    const tiredDrivers = (gs.drivers||[]).filter(d => (d.fatigue||0) >= 80);
    if (tiredDrivers.length)
        alerts.push({ icon:'😴', text: `${tiredDrivers.length} autist${tiredDrivers.length===1?'a':'i'} stanco — mandali a riposare` });

    const unreadEmails = (gs.emails||[]).filter(e => !e.read).length;
    if (unreadEmails > 0)
        alerts.push({ icon:'📬', text: `${unreadEmails} email non lett${unreadEmails===1?'a':'e'} in arrivo` });

    const dueLoans = (gs.loans||[]).filter(l => (l.dueDays - gs.day) <= 3 && (l.dueDays - gs.day) >= 0);
    if (dueLoans.length)
        alerts.push({ icon:'💳', text: `Rimborso prestito tra ${dueLoans[0].dueDays - gs.day} giorni` });

    const activeFines = (gs.activeFines||[]).filter(f => !f.paid);
    if (activeFines.length)
        alerts.push({ icon:'⚖️', text: `${activeFines.length} multa${activeFines.length===1?'':'e'} in sospeso` });

    const lowFuel = (gs.fuelTank||0) < 200;
    if (lowFuel)
        alerts.push({ icon:'⛽', text: `Carburante basso — ${Math.round(gs.fuelTank||0)} L rimasti` });

    if (!alerts.length)
        alerts.push({ icon:'✅', text: 'Tutto in ordine — buona giornata, CEO!' });

    const alertsHTML = alerts.slice(0,5).map(a =>
        `<div class="home-alert-row">
            <span class="home-alert-icon">${a.icon}</span>
            <span>${esc(a.text)}</span>
        </div>`
    ).join('');

    // company logo emoji
    const compLogo = esc(gs.companyLogo || '👁️');
    const compName = esc(gs.companyName || 'Chauffeur Empire');

    const regionLabel = (gs.unlockedRegions||[]).map(r => r.charAt(0).toUpperCase()+r.slice(1)).join(', ') || 'Lazio';
    const hqName = (gs.hq && gs.hq.name) ? esc(gs.hq.name) : 'Garage Periferico';
    const hqLvl  = gs.hqLevel || 0;

    c.innerHTML = `
<div style="height:100%;overflow-y:auto;padding-bottom:60px">

  <!-- Hero -->
  <div class="home-hero">
    <div class="home-company-logo">${compLogo}</div>
    <div style="flex:1;min-width:0">
      <div class="home-company-name">${compName}</div>
      <div class="home-company-sub">
        <span>⭐ Prestigio ${prestige}</span>
        <span style="color:rgba(255,255,255,0.15)">|</span>
        <span>📍 ${regionLabel}</span>
        <span style="color:rgba(255,255,255,0.15)">|</span>
        <span>🏗️ ${hqName} Lv.${hqLvl}</span>
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:var(--text)">${hh}:${mm}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:2px">GIORNO ${gs.day||1} · ${monthName}</div>
    </div>
  </div>

  <!-- KPI row -->
  <div class="home-kpi-grid">
    <div class="home-kpi">
      <div class="home-kpi-label">Cassa</div>
      <div class="home-kpi-val" style="color:#4ade80">${cashFmt}</div>
      <div class="home-kpi-sub">oggi +${earnFmt}</div>
    </div>
    <div class="home-kpi">
      <div class="home-kpi-label">Reputazione</div>
      <div class="home-kpi-val" style="color:var(--gold)">★ ${repFmt}</div>
      <div class="home-kpi-sub">/5.0 stelle</div>
    </div>
    <div class="home-kpi">
      <div class="home-kpi-label">Energia CEO</div>
      <div class="home-kpi-val" style="color:${energyPct>=50?'#60a5fa':'#f87171'}">${energyPct}%</div>
      <div class="home-kpi-sub">del massimo</div>
    </div>
    <div class="home-kpi">
      <div class="home-kpi-label">Autisti</div>
      <div class="home-kpi-val" style="color:var(--text)">${driversOn}/${totalDrivers}</div>
      <div class="home-kpi-sub">${driversRdy} liberi · ${driversOff} riposo</div>
    </div>
    <div class="home-kpi">
      <div class="home-kpi-label">Flotta</div>
      <div class="home-kpi-val" style="color:var(--text)">${fleetWorking}/${fleetTotal}</div>
      <div class="home-kpi-sub">${activeRides} corse attive · ${pendingRides} in coda</div>
    </div>
  </div>

  <!-- Body -->
  <div class="home-body">

    <!-- Quick actions -->
    <div class="home-section">
      <div class="home-section-head">⚡ Accesso Rapido</div>
      <div class="home-section-body" style="padding-top:8px;padding-bottom:8px">
        <div class="home-quick-btn" onclick="switchTab('corse')">
          <span class="home-quick-btn-icon">🚕</span>
          <div>
            <div class="home-quick-btn-label">Dispatch Center</div>
            <div class="home-quick-btn-sub">${pendingRides} corse in attesa · ${activeRides} attive</div>
          </div>
        </div>
        <div class="home-quick-btn" onclick="switchTab('fleet')">
          <span class="home-quick-btn-icon">🚘</span>
          <div>
            <div class="home-quick-btn-label">Gestione Flotta</div>
            <div class="home-quick-btn-sub">${fleetTotal} veicoli totali</div>
          </div>
        </div>
        <div class="home-quick-btn" onclick="switchTab('staff')">
          <span class="home-quick-btn-icon">👔</span>
          <div>
            <div class="home-quick-btn-label">Staff & HR</div>
            <div class="home-quick-btn-sub">${totalDrivers} autisti · ${(gs.staff||[]).length} staff</div>
          </div>
        </div>
        <div class="home-quick-btn" onclick="switchTab('career')">
          <span class="home-quick-btn-icon">📋</span>
          <div>
            <div class="home-quick-btn-label">Missioni & Carriera</div>
            <div class="home-quick-btn-sub">${(gs.claimableQuests||[]).length} premi da riscuotere</div>
          </div>
        </div>
        <div class="home-quick-btn" onclick="switchTab('finance')">
          <span class="home-quick-btn-icon">💹</span>
          <div>
            <div class="home-quick-btn-label">Finanza & Borsa</div>
            <div class="home-quick-btn-sub">Mercato ${gs.hour >= 9 && gs.hour < 18 ? '🟢 aperto' : '🔴 chiuso'}</div>
          </div>
        </div>
        <div class="home-quick-btn" onclick="switchTab('emails')">
          <span class="home-quick-btn-icon">📬</span>
          <div>
            <div class="home-quick-btn-label">Inbox CEO</div>
            <div class="home-quick-btn-sub">${unreadEmails} non lett${unreadEmails===1?'a':'e'}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Alerts -->
    <div class="home-section">
      <div class="home-section-head">🔔 Situazione Attuale</div>
      <div class="home-section-body">
        ${alertsHTML}
        ${gs.loginStreak > 0 ? `
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06)">
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">
            🔥 Login streak: <strong style="color:var(--gold)">${streak} giorni</strong>
          </div>
          <div class="home-streak-bar">${streakHTML}</div>
          <div style="font-size:9px;color:var(--text-dim);margin-top:5px">7 giorni = ricompensa settimanale</div>
        </div>` : ''}
      </div>
    </div>

  </div>

</div>`;
};
