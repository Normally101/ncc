/* ============================================================================
   api/dc-checkout.mjs — Chauffeur Empire
   Apre una sessione di pagamento Stripe per un pacchetto di Driver Coins.

   QUESTA FUNZIONE NON ACCREDITA NIENTE. Apre soltanto la cassa. L'accredito
   avviene in `dc-webhook.mjs`, e solo dopo che Stripe ha confermato l'incasso.
   Sono due funzioni separate apposta: se fossero una sola, chiunque sapesse
   chiamare l'endpoint avrebbe i Driver Coins gratis, che e' esattamente il
   difetto che stiamo chiudendo.

   Due cose non arrivano MAI dal browser, e sono le due che contano:
     - il PREZZO   → letto dalla tabella `dc_packs`
     - i COIN      → idem
   Dal browser arriva solo quale pacchetto vuole, ed e' una stringa che deve
   esistere nel catalogo. Chi manda `{pack:'starter', price:1}` ottiene il
   prezzo di listino dello starter, perche' il campo `price` non viene letto.

   FIRMA `(req, res)`, NON `(Request) => Response`. La prima stesura usava
   l'API Web, e sul deploy del 29/08/2026 la funzione restava appesa fino al
   timeout su OGNI chiamata: Vercel la invocava con gli oggetti di Node, quindi
   `req.headers.get(...)` lanciava un TypeError e `res.end()` non veniva mai
   raggiunto. Il sintomo era ingannevole — nessun 404, nessun 500, solo silenzio
   — perche' una funzione che lancia prima di rispondere non chiude la
   connessione. Se un giorno si torna all'API Web, va verificato dal vivo con
   una chiamata reale: i test non vedono questa differenza.

   NESSUNA DIPENDENZA npm: `fetch` e `node:crypto` bastano, e su un progetto
   senza bundler ogni pacchetto in piu' e' superficie da aggiornare per sempre.

   VARIABILI D'AMBIENTE (Vercel → Settings → Environment Variables):
     STRIPE_SECRET_KEY           sk_live_… (o sk_test_… per provare)
     SUPABASE_URL                https://twstjbykstaioaahfqbe.supabase.co
     SUPABASE_SERVICE_ROLE_KEY   la chiave service_role (MAI nel repo)
     SITE_URL                    https://www.chauffeurempire.com
   ============================================================================ */

function rispondi(res, stato, dati) {
    res.statusCode = stato;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(dati));
}

/** Il corpo della richiesta, comunque Vercel ce lo consegni. */
async function leggiCorpo(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
    try {
        const pezzi = [];
        for await (const p of req) pezzi.push(p);
        if (!pezzi.length) return {};
        return JSON.parse(Buffer.concat(pezzi).toString('utf8'));
    } catch { return {}; }
}

