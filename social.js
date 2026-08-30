'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   social.js — Tab "Network": il pezzo che mancava per chiamarlo multiplayer.

   Vlad, 30/08: «una chat generale dove tutti possono parlare tra di loro,
   perché altrimenti non è un vero multiplayer», più i messaggi privati verso
   CHIUNQUE («non per forza c'è bisogno che siano amici») e le amicizie.

   Quattro viste in una scheda sola:
     · Globale   — la piazza. Tabella `global_chat`, RPC rpc_post_global_chat.
     · Consorzio — la chat che esisteva già (`alliance_chat`), portata qui
                   dentro invece di essere sepolta nella scheda Consorzi.
                   Passa dalla STESSA rpc_post_alliance_chat: nessun doppione
                   di regole lato server.
     · Messaggi  — conversazioni private a due. `direct_messages`.
     · Amici     — richieste e amicizie. `friendships`.

   Server: 70_chat_globale_messaggi_amici.sql. Le tabelle si LEGGONO con RLS e
   si SCRIVONO solo via RPC: qui dentro non esiste un solo INSERT diretto.

   L'ascolto dei messaggi in arrivo parte al caricamento e NON quando si apre
   la scheda: un messaggio privato deve accendere il pallino nella barra anche
   se in quel momento stai guardando la flotta.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
    const sb    = () => window.supabaseClient;
    const uid   = () => window.currentUser && window.currentUser.id;
    const esc   = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const _notify = (m, t) => { if (typeof showNotification === 'function') showNotification(m, t || 'info'); };

    const MAX_CHAT   = 60;     // messaggi di chat caricati all'apertura
    const MAX_DM     = 300;    // righe di posta private caricate in un colpo

    const ST = {
        vista: 'globale',        // globale | consorzio | messaggi | amici
        conversazione: null,     // user_id dell'interlocutore aperto (vista messaggi)
        canali: {},              // nome logico -> canale Realtime
        nomi: {},                // user_id -> nome azienda (cache)
        nonLetti: 0,
        richiestePendenti: 0,
        ricerca: [],             // ultimi risultati della ricerca giocatori
    };
    window._ceSocial = ST;       // introspezione dai test e dalla console

    /* ── ORA ────────────────────────────────────────────────────────────── */
    const _ora = iso => {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    };
    const _quando = iso => {
        const d = new Date(iso); if (isNaN(d.getTime())) return '';
        const min = Math.floor((Date.now() - d.getTime()) / 60000);
        if (min < 1) return 'ora';
        if (min < 60) return min + 'm fa';
        if (min < 1440) return Math.floor(min / 60) + 'h fa';
        return Math.floor(min / 1440) + 'g fa';
    };

    /* ── NOMI ───────────────────────────────────────────────────────────────
       I nomi delle aziende stanno in `leaderboard`. Si risolvono in blocco e si
       tengono in cache: una conversazione con dieci interlocutori non deve
       diventare dieci interrogazioni. */
    async function _risolviNomi(ids) {
        const mancanti = [...new Set(ids.filter(x => x && !ST.nomi[x]))];
        if (!mancanti.length) return ST.nomi;
        try {
            const { data } = await sb().from('leaderboard').select('user_id,company_name').in('user_id', mancanti);
            (data || []).forEach(r => { ST.nomi[r.user_id] = r.company_name || 'CEO'; });
        } catch (e) { /* offline: si mostrera' il fallback */ }
        mancanti.forEach(x => { if (!ST.nomi[x]) ST.nomi[x] = 'CEO'; });
        return ST.nomi;
    }
    const _nome = id => ST.nomi[id] || 'CEO';

    async function _rpc(fn, args) {
        const { data, error } = await sb().rpc(fn, args || {});
        if (error) throw new Error(error.message || 'Errore server');
        return data;
    }

    /* ── PALLINO DI NOTIFICA NELLA BARRA ────────────────────────────────── */
    function _aggiornaPallino() {
        const dot = document.getElementById('social-dot');
        if (!dot) return;
        const n = ST.nonLetti + ST.richiestePendenti;
        if (n > 0) { dot.classList.remove('hidden'); dot.textContent = n > 9 ? '9+' : String(n); }
        else dot.classList.add('hidden');
    }

    /* ══════════════════════════════════════════════════════════════════════
       RENDER
       ══════════════════════════════════════════════════════════════════════ */
    window.renderTabSocial = async function () {
        const c = document.getElementById('tab-container'); if (!c) return;
        if (!sb() || !uid()) {
            _staccaTutto();
            c.innerHTML = `<div class="em em-page"><div class="em-wrap"><div class="em-empty" style="margin-top:40px">
                <div style="font-size:34px;margin-bottom:10px">💬</div>
                <div style="font-size:15px;font-weight:800;color:var(--em-ink)">Network non disponibile</div>
                <div style="margin-top:4px">Accedi al tuo account per parlare con gli altri giocatori.</div>
            </div></div></div>`;
            return;
        }
        c.innerHTML = `<div class="em em-page"><div class="em-wrap">${_barra()}
            <div id="social-corpo"><div class="em-empty" style="margin-top:30px">Caricamento…</div></div>
        </div></div>`;
        await _renderCorpo();
    };

    function _barra() {
        const t = (id, label, badge) => {
            const on = ST.vista === id;
            return `<button ${ceAct('_socialVista', [id])} style="
                background:${on ? 'var(--em-row-on)' : 'transparent'};
                border:1px solid ${on ? 'var(--em-gold)' : 'var(--em-line)'};
                color:${on ? 'var(--em-gold)' : 'var(--em-muted)'};
                border-radius:7px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer">
                ${label}${badge ? ` <span style="color:var(--em-red);font-weight:800">${badge}</span>` : ''}
            </button>`;
        };
        return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
            ${t('globale', '🌍 Globale')}
            ${t('consorzio', '🛡️ Consorzio')}
            ${t('messaggi', '✉️ Messaggi', ST.nonLetti || 0)}
            ${t('amici', '🤝 Amici', ST.richiestePendenti || 0)}
        </div>`;
    }

    async function _renderCorpo() {
        const box = document.getElementById('social-corpo'); if (!box) return;
        try {
            if (ST.vista === 'globale')        await _vistaGlobale(box);
            else if (ST.vista === 'consorzio') await _vistaConsorzio(box);
            else if (ST.vista === 'messaggi')  await _vistaMessaggi(box);
            else                               await _vistaAmici(box);
        } catch (e) {
            box.innerHTML = `<div class="em-empty" style="margin-top:30px">Impossibile caricare: ${esc(e.message)}</div>`;
        }
    }

    window._socialVista = async function (v) {
        ST.vista = v;
        if (v !== 'messaggi') ST.conversazione = null;
        const c = document.getElementById('tab-container'); if (!c) return;
        // Si ridisegna tutto: la barra deve mostrare quale vista e' attiva.
        await window.renderTabSocial();
    };

    /* ── riga di chat, condivisa fra globale e consorzio ────────────────── */
    function _rigaChat(m, campoNome) {
        const mio = m.user_id === uid();
        return `<div style="padding:6px 11px;border-top:1px solid var(--em-line2)">
            <span style="font-weight:700;font-size:11px;color:${mio ? 'var(--em-blue)' : 'var(--em-gold)'}">${esc(m[campoNome] || 'CEO')}</span>
            <span style="font-size:9px;color:var(--em-dim);margin-left:4px">${_ora(m.created_at)}</span>
            <span style="font-size:11px;color:var(--em-ink);margin-left:4px">${esc(m.message)}</span>
        </div>`;
    }

    function _scatolaChat(idScroll, righe, idInput, azioneInvio, azioneEnter, segnaposto, testata) {
        return `<div class="em-card" style="display:flex;flex-direction:column;height:460px">
            ${testata || ''}
            <div id="${idScroll}" style="flex:1;overflow-y:auto;min-height:120px">${righe}</div>
            <div style="display:flex;gap:6px;padding:9px 11px;border-top:1px solid var(--em-line2)">
                <input id="${idInput}" maxlength="500" placeholder="${segnaposto}" ${ceAct(azioneEnter, [], 'keydown')}
                    style="flex:1;background:var(--em-bg);border:1px solid var(--em-line);border-radius:7px;padding:8px 10px;font-size:12px;color:var(--em-ink);outline:none">
                <button class="em-bbtn" ${ceAct(azioneInvio, [])}>Invia</button>
            </div>
        </div>`;
    }

    /* ── VISTA: CHAT GLOBALE ────────────────────────────────────────────── */
    async function _vistaGlobale(box) {
        let msg = [];
        try {
            const { data } = await sb().from('global_chat')
                .select('user_id,company_name,message,created_at')
                .order('created_at', { ascending: false }).limit(MAX_CHAT);
            msg = (data || []).reverse();
        } catch (e) { /* si mostra la chat vuota */ }

        const righe = msg.length
            ? msg.map(m => _rigaChat(m, 'company_name')).join('')
            : `<div class="em-empty" style="padding:24px">Nessun messaggio. Rompi il ghiaccio.</div>`;

        box.innerHTML = _scatolaChat('sc-glob-scroll', righe, 'sc-glob-input',
            '_chatGlobaleInvia', 'ceChatGlobaleEnter', 'Scrivi a tutti…',
            `<div style="padding:9px 11px;border-bottom:1px solid var(--em-line2);font-size:11px;color:var(--em-muted)">
                🌍 <b style="color:var(--em-ink)">Chat globale</b> — la leggono tutti i giocatori collegati.
            </div>`);

        const sc = document.getElementById('sc-glob-scroll'); if (sc) sc.scrollTop = sc.scrollHeight;
        _ascoltaGlobale();
    }

    window._chatGlobaleInvia = async function () {
        const el = document.getElementById('sc-glob-input');
        const msg = (el && el.value || '').trim();
        if (!msg) return;
        el.value = '';
        try { await _rpc('rpc_post_global_chat', { p_message: msg }); }
        catch (e) { _notify(e.message, 'error'); }
    };

    /* ── VISTA: CHAT DI CONSORZIO ───────────────────────────────────────────
       Stessa tabella e stessa RPC della scheda Consorzi. Qui c'e' solo la
       chat: gestione membri, perk e donazioni restano di la'. */
    async function _vistaConsorzio(box) {
        let mem = null;
        try {
            const { data } = await sb().from('alliance_members').select('alliance_id').eq('user_id', uid()).maybeSingle();
            mem = data || null;
        } catch (e) { mem = null; }

        if (!mem || !mem.alliance_id) {
            box.innerHTML = `<div class="em-card" style="padding:24px;text-align:center">
                <div style="font-size:30px;margin-bottom:8px">🛡️</div>
                <div style="font-size:13px;font-weight:800;color:var(--em-ink)">Non sei in un consorzio</div>
                <div style="font-size:11px;color:var(--em-muted);margin:6px 0 12px">La chat di consorzio è riservata ai membri.</div>
                <button class="em-bbtn" ${ceAct('switchTab', ['consorzi'])}>Vai ai Consorzi</button>
            </div>`;
            return;
        }

        let msg = [];
        try {
            const { data } = await sb().from('alliance_chat')
                .select('user_id,company_name,message,created_at')
                .eq('alliance_id', mem.alliance_id)
                .order('created_at', { ascending: false }).limit(MAX_CHAT);
            msg = (data || []).reverse();
        } catch (e) { /* chat vuota */ }

        const righe = msg.length
            ? msg.map(m => _rigaChat(m, 'company_name')).join('')
            : `<div class="em-empty" style="padding:24px">Nessun messaggio nel consorzio.</div>`;

        box.innerHTML = _scatolaChat('sc-cons-scroll', righe, 'sc-cons-input',
            '_chatConsorzioInvia', 'ceChatConsorzioEnter', 'Scrivi al consorzio…',
            `<div style="padding:9px 11px;border-bottom:1px solid var(--em-line2);font-size:11px;color:var(--em-muted)">
                🛡️ <b style="color:var(--em-ink)">Chat del consorzio</b> — la leggono solo i tuoi soci.
            </div>`);

        const sc = document.getElementById('sc-cons-scroll'); if (sc) sc.scrollTop = sc.scrollHeight;
        _ascoltaConsorzio(mem.alliance_id);
    }

    window._chatConsorzioInvia = async function () {
        const el = document.getElementById('sc-cons-input');
        const msg = (el && el.value || '').trim();
        if (!msg) return;
        el.value = '';
        const cname = (window.gameState && gameState.companyName) || 'Chauffeur Empire';
        try { await _rpc('rpc_post_alliance_chat', { p_company_name: cname, p_message: msg }); }
        catch (e) { _notify(e.message, 'error'); }
    };

    /* ── VISTA: MESSAGGI PRIVATI ────────────────────────────────────────── */
    async function _caricaPosta() {
        const me = uid();
        const { data } = await sb().from('direct_messages')
            .select('id,sender_id,sender_name,recipient_id,message,created_at,read_at')
            .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
            .order('created_at', { ascending: false }).limit(MAX_DM);
        return data || [];
    }

    // Raggruppa la posta per interlocutore: l'elenco delle conversazioni non
    // esiste come tabella, e' una vista sui messaggi.
    function _perInterlocutore(posta) {
        const me = uid(), conv = new Map();
        posta.forEach(m => {
            const altro = m.sender_id === me ? m.recipient_id : m.sender_id;
            if (!conv.has(altro)) conv.set(altro, { altro, messaggi: [], nonLetti: 0, ultimo: m });
            const c = conv.get(altro);
            c.messaggi.push(m);
            if (m.recipient_id === me && !m.read_at) c.nonLetti++;
        });
        conv.forEach(c => c.messaggi.reverse());   // dal piu' vecchio al piu' recente
        return [...conv.values()];
    }

    async function _vistaMessaggi(box) {
        const posta = await _caricaPosta();
        const conv  = _perInterlocutore(posta);
        await _risolviNomi(conv.map(c => c.altro));

        ST.nonLetti = conv.reduce((s, c) => s + c.nonLetti, 0);
        _aggiornaPallino();

        if (ST.conversazione) { await _vistaConversazione(box, conv); return; }

        const righe = conv.length ? conv.map(c => `
            <div ${ceAct('_dmApri', [c.altro])} style="display:flex;align-items:center;gap:8px;padding:9px 11px;
                border-top:1px solid var(--em-line2);cursor:pointer">
                <div style="flex:1;min-width:0">
                    <div style="font-size:11px;font-weight:700;color:var(--em-ink)">${esc(_nome(c.altro))}
                        ${c.nonLetti ? `<span style="background:var(--em-red);color:#fff;border-radius:9px;padding:1px 6px;font-size:9px;margin-left:5px">${c.nonLetti}</span>` : ''}
                    </div>
                    <div style="font-size:10px;color:var(--em-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                        ${c.ultimo.sender_id === uid() ? 'Tu: ' : ''}${esc(c.ultimo.message)}
                    </div>
                </div>
                <div style="font-size:9px;color:var(--em-dim)">${_quando(c.ultimo.created_at)}</div>
            </div>`).join('')
            : `<div class="em-empty" style="padding:24px">Nessuna conversazione. Cerca un giocatore qui sotto.</div>`;

        box.innerHTML = `
            <div class="em-card" style="margin-bottom:10px">
                <div style="padding:9px 11px;border-bottom:1px solid var(--em-line2);font-size:11px;color:var(--em-muted)">
                    ✉️ <b style="color:var(--em-ink)">Messaggi privati</b> — puoi scrivere a chiunque, non serve essere amici.
                </div>
                ${righe}
            </div>
            ${_ricercaGiocatori('Scrivi a un giocatore')}`;
    }

    async function _vistaConversazione(box, conv) {
        const altro = ST.conversazione;
        const c = conv.find(x => x.altro === altro) || { altro, messaggi: [] };
        await _risolviNomi([altro]);

        if (c.nonLetti) {
            try { await _rpc('rpc_mark_dm_read', { p_other: altro }); ST.nonLetti -= c.nonLetti; _aggiornaPallino(); }
            catch (e) { /* poco male: restano da leggere */ }
        }

        const righe = c.messaggi.length ? c.messaggi.map(m => {
            const mio = m.sender_id === uid();
            return `<div style="padding:6px 11px;border-top:1px solid var(--em-line2);text-align:${mio ? 'right' : 'left'}">
                <div style="display:inline-block;max-width:80%;text-align:left;background:${mio ? 'var(--em-blue-soft)' : 'var(--em-row-on)'};
                    border:1px solid ${mio ? 'var(--em-blue-edge)' : 'var(--em-line)'};border-radius:8px;padding:6px 9px">
                    <div style="font-size:11px;color:var(--em-ink)">${esc(m.message)}</div>
                    <div style="font-size:9px;color:var(--em-dim);margin-top:2px">${_ora(m.created_at)}</div>
                </div>
            </div>`;
        }).join('') : `<div class="em-empty" style="padding:24px">Nessun messaggio. Scrivi tu per primo.</div>`;

        box.innerHTML = _scatolaChat('sc-dm-scroll', righe, 'sc-dm-input',
            '_dmInvia', 'ceDmEnter', 'Scrivi un messaggio…',
            `<div style="display:flex;align-items:center;gap:8px;padding:9px 11px;border-bottom:1px solid var(--em-line2)">
                <button ${ceAct('_dmChiudi', [])} style="background:transparent;border:1px solid var(--em-line);color:var(--em-muted);
                    border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer">‹ Indietro</button>
                <span style="font-size:11px;font-weight:800;color:var(--em-ink)">${esc(_nome(altro))}</span>
                <span style="flex:1"></span>
                <button ${ceAct('_amicoRichiedi', [altro])} style="background:transparent;border:1px solid var(--em-line);
                    color:var(--em-gold);border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer">＋ Amico</button>
            </div>`);

        const sc = document.getElementById('sc-dm-scroll'); if (sc) sc.scrollTop = sc.scrollHeight;
    }

    /* Si arriva qui anche dalla classifica, dove la scheda aperta e' un'altra:
       in quel caso serve un vero cambio di scheda, se no il Network comparirebbe
       dentro il pannello sbagliato con il titolo sbagliato. */
    window._dmApri = async function (userId) {
        ST.vista = 'messaggi';
        ST.conversazione = userId;
        const suSocial = document.getElementById('social-corpo');
        if (!suSocial && typeof window.switchTab === 'function') { window.switchTab('social'); return; }
        await window.renderTabSocial();
    };
    window._dmChiudi = async function () {
        ST.conversazione = null;
        await _renderCorpo();
    };
    window._dmInvia = async function () {
        const el = document.getElementById('sc-dm-input');
        const msg = (el && el.value || '').trim();
        if (!msg || !ST.conversazione) return;
        el.value = '';
        try { await _rpc('rpc_send_direct_message', { p_recipient: ST.conversazione, p_message: msg }); await _renderCorpo(); }
        catch (e) { _notify(e.message, 'error'); }
    };

    /* ── VISTA: AMICI ───────────────────────────────────────────────────── */
    async function _caricaAmicizie() {
        const me = uid();
        const { data } = await sb().from('friendships')
            .select('id,requester_id,addressee_id,status,created_at')
            .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
        return data || [];
    }

    async function _vistaAmici(box) {
        const me = uid();
        const righe = await _caricaAmicizie();
        await _risolviNomi(righe.flatMap(r => [r.requester_id, r.addressee_id]));

        const amici    = righe.filter(r => r.status === 'accepted');
        const ricevute = righe.filter(r => r.status === 'pending' && r.addressee_id === me);
        const inviate  = righe.filter(r => r.status === 'pending' && r.requester_id === me);

        ST.richiestePendenti = ricevute.length;
        _aggiornaPallino();

        const altro = r => (r.requester_id === me ? r.addressee_id : r.requester_id);
        const bottoncino = (azione, args, testo, colore) =>
            `<button ${ceAct(azione, args)} style="background:transparent;border:1px solid var(--em-line);
                color:${colore};border-radius:6px;padding:3px 8px;font-size:10px;font-weight:700;cursor:pointer">${testo}</button>`;

        const sezione = (titolo, corpo) => `<div class="em-card" style="margin-bottom:10px">
            <div style="padding:9px 11px;border-bottom:1px solid var(--em-line2);font-size:11px;font-weight:800;color:var(--em-ink)">${titolo}</div>
            ${corpo}</div>`;

        const rigaP = (nome, bottoni) => `<div style="display:flex;align-items:center;gap:8px;padding:8px 11px;border-top:1px solid var(--em-line2)">
            <span style="flex:1;font-size:11px;color:var(--em-ink)">${esc(nome)}</span>${bottoni}</div>`;

        let html = '';
        if (ricevute.length) {
            html += sezione(`Richieste ricevute (${ricevute.length})`, ricevute.map(r => rigaP(_nome(r.requester_id),
                bottoncino('_amicoRispondi', [r.id, true], 'Accetta', 'var(--em-green)') + ' ' +
                bottoncino('_amicoRispondi', [r.id, false], 'Rifiuta', 'var(--em-red)'))).join(''));
        }
        html += sezione(`I miei amici (${amici.length})`, amici.length
            ? amici.map(r => rigaP(_nome(altro(r)),
                bottoncino('_dmApri', [altro(r)], '✉️ Messaggio', 'var(--em-blue)') + ' ' +
                bottoncino('_amicoRimuovi', [altro(r)], 'Rimuovi', 'var(--em-dim)'))).join('')
            : `<div class="em-empty" style="padding:20px">Ancora nessun amico. Cercane uno qui sotto.</div>`);
        if (inviate.length) {
            html += sezione(`Richieste inviate (${inviate.length})`, inviate.map(r => rigaP(_nome(r.addressee_id),
                `<span style="font-size:10px;color:var(--em-dim)">In attesa</span> ` +
                bottoncino('_amicoRimuovi', [r.addressee_id], 'Annulla', 'var(--em-dim)'))).join(''));
        }
        html += _ricercaGiocatori('Cerca un giocatore');

        box.innerHTML = html;
    }

    window._amicoRichiedi = async function (userId) {
        try {
            const esito = await _rpc('rpc_send_friend_request', { p_user_id: userId });
            _notify(esito === 'accettata' ? 'Richiesta accettata: ora siete amici.'
                  : esito === 'gia_amici'  ? 'Siete già amici.'
                  : esito === 'gia_inviata' ? 'Richiesta già inviata, aspetta la risposta.'
                  : 'Richiesta di amicizia inviata.', esito === 'inviata' || esito === 'accettata' ? 'success' : 'info');
            await _renderCorpo();
        } catch (e) { _notify(e.message, 'error'); }
    };
    window._amicoRispondi = async function (id, accetta) {
        try {
            await _rpc('rpc_respond_friend_request', { p_request_id: id, p_accept: !!accetta });
            _notify(accetta ? 'Amicizia accettata.' : 'Richiesta rifiutata.', accetta ? 'success' : 'info');
            await _renderCorpo();
        } catch (e) { _notify(e.message, 'error'); }
    };
    window._amicoRimuovi = async function (userId) {
        try { await _rpc('rpc_remove_friend', { p_user_id: userId }); await _renderCorpo(); }
        catch (e) { _notify(e.message, 'error'); }
    };

    /* ── RICERCA GIOCATORI ──────────────────────────────────────────────────
       Un giocatore si trova per nome azienda. Serve sia per scrivere a
       chiunque sia per chiedere l'amicizia: e' lo stesso pannello. */
    function _ricercaGiocatori(titolo) {
        const risultati = ST.ricerca.length ? ST.ricerca.map(r => `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 11px;border-top:1px solid var(--em-line2)">
                <span style="flex:1;font-size:11px;color:var(--em-ink)">${esc(r.company_name || 'CEO')}</span>
                <button ${ceAct('_dmApri', [r.user_id])} style="background:transparent;border:1px solid var(--em-line);
                    color:var(--em-blue);border-radius:6px;padding:3px 8px;font-size:10px;font-weight:700;cursor:pointer">✉️ Scrivi</button>
                <button ${ceAct('_amicoRichiedi', [r.user_id])} style="background:transparent;border:1px solid var(--em-line);
                    color:var(--em-gold);border-radius:6px;padding:3px 8px;font-size:10px;font-weight:700;cursor:pointer">＋ Amico</button>
            </div>`).join('') : '';

        return `<div class="em-card">
            <div style="padding:9px 11px;border-bottom:1px solid var(--em-line2);font-size:11px;font-weight:800;color:var(--em-ink)">${esc(titolo)}</div>
            <div style="display:flex;gap:6px;padding:9px 11px">
                <input id="sc-cerca" maxlength="40" placeholder="Nome azienda…" ${ceAct('ceCercaGiocatoriEnter', [], 'keydown')}
                    style="flex:1;background:var(--em-bg);border:1px solid var(--em-line);border-radius:7px;padding:8px 10px;font-size:12px;color:var(--em-ink);outline:none">
                <button class="em-bbtn" ${ceAct('_cercaGiocatori', [])}>Cerca</button>
            </div>
            ${risultati}
        </div>`;
    }

    window._cercaGiocatori = async function () {
        const el = document.getElementById('sc-cerca');
        const q = (el && el.value || '').trim();
        if (q.length < 2) { _notify('Scrivi almeno due lettere del nome azienda.', 'info'); return; }
        try {
            // `%` e `_` sono jolly di ILIKE: se non si neutralizzano, una ricerca
            // con "%" restituisce l'intera classifica.
            const q2 = q.replace(/[%_]/g, m => '\\' + m);
            const { data } = await sb().from('leaderboard')
                .select('user_id,company_name').ilike('company_name', `%${q2}%`).limit(20);
            ST.ricerca = (data || []).filter(r => r.user_id !== uid());
            (data || []).forEach(r => { ST.nomi[r.user_id] = r.company_name || 'CEO'; });
            if (!ST.ricerca.length) _notify('Nessun giocatore con questo nome.', 'info');
            await _renderCorpo();
        } catch (e) { _notify(e.message, 'error'); }
    };

    /* ══════════════════════════════════════════════════════════════════════
       REALTIME
       ══════════════════════════════════════════════════════════════════════ */
    function _stacca(nome) {
        try { if (ST.canali[nome]) sb().removeChannel(ST.canali[nome]); } catch (e) { /* ok */ }
        ST.canali[nome] = null;
    }
    function _staccaTutto() { Object.keys(ST.canali).forEach(_stacca); }

    function _appendi(idScroll, html) {
        const sc = document.getElementById(idScroll); if (!sc) return;
        const vuoto = sc.querySelector('.em-empty'); if (vuoto) sc.innerHTML = '';
        const d = document.createElement('div');
        d.innerHTML = html;
        while (d.firstChild) sc.appendChild(d.firstChild);
        sc.scrollTop = sc.scrollHeight;
    }

    function _ascoltaGlobale() {
        if (ST.canali.globale) return;
        try {
            ST.canali.globale = sb().channel('ce_chat_globale')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_chat' }, p => {
                    const m = p && p.new; if (!m) return;
                    _appendi('sc-glob-scroll', _rigaChat(m, 'company_name'));
                })
                .subscribe();
        } catch (e) { /* offline */ }
    }

    function _ascoltaConsorzio(aid) {
        if (ST.canali.consorzio && ST.canali._aid === aid) return;
        _stacca('consorzio');
        ST.canali._aid = aid;
        try {
            ST.canali.consorzio = sb().channel('ce_chat_cons_' + aid)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alliance_chat', filter: 'alliance_id=eq.' + aid }, p => {
                    const m = p && p.new; if (!m) return;
                    _appendi('sc-cons-scroll', _rigaChat(m, 'company_name'));
                })
                .subscribe();
        } catch (e) { /* offline */ }
    }

    /* La posta e le amicizie si ascoltano SEMPRE, non solo dentro la scheda:
       e' quello che accende il pallino mentre stai facendo altro. */
    window.socialAvviaAscolto = function () {
        if (!sb() || !uid() || ST.canali.posta) return;
        const me = uid();
        try {
            ST.canali.posta = sb().channel('ce_posta_' + me)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: 'recipient_id=eq.' + me }, p => {
                    const m = p && p.new; if (!m) return;
                    ST.nonLetti++;
                    _aggiornaPallino();
                    _notify(`✉️ Messaggio da ${esc(m.sender_name || 'un giocatore')}`, 'info');
                    // Se la conversazione con quel giocatore e' aperta, il messaggio
                    // deve comparire subito invece di aspettare un ridisegno.
                    if (ST.vista === 'messaggi') _renderCorpo();
                })
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friendships', filter: 'addressee_id=eq.' + me }, () => {
                    ST.richiestePendenti++;
                    _aggiornaPallino();
                    _notify('🤝 Hai una nuova richiesta di amicizia.', 'info');
                })
                .subscribe();
        } catch (e) { /* offline */ }
    };

    /* Conteggio iniziale: senza, il pallino resta spento finche' non arriva un
       messaggio nuovo, e la posta arretrata sembra non esistere. */
    window.socialContaArretrati = async function () {
        if (!sb() || !uid()) return;
        const me = uid();
        try {
            const dm = await sb().from('direct_messages').select('id', { count: 'exact', head: true })
                .eq('recipient_id', me).is('read_at', null);
            ST.nonLetti = dm && typeof dm.count === 'number' ? dm.count : ST.nonLetti;
            const fr = await sb().from('friendships').select('id', { count: 'exact', head: true })
                .eq('addressee_id', me).eq('status', 'pending');
            ST.richiestePendenti = fr && typeof fr.count === 'number' ? fr.count : ST.richiestePendenti;
            _aggiornaPallino();
        } catch (e) { /* offline */ }
    };

    // Stesso schema di alliances.js: si parte qualche secondo dopo il boot,
    // quando l'autenticazione ha avuto il tempo di risolversi.
    setTimeout(() => {
        try { window.socialAvviaAscolto(); window.socialContaArretrati(); } catch (e) { /* ok */ }
    }, 6000);
    setInterval(() => {
        try { window.socialAvviaAscolto(); } catch (e) { /* ok */ }
    }, 120000);
})();
