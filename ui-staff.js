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

    let html = `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #21262d">
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Risorse Umane</div>
        <div style="font-size:20px;font-weight:700;color:#e6edf3">Gestione Staff</div>
        <div style="font-size:11px;color:#8b949e;margin-top:4px">${hqName} · ${currentStaff} / ${maxStaff === 99 ? '∞' : maxStaff} posizioni · Stipendi €${monthlyPayroll.toLocaleString()}/mese</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Staff Ufficio</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${officeStaff > 0 ? '#3fb950' : '#e6edf3'}">${officeStaff}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Autisti</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${driverCount > 0 ? '#58a6ff' : '#e6edf3'}">${driverCount}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Capacità</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${staffFull ? '#f85149' : '#3fb950'}">${currentStaff}/${maxStaff===99?'∞':maxStaff}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Stipendi/mese</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${monthlyPayroll > 0 ? '#f85149' : '#3fb950'}">€${monthlyPayroll.toLocaleString()}</div>
        </div>
    </div>`;

    html += `<div class="ds-eyebrow" style="margin:0 0 12px">🏢 Ufficio Centralizzato</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">`;
    for(let k in STAFF_ROLES) {
        let s = STAFF_ROLES[k]; let owned = gameState.staff.some(x => x.id === s.id);
        html += `<div class="ds-card${owned?' ds-card--gold':''}" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:700;color:${owned?'var(--gold)':'var(--text)'}">${s.name}</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px">€${s.salary.toLocaleString()}/mese</div>
                <div style="font-size:10px;color:var(--text-dim);margin-top:4px;line-height:1.4">${s.desc}</div>
            </div>
            <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
                ${owned
                    ? `<span style="font-size:9px;font-weight:700;color:#3fb950;background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.3);border-radius:4px;padding:2px 6px;margin-bottom:4px;display:block;width:fit-content">✓ ATTIVO</span>
                       <button onclick="window.fireStaff('${s.id}')" style="background:#2d0d0d;border:1px solid #5a1a1a;color:#f85149;padding:4px 10px;border-radius:4px;font-size:9px;cursor:pointer;transition:opacity .15s" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">Licenzia</button>`
                    : `<button onclick="hireOfficeStaff('${s.id}')" ${staffFull ? 'disabled' : ''} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:4px 10px;border-radius:4px;font-size:9px;cursor:pointer;transition:opacity .15s;${staffFull ? 'opacity:.4;cursor:not-allowed' : ''}" onmousedown="if(!this.disabled)this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">Assumi</button>`
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

    // ── HR Automation ───────────────────────────────────────────────────────
    html += `<div class="ds-card${hrActive ? ' ds-card--gold' : ''}" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <div>
                <div class="ds-eyebrow" style="color:#a855f7;margin-bottom:4px">🤝 Gestione Sindacale HR</div>
                <div style="font-size:10px;color:var(--text-muted);line-height:1.4;max-width:220px">Gli scioperi vengono risolti automaticamente senza popup bloccanti.</div>
                ${hrActive
                    ? `<div style="font-size:10px;color:var(--green);margin-top:4px;font-weight:700">✅ Attivo — scade tra ${hrTimeLeft}</div>`
                    : `<div style="font-size:10px;color:var(--text-dim);margin-top:4px">7 giorni · 5 DC</div>`}
            </div>
            <div>
                ${hrActive
                    ? `<span style="font-size:9px;font-weight:700;color:#3fb950;background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.3);border-radius:4px;padding:2px 6px">ATTIVO</span>`
                    : `<button onclick="window.buyHRAutomation()" style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:4px 10px;border-radius:4px;font-size:9px;cursor:pointer;transition:opacity .15s" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">🪙 5 DC · 7g</button>`}
            </div>
        </div>
    </div>`;

    // ── I Tuoi Autisti ──────────────────────────────────────────────────────
    const _myDrivers = gameState.drivers.filter(d => d.id !== 'ceo');
    if (_myDrivers.length === 0) {
        html += `<div class="ds-eyebrow" style="margin:0 0 12px">🚗 I Tuoi Autisti</div>` +
            `<div style="text-align:center;padding:40px 0"><div style="font-size:32px;margin-bottom:10px">🚗</div><div style="font-size:14px;font-weight:600;color:#e6edf3">Nessun autista</div><div style="font-size:11px;color:#8b949e;margin-top:4px">Assumi autisti dal Mercato Reclutamento qui sotto</div></div>`;
    } else {
        const _STH = t => `<th style="padding:8px 14px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);font-family:'Roboto Mono',monospace;text-align:left;border-bottom:1px solid rgba(255,255,255,0.05);white-space:nowrap">${t}</th>`;
        html += `<div class="ds-eyebrow" style="margin:0 0 12px">🚗 I Tuoi Autisti <span style="font-size:9px;font-weight:400;color:var(--text-dim)">${_myDrivers.length} totali</span></div>
        <div class="ce-glass" style="overflow:hidden;margin-bottom:16px">
            <table style="width:100%;border-collapse:collapse">
                <thead><tr style="background:rgba(255,255,255,0.02)">${_STH('Autista')}${_STH('Stato')}${_STH('Fatica')}${_STH('Stress')}${_STH('Morale')}${_STH('Veicolo')}<th></th></tr></thead>
                <tbody>`;

        _myDrivers.forEach(d => {
            const fatigue   = d.fatigue || 0;
            const stress    = d.stress_level !== undefined ? d.stress_level : 0;
            const morale    = d.morale !== undefined ? d.morale : 100;
            const isResting = d.status === 'resting';
            const isBusy    = d.status === 'busy';
            const isBurnout = d.burnout_until && (gameState.day * 24 + gameState.hour) < d.burnout_until;

            const fatigueColor = fatigue >= 85 ? '#ef4444' : fatigue >= 60 ? '#f59e0b' : '#22c55e';
            const stressColor  = stress  >= 80 ? '#ef4444' : stress  >= 50 ? '#f59e0b' : '#22c55e';
            const moraleColor  = morale  < 25  ? '#ef4444' : morale  < 60  ? '#f59e0b' : '#22c55e';

            const levelData = (DRIVER_LEVELS || [])[d.level || 0] || { name:'Rookie', badge:'lvl-rookie' };

            let statusLabel, statusColor;
            if (isBurnout)       { statusLabel = '🔥 BURNOUT';    statusColor = '#ef4444'; }
            else if (d.isOnStrike) { statusLabel = '🪧 SCIOPERO';  statusColor = '#ef4444'; }
            else if (isResting)  { statusLabel = `☕ Riposo ${d.restHoursLeft}h`; statusColor = '#f97316'; }
            else if (fatigue >= 85) { statusLabel = '⚠ ESAUSTO';  statusColor = '#f59e0b'; }
            else if (isBusy)     { statusLabel = '● IN CORSA';    statusColor = '#3b82f6'; }
            else                 { statusLabel = '● LIBERO';       statusColor = '#22c55e'; }

            const car = gameState.fleet.find(v => v.id === d.assignedCarId);
            const carLabel = car ? car.name : '—';

            const miniBar = (val, color) => `<div style="display:flex;align-items:center;gap:5px">
                <div style="flex:1;height:4px;border-radius:3px;background:rgba(255,255,255,0.08);min-width:48px;overflow:hidden">
                    <div style="height:100%;width:${Math.round(val)}%;background:${color};border-radius:3px"></div>
                </div>
                <span style="font-size:9px;font-family:monospace;color:${color};width:26px;text-align:right;flex-shrink:0">${Math.floor(val)}%</span>
            </div>`;

            // actions
            const actBtns = [
                d.isOnStrike && !isBusy
                    ? `<button onclick="resolveStrike('${d.id}')" style="font-size:8px;padding:3px 7px;border-radius:5px;border:1px solid rgba(212,175,55,0.4);background:rgba(212,175,55,0.08);color:#d4af37;cursor:pointer">🤝 Accordo</button>`
                    : (!isResting && !isBurnout && !isBusy && (fatigue >= 40 || stress >= 50))
                        ? `<button onclick="putDriverOnBreak('${d.id}')" style="font-size:8px;padding:3px 7px;border-radius:5px;border:1px solid rgba(107,114,128,0.4);background:rgba(107,114,128,0.08);color:#9ca3af;cursor:pointer">☕ Pausa</button>`
                        : '',
                `<button onclick="window.renderDriverSkillModal('${d.id}')" style="font-size:8px;padding:3px 7px;border-radius:5px;border:1px solid rgba(59,130,246,0.4);background:rgba(59,130,246,0.08);color:#60a5fa;cursor:pointer">⭐ Skills</button>`,
                `<button onclick="fireDriver('${d.id}')" style="font-size:8px;padding:3px 7px;border-radius:5px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.07);color:#f87171;cursor:pointer">Licenzia</button>`,
            ].filter(Boolean).join(' ');

            html += `
            <input type="file" id="avatar-upload-${d.id}" accept="image/*" style="display:none" onchange="window.setDriverAvatar('${d.id}', this)">
            <tr class="ce-table-row" style="border-bottom:1px solid rgba(255,255,255,0.04)">
                <td style="padding:11px 14px">
                    <div style="display:flex;align-items:center;gap:8px">
                        ${d.avatarBase64
                            ? `<img src="${d.avatarBase64}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;cursor:pointer;border:1px solid rgba(255,255,255,0.12)" onclick="document.getElementById('avatar-upload-${d.id}').click()">`
                            : `<div style="width:30px;height:30px;border-radius:50%;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;color:#d4af37;flex-shrink:0" onclick="document.getElementById('avatar-upload-${d.id}').click()">👤</div>`}
                        <div style="min-width:0">
                            <div style="font-size:12px;font-weight:700;color:var(--text)">${d.name} <span class="lvl-badge ${levelData.badge}" style="font-size:7px">${levelData.name}</span></div>
                            <div style="font-size:9px;color:var(--text-dim);margin-top:1px">€${(d.salary||0).toLocaleString()}/mese · XP ${d.xp||0}</div>
                            ${d.trait ? `<div style="font-size:9px;color:#a855f7;margin-top:1px">${d.trait.name}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td style="padding:11px 14px;white-space:nowrap">
                    <span style="font-size:9px;font-weight:700;color:${statusColor}">${statusLabel}</span>
                </td>
                <td style="padding:11px 14px;min-width:110px">${miniBar(fatigue, fatigueColor)}</td>
                <td style="padding:11px 14px;min-width:110px">
                    ${miniBar(stress, stressColor)}
                    ${stress >= 50 && !isResting && !isBurnout && !isBusy ? `<div style="margin-top:4px;display:flex;gap:4px">
                        <button onclick="putDriverOnBreak('${d.id}')" style="font-size:7px;padding:2px 5px;border-radius:4px;border:1px solid rgba(107,114,128,0.35);background:rgba(107,114,128,0.08);color:#9ca3af;cursor:pointer">☕ −40%</button>
                        <button onclick="payStressClear('${d.id}')" style="font-size:7px;padding:2px 5px;border-radius:4px;border:1px solid rgba(34,197,94,0.35);background:rgba(34,197,94,0.08);color:#22c55e;cursor:pointer">💊 €1k</button>
                    </div>` : ''}
                </td>
                <td style="padding:11px 14px;min-width:110px">
                    ${miniBar(morale, moraleColor)}
                    ${morale < 60 ? `<button onclick="payDriverBonus('${d.id}', 500)" style="font-size:7px;padding:2px 5px;border-radius:4px;border:1px solid rgba(34,197,94,0.35);background:rgba(34,197,94,0.08);color:#22c55e;cursor:pointer;margin-top:4px">+€500</button>` : ''}
                </td>
                <td style="padding:11px 14px">
                    <div style="font-size:11px;color:${car ? 'var(--text)' : 'var(--text-dim)'}">${carLabel}</div>
                </td>
                <td style="padding:11px 14px;text-align:right;white-space:nowrap">${actBtns}</td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
    }

    // ── Meet & Greet ─────────────────────────────────────────────────────────
    const _mgStaff = (gameState.staff || []).filter(s => s.skill === 'meetgreet');
    if (_mgStaff.length > 0) {
        const _mgIncome = gameState._lastMgIncome || 0;
        html += `<div class="ds-eyebrow" style="margin:16px 0 12px">🤝 Meet &amp; Greet Aeroportuale</div>
        <div style="display:flex;flex-direction:column;gap:8px">`;
        _mgStaff.forEach(asst => {
            html += `<div class="ds-card" style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <div style="font-size:12px;font-weight:700;color:var(--text)">${asst.name}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Aeroporto: ${asst.airport || '—'} · Missioni passive: attive</div>
                    <div style="font-size:10px;color:var(--green);margin-top:2px">Entrate ultima sessione: +€${(_mgIncome / _mgStaff.length).toFixed(0)}/g</div>
                </div>
                <span style="font-size:9px;font-weight:700;color:#3fb950;background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.3);border-radius:4px;padding:2px 6px">✓ ON DUTY</span>
            </div>`;
        });
    }

    // ── Mercato Reclutamento ──────────────────────────────────────────────────
    const tierIcon = { standard:'🟢', business:'🔵', vip:'🟣', ultra:'⚫' };
    html += `<div class="ds-eyebrow" style="margin:16px 0 4px">Mercato Reclutamento</div>
    <div style="font-size:10px;color:var(--text-dim);margin-bottom:12px;font-style:italic">I candidati si aggiornano dopo ogni assunzione.</div>
    <div style="display:flex;flex-direction:column;gap:8px">`;
    (gameState.availableRecruits || []).forEach(p => {
        html += `<div class="ds-card" style="display:flex;justify-content:space-between;align-items:center">
            <div>
                <div style="font-size:12px;font-weight:700;color:var(--text)">${p.name} <span style="font-size:10px;color:var(--text-muted)">${tierIcon[p.tier] || ''} ${p.tier.toUpperCase()}</span></div>
                ${p.trait ? `<div style="margin-top:4px">${typeof window._traitBadgeHTML === 'function' ? window._traitBadgeHTML(p) : ''} <span style="font-size:9px;color:var(--text-dim)">${p.trait.desc}</span></div>` : ''}
                <div style="font-size:10px;color:var(--text-dim);margin-top:4px">Stipendio: €${p.salary}/mese | Anticipo: €${p.salary*2}</div>
            </div>
            <button onclick="hireDriver('${p.name}', ${p.salary})" style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:4px 10px;border-radius:4px;font-size:9px;cursor:pointer;transition:opacity .15s" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">Assumi</button>
        </div>`;
    });
    if ((gameState.availableRecruits || []).length === 0) {
        html += `<div style="text-align:center;padding:40px 0"><div style="font-size:32px;margin-bottom:10px">👤</div><div style="font-size:14px;font-weight:600;color:#e6edf3">Nessun candidato</div><div style="font-size:11px;color:#8b949e;margin-top:4px">Il mercato si aggiorna ad ogni assunzione</div></div>`;
    }

    // ── Driver Academy ────────────────────────────────────────────────────────
    const _academyDrivers  = gameState.drivers.filter(d => d.id !== 'ceo');
    const _inTrainingCount = (gameState.driverAcademy||[]).length;
    html += `</div><div style="display:flex;align-items:center;justify-content:space-between;margin:16px 0 12px">
        <div class="ds-eyebrow">🎓 Accademia Autisti</div>
        ${_inTrainingCount > 0 ? `<span style="font-size:9px;font-weight:700;color:#d4af37;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.3);border-radius:4px;padding:2px 6px">📚 ${_inTrainingCount} in formazione</span>` : ''}
    </div>`;
    if (_academyDrivers.length === 0) {
        html += `<div style="text-align:center;padding:40px 0"><div style="font-size:32px;margin-bottom:10px">🎓</div><div style="font-size:14px;font-weight:600;color:#e6edf3">Nessun autista</div><div style="font-size:11px;color:#8b949e;margin-top:4px">Assumi almeno un autista per accedere all'Accademia</div></div>`;
    } else {
        html += `<div class="ds-card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px">
            <div>
                <div style="font-size:12px;font-weight:700;color:var(--text)">Gestione Corsi</div>
                <div style="font-size:10px;color:var(--text-dim);margin-top:2px">${_academyDrivers.length} autisti · ${_inTrainingCount} in corso · 5 corsi disponibili</div>
            </div>
            <button onclick="window.openAcademyModal()" style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:4px 10px;border-radius:4px;font-size:9px;cursor:pointer;transition:opacity .15s" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">Apri Accademia →</button>
        </div>`;
    }

    // ── CEO della Settimana ───────────────────────────────────────────────────
    html += `<div class="ds-eyebrow" style="margin:16px 0 12px">🏆 CEO della Settimana</div>
    <div class="ds-card">
        <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
                <div style="font-size:12px;font-weight:700;color:var(--text)">Settimana in Corso</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Reset domenica · Premio: Driver Coins</div>
            </div>
            <div style="text-align:right">
                <div style="font-size:14px;font-weight:700;color:var(--gold)">€${(gameState.weeklyEarnings||0).toLocaleString()}</div>
                <div style="font-size:10px;color:var(--text-dim)">${gameState.weeklyRides||0} corse</div>
            </div>
        </div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:8px;font-style:italic">Il vincitore riceve fino a 50 DC domenica sera.</div>
    </div>`;

    container.innerHTML = html;
}

window.openCarModal = function(carId) {
    const car = gameState.fleet.find(c => c.id === carId);
    if(!car) return;
    document.getElementById('car-modal-title').innerText = car.name;
    document.getElementById('car-modal-desc').innerText = `${car.tier.toUpperCase()} · Condizione ${Math.floor(car.condition)}% · Carburante ${Math.floor(car.fuel||100)}%`;

    const _repMissing = 100 - Math.max(0, Math.floor(car.condition || 0));
    const _repHasMech = gameState.staff.some(s => s.id === 'mech');
    const _repContractDisc = (gameState.maintenanceContract && gameState.day <= gameState.maintenanceContractPaidUntilDay) ? 0.70 : 1.0;
    const _repMechDisc = _repHasMech ? 0.50 : 1.0;
    let repairCost = Math.round(Math.max(500, _repMissing * 85) * _repContractDisc * _repMechDisc);

    const fuelPct = car.fuel !== undefined ? Math.floor(car.fuel) : 100;
    const fuelColor = fuelPct < 20 ? '#ff4060' : fuelPct < 50 ? '#f59e0b' : '#00f2ff';

    if (!car.upgrades) car.upgrades = [];
    const installedUpgrades = car.upgrades.map(uid => CAR_UPGRADES.find(u => u.id === uid)?.name || uid).join(', ');

    const tirePct2 = car.tirePressure !== undefined ? Math.floor(car.tirePressure) : 100;
    const tireColor2 = tirePct2 < 20 ? '#ff4060' : tirePct2 < 50 ? '#f59e0b' : '#22c55e';
    const outReason = car.outOfService;

    let html = `<div class="space-y-3">
    ${(outReason && !(outReason === 'fuel' && fuelPct > 5)) ? `<div class="p-2 border border-red-500/40 bg-red-950/20 rounded-lg text-[9px] text-red-300 font-bold">
        🔴 Auto ferma: ${outReason === 'fuel' ? 'serbatoio esaurito — rifornisci qui sotto' : outReason === 'engine' ? 'motore fuso — riparazione urgente' : 'deposito gomme esaurito'}.<br>
        <span class="text-gray-400 font-normal">${outReason === 'fuel' ? 'Usa "Rifornisci" o "Gasolio Agric." qui sotto per sbloccarla.' : outReason === 'engine' ? 'Usa il pulsante Ripara Motore qui sotto.' : 'Rifornisci il deposito gomme nella schermata Flotta.'}</span>
    </div>` : ''}
    <div>
        <div class="flex justify-between text-[9px] text-gray-500 mb-1"><span>⛽ Carburante</span><span style="color:${fuelColor}">${fuelPct}%</span></div>
        <div class="fuel-bar-bg"><div class="fuel-bar-fill" style="width:${fuelPct}%; background:${fuelColor}"></div></div>
        <div class="text-[8px] text-gray-600 mt-0.5 text-center">Rifornimento automatico via Deposito Aziendale</div>
    </div>
    <div>
        <div class="flex justify-between text-[9px] text-gray-500 mb-1"><span>🔵 Gomme</span><span style="color:${tireColor2}">${tirePct2}%</span></div>
        <div class="fuel-bar-bg"><div class="fuel-bar-fill" style="width:${tirePct2}%; background:${tireColor2}"></div></div>
        <div class="text-[8px] text-gray-600 mt-0.5 text-center">Sostituzione automatica (sotto 20%) via Deposito Aziendale</div>
    </div>
    ${car.condition < 100 ? `<button onclick="payToRepairCar('${car.id}')" class="w-full btn-gold !bg-blue-900/30 !text-blue-300 !border !border-blue-500/30">🔧 Ripara (€${repairCost})</button>` : ''}
    <h4 class="text-[10px] text-gray-500 uppercase">Upgrade VIP</h4>
    <div class="space-y-1 max-h-28 overflow-y-auto">`;

    CAR_UPGRADES.forEach(upg => {
        const owned = car.upgrades.includes(upg.id);
        html += `<div class="flex justify-between items-center p-1.5 border border-white/5 rounded text-[9px] ${owned ? 'opacity-50' : ''}">
            <div><span class="text-white font-bold">${upg.name}</span><span class="text-gray-500 ml-1">${upg.desc}</span></div>
            ${owned ? '<span class="upgrade-pill">✓</span>' : `<button onclick="buyCARUpgrade('${car.id}','${upg.id}')" class="btn-blue !text-[8px] !py-0.5 !px-1.5">€${upg.price.toLocaleString()}</button>`}
        </div>`;
    });

    html += `</div>${installedUpgrades ? `<div class="text-[9px] text-gray-500">Upgrade attivi: <span class="text-blue font-bold">${installedUpgrades}</span></div>` : ''}
    <h4 class="text-[10px] text-gray-500 uppercase mt-2">Assegna Autista</h4>
    <div class="grid grid-cols-1 gap-1 max-h-28 overflow-y-auto pr-1">`;

    gameState.drivers.forEach(d => {
        const isSet = d.assignedCarId === car.id;
        const lvl = d.level || 0;
        const driverTier = lvl >= 6 ? 'ULTRA' : lvl >= 4 ? 'VIP' : lvl >= 2 ? 'BUSINESS' : 'STANDARD';
        const tierColor  = lvl >= 6 ? '#a855f7' : lvl >= 4 ? '#00f2ff' : lvl >= 2 ? '#f59e0b' : '#6b7280';
        const specLabel  = d.specialty && d.specialty !== 'none' ? ` · ${d.specialty.replace(/_/g,' ')}` : '';
        html += `<button onclick="assignCarToDriver('${car.id}','${d.id}')" class="text-left p-1.5 border border-white/10 rounded text-[9px] w-full ${isSet?'border-gold text-gold bg-gold/5':'text-white hover:border-white/20'}">
            <span class="font-bold">${d.name}</span>
            <span style="font-size:8px;font-weight:700;color:${tierColor};margin-left:4px">[${driverTier}]</span>
            <span style="font-size:8px;color:#4b5563">${specLabel}</span>
            ${isSet ? '<span style="font-size:8px;color:#d4af37;margin-left:4px">✓ Assegnato</span>' : ''}
        </button>`;
    });
    // Skin badge
    const _activeSkin = car.skin ? (typeof VEHICLE_SKINS !== 'undefined' ? VEHICLE_SKINS : (window.VEHICLE_SKINS||[])).find(s => s.id === car.skin) : null;
    if (_activeSkin) {
        html += `<div class="text-[9px] mt-1" style="color:${_activeSkin.color}">🎨 Livrea: ${_activeSkin.name}</div>`;
    }
    html += `</div>
    <button onclick="openGarage3D('${car.id}')" class="w-full btn-blue !text-[9px]">🚗 Vista 3D Garage</button>`;
    // Instant Repair DC
    const condPctModal = Math.floor(car.condition || 0);
    const dcRepairCost = gameState.executivePassActive ? 1 : 2;
    if (condPctModal < 100) {
        html += `<button onclick="instantRepairDC('${car.id}')" class="w-full btn-gold !text-[9px] mt-1">⚡ Ripara Istant. (${dcRepairCost} DC)</button>`;
    }
    if(!car.isLease) {
        html += `<button onclick="sellCar('${car.id}')" class="w-full btn-gold !bg-red-900/20 !text-red-400 !border !border-red-900/40 mt-1">💰 Vendi (usato)</button>`;
        const alreadyListed = (gameState.marketplace||[]).some(l => l.carId === car.id);
        if (!alreadyListed) {
            const suggestPrice = Math.round(20000 * ((condPctModal/100)) * (car.tier === 'ultra' ? 5 : car.tier === 'vip' ? 3 : car.tier === 'business' ? 1.8 : 1));
            html += `<button onclick="listCarForSale('${car.id}', ${suggestPrice}); closeModals();" class="w-full btn-gold !bg-purple-900/20 !text-purple-300 !border !border-purple-900/40 mt-1">🏪 Metti in Mercato (~€${(suggestPrice/1000).toFixed(0)}k)</button>`;
        }
    }
    document.getElementById('car-modal-content').innerHTML = html + `</div>`;
    document.getElementById('modal-car').classList.remove('hidden');
    document.getElementById('modal-car').classList.add('flex');
}

window.closeModals = function() { 
    document.querySelectorAll('[id^="modal-"]').forEach(m => { m.classList.add('hidden'); m.classList.remove('flex'); }); 
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
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(modal);

    const sel = new Set();

    // ── Build static shell (photo + config panel) once ───────────────────────
    modal.innerHTML = `
<div style="display:flex;width:100%;max-width:1020px;height:90vh;border-radius:20px;overflow:hidden;box-shadow:0 60px 120px rgba(0,0,0,0.95)">

  <!-- LEFT: full-height photo -->
  <div style="width:58%;position:relative;flex-shrink:0;background:#080808">
    <img src="${carImg}" alt="${carT.name}"
         style="width:100%;height:100%;object-fit:cover;object-position:center;display:block">
    <!-- subtle bottom fade for readability -->
    <div style="position:absolute;bottom:0;left:0;right:0;height:40%;background:linear-gradient(to top,rgba(0,0,0,0.72) 0%,transparent 100%)"></div>
    <!-- car name badge bottom-left -->
    <div style="position:absolute;bottom:28px;left:28px;right:28px">
      <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:1px;line-height:1.1;text-shadow:0 2px 12px rgba(0,0,0,0.8)">${carT.name}</div>
      ${isElec ? `<div style="margin-top:10px;display:inline-flex;align-items:center;gap:5px;background:rgba(34,197,94,0.18);border:1px solid rgba(34,197,94,0.4);color:#4ade80;font-size:9px;font-weight:800;padding:4px 12px;border-radius:20px;letter-spacing:1.5px;backdrop-filter:blur(4px)">⚡ ZERO EMISSIONI</div>` : ''}
    </div>
  </div>

  <!-- RIGHT: config panel -->
  <div id="cfg-right" style="flex:1;background:#111114;overflow-y:auto;display:flex;flex-direction:column;min-width:0;scrollbar-width:thin;scrollbar-color:#2a2a30 transparent">

    <!-- top bar: close -->
    <div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px 0">
      <div style="font-size:9px;color:#4b5563;text-transform:uppercase;letter-spacing:3px">Configuratore</div>
      <button onclick="document.getElementById('modal-configurator').remove()"
        style="width:28px;height:28px;border-radius:50%;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#6b7280;font-size:14px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.15s"
        onmouseover="this.style.background='rgba(255,255,255,0.1)';this.style.color='#fff'"
        onmouseout="this.style.background='rgba(255,255,255,0.04)';this.style.color='#6b7280'">✕</button>
    </div>

    <!-- car name + tier + base price block -->
    <div style="padding:16px 24px 20px;border-bottom:1px solid rgba(255,255,255,0.06)">
      <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:0.5px;line-height:1.2">${carT.name}</div>
      <div style="font-size:9px;color:#d4af37;text-transform:uppercase;letter-spacing:2px;margin-top:4px">${carT.tier}</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:16px">
        <span style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Prezzo base</span>
        <span style="font-size:24px;font-weight:900;color:#fff;font-family:monospace;letter-spacing:-0.5px">€${carT.price.toLocaleString()}</span>
      </div>
    </div>

    <!-- optional list -->
    <div style="padding:20px 24px;flex:1">
      <div style="font-size:8px;color:#d4af37;text-transform:uppercase;letter-spacing:3px;margin-bottom:14px">Optional disponibili</div>
      <div id="cfg-upgrades" style="display:flex;flex-direction:column;gap:6px">
        ${CAR_UPGRADES.map(u => `
        <div id="cfg-upg-${u.id}" onclick="__cfgToggle('${u.id}')"
             style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);cursor:pointer;user-select:none;transition:all 0.15s">
          <div id="cfg-chk-${u.id}"
               style="width:17px;height:17px;border-radius:4px;border:1.5px solid rgba(255,255,255,0.18);background:transparent;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;font-weight:900;color:#000"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;color:#e5e7eb">${u.name}</div>
            <div style="font-size:8px;color:#6b7280;margin-top:2px;line-height:1.4">${u.desc}</div>
          </div>
          <div id="cfg-price-${u.id}" style="font-size:11px;font-family:monospace;color:#6b7280;flex-shrink:0;font-weight:600">+€${u.price.toLocaleString()}</div>
        </div>`).join('')}
      </div>
    </div>

    <!-- sticky footer -->
    <div id="cfg-footer" style="position:sticky;bottom:0;background:#111114;border-top:1px solid rgba(255,255,255,0.07);padding:18px 24px"></div>
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
            <span style="font-size:28px;font-family:monospace;font-weight:900;color:${ok ? '#fff' : '#f87171'};letter-spacing:-1px">€${total.toLocaleString()}</span>
          </div>
          ${!ok ? `<div style="font-size:9px;color:#f87171;margin-bottom:10px;text-align:right">Fondi insufficienti — disponibili: €${gameState.cash.toLocaleString()}</div>` : ''}
          <div style="display:flex;gap:10px">
            <button onclick="document.getElementById('modal-configurator').remove()"
              style="flex:0 0 auto;padding:12px 20px;font-size:10px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#6b7280;background:transparent;cursor:pointer">
              Annulla
            </button>
            <button onclick="__cfgConfirm('${carId}','${type}')" ${!ok ? 'disabled' : ''}
              style="flex:1;padding:12px;font-size:11px;font-weight:800;border-radius:10px;cursor:${ok ? 'pointer' : 'not-allowed'};letter-spacing:0.5px;
                     background:${ok ? 'linear-gradient(135deg,#d4af37,#b8961f)' : 'rgba(255,255,255,0.05)'};
                     color:${ok ? '#000' : '#4b5563'};border:${ok ? 'none' : '1px solid rgba(255,255,255,0.08)'}">
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
            row.style.borderColor  = on ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.08)';
            row.style.background   = on ? 'rgba(212,175,55,0.06)' : 'rgba(0,0,0,0.3)';
        }
        if (chk) {
            chk.style.background   = on ? '#d4af37' : 'rgba(0,0,0,0.4)';
            chk.style.borderColor  = on ? '#d4af37' : 'rgba(255,255,255,0.2)';
            chk.textContent        = on ? '✓' : '';
        }
        if (prc) prc.style.color = on ? '#d4af37' : '#9ca3af';
        _updateSummary();
    };

    _updateSummary();

    window.__cfgConfirm = async function(cId, cType) {
        const car = (cType === 'new' ? NEW_CARS : USED_CARS).find(c => c.id === cId);
        if (!car) return;
        const ups     = [...sel];
        const upTotal = ups.reduce((s, uid) => { const u = CAR_UPGRADES.find(x => x.id === uid); return s + (u ? u.price : 0); }, 0);
        const total   = car.price + upTotal;

        const result = await window.ServerState?.buyVehicle(
            car.vehicleClass || car.id,
            total,
            ServerState.getCompany()?.hq_city || 'roma'
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
        document.getElementById('modal-configurator')?.remove();
        updateUI(); renderTabFleet();
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

    const result = await window.ServerState?.buyVehicle(
        c.vehicleClass || c.id,
        upFront,
        ServerState.getCompany()?.hq_city || 'roma'
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
    updateUI(); renderTabFleet();
    showNotification('Contratto Leasing approvato!', 'success');
};


window.renderTabStaff = renderTabStaff;