export default async function handler(req, res) {
    /* Qualunque cosa vada storta, si risponde. Una funzione di pagamento che
       resta in silenzio e' peggio di una che sbaglia: il giocatore aspetta
       davanti a un pulsante che non fa niente e non sa se ha pagato. */
    try {
        if (req.method !== 'POST') return rispondi(res, 405, { ok: false, reason: 'metodo_non_ammesso' });

        const SK     = process.env.STRIPE_SECRET_KEY;
        const SB_URL = process.env.SUPABASE_URL;
        const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const SITE   = process.env.SITE_URL || 'https://www.chauffeurempire.com';

        /* Se il negozio non e' ancora configurato lo diciamo con parole nostre.
           Un 500 generico farebbe pensare a un guasto, e il giocatore
           riproverebbe. */
        if (!SK || !SB_URL || !SB_KEY) {
            return rispondi(res, 503, { ok: false, reason: 'pagamenti_non_configurati',
                messaggio: 'Il negozio non è ancora attivo. Nessun addebito è stato fatto.' });
        }

        // ── 1. CHI SEI ──────────────────────────────────────────────────────
        // Il token lo verifica Supabase, non noi: e' l'unica prova che l'utente
        // sia chi dice di essere. Senza questo passo si potrebbero far
        // accreditare i coin a un account altrui — o farsi pagare da un altro.
        const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
        if (!token) return rispondi(res, 401, { ok: false, reason: 'non_autenticato' });

        let utente;
        try {
            const r = await fetch(`${SB_URL}/auth/v1/user`, {
                headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
            });
            if (!r.ok) return rispondi(res, 401, { ok: false, reason: 'sessione_non_valida' });
            utente = await r.json();
        } catch {
            return rispondi(res, 502, { ok: false, reason: 'verifica_identita_non_riuscita' });
        }
        if (!utente || !utente.id) return rispondi(res, 401, { ok: false, reason: 'sessione_non_valida' });

        // ── 2. QUALE PACCHETTO, E QUANTO COSTA DAVVERO ──────────────────────
        const corpo = await leggiCorpo(req);
        const packKey = typeof corpo.pack === 'string' ? corpo.pack : null;
        if (!packKey) return rispondi(res, 400, { ok: false, reason: 'pacchetto_mancante' });

        let pack;
        try {
            const r = await fetch(
                `${SB_URL}/rest/v1/dc_packs?pack_key=eq.${encodeURIComponent(packKey)}&attivo=is.true&select=*`,
                { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
            const righe = await r.json();
            pack = Array.isArray(righe) ? righe[0] : null;
        } catch {
            return rispondi(res, 502, { ok: false, reason: 'catalogo_non_raggiungibile' });
        }
        if (!pack) return rispondi(res, 404, { ok: false, reason: 'pacchetto_sconosciuto' });

        // ── 3. LA CASSA ─────────────────────────────────────────────────────
        /* `payment_method_types` non viene passato di proposito: cosi' Stripe
           mostra i metodi attivati nel Dashboard (carta, PayPal, e sui
           dispositivi compatibili Apple Pay e Google Pay). Elencarli qui
           vorrebbe dire tornare a toccare il codice ogni volta che se ne
           aggiunge uno. */
        const campi = new URLSearchParams();
        campi.set('mode', 'payment');
        campi.set('success_url', `${SITE}/?dc=ok&session_id={CHECKOUT_SESSION_ID}`);
        campi.set('cancel_url',  `${SITE}/?dc=annullato`);
        campi.set('client_reference_id', utente.id);
        campi.set('metadata[user_id]',  utente.id);
        campi.set('metadata[pack_key]', pack.pack_key);
        campi.set('line_items[0][quantity]', '1');
        campi.set('line_items[0][price_data][currency]', pack.currency || 'eur');
        campi.set('line_items[0][price_data][unit_amount]', String(pack.price_cents));
        campi.set('line_items[0][price_data][product_data][name]',
                  `${pack.label} — ${pack.dc} Driver Coins`);
        campi.set('line_items[0][price_data][product_data][description]',
                  'Chauffeur Empire · valuta di gioco, accreditata sull\'account che ha effettuato l\'acquisto');
        if (utente.email) campi.set('customer_email', utente.email);
        // Una carta rifiutata non deve lasciare sessioni aperte all'infinito.
        campi.set('expires_at', String(Math.floor(Date.now() / 1000) + 30 * 60));

        let sessione;
        try {
            const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${SK}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    // Se il giocatore preme due volte, Stripe restituisce la
                    // stessa sessione invece di aprirne una seconda.
                    'Idempotency-Key': `dc_${utente.id}_${pack.pack_key}_${Math.floor(Date.now() / 60000)}`,
                },
                body: campi.toString(),
            });
            sessione = await r.json();
            if (!r.ok) {
                console.error('stripe checkout errore', sessione && sessione.error && sessione.error.message);
                return rispondi(res, 502, { ok: false, reason: 'cassa_non_disponibile' });
            }
        } catch (e) {
            console.error('stripe checkout eccezione', e && e.message);
            return rispondi(res, 502, { ok: false, reason: 'cassa_non_disponibile' });
        }

        return rispondi(res, 200, { ok: true, url: sessione.url });

    } catch (e) {
        console.error('dc-checkout eccezione non prevista', e && e.stack);
        return rispondi(res, 500, { ok: false, reason: 'errore_interno' });
    }
}
