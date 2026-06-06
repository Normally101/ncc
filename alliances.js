'use strict';
/* ════════════════════════════════════════════════════════════════════
   alliances.js — Tab "Consorzi" (alleanze tra aziende)
   Frontend sulle RPC Supabase: rpc_create_alliance, rpc_join_alliance,
   rpc_leave_alliance, rpc_donate_to_alliance, rpc_post_alliance_chat,
   rpc_kick_member, rpc_set_member_role, rpc_disband_alliance.
   Letture dirette (RLS) su alliances / alliance_members / alliance_chat.
   ════════════════════════════════════════════════════════════════════ */
(function () {
    const CREATE_COST = 25000;
    const ST = { chatChan: null, chatAid: null };

    // ── BOTTEGA DEL CONSORZIO — catalogo perk ─────────────────────────
    // NB: cost/hours sono SOLO per il display. La verità è server-side in
    // rpc_activate_alliance_perk (36_alliance_perks.sql). Tenerli allineati.
    const PERKS = [
        { id: 'boost_income', icon: '💰', name: 'Boost Ricavi',          desc: '+12% guadagni su tutte le corse',   cost: 50000,  hours: 48, kind: 'earnings', mult: 1.12 },
        { id: 'fuel_save',    icon: '⛽', name: 'Efficienza Carburante',  desc: '−15% sul prezzo del carburante',    cost: 35000,  hours: 48, kind: 'fuel',     mult: 0.85 },
        { id: 'mega_income',  icon: '🚀', name: 'Mega Ricavi',           desc: '+25% guadagni su tutte le corse',   cost: 120000, hours: 24, kind: 'earnings', mult: 1.25 },
    ];
    const _fmtRemain = ms => {
        const s = Math.max(0, Math.floor((ms - Date.now()) / 1000));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        return h >= 24 ? `${Math.floor(h / 24)}g ${h % 24}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    // Buff client-side: il motore (engine-rides/engine-fleet) legge questi.
    // window._allyActivePerk = { type, until(ISO/ms) } | null
    window._allyPerkMult = function (kind) {
        const p = window._allyActivePerk;
        if (!p || !p.type) return 1.0;
        if (!(new Date(p.until).getTime() > Date.now())) return 1.0;
        const def = PERKS.find(x => x.id === p.type);
        return (def && def.kind === kind) ? def.mult : 1.0;
    };
    // Aggiorna la cache del perk leggendo il consorzio del giocatore.
    // Gira in background (anche fuori dalla tab Consorzi) per applicare il buff.
    window._allyRefreshPerk = async function () {
        try {
            if (!sb() || !uid()) { window._allyActivePerk = null; return; }
            const { data: m } = await sb().from('alliance_members').select('alliance_id').eq('user_id', uid()).maybeSingle();
            if (!m || !m.alliance_id) { window._allyActivePerk = null; return; }
            const { data: a } = await sb().from('alliances').select('perk_type,perk_until').eq('id', m.alliance_id).maybeSingle();
            window._allyActivePerk = (a && a.perk_type && a.perk_until && new Date(a.perk_until).getTime() > Date.now())
                ? { type: a.perk_type, until: a.perk_until } : null;
        } catch (e) { /* offline o colonne perk non ancora migrate (36_alliance_perks.sql) */ }
    };

    const sb  = () => window.supabaseClient;
    const uid = () => window.currentUser && window.currentUser.id;
    const cname = () => (window.gameState && gameState.companyName) || 'Chauffeur Empire';
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmt = n => '€' + Math.floor(n || 0).toLocaleString('it-IT');
    const _notify = (m, t) => { if (typeof showNotification === 'function') showNotification(m, t || 'info'); };

    // ── MAIN RENDER ───────────────────────────────────────────────────
    window.renderTabConsorzi = async function () {
        const c = document.getElementById('tab-container'); if (!c) return;
        if (!sb() || !uid()) {
            c.innerHTML = `<div class="em em-page"><div class="em-wrap"><div class="em-empty" style="margin-top:40px"><div style="font-size:34px;margin-bottom:10px">🛡️</div><div style="font-size:15px;font-weight:800;color:var(--em-ink)">Consorzi non disponibili</div><div style="margin-top:4px">Accedi al tuo account per unirti a un consorzio.</div></div></div></div>`;
            return;
        }
        // loading
        c.innerHTML = `<div class="em em-page"><div class="em-wrap"><div class="em-empty" style="margin-top:40px">Caricamento consorzi…</div></div></div>`;

        // mia membership
        let mem = null;
        try {
            const { data } = await sb().from('alliance_members')
                .select('alliance_id,role,contribution').eq('user_id', uid()).maybeSingle();
            mem = data || null;
        } catch (e) { mem = null; }

        if (mem) await _renderMember(c, mem);
        else      await _renderBrowse(c);
    };

    // ── VISTA MEMBRO ──────────────────────────────────────────────────
    async function _renderMember(c, mem) {
        let al = null, roster = [], chat = [];
        try {
            const a = await sb().from('alliances').select('*').eq('id', mem.alliance_id).maybeSingle();
            al = a.data;
            const r = await sb().from('alliance_members')
                .select('user_id,company_name,role,contribution,joined_at')
                .eq('alliance_id', mem.alliance_id).order('contribution', { ascending: false });
            roster = r.data || [];
            const ch = await sb().from('alliance_chat')
                .select('user_id,company_name,message,created_at')
                .eq('alliance_id', mem.alliance_id).order('created_at', { ascending: false }).limit(40);
            chat = (ch.data || []).reverse();
        } catch (e) { /* parziale */ }
        if (!al) { c.innerHTML = `<div class="em em-page"><div class="em-wrap"><div class="em-empty">Consorzio non trovato.</div></div></div>`; return; }

        const isLeader  = mem.role === 'leader';
        const isOfficer = mem.role === 'leader' || mem.role === 'officer';
        const roleBadge = r => r === 'leader' ? '<span class="em-pill em-pill--gold">Leader</span>'
                             : r === 'officer' ? '<span class="em-pill em-pill--blue">Officer</span>'
                             : '<span class="em-pill em-pill--gray">Membro</span>';

        const rosterRows = roster.map(m => {
            const me = m.user_id === uid();
            const ctrl = (isOfficer && !me && m.role !== 'leader') ? `
                <div style="display:flex;gap:4px;flex-shrink:0">
                    ${isLeader ? `<button class="em-ghbtn" style="padding:3px 8px;font-size:9.5px" onclick="window._alSetRole('${m.user_id}','${m.role === 'officer' ? 'member' : 'officer'}')">${m.role === 'officer' ? '↓ Membro' : '↑ Officer'}</button>` : ''}
                    <button class="em-redbtn" style="padding:3px 8px;font-size:9.5px" onclick="window._alKick('${m.user_id}')">Espelli</button>
                </div>` : '';
            return `<div class="em-lrow">
                <div style="flex:1;min-width:0">
                    <div class="em-lt" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.company_name || '—')}${me ? ' <span style="color:var(--em-dim);font-weight:500">(tu)</span>' : ''}</div>
                    <div class="em-lm">${roleBadge(m.role)}<span>contributo ${fmt(m.contribution)}</span></div>
                </div>${ctrl}
            </div>`;
        }).join('');

        // ── Bottega del Consorzio (perk dal tesoro) ───────────────────
        const _perkActiveMs = (al.perk_type && al.perk_until && new Date(al.perk_until).getTime() > Date.now()) ? new Date(al.perk_until).getTime() : 0;
        const activePerk = _perkActiveMs ? PERKS.find(p => p.id === al.perk_type) : null;
        window._allyActivePerk = activePerk ? { type: al.perk_type, until: al.perk_until } : null;

        const perkBanner = activePerk ? `
            <div style="margin:0 11px 9px;padding:9px 11px;background:linear-gradient(135deg,rgba(26,160,106,.12),rgba(26,160,106,.04));border:1px solid var(--em-green);border-radius:8px">
                <div style="font-size:11.5px;font-weight:800;color:var(--em-green-d)">${activePerk.icon} ${activePerk.name} · ATTIVO</div>
                <div style="font-size:10.5px;color:var(--em-muted);margin-top:1px">${activePerk.desc} — scade tra <b>${_fmtRemain(_perkActiveMs)}</b></div>
            </div>`
            : `<div style="margin:0 11px 9px;font-size:10.5px;color:var(--em-dim)">Nessun perk attivo. ${isLeader ? 'Spendi il tesoro per buffare tutto il consorzio.' : 'Solo il leader può attivarne uno.'}</div>`;

        const perkRows = PERKS.map(p => {
            const affordable = (al.treasury || 0) >= p.cost;
            const dis = !isLeader || !affordable;
            const hint = !isLeader ? 'Solo leader' : !affordable ? 'Tesoro basso' : `${p.hours}h`;
            return `<div class="em-lrow">
                <div style="flex:1;min-width:0">
                    <div class="em-lt">${p.icon} ${esc(p.name)}</div>
                    <div class="em-lm"><span>${esc(p.desc)}</span><span>· ${hint}</span></div>
                </div>
                <button class="em-goldbtn" style="flex-shrink:0${dis ? ';opacity:.45;cursor:not-allowed' : ''}" ${dis ? 'disabled' : `onclick="window._alPerk('${p.id}')"`}>${fmt(p.cost)}</button>
            </div>`;
        }).join('');

        const bottegaCard = `<div class="em-card" style="margin-bottom:7px">
            <div class="em-ch"><span class="t">Bottega del Consorzio</span><span class="a" style="color:var(--em-muted)">perk a tempo</span></div>
            ${perkBanner}
            ${perkRows}
        </div>`;

        const chatRows = chat.length ? chat.map(m => `
            <div style="padding:6px 11px;border-top:1px solid var(--em-line2)">
                <span style="font-weight:700;font-size:11px;color:${m.user_id === uid() ? 'var(--em-blue)' : 'var(--em-ink)'}">${esc(m.company_name || 'Anon')}</span>
                <span style="font-size:11px;color:var(--em-ink)"> ${esc(m.message)}</span>
            </div>`).join('') : `<div class="em-empty">Nessun messaggio. Rompi il ghiaccio 👋</div>`;

        c.innerHTML = `<div class="em em-page"><div class="em-wrap">
            <div class="em-card" style="margin-bottom:7px;padding:14px 16px;display:flex;align-items:center;gap:14px">
                <div style="font-size:34px;line-height:1;flex-shrink:0">${esc(al.emblem || '🛡️')}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:19px;font-weight:800;color:var(--em-ink)">${esc(al.name)} <span style="font-size:12px;font-weight:800;color:${esc(al.color || '#c79a2a')}">[${esc(al.tag)}]</span></div>
                    <div style="font-size:11px;color:var(--em-muted);margin-top:1px">${al.member_count} membri · Tesoro <b style="color:var(--em-green-d)">${fmt(al.treasury)}</b> · ${al.is_open ? 'Aperto' : 'Su richiesta'}</div>
                    ${al.description ? `<div style="font-size:10.5px;color:var(--em-dim);margin-top:3px">${esc(al.description)}</div>` : ''}
                </div>
                ${isLeader
                    ? `<button class="em-redbtn" style="flex-shrink:0" onclick="window._alDisband()">Sciogli</button>`
                    : `<button class="em-ghbtn" style="flex-shrink:0" onclick="window._alLeave()">Esci</button>`}
            </div>

            <div style="display:grid;grid-template-columns:1fr 360px;gap:7px;align-items:start">
                <div>
                    <div class="em-card" style="margin-bottom:7px">
                        <div class="em-ch"><span class="t">Tesoro del Consorzio</span><span class="a" style="color:var(--em-green)">${fmt(al.treasury)}</span></div>
                        <div style="padding:11px;display:flex;gap:8px;align-items:center">
                            <input id="al-donate" type="number" min="1000" step="1000" placeholder="Importo da donare"
                                style="flex:1;background:#0d1117;border:1px solid var(--em-line);border-radius:7px;padding:8px 10px;font-size:12px;color:var(--em-ink);outline:none">
                            <button class="em-gbtn" onclick="window._alDonate()">Dona</button>
                        </div>
                        <div style="font-size:10px;color:var(--em-dim);padding:0 11px 10px">Il tuo contributo totale: <b>${fmt((roster.find(m => m.user_id === uid()) || {}).contribution)}</b></div>
                    </div>
                    ${bottegaCard}
                    <div class="em-card">
                        <div class="em-ch"><span class="t">Membri</span><span class="a">${roster.length}</span></div>
                        ${rosterRows}
                    </div>
                </div>

                <div class="em-card" style="display:flex;flex-direction:column;max-height:62vh">
                    <div class="em-ch"><span class="t">Chat del Consorzio</span><span class="a" style="color:var(--em-green)">● live</span></div>
                    <div id="al-chat-scroll" style="flex:1;overflow-y:auto;min-height:200px">${chatRows}</div>
                    <div style="display:flex;gap:6px;padding:9px 11px;border-top:1px solid var(--em-line2)">
                        <input id="al-chat-input" maxlength="500" placeholder="Scrivi al consorzio…" onkeydown="if(event.key==='Enter')window._alChat()"
                            style="flex:1;background:#0d1117;border:1px solid var(--em-line);border-radius:7px;padding:8px 10px;font-size:12px;color:var(--em-ink);outline:none">
                        <button class="em-bbtn" onclick="window._alChat()">Invia</button>
                    </div>
                </div>
            </div>
        </div></div>`;

        // scrolla la chat in fondo + realtime
        const sc = document.getElementById('al-chat-scroll'); if (sc) sc.scrollTop = sc.scrollHeight;
        _subscribeChat(mem.alliance_id);
    }

    // ── VISTA BROWSE / CREATE ─────────────────────────────────────────
    async function _renderBrowse(c) {
        let list = [];
        try {
            const { data } = await sb().from('alliances').select('*').order('member_count', { ascending: false }).limit(30);
            list = data || [];
        } catch (e) { list = [] }

        const cards = list.length ? list.map(a => `
            <div class="em-card" style="padding:12px 14px;display:flex;align-items:center;gap:12px">
                <div style="font-size:26px;line-height:1;flex-shrink:0">${esc(a.emblem || '🛡️')}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:800;color:var(--em-ink)">${esc(a.name)} <span style="font-size:11px;color:${esc(a.color || '#c79a2a')};font-weight:800">[${esc(a.tag)}]</span></div>
                    <div style="font-size:10.5px;color:var(--em-muted)">${a.member_count} membri · Tesoro ${fmt(a.treasury)} · ${a.is_open ? 'Aperto' : 'Su richiesta'}</div>
                    ${a.description ? `<div style="font-size:10px;color:var(--em-dim);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.description)}</div>` : ''}
                </div>
                <button class="em-gbtn" style="flex-shrink:0" onclick="window._alJoin('${a.id}')">${a.is_open ? 'Entra' : 'Richiedi'}</button>
            </div>`).join('') : `<div class="em-empty">Nessun consorzio ancora. Fonda il primo! 🛡️</div>`;

        c.innerHTML = `<div class="em em-page"><div class="em-wrap">
            <div style="margin-bottom:10px">
                <div class="em-sec">Community</div>
                <div style="font-size:20px;font-weight:800;margin-top:3px">Consorzi</div>
                <div style="font-size:11px;color:var(--em-muted);margin-top:3px">Unisci le forze: tesoro condiviso, chat di gruppo, dominio dei territori.</div>
            </div>

            <div class="em-card" style="margin-bottom:10px">
                <div class="em-ch"><span class="t">Fonda un Consorzio</span><span class="a" style="color:var(--em-muted)">Costo ${fmt(CREATE_COST)}</span></div>
                <div style="padding:12px;display:grid;grid-template-columns:1fr 110px;gap:8px">
                    <input id="al-name" maxlength="40" placeholder="Nome consorzio" style="background:#0d1117;border:1px solid var(--em-line);border-radius:7px;padding:8px 10px;font-size:12px;color:var(--em-ink);outline:none">
                    <input id="al-tag" maxlength="6" placeholder="TAG" style="background:#0d1117;border:1px solid var(--em-line);border-radius:7px;padding:8px 10px;font-size:12px;color:var(--em-ink);outline:none;text-transform:uppercase">
                    <input id="al-desc" maxlength="120" placeholder="Descrizione (facoltativa)" style="grid-column:span 2;background:#0d1117;border:1px solid var(--em-line);border-radius:7px;padding:8px 10px;font-size:12px;color:var(--em-ink);outline:none">
                    <div style="display:flex;align-items:center;gap:8px">
                        <span style="font-size:11px;color:var(--em-muted)">Emblema</span>
                        <input id="al-emblem" maxlength="2" value="🛡️" style="width:46px;text-align:center;background:#0d1117;border:1px solid var(--em-line);border-radius:7px;padding:8px;font-size:14px;outline:none">
                        <label style="font-size:11px;color:var(--em-muted);display:flex;align-items:center;gap:5px;cursor:pointer"><input id="al-open" type="checkbox" checked> Aperto a tutti</label>
                    </div>
                    <button class="em-goldbtn" style="grid-column:2" onclick="window._alCreate()">Fonda</button>
                </div>
            </div>

            <div class="em-sec" style="margin:4px 0 8px">Sfoglia consorzi · ${list.length}</div>
            <div style="display:flex;flex-direction:column;gap:6px">${cards}</div>
        </div></div>`;
    }

    // ── REALTIME CHAT ─────────────────────────────────────────────────
    function _subscribeChat(aid) {
        try {
            if (ST.chatChan && ST.chatAid === aid) return;       // già sottoscritto
            if (ST.chatChan) { sb().removeChannel(ST.chatChan); ST.chatChan = null; }
            ST.chatAid = aid;
            ST.chatChan = sb().channel('al_chat_' + aid)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alliance_chat', filter: 'alliance_id=eq.' + aid },
                    payload => {
                        const m = payload && payload.new; if (!m) return;
                        const sc = document.getElementById('al-chat-scroll'); if (!sc) return;
                        if (sc.querySelector('.em-empty')) sc.innerHTML = '';
                        const div = document.createElement('div');
                        div.style.cssText = 'padding:6px 11px;border-top:1px solid var(--em-line2)';
                        div.innerHTML = `<span style="font-weight:700;font-size:11px;color:${m.user_id === uid() ? 'var(--em-blue)' : 'var(--em-ink)'}">${esc(m.company_name || 'Anon')}</span><span style="font-size:11px;color:var(--em-ink)"> ${esc(m.message)}</span>`;
                        sc.appendChild(div); sc.scrollTop = sc.scrollHeight;
                    })
                .subscribe();
        } catch (e) { /* ok */ }
    }

    // ── AZIONI ────────────────────────────────────────────────────────
    async function _rpc(fn, args) {
        const { data, error } = await sb().rpc(fn, args || {});
        if (error) throw new Error(error.message || 'Errore server');
        return data;
    }

    window._alCreate = async function () {
        const name = (document.getElementById('al-name') || {}).value || '';
        const tag  = ((document.getElementById('al-tag') || {}).value || '').toUpperCase();
        const desc = (document.getElementById('al-desc') || {}).value || '';
        const emb  = (document.getElementById('al-emblem') || {}).value || '🛡️';
        const open = !!(document.getElementById('al-open') || {}).checked;
        if (name.trim().length < 3) return _notify('Nome troppo corto (min 3).', 'error');
        if (tag.trim().length < 2)  return _notify('TAG troppo corto (min 2).', 'error');
        if ((gameState.cash || 0) < CREATE_COST) return _notify(`Servono ${fmt(CREATE_COST)} per fondare un consorzio.`, 'error');
        try {
            const id = await _rpc('rpc_create_alliance', { p_name: name.trim(), p_tag: tag.trim(), p_company_name: cname(), p_description: desc.trim(), p_emblem: emb });
            if (typeof window._addCash === 'function') window._addCash(-CREATE_COST); else gameState.cash -= CREATE_COST;
            // imposta apertura se l'utente l'ha tolta (default RPC = aperto)
            if (!open && id) { try { await sb().from('alliances').update({ is_open: false }).eq('id', id); } catch (e) {} }
            _notify('Consorzio fondato! 🛡️', 'success');
            if (typeof saveGame === 'function') saveGame();
            if (typeof updateUI === 'function') updateUI();
            window.renderTabConsorzi();
        } catch (e) { _notify(e.message, 'error'); }
    };

    window._alJoin = async function (id) {
        try {
            const r = await _rpc('rpc_join_alliance', { p_alliance_id: id, p_company_name: cname() });
            _notify(r === 'requested' ? 'Richiesta inviata.' : 'Sei entrato nel consorzio! 🛡️', 'success');
            window.renderTabConsorzi();
        } catch (e) { _notify(e.message, 'error'); }
    };

    window._alLeave = async function () {
        if (!confirm('Vuoi davvero uscire dal consorzio?')) return;
        try { await _rpc('rpc_leave_alliance'); _notify('Hai lasciato il consorzio.', 'info'); window.renderTabConsorzi(); }
        catch (e) { _notify(e.message, 'error'); }
    };

    window._alDisband = async function () {
        if (!confirm('Sciogliere il consorzio? Operazione irreversibile.')) return;
        try { await _rpc('rpc_disband_alliance'); _notify('Consorzio sciolto.', 'info'); window.renderTabConsorzi(); }
        catch (e) { _notify(e.message, 'error'); }
    };

    window._alDonate = async function () {
        const el = document.getElementById('al-donate');
        const amt = Math.floor(parseFloat(el && el.value) || 0);
        if (amt <= 0) return _notify('Importo non valido.', 'error');
        if ((gameState.cash || 0) < amt) return _notify('Fondi insufficienti.', 'error');
        try {
            await _rpc('rpc_donate_to_alliance', { p_amount: amt });
            if (typeof window._addCash === 'function') window._addCash(-amt); else gameState.cash -= amt;
            _notify(`Hai donato ${fmt(amt)} al consorzio.`, 'success');
            if (typeof saveGame === 'function') saveGame();
            if (typeof updateUI === 'function') updateUI();
            window.renderTabConsorzi();
        } catch (e) { _notify(e.message, 'error'); }
    };

    window._alChat = async function () {
        const el = document.getElementById('al-chat-input');
        const msg = (el && el.value || '').trim();
        if (!msg) return;
        el.value = '';
        try { await _rpc('rpc_post_alliance_chat', { p_company_name: cname(), p_message: msg }); }
        catch (e) { _notify(e.message, 'error'); }
    };

    window._alKick = async function (userId) {
        if (!confirm('Espellere questo membro?')) return;
        try { await _rpc('rpc_kick_member', { p_user_id: userId }); window.renderTabConsorzi(); }
        catch (e) { _notify(e.message, 'error'); }
    };

    window._alSetRole = async function (userId, role) {
        try { await _rpc('rpc_set_member_role', { p_user_id: userId, p_role: role }); window.renderTabConsorzi(); }
        catch (e) { _notify(e.message, 'error'); }
    };

    // ── BOTTEGA: attiva un perk dal tesoro (solo leader, server-authoritative)
    window._alPerk = async function (perkId) {
        const def = PERKS.find(p => p.id === perkId); if (!def) return;
        if (!confirm(`Attivare "${def.name}" per ${fmt(def.cost)} dal tesoro?\nDurata ${def.hours}h · buffa TUTTI i membri.`)) return;
        try {
            const until = await _rpc('rpc_activate_alliance_perk', { p_perk: perkId });
            if (until) window._allyActivePerk = { type: perkId, until };
            _notify(`${def.icon} ${def.name} attivato per il consorzio!`, 'success');
            window.renderTabConsorzi();
        } catch (e) { _notify(e.message, 'error'); }
    };

    // Refresh perk in background → il buff si applica anche fuori dalla tab.
    setTimeout(() => { try { window._allyRefreshPerk(); } catch (e) {} }, 5000);
    setInterval(() => { try { window._allyRefreshPerk(); } catch (e) {} }, 180000);
})();
