'use strict';
/* ================================================================
   ui-staff.js — Chauffeur Empire
   Staff tab, car modal, car configurator, buyCar, leaseCar,
   hireOfficeStaff, fireStaff.
   Dipendenze: engine.js, engine-drivers.js, engine-fleet.js,
   dispatcher.js (gameState, showNotification, updateUI)
   ================================================================ */

'use strict';
/* ui-staff.js — renderTabStaff, renderTabLifestyle */

function renderTabStaff() {
    const container = document.getElementById('tab-container');
    // Zero-to-Hero: sotto le 25 corse lo Staff è in fase transitoria
    // (solo "Ragazzo di Quartiere", niente HR/Accademia). Veterani esenti.
    const _z2hLite = (typeof window._z2hRestricted === 'function') && window._z2hRestricted();
    const hqLvl      = typeof HQ_LEVELS !== 'undefined' ? HQ_LEVELS.find(l => l.level === (gameState.hqLevel || 0)) : null;
    const maxStaff   = hqLvl ? hqLvl.maxStaff : 2;
    const officeStaff= gameState.staff.length;
    const driverCount= gameState.drivers.filter(d => d.id !== 'ceo').length;
    const currentStaff = officeStaff + driverCount;
    const hqName     = hqLvl ? hqLvl.name : 'Garage Condiviso';
    const staffFull  = currentStaff >= maxStaff && maxStaff !== 99;
    const monthlyPayroll = gameState.staff.reduce((s, st) => {
        const role = typeof STAFF_ROLES !== 'undefined' ? Object.values(STAFF_ROLES).find(r => r.id === st.id) : null;
        return s + (role ? role.salary : 0);
    }, 0);

    let html = `<div style="margin-bottom:10px">
        <div class="em-sec">Risorse Umane</div>
        <div style="font-size:20px;font-weight:800;margin-top:3px">Gestione Staff</div>
        <div style="font-size:11px;color:var(--em-muted);margin-top:3px">${hqName} · ${currentStaff} / ${maxStaff === 99 ? '∞' : maxStaff} posizioni · Stipendi €${monthlyPayroll.toLocaleString()}/mese</div>
    </div>
    <div class="em-kpibar">
        <div class="k"><div class="l">Staff Ufficio</div><div class="v" style="color:${officeStaff > 0 ? 'var(--em-green)' : 'var(--em-ink)'}">${officeStaff}</div></div>
        <div class="k"><div class="l">Autisti</div><div class="v" style="color:${driverCount > 0 ? 'var(--em-blue)' : 'var(--em-ink)'}">${driverCount}</div></div>
        <div class="k"><div class="l">Capacità</div><div class="v" style="color:${staffFull ? 'var(--em-red)' : 'var(--em-green)'}">${currentStaff}/${maxStaff===99?'∞':maxStaff}</div></div>
        <div class="k"><div class="l">Stipendi/mese</div><div class="v" style="color:${monthlyPayroll > 0 ? 'var(--em-red)' : 'var(--em-green)'}">€${monthlyPayroll.toLocaleString()}</div></div>
    </div>`;

    html += `<div class="em-sec" style="margin:0 0 8px">🏢 Ufficio Centralizzato</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">`;
    for(let k in STAFF_ROLES) {
        let s = STAFF_ROLES[k]; let owned = gameState.staff.some(x => x.id === s.id);
        html += `<div class="em-card" style="padding:14px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;${owned ? 'border-color:#ecd9a0' : ''}">
            <div style="flex:1;min-width:0">
                <div style="font-weight:700;color:${owned?'var(--em-gold)':'var(--em-ink)'}">${s.name}</div>
                <div style="font-size:10.5px;color:var(--em-muted);margin-top:2px">€${s.salary.toLocaleString()}/mese</div>
                <div style="font-size:10.5px;color:var(--em-dim);margin-top:4px;line-height:1.4">${s.desc}</div>
            </div>
            <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
                ${owned
                    ? `<span class="em-pill em-pill--green">✓ Attivo</span>
                       <button ${ceAct('fireStaff', [s.id])} class="em-redbtn" style="padding:4px 11px;font-size:10px">Licenzia</button>`
                    : `<button ${ceAct('hireOfficeStaff', [s.id])} ${staffFull ? 'disabled' : ''} class="em-goldbtn" style="${staffFull ? 'opacity:.4;cursor:not-allowed' : ''}">Assumi</button>`
                }
            </div>
        </div>`;
    }
    const hasHR = gameState.staff.some(s => s.id === 'hr');

    // ── HR Automation premium buff ──────────────────────────────────────────
    const hrExpires  = gameState.hrAutomationExpiresAt ? new Date(gameState.hrAutomationExpiresAt) : null;
    const hrActive   = hrExpires && hrExpires > new Date();
    const hrTimeLeft = hrActive ? (() => {
        const ms = hrExpires - Date.now();
        const d  = Math.floor(ms / 86400000);
        const h  = Math.floor((ms % 86400000) / 3600000);
        return d > 0 ? `${d}g ${h}h` : `${h}h`;
    })() : null;
    html += `</div>`;

    // ── HR Automation (nascosta in fase Zero-to-Hero) ─────────────────────────
    if (!_z2hLite) html += `<div class="em-card" style="padding:14px;margin-bottom:16px;${hrActive ? 'border-color:#ecd9a0' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <div>
                <div class="em-sec" style="color:var(--em-violet);margin-bottom:4px">🤝 Gestione Sindacale HR</div>
                <div style="font-size:10.5px;color:var(--em-muted);line-height:1.4;max-width:240px">Gli scioperi vengono risolti automaticamente senza popup bloccanti.</div>
                ${hrActive
                    ? `<div style="font-size:10.5px;color:var(--em-green-d);margin-top:4px;font-weight:700">✅ Attivo — scade tra ${hrTimeLeft}</div>`
                    : `<div style="font-size:10.5px;color:var(--em-dim);margin-top:4px">7 giorni · 5 DC</div>`}
            </div>
            <div>
                ${hrActive
                    ? `<span class="em-pill em-pill--green">Attivo</span>`
                    : `<button ${ceAct('buyHRAutomation', [])} class="em-goldbtn">🪙 5 DC · 7g</button>`}
            </div>
        </div>
    </div>`;

    // ── I Tuoi Autisti ──────────────────────────────────────────────────────
    const _myDrivers = gameState.drivers.filter(d => d.id !== 'ceo');
    if (_myDrivers.length === 0) {
        html += `<div class="em-sec" style="margin:0 0 10px">🚗 I Tuoi Autisti</div>` +
            `<div class="em-empty"><div style="font-size:32px;margin-bottom:10px">🚗</div><div style="font-size:14px;font-weight:700;color:var(--em-ink)">Nessun autista</div><div style="margin-top:4px">Assumi autisti dal Mercato Reclutamento qui sotto</div></div>`;
    } else {
        html += `<div class="em-sec" style="margin:0 0 8px">🚗 I Tuoi Autisti <span style="color:var(--em-muted)">${_myDrivers.length} totali</span></div>
        <div class="em-card" style="margin-bottom:16px">
            <table class="em-tbl">
                <thead><tr><th>Autista</th><th>Stato</th><th>Fatica</th><th>Stress</th><th>Morale</th><th>Veicolo</th><th></th></tr></thead>
                <tbody>`;

        _myDrivers.forEach(d => {
            const fatigue   = d.fatigue || 0;
            const stress    = d.stress_level !== undefined ? d.stress_level : 0;
            const morale    = d.morale !== undefined ? d.morale : 100;
            const isResting = d.status === 'resting';
            const isBusy    = d.status === 'busy';
            const isBurnout = d.burnout_until && (gameState.day * 24 + gameState.hour) < d.burnout_until;

            const fatigueColor = fatigue >= 85 ? 'var(--em-red)' : fatigue >= 60 ? 'var(--em-amber)' : 'var(--em-green)';
            const stressColor  = stress  >= 80 ? 'var(--em-red)' : stress  >= 50 ? 'var(--em-amber)' : 'var(--em-green)';
            const moraleColor  = morale  < 25  ? 'var(--em-red)' : morale  < 60  ? 'var(--em-amber)' : 'var(--em-green)';

            const levelData = (DRIVER_LEVELS || [])[d.level || 0] || { name:'Rookie', badge:'lvl-rookie' };

            let statusLabel, statusCls;
            if (isBurnout)       { statusLabel = '🔥 Burnout';    statusCls = 'em-pill--red'; }
            else if (d.isOnStrike) { statusLabel = '🪧 Sciopero';  statusCls = 'em-pill--red'; }
            else if (isResting)  { statusLabel = `☕ Riposo ${d.restHoursLeft}h`; statusCls = 'em-pill--gold'; }
            else if (fatigue >= 85) { statusLabel = '⚠ Esausto';  statusCls = 'em-pill--gold'; }
            else if (isBusy)     { statusLabel = '● In corsa';    statusCls = 'em-pill--blue'; }
            else                 { statusLabel = '● Libero';       statusCls = 'em-pill--green'; }

            const car = gameState.fleet.find(v => v.id === d.assignedCarId);
            const carLabel = car ? car.name : '—';

            const miniBar = (val, color) => `<div style="display:flex;align-items:center;gap:5px">
                <span class="em-prog" style="width:52px"><i style="width:${Math.round(val)}%;background:${color}"></i></span>
                <span style="font-size:9.5px;font-weight:700;color:${color};width:26px;text-align:right;flex-shrink:0">${Math.floor(val)}%</span>
            </div>`;

            // actions
            const actBtns = [
                d.isOnStrike && !isBusy
                    ? `<button ${ceAct('resolveStrike', [d.id])} class="em-goldbtn" style="font-size:9.5px;padding:3px 8px">🤝 Accordo</button>`
                    : (!isResting && !isBurnout && !isBusy && (fatigue >= 40 || stress >= 50))
                        ? `<button ${ceAct('putDriverOnBreak', [d.id])} class="em-ghbtn" style="font-size:9.5px;padding:3px 8px">☕ Pausa</button>`
                        : '',
                `<button ${ceAct('renderDriverSkillModal', [d.id])} class="em-bbtn" style="font-size:9.5px;padding:3px 8px">⭐ Skills</button>`,
                `<button ${ceAct('fireDriver', [d.id])} class="em-redbtn" style="font-size:9.5px;padding:3px 8px">Licenzia</button>`,
            ].filter(Boolean).join(' ');

            html += `
            <input type="file" id="avatar-upload-${d.id}" accept="image/*" style="display:none" ${ceAct('ceSetAvatar', [d.id], 'change')}>
            <tr>
                <td style="min-width:175px">
                    <div style="display:flex;align-items:center;gap:8px">
                        ${d.avatarBase64
                            ? `<img src="${d.avatarBase64}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;cursor:pointer;border:1px solid var(--em-line)" ${ceAct('ceClick', ['avatar-upload-' + d.id])}>`
                            : `<div style="width:30px;height:30px;border-radius:50%;background:#161b223cf;border:1px solid #ecd9a0;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;color:var(--em-gold);flex-shrink:0" ${ceAct('ceClick', ['avatar-upload-' + d.id])}>👤</div>`}
                        <div style="min-width:0">
                            <div style="font-weight:700">${d.name} <span class="lvl-badge ${levelData.badge}" style="font-size:7px">${levelData.name}</span></div>
                            <div style="font-size:9.5px;color:var(--em-dim);margin-top:1px">€${(d.salary||0).toLocaleString()}/mese · XP ${d.xp||0}</div>
                            ${d.trait ? `<div style="font-size:9.5px;color:var(--em-violet);margin-top:1px">${d.trait.name}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td style="white-space:nowrap"><span class="em-pill ${statusCls}">${statusLabel}</span></td>
                <td style="min-width:110px">${miniBar(fatigue, fatigueColor)}</td>
                <td style="min-width:110px">
                    ${miniBar(stress, stressColor)}
                    ${stress >= 50 && !isResting && !isBurnout && !isBusy ? `<div style="margin-top:4px;display:flex;gap:4px">
                        <button ${ceAct('putDriverOnBreak', [d.id])} class="em-ghbtn" style="font-size:8.5px;padding:2px 6px">☕ −40%</button>
                        <button ${ceAct('payStressClear', [d.id])} class="em-pill em-pill--green" style="border:1px solid #bfe6cd;cursor:pointer;font-size:8.5px;padding:3px 6px">💊 €1k</button>
                    </div>` : ''}
                </td>
                <td style="min-width:110px">
                    ${miniBar(morale, moraleColor)}
                    ${morale < 60 ? `<button ${ceAct('payDriverBonus', [d.id, 500])} class="em-pill em-pill--green" style="border:1px solid #bfe6cd;cursor:pointer;font-size:8.5px;padding:3px 6px;margin-top:4px">+€500</button>` : ''}
                </td>
                <td><div style="color:${car ? 'var(--em-ink)' : 'var(--em-dim)'}">${carLabel}</div></td>
                <td class="r" style="white-space:nowrap">${actBtns}</td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
    }

    // ── Meet & Greet ─────────────────────────────────────────────────────────
    const _mgStaff = (gameState.staff || []).filter(s => s.skill === 'meetgreet');
    if (_mgStaff.length > 0) {
        const _mgIncome = gameState._lastMgIncome || 0;
        html += `<div class="em-sec" style="margin:16px 0 8px">🤝 Meet &amp; Greet Aeroportuale</div>
        <div style="display:flex;flex-direction:column;gap:6px">`;
        _mgStaff.forEach(asst => {
            html += `<div class="em-card" style="padding:14px;display:flex;justify-content:space-between;align-items:center">
                <div>
                    <div style="font-weight:700">${asst.name}</div>
                    <div style="font-size:10.5px;color:var(--em-muted);margin-top:2px">Aeroporto: ${asst.airport || '—'} · Missioni passive: attive</div>
                    <div style="font-size:10.5px;color:var(--em-green-d);margin-top:2px">Entrate ultima sessione: +€${(_mgIncome / _mgStaff.length).toFixed(0)}/g</div>
                </div>
                <span class="em-pill em-pill--green">✓ On duty</span>
            </div>`;
        });
    }

    // ── Mercato Reclutamento ──────────────────────────────────────────────────
    const tierIcon = { standard:'🟢', business:'🔵', vip:'🟣', ultra:'⚫' };
    html += `<div class="em-sec" style="margin:16px 0 4px">Mercato Reclutamento</div>
    <div style="font-size:10.5px;color:var(--em-dim);margin-bottom:10px;font-style:italic">I candidati si aggiornano dopo ogni assunzione.</div>
    <div style="display:flex;flex-direction:column;gap:6px">`;
    if (_z2hLite) {
        // Fase transitoria: unico assumibile = Ragazzo di Quartiere (ingaggio gratis).
        const _kidHired = (gameState.drivers || []).some(d => d.name === 'Ragazzo di Quartiere');
        html += `<div class="em-card" style="padding:14px;display:flex;justify-content:space-between;align-items:center">
            <div>
                <div style="font-weight:700">Ragazzo di Quartiere <span style="font-size:10px;color:var(--em-muted)">🟢 STANDARD</span></div>
                <div style="font-size:9.5px;color:var(--em-dim);margin-top:4px">Sveglio ma acerbo. Statistiche mediocri, ma costa pochissimo.</div>
                <div style="font-size:10.5px;color:var(--em-green-d);margin-top:4px">Stipendio: €40/mese | Anticipo: €0</div>
            </div>
            ${_kidHired
                ? `<span class="em-pill em-pill--green">✓ Assunto</span>`
                : `<button ${ceAct('hireNeighborhoodKid', [])} class="em-goldbtn">Assumi · Gratis</button>`}
        </div>`;
    } else {
        (gameState.availableRecruits || []).forEach(p => {
            html += `<div class="em-card" style="padding:14px;display:flex;justify-content:space-between;align-items:center">
                <div>
                    <div style="font-weight:700">${p.name} <span style="font-size:10px;color:var(--em-muted)">${tierIcon[p.tier] || ''} ${p.tier.toUpperCase()}</span></div>
                    ${p.trait ? `<div style="margin-top:4px">${typeof window._traitBadgeHTML === 'function' ? window._traitBadgeHTML(p) : ''} <span style="font-size:9.5px;color:var(--em-dim)">${p.trait.desc}</span></div>` : ''}
                    <div style="font-size:10.5px;color:var(--em-dim);margin-top:4px">Stipendio: €${p.salary}/mese | Anticipo: €${p.salary*2}</div>
                </div>
                <button ${ceAct('hireDriver', [p.name, p.salary])} class="em-goldbtn">Assumi</button>
            </div>`;
        });
        if ((gameState.availableRecruits || []).length === 0) {
            html += `<div class="em-empty"><div style="font-size:32px;margin-bottom:10px">👤</div><div style="font-size:14px;font-weight:700;color:var(--em-ink)">Nessun candidato</div><div style="margin-top:4px">Il mercato si aggiorna ad ogni assunzione</div></div>`;
        }
    }

    html += `</div>`; // chiude il contenitore del Mercato Reclutamento

    // ── Driver Academy (nascosta in fase Zero-to-Hero) ────────────────────────
    if (!_z2hLite) {
        const _academyDrivers  = gameState.drivers.filter(d => d.id !== 'ceo');
        const _inTrainingCount = (gameState.driverAcademy||[]).length;
        html += `<div style="display:flex;align-items:center;justify-content:space-between;margin:16px 0 8px">
            <div class="em-sec">🎓 Accademia Autisti</div>
            ${_inTrainingCount > 0 ? `<span class="em-pill em-pill--gold">📚 ${_inTrainingCount} in formazione</span>` : ''}
        </div>`;
        if (_academyDrivers.length === 0) {
            html += `<div class="em-empty"><div style="font-size:32px;margin-bottom:10px">🎓</div><div style="font-size:14px;font-weight:700;color:var(--em-ink)">Nessun autista</div><div style="margin-top:4px">Assumi almeno un autista per accedere all'Accademia</div></div>`;
        } else {
            html += `<div class="em-card" style="padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px">
                <div>
                    <div style="font-weight:700">Gestione Corsi</div>
                    <div style="font-size:10.5px;color:var(--em-dim);margin-top:2px">${_academyDrivers.length} autisti · ${_inTrainingCount} in corso · 5 corsi disponibili</div>
                </div>
                <button ${ceAct('openAcademyModal', [])} class="em-goldbtn">Apri Accademia →</button>
            </div>`;
        }
    }

    // ── CEO della Settimana ───────────────────────────────────────────────────
    html += `<div class="em-sec" style="margin:16px 0 8px">🏆 CEO della Settimana</div>
    <div class="em-card" style="padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
                <div style="font-weight:700">Settimana in Corso</div>
                <div style="font-size:10.5px;color:var(--em-muted);margin-top:2px">Reset domenica · Premio: Driver Coins</div>
            </div>
            <div style="text-align:right">
                <div style="font-size:14px;font-weight:800;color:var(--em-gold)">€${(gameState.weeklyEarnings||0).toLocaleString()}</div>
                <div style="font-size:10.5px;color:var(--em-dim)">${gameState.weeklyRides||0} corse</div>
            </div>
        </div>
        <div style="font-size:10.5px;color:var(--em-dim);margin-top:8px;font-style:italic">Il vincitore riceve fino a 50 DC domenica sera.</div>
    </div>`;

    container.innerHTML = `<div class="em em-page"><div class="em-wrap">` + html + `</div></div>`;
}

window.openCarModal = function(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if(!car) return;
    document.getElementById('car-modal-title').innerText = car.name;
    document.getElementById('car-modal-desc').innerText = `${car.tier.toUpperCase()} · Condizione ${Math.floor(car.condition)}% · Carburante ${Math.floor(car.fuel||100)}%`;

    // Prezzo dalla funzione canonica (engine.js): questa formula era ricopiata a
    // mano e divergeva da quella davvero addebitata dal pulsante — mostrava
    // €5.100 su un'auto al 40% mentre payToRepairCar ne scalava 1.500.
    let repairCost = window.repairCostFor(car);

    const fuelPct = car.fuel !== undefined ? Math.floor(car.fuel) : 100;
    const fuelColor = fuelPct < 20 ? '#db5746' : fuelPct < 50 ? '#e0922e' : '#2f74c0';

    if (!car.upgrades) car.upgrades = [];
    const installedUpgrades = car.upgrades.map(uid => CAR_UPGRADES.find(u => u.id === uid)?.name || uid).join(', ');

    const tirePct2 = car.tirePressure !== undefined ? Math.floor(car.tirePressure) : 100;
    const tireColor2 = tirePct2 < 20 ? '#db5746' : tirePct2 < 50 ? '#e0922e' : '#1aa06a';
    const outReason = car.outOfService;

    let html = `<div style="display:flex;flex-direction:column;gap:10px">
    ${(outReason && !(outReason === 'fuel' && fuelPct > 5)) ? `<div style="padding:8px;border:1px solid rgba(248,81,73,0.4);background:rgba(127,29,29,0.2);border-radius:6px;font-size:9px;color:#db5746;font-weight:700">
        🔴 Auto ferma: ${outReason === 'fuel' ? 'serbatoio esaurito — rifornisci qui sotto' : outReason === 'engine' ? 'motore fuso — riparazione urgente' : 'deposito gomme esaurito'}.<br>
        <span style="color:#6b7280;font-weight:400">${outReason === 'fuel' ? 'Usa "Rifornisci" o "Gasolio Agric." qui sotto per sbloccarla.' : outReason === 'engine' ? 'Usa il pulsante Ripara Motore qui sotto.' : 'Rifornisci il deposito gomme nella schermata Flotta.'}</span>
    </div>` : ''}
    <div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:#6b7280;margin-bottom:4px"><span>⛽ Carburante</span><span style="color:${fuelColor}">${fuelPct}%</span></div>
        <div class="fuel-bar-bg"><div class="fuel-bar-fill" style="width:${fuelPct}%; background:${fuelColor}"></div></div>
        <div style="font-size:8px;color:#6b7280;margin-top:2px;text-align:center">Rifornimento automatico via Deposito Aziendale</div>
    </div>
    <div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:#6b7280;margin-bottom:4px"><span>🔵 Gomme</span><span style="color:${tireColor2}">${tirePct2}%</span></div>
        <div class="fuel-bar-bg"><div class="fuel-bar-fill" style="width:${tirePct2}%; background:${tireColor2}"></div></div>
        <div style="font-size:8px;color:#6b7280;margin-top:2px;text-align:center">Sostituzione automatica (sotto 20%) via Deposito Aziendale</div>
    </div>
    ${car.condition < 100 ? `<button ${ceAct('payToRepairCar', [car.id])} style="width:100%;background:rgba(30,58,138,0.3);border:1px solid rgba(59,130,246,0.3);color:#2f74c0;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer">🔧 Ripara (€${repairCost})</button>` : ''}
    <div style="font-size:10px;color:#6b7280;text-transform:uppercase">Upgrade VIP</div>
    <div style="display:flex;flex-direction:column;gap:4px;max-height:112px;overflow-y:auto">`;

    CAR_UPGRADES.forEach(upg => {
        const owned = car.upgrades.includes(upg.id);
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px;border:1px solid #eef1f5;border-radius:4px;font-size:9px;${owned ? 'opacity:.5' : ''}">
            <div><span style="color:#e6edf3;font-weight:700">${upg.name}</span><span style="color:#6b7280;margin-left:4px">${upg.desc}</span></div>
            ${owned ? '<span class="upgrade-pill">✓</span>' : `<button ${ceAct('buyCARUpgrade', [car.id,upg.id])} style="background:#161b228e8;border:1px solid #c79a2a;color:#c79a2a;padding:2px 6px;border-radius:4px;font-size:8px;cursor:pointer">€${upg.price.toLocaleString()}</button>`}
        </div>`;
    });

    html += `</div>${installedUpgrades ? `<div style="font-size:9px;color:#6b7280">Upgrade attivi: <span style="color:#2f74c0;font-weight:700">${installedUpgrades}</span></div>` : ''}
    <div style="font-size:10px;color:#6b7280;text-transform:uppercase;margin-top:8px">Assegna Autista</div>
    <div style="display:flex;flex-direction:column;gap:4px;max-height:112px;overflow-y:auto;padding-right:4px">`;

    gameState.drivers.forEach(d => {
        const isSet = d.assignedCarId === car.id;
        const lvl = d.level || 0;
        const driverTier = lvl >= 6 ? 'ULTRA' : lvl >= 4 ? 'VIP' : lvl >= 2 ? 'BUSINESS' : 'STANDARD';
        const tierColor  = lvl >= 6 ? '#7c5fc9' : lvl >= 4 ? '#2f74c0' : lvl >= 2 ? '#e0922e' : '#6a7480';
        const specLabel  = d.specialty && d.specialty !== 'none' ? ` · ${d.specialty.replace(/_/g,' ')}` : '';
        html += `<button ${ceAct('assignCarToDriver', [car.id,d.id])} style="text-align:left;padding:6px;border:1px solid ${isSet?'rgba(212,175,55,0.5)':'#d6dee8'};border-radius:4px;font-size:9px;width:100%;background:${isSet?'rgba(212,175,55,0.05)':'transparent'};color:${isSet?'#c79a2a':'#1f2733'};cursor:pointer">
            <span style="font-weight:700">${d.name}</span>
            <span style="font-size:8px;font-weight:700;color:${tierColor};margin-left:4px">[${driverTier}]</span>
            <span style="font-size:8px;color:#6b7280">${specLabel}</span>
            ${isSet ? '<span style="font-size:8px;color:#c79a2a;margin-left:4px">✓ Assegnato</span>' : ''}
        </button>`;
    });
    // Skin badge
    const _activeSkin = car.skin ? (typeof VEHICLE_SKINS !== 'undefined' ? VEHICLE_SKINS : (window.VEHICLE_SKINS||[])).find(s => s.id === car.skin) : null;
    if (_activeSkin) {
        html += `<div style="font-size:9px;margin-top:4px;color:${_activeSkin.color}">🎨 Livrea: ${_activeSkin.name}</div>`;
    }
    html += `</div>
    <button ${ceAct('openGarage3D', [car.id])} style="width:100%;background:#0d1117;border:1px solid #2f74c0;color:#2f74c0;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;transition:opacity .15s">🚗 Vista 3D Garage</button>`;
    // Instant Repair DC
    const condPctModal = Math.floor(car.condition || 0);
    const dcRepairCost = gameState.executivePassActive ? 1 : 2;
    if (condPctModal < 100) {
        html += `<button ${ceAct('instantRepairDC', [car.id])} style="width:100%;background:#161b228e8;border:1px solid #c79a2a;color:#c79a2a;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;margin-top:4px;transition:opacity .15s">⚡ Ripara Istant. (${dcRepairCost} DC)</button>`;
    }
    if(!car.isLease) {
        html += `<button ${ceAct('sellCar', [car.id])} style="width:100%;background:rgba(127,29,29,0.2);border:1px solid rgba(127,29,29,0.4);color:#db5746;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;margin-top:4px">💰 Vendi (usato)</button>`;
        const alreadyListed = (gameState.marketplace||[]).some(l => l.carId === car.id);
        if (!alreadyListed) {
            const suggestPrice = Math.round(20000 * ((condPctModal/100)) * (car.tier === 'ultra' ? 5 : car.tier === 'vip' ? 3 : car.tier === 'business' ? 1.8 : 1));
            html += `<button ${ceAct('ceListCar', [car.id, suggestPrice])} style="width:100%;background:rgba(88,28,135,0.2);border:1px solid rgba(88,28,135,0.4);color:#7c5fc9;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;margin-top:4px">🏪 Metti in Mercato (~€${(suggestPrice/1000).toFixed(0)}k)</button>`;
        }
    }
    document.getElementById('car-modal-content').innerHTML = html + `</div>`;
    document.getElementById('modal-car').style.display = 'flex';
}

window.closeModals = function() {
    document.querySelectorAll('[id^="modal-"]').forEach(m => { m.classList.add('hidden'); m.classList.remove('flex'); m.style.display = 'none'; });
}

// --- LOGICHE FINALI ---

window.fireStaff = function(staffId) {
    const s = gameState.staff.find(x => x.id === staffId);
    if (!s) return;
    if (!confirm(`Licenziare ${s.name}?\n\nRisparmio: €${s.salary.toLocaleString('it-IT')}/mese.\nTutti i benefici verranno rimossi immediatamente.`)) return;
    gameState.staff = gameState.staff.filter(x => x.id !== staffId);
    if (typeof showNotification === 'function') showNotification(`${s.name} licenziato.`, 'warning');
    renderTabStaff();
    if (typeof saveGame === 'function') saveGame();
};

window.hireOfficeStaff = async function(id) {
    const s = STAFF_ROLES[Object.keys(STAFF_ROLES).find(k => STAFF_ROLES[k].id === id)];
    if (!s) return;
    const maxStaff = typeof _getMaxStaff === 'function' ? _getMaxStaff() : 2;
    const currentStaff = gameState.staff.length + gameState.drivers.filter(d => d.id !== 'ceo').length;
    if (currentStaff >= maxStaff) {
        showNotification(`Limite staff raggiunto (${maxStaff}). Potenzia la sede!`, 'error');
        return;
    }

    const result = await window.ServerState?.hireDriver(s.name, s.salary, 'STAFF');
    if (!result) return;

    gameState.staff.push(s);
    showNotification(`${s.name} assunto con successo!`, 'success');
    updateUI(); renderTabStaff();
    if(typeof saveGame==='function') saveGame();
};

window.openCarConfigurator = function(carId, type) {
    const carT = (type === 'new' ? NEW_CARS : USED_CARS).find(c => c.id === carId);
    if (!carT) return;
    const totalRides = gameState.questStats?.totalRides || 0;
    const rideGate = carT.rideGate || 0;
    if (totalRides < rideGate) {
        showNotification(`Sblocco non raggiunto! Servono ${rideGate} corse completate — hai ${totalRides}.`, 'error');
        return;
    }
    if (carT.fuel === 'electric' && !gameState.hasEVHub) {
        showNotification('Infrastruttura mancante: costruisci l\'Hub di Ricarica Corporate prima di acquistare veicoli EV.', 'error');
        return;
    }
    const old = document.getElementById('modal-configurator');
    if (old) old.remove();

    const catalog = (typeof STELLAR_VOLT_CATALOG !== 'undefined' ? STELLAR_VOLT_CATALOG : [])
        .find(c => c.vehicleClass === carT.vehicleClass || c.id === carT.vehicleClass);
    const carImg  = catalog?.img || 'assets/fleet/stellar-e-executive.jpg';
    const isElec  = catalog?.fuel === 'electric';

    const modal = document.createElement('div');
    modal.id = 'modal-configurator';
    modal.style.cssText = 'position:fixed;inset:0;z-index:var(--z-modal);background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(modal);

    const sel = new Set();

    // ── Build static shell (photo + config panel) once ───────────────────────
    modal.innerHTML = `
<div style="display:flex;width:100%;max-width:1020px;height:90vh;border-radius:20px;overflow:hidden;box-shadow:0 60px 120px rgba(0,0,0,0.95)">

  <!-- LEFT: full-height photo -->
  <div style="width:58%;position:relative;flex-shrink:0;background:#e8eef5">
    <img src="${carImg}" alt="${carT.name}"
         style="width:100%;height:100%;object-fit:cover;object-position:center;display:block">
    <!-- subtle bottom fade for readability -->
    <div style="position:absolute;bottom:0;left:0;right:0;height:40%;background:linear-gradient(to top,rgba(0,0,0,0.72) 0%,transparent 100%)"></div>
    <!-- car name badge bottom-left -->
    <div style="position:absolute;bottom:28px;left:28px;right:28px">
      <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:1px;line-height:1.1;text-shadow:0 2px 12px rgba(0,0,0,0.8)">${carT.name}</div>
      ${isElec ? `<div style="margin-top:10px;display:inline-flex;align-items:center;gap:5px;background:rgba(34,197,94,0.18);border:1px solid rgba(34,197,94,0.4);color:#1aa06a;font-size:9px;font-weight:800;padding:4px 12px;border-radius:20px;letter-spacing:1.5px;backdrop-filter:blur(4px)">⚡ ZERO EMISSIONI</div>` : ''}
    </div>
  </div>

  <!-- RIGHT: config panel -->
  <div id="cfg-right" style="flex:1;background:#161b22;overflow-y:auto;display:flex;flex-direction:column;min-width:0;scrollbar-width:thin;scrollbar-color:#cfd8e2 transparent">

    <!-- top bar: close -->
    <div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px 0">
      <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:3px">Configuratore</div>
      <button ${ceAct('ceRemove', ['modal-configurator'])}
        style="width:28px;height:28px;border-radius:50%;border:1px solid #21262d;background:#21262d;color:#6b7280;font-size:14px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.15s"
       >✕</button>
    </div>

    <!-- car name + tier + base price block -->
    <div style="padding:16px 24px 20px;border-bottom:1px solid #e6eaf0">
      <div style="font-size:22px;font-weight:800;color:#e6edf3;letter-spacing:0.5px;line-height:1.2">${carT.name}</div>
      <div style="font-size:9px;color:#c79a2a;text-transform:uppercase;letter-spacing:2px;margin-top:4px">${carT.tier}</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:16px">
        <span style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Prezzo base</span>
        <span style="font-size:24px;font-weight:900;color:#e6edf3;font-family:monospace;letter-spacing:-0.5px">€${carT.price.toLocaleString()}</span>
      </div>
    </div>

    <!-- optional list -->
    <div style="padding:20px 24px;flex:1">
      <div style="font-size:8px;color:#c79a2a;text-transform:uppercase;letter-spacing:3px;margin-bottom:14px">Optional disponibili</div>
      <div id="cfg-upgrades" style="display:flex;flex-direction:column;gap:6px">
        ${CAR_UPGRADES.map(u => `
        <div id="cfg-upg-${u.id}" ${ceAct('__cfgToggle', [u.id])}
             style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:10px;border:1px solid #21262d;background:#161b22;cursor:pointer;user-select:none;transition:all 0.15s">
          <div id="cfg-chk-${u.id}"
               style="width:17px;height:17px;border-radius:4px;border:1.5px solid #c2ccd8;background:transparent;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;font-weight:900;color:#000"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;color:#e6edf3">${u.name}</div>
            <div style="font-size:8px;color:#6b7280;margin-top:2px;line-height:1.4">${u.desc}</div>
          </div>
          <div id="cfg-price-${u.id}" style="font-size:11px;font-family:monospace;color:#6b7280;flex-shrink:0;font-weight:600">+€${u.price.toLocaleString()}</div>
        </div>`).join('')}
      </div>
    </div>

    <!-- sticky footer -->
    <div id="cfg-footer" style="position:sticky;bottom:0;background:#161b22;border-top:1px solid #21262d;padding:18px 24px"></div>
  </div>
</div>`;

    // ── Summary update (no scroll reset) ──────────────────────────────────────
    function _updateSummary() {
        const upTotal = [...sel].reduce((s, uid) => { const u = CAR_UPGRADES.find(x => x.id === uid); return s + (u ? u.price : 0); }, 0);
        const total   = carT.price + upTotal;
        const ok      = gameState.cash >= total;
        document.getElementById('cfg-footer').innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px">
            <span style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:2px">Totale</span>
            <span style="font-size:28px;font-family:monospace;font-weight:900;color:${ok ? "#1f2733" : "#db5746"};letter-spacing:-1px">€${total.toLocaleString()}</span>
          </div>
          ${!ok ? `<div style="font-size:9px;color:#db5746;margin-bottom:10px;text-align:right">Fondi insufficienti — disponibili: €${gameState.cash.toLocaleString()}</div>` : ''}
          <div style="display:flex;gap:10px">
            <button ${ceAct('ceRemove', ['modal-configurator'])}
              style="flex:0 0 auto;padding:12px 20px;font-size:10px;border:1px solid #21262d;border-radius:10px;color:#6b7280;background:transparent;cursor:pointer">
              Annulla
            </button>
            <button ${ceAct('__cfgConfirm', [carId,type])} ${!ok ? 'disabled' : ''}
              style="flex:1;padding:12px;font-size:11px;font-weight:800;border-radius:10px;cursor:${ok ? 'pointer' : 'not-allowed'};letter-spacing:0.5px;
                     background:${ok ? 'linear-gradient(135deg,#c79a2a,#b8961f)' : '#eef1f5'};
                     color:${ok ? '#000' : '#98a1ae'};border:${ok ? 'none' : '1px solid #d6dee8'}">
              ${ok ? '🚗 Conferma & Acquista' : 'Fondi insufficienti'}
            </button>
          </div>`;
    }

    // ── Toggle: update only the affected row + summary (NO scroll reset) ──────
    window.__cfgSel = sel;
    window.__cfgToggle = function(uid) {
        sel.has(uid) ? sel.delete(uid) : sel.add(uid);
        const on  = sel.has(uid);
        const row = document.getElementById(`cfg-upg-${uid}`);
        const chk = document.getElementById(`cfg-chk-${uid}`);
        const prc = document.getElementById(`cfg-price-${uid}`);
        if (row) {
            row.style.borderColor  = on ? 'rgba(212,175,55,0.5)' : '#d6dee8';
            row.style.background   = on ? 'rgba(212,175,55,0.06)' : '#eef1f5';
        }
        if (chk) {
            chk.style.background   = on ? '#c79a2a' : '#ffffff';
            chk.style.borderColor  = on ? '#c79a2a' : '#c2ccd8';
            chk.textContent        = on ? '✓' : '';
        }
        if (prc) prc.style.color = on ? '#c79a2a' : '#6a7480';
        _updateSummary();
    };

    _updateSummary();

    window.__cfgConfirm = async function(cId, cType) {
        const car = (cType === 'new' ? NEW_CARS : USED_CARS).find(c => c.id === cId);
        if (!car) return;
        const ups     = [...sel];
        const upTotal = ups.reduce((s, uid) => { const u = CAR_UPGRADES.find(x => x.id === uid); return s + (u ? u.price : 0); }, 0);
        const total   = car.price + upTotal;

        // Ensure company row exists before purchasing (safety net for edge cases)
        if (window.ServerState && !window.ServerState.getCompany()) {
            try { await window.ServerState.initCompany(gameState?.companyName || 'Chauffeur Empire'); } catch(e) {}
        }

        const result = await window.ServerState?.buyVehicle(
            car.vehicleClass || car.id,
            total,
            window.ServerState?.getCompany()?.hq_city || 'roma'
        );
        if (!result) return;

        // Apply per-upgrade server records (best-effort, non-blocking)
        for (const uid of ups) {
            const u = CAR_UPGRADES.find(x => x.id === uid);
            if (u) ServerState.buyVehicleUpgrade(result.id, uid, u.price).catch(() => {});
        }

        gameState.fleet.push({
            id: 'c_' + Date.now(), _serverId: result.id,
            name: car.name, tier: car.tier, condition: car.condition || 100,
            isLease: false, fuel: 100, mileage: 0, tirePressure: 100,
            upgrades: ups, vehicleClass: car.vehicleClass || 'mercedes_e',
        });
        // rpc_buy_vehicle ha gia' scalato la cassa server-side (01_mmo_migration.sql:228).
        // Senza guard il delta Realtime la riapplica: doppia deduzione su un acquisto d'auto.
        if (!window.ServerState?.isReady()) window.CE_money.spend(total, 'buy_car_configurator');
        document.getElementById('modal-configurator')?.remove();
        updateUI(); if (typeof switchTab === 'function') switchTab('fleet');
        showBigEvent('🚗', `${car.name} Configurata!`, ups.length > 0 ? `${ups.length} optional installati · pronta al servizio.` : 'Veicolo standard pronto per la flotta.');
        if (typeof saveGame === 'function') saveGame();
        if ((car.tier === 'ultra' || car.tier === 'vip') && car.price >= 80000) {
            if (typeof _broadcastNews === 'function')
                _broadcastNews(`${gameState.companyName} ha aggiunto alla flotta una ${car.name} 🚗`, 'milestone');
        }
    };
    _updateSummary();
};

window.buyCar = function(carId, type) { window.openCarConfigurator(carId, type); };

window.leaseCar = async function(carId) {
    const c = NEW_CARS.find(x => x.id === carId);
    if (!c) return;
    const upFront = Math.floor(c.price * 0.1);

    if (window.ServerState && !window.ServerState.getCompany()) {
        try { await window.ServerState.initCompany(gameState?.companyName || 'Chauffeur Empire'); } catch(e) {}
    }

    const result = await window.ServerState?.buyVehicle(
        c.vehicleClass || c.id,
        upFront,
        window.ServerState?.getCompany()?.hq_city || 'roma'
    );
    if (!result) return;

    gameState.fleet.push({
        id: 'l_' + Date.now(), _serverId: result.id,
        name: c.name, tier: c.tier, condition: 100,
        isLease: true, dailyCost: Math.floor(c.price / 300),
        leaseDuration: 12, leaseElapsedDays: 0,
        vehicleClass: c.vehicleClass || 'mercedes_e',
        fuel: 100, mileage: 0, tirePressure: 100, engineHealth: 100, upgrades: [],
    });
    // rpc_buy_vehicle ha gia' scalato la cassa server-side (01_mmo_migration.sql:228).
    if (!window.ServerState?.isReady()) window.CE_money.spend(upFront, 'lease_car');
    updateUI(); if (typeof renderTabFleet === 'function') renderTabFleet();
    showNotification('Contratto Leasing approvato!', 'success');
};


window.renderTabStaff = renderTabStaff;
