'use strict';
/* ================================================================
   money.js — l'UNICA porta legale per muovere valuta.

   Perche' esiste: prima di questo file il saldo si muoveva in cinque modi
   diversi (`gameState.cash -=` diretto, `_addCash()`, `syncCash()`, le RPC
   dedicate, e il pattern `if (!isReady()) cash -=`). Cinque convenzioni =
   cinque modi di sbagliare, e infatti 19 azioni scalavano soldi senza mai
   dirlo al server. Il valore autoritativo del server vince al caricamento
   (serverState.js:207-210), quindi ogni spesa non sincronizzata veniva
   RIMBORSATA al ricaricamento mentre l'oggetto comprato restava: acquisti
   gratis, non semplici disallineamenti.

   Il divieto di scavalcare questo file e' sorvegliato da
   test/guardrail/una-sola-porta.test.js, non dalla buona volonta'.

   Caricato subito dopo serverState.js e prima di ogni file di gioco.
   ================================================================ */

var CE_money = (function () {

    function _gs() { return window.gameState; }

    function _avvisa(messaggio, tipo) {
        if (typeof showNotification === 'function') showNotification(messaggio, tipo || 'error');
    }

    /* ── CASSA ────────────────────────────────────────────────────────────
       `cash` viaggia in OVERWRITE dal server (serverState.js:207): il saldo
       locale e' una previsione, `rpc_sync_cash` la rende vera. Senza la
       sincronizzazione la previsione viene semplicemente scartata. */

    function _sincronizzaCassa() {
        var SS = window.ServerState;
        if (!SS || typeof SS.syncCash !== 'function') return;
        try { SS.syncCash(_gs().cash).catch(function () {}); } catch (e) {}
    }

    /**
     * Scala denaro e lo comunica al server.
     * @returns {boolean} false se i fondi non bastano — in quel caso NULLA viene toccato.
     */
    function spend(importo, motivo) {
        var gs = _gs();
        if (!Number.isFinite(importo) || importo < 0) return false;
        if ((gs.cash || 0) < importo) {
            _avvisa('Fondi insufficienti! Servono €' + Math.round(importo).toLocaleString('it-IT'));
            return false;
        }
        gs.cash -= importo;
        _sincronizzaCassa();
        return true;
    }

    /** Accredita denaro e lo comunica al server. */
    function earn(importo, motivo) {
        var gs = _gs();
        if (!Number.isFinite(importo)) return false;
        gs.cash = (gs.cash || 0) + importo;
        _sincronizzaCassa();
        return true;
    }

    /**
     * Allinea il saldo locale a un accredito che il SERVER ha gia' fatto.
     *
     * Serve quando il denaro si muove dentro una RPC (le aste giudiziarie sono
     * il primo caso): li' la colonna `companies.cash` e' gia' aggiornata, e
     * chiamare `earn` rispedirebbe indietro il totale calcolato dal browser —
     * cioe' farebbe decidere al client una cifra che il server aveva gia'
     * deciso da solo. Qui si aggiorna solo la previsione locale, che cosi'
     * torna a coincidere con la verita' senza mai sovrascriverla.
     *
     * @returns {boolean} false se l'importo non e' un numero utilizzabile.
     */
    function accreditatoDalServer(importo, motivo) {
        var gs = _gs();
        if (!Number.isFinite(importo) || importo <= 0) return false;
        gs.cash = (gs.cash || 0) + importo;
        return true;
    }

    /**
     * Allinea il saldo locale a un addebito che il SERVER ha gia' fatto.
     *
     * Serve quando il denaro si muove dentro una RPC: li' la colonna
     * `companies.cash` e' gia' aggiornata, e chiamare `spend` rispedirebbe
     * indietro il totale calcolato dal browser — rischiando di raddoppiare
     * l'addebito se arriva prima l'eco Realtime o di sovrascrivere il server.
     * Qui si aggiorna solo la previsione locale senza risincronizzare.
     *
     * @returns {boolean} false se l'importo non e' un numero utilizzabile.
     */
    function addebitatoDalServer(importo, motivo) {
        var gs = _gs();
        if (!Number.isFinite(importo) || importo <= 0) return false;
        gs.cash = (gs.cash || 0) - importo;
        return true;
    }

    /* ── DRIVER COINS ─────────────────────────────────────────────────────
       I DC sono la valuta premium: si comprano con soldi veri. Anche loro
       arrivano in OVERWRITE (serverState.js:209), quindi una spesa solo
       locale torna indietro al primo evento Realtime lasciando l'effetto
       comprato -> booster gratis, ripetibile. La sola via corretta e' la RPC
       `spendDriverCoins`, che scrive sulla colonna autoritativa e RESTITUISCE
       il saldo vero con cui riallineare il locale.
       Modello: vanity.js:125 `_spend`, l'unico posto che lo faceva giusto. */

    /* Il server ha RIFIUTATO una spesa DC: annulla l'addebito fatto in locale
       in attesa della risposta e avvisa il giocatore. Serve perche' il chiamante
       applica subito l'effetto comprato su `true`: se il saldo restasse scalato,
       la spesa rifiutata diventerebbe un oggetto regalato con saldo falsato.
       La ricostruzione locale viene sostituita dal saldo che il server dichiara,
       quando ServerState riesce a dirlo (getCompany).
       SOLO per la spesa: earnDC non deve annullare il credito qui, perche' i
       suoi chiamanti con rollback proprio (daily-orders.js claimDailyOrder)
       lo disfarebbero una seconda volta. */
    function _annullaMovimentoDC(deltaDaAnnullare) {
        var gs = _gs();
        gs.driverCoins = (gs.driverCoins || 0) + deltaDaAnnullare;
        var azienda = window.ServerState && typeof window.ServerState.getCompany === 'function'
            ? window.ServerState.getCompany() : null;
        if (azienda && azienda.driver_coins != null) gs.driverCoins = azienda.driver_coins;
        _avvisa('Operazione non andata a buon fine. Riprova più tardi.');
        if (typeof updateUI === 'function') updateUI();
    }

    /**
     * Spende Driver Coins tramite la RPC dedicata.
     * Se il server rifiuta la spesa, l'addebito locale viene annullato e il
     * giocatore avvisato.
     * @returns {boolean} false se i coin non bastano — in quel caso NULLA viene toccato.
     */
    function spendDC(quantita, motivo) {
        var gs = _gs();
        if (!Number.isFinite(quantita) || quantita < 0) return false;
        if ((gs.driverCoins || 0) < quantita) {
            _avvisa('Servono ' + quantita + ' DC — acquistali nell\'Executive Club.');
            if (typeof switchTab === 'function') switchTab('store');
            return false;
        }
        gs.driverCoins -= quantita;
        try {
            var p = window.ServerState && window.ServerState.spendDriverCoins
                ? window.ServerState.spendDriverCoins(motivo || 'acquisto', quantita)
                : null;
            if (p && typeof p.then === 'function') {
                p.then(function (r) {
                    // Il server e' l'autorita': riallinea sul valore che ci ritorna.
                    if (r && r.driver_coins != null) {
                        gs.driverCoins = r.driver_coins;
                        if (typeof updateUI === 'function') updateUI();
                    } else if (!r) {
                        // Un null NON e' un successo senza saldo: e' un rifiuto.
                        // Il vero serverState (_rpc) non rigetta mai: trasforma
                        // l'errore della RPC in null, quindi il .catch qui sotto
                        // non scatterebbe — va gestito anche questa forma.
                        _annullaMovimentoDC(quantita);
                    }
                }).catch(function () {
                    _annullaMovimentoDC(quantita);
                });
            }
        } catch (e) {}
        return true;
    }

    /** Accredita Driver Coins tramite la RPC dedicata. */
    function earnDC(quantita, motivo) {
        var gs = _gs();
        if (!Number.isFinite(quantita) || quantita < 0) return false;
        gs.driverCoins = (gs.driverCoins || 0) + quantita;
        try {
            var p = window.ServerState && window.ServerState.addDriverCoins
                ? window.ServerState.addDriverCoins(quantita, motivo || 'premio')
                : null;
            if (p && typeof p.then === 'function') {
                p.then(function (r) {
                    if (r && r.driver_coins != null) {
                        gs.driverCoins = r.driver_coins;
                        if (typeof updateUI === 'function') updateUI();
                    }
                }).catch(function () {
                    _avvisa('Operazione non andata a buon fine. Riprova più tardi.');
                });
            }
        } catch (e) {}
        return true;
    }

    /**
     * Allinea il saldo locale a un accredito DC che il SERVER ha gia' fatto.
     *
     * Via obbligata per i pacchetti Executive Club: la RPC dedicata
     * `rpc_purchase_dc_pack` accredita lei i coin e restituisce il saldo vero.
     * Il client qui si limita a registrare la verita' — non ne decide l'importo,
     * e non passa da earnDC perche' quello rifarebbe una seconda RPC
     * (rpc_add_driver_coins) accreditando due volte.
     *
     * @returns {boolean} false se il saldo dichiarato non e' utilizzabile.
     */
    function dcAccreditatiDalServer(saldoAutoritativo) {
        var gs = _gs();
        if (!Number.isFinite(saldoAutoritativo) || saldoAutoritativo < 0) return false;
        gs.driverCoins = saldoAutoritativo;
        if (typeof updateUI === 'function') updateUI();
        return true;
    }

    /* ── ACQUISTO A LISTINO SERVER ─────────────────────────────────────────
       La forma di Vlad (hub 22/08/2026): il browser dice «voglio comprare X»,
       il server legge il prezzo dalla tabella purchase_prices, controlla il
       saldo con la riga in lock, scala LUI e RESTITUISCE il saldo nuovo.
       Qui non si calcola nessun prezzo e non si controlla nessun saldo
       locale: entrambe le decisioni sono del server. Il client si limita a
       scrivere la verita' che gli torna indietro.
       RPC: rpc_purchase (66_server_priced_purchases.sql).
       Modello client: spendDC sopra, ma senza l'addebito preventivo. */

    /**
     * Chiede al server l'acquisto di un articolo a listino e registra il saldo
     * restituito. NON calcola il costo (arriva dal server) e NON verifica i
     * fondi in locale (li verifica il server): un rifiuto arriva come `null`.
     *
     * @param {string} valuta   'cash' | 'driver_coins'
     * @param {string} articolo id nel listino `purchase_prices` (es. 'executive_pass')
     * @param {number} [quantita] quante unita' (default 1); per gli articoli
     *                          "a quantita'" il costo e' unit_price * quantita'.
     * @returns {Promise<Object|null>} l'esito {spent, balance,...} se il server ha
     *          accettato; null se ha rifiutato (fondi insufficienti, articolo
     *          sconosciuto, offline) — in quel caso NULLA viene toccato.
     */
    function acquistoDalListino(valuta, articolo, quantita) {
        var gs = _gs();
        var SS = window.ServerState;
        if (!SS || typeof SS.purchaseItem !== 'function') {
            return Promise.resolve(null);
        }
        return SS.purchaseItem(valuta, articolo, quantita).then(function (r) {
            // Un esito senza saldo non e' un successo: e' un rifiuto da non applicare.
            if (!r || typeof r.balance !== 'number') return null;
            if (valuta === 'cash') gs.cash = r.balance;
            else gs.driverCoins = r.balance;
            if (typeof updateUI === 'function') updateUI();
            return r;
        }).catch(function () {
            _avvisa('Operazione non andata a buon fine. Riprova più tardi.');
            return null;
        });
    }

    /* ── REPUTAZIONE ──────────────────────────────────────────────────────
       Il tetto e' `5.0 + prestige`, non `5`: copiato a mano ~22 volte nel
       codice e gia' sbagliato in daily-orders.js:157, dove chi ha fatto
       prestigio non guadagnava piu' reputazione. Qui sta una volta sola. */

    /* Unico posto dove esiste la formula del tetto: addReputation la usa per
       scrivere, i flussi con stato di prova (dry-run di vtkBuyShopItem) la
       chiamano direttamente perche' sono PURA — non toccano nulla. */
    function reputazioneDopo(gs, delta) {
        var tetto = 5.0 + (gs.prestige || 0);
        return Math.max(0, Math.min(tetto, (gs.reputation || 0) + delta));
    }

    function addReputation(delta) {
        var gs = _gs();
        if (!Number.isFinite(delta)) return false;
        gs.reputation = reputazioneDopo(gs, delta);
        return true;
    }

    return {
        spend: spend, earn: earn, spendDC: spendDC, earnDC: earnDC,
        addReputation: addReputation, reputazioneDopo: reputazioneDopo,
        accreditatoDalServer: accreditatoDalServer,
        addebitatoDalServer: addebitatoDalServer,
        dcAccreditatiDalServer: dcAccreditatiDalServer,
        acquistoDalListino: acquistoDalListino,
    };
})();

window.CE_money = CE_money;
