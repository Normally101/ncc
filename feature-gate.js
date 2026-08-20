'use strict';
/* ============================================================================
   feature-gate.js — rende vero quello che config.js dichiara.

   `window.FEATURES` da solo non spegne niente: e' un elenco di intenzioni.
   Questo file lo fa valere, chiudendo le due strade per cui un giocatore puo'
   arrivare a una parte del gioco:

     1. Le porte visibili — voci di menu, scorciatoie della home. Si nascondono
        con un foglio di stile invece che togliendo i nodi dal documento,
        perche' la barra laterale e la home si ridisegnano piu' volte durante
        la partita: una regola CSS vale anche per i pulsanti che nasceranno
        dopo, un `remove()` no.

     2. La porta di servizio — `switchTab('auctions')` chiamato a mano dalla
        console, da un vecchio segnalibro, o da un pezzo di codice che non sa
        della funzione spenta. Il guardiano sta in `dispatcher.js`, dentro
        `switchTab`, che e' il passaggio obbligato di ogni cambio di schermata.

   Cosa questo file NON copre, e va saputo: le funzioni senza una scheda
   propria (`vtk`, `vip`) vivono dentro schermate accese, quindi vanno spente
   nel punto in cui compaiono, non da qui.
   ============================================================================ */

(function () {
    /** I nomi delle schede da nascondere, secondo gli interruttori di config.js. */
    function schedeSpente() {
        const mappa = window.TAB_DI || {};
        return Object.keys(mappa).filter(tab => window.tabSpenta(tab));
    }

    /**
     * Scrive (o riscrive) la regola che nasconde le porte d'ingresso.
     * Un solo elemento <style>, riusato: chiamarla due volte non accumula nulla.
     */
    function applicaInterruttori() {
        const spente = schedeSpente();

        let foglio = document.getElementById('feature-gate-style');
        if (!foglio) {
            foglio = document.createElement('style');
            foglio.id = 'feature-gate-style';
            document.head.appendChild(foglio);
        }

        if (spente.length === 0) { foglio.textContent = ''; return; }

        /* Due famiglie di selettori per le due forme che ha un punto d'ingresso:
           `data-tab` sulle voci di menu, `data-ce-args` sui riquadri della home
           che chiamano hubNavigate. Le virgolette interne sono doppie perche'
           quelle esterne del selettore CSS sono singole. */
        const selettori = spente.flatMap(tab => [
            `[data-tab="${tab}"]`,
            `[data-ce-args='["${tab}"]']`,
        ]);

        foglio.textContent =
            `/* Nascoste perche' non ancora verificate — vedi config.js */\n` +
            `${selettori.join(',\n')} { display: none !important; }\n`;
    }

    window.applicaInterruttori = applicaInterruttori;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applicaInterruttori);
    } else {
        applicaInterruttori();
    }
})();
