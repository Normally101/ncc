# Pagamenti Driver Coins — come si accende

> ✅ **ACCESO IN LIVE dal 30/08/2026.** Account Stripe attivato
> (`charges_enabled`/`payouts_enabled` = true), webhook live creato via API,
> le quattro variabili impostate su Vercel (progetto `ncc`). Verificato che
> `/api/dc-checkout` risponde correttamente senza fare nessun addebito di
> prova — **manca ancora un acquisto vero end-to-end nel browser**, unico modo
> di provarlo senza poterlo fare al posto del giocatore.
>
> ⚠️ **Da fare quando c'è un minuto, non urgente**: `STRIPE_SECRET_KEY` oggi è
> la secret key piena. L'unica chiamata che serve a runtime è
> `POST /v1/checkout/sessions` — basta una Restricted API Key con permesso
> *Checkout Sessions: Write* e nient'altro (Dashboard → Developers → API keys
> → Create restricted key), poi sostituire il valore su Vercel e revocare la
> chiave piena. Il webhook non usa mai `STRIPE_SECRET_KEY`: verifica solo con
> `STRIPE_WEBHOOK_SECRET` (HMAC), quindi non serve nessun permesso lì.

Il codice è tutto in piedi e i test lo coprono. Il resto di questa pagina
descrive come è stato acceso (le variabili, il webhook) — utile se un giorno
si deve ruotare una chiave o si accende un secondo ambiente (staging/preview).

## Cosa c'è già

| Pezzo | Dove | Stato |
|---|---|---|
| Catalogo prezzi autorevole | tabella `dc_packs` | applicato in produzione |
| Registro acquisti idempotente | tabella `dc_purchases` | applicato |
| Accredito, revocato al browser | `rpc_credit_dc_purchase` | applicato |
| Apertura cassa | `api/dc-checkout.mjs` | nel repo |
| Conferma pagamento + accredito | `api/dc-webhook.mjs` | nel repo |
| Pulsante e ritorno dalla cassa | `ui-store.js` | nel repo |

Nessuna dipendenza npm: le due funzioni usano `fetch` e `node:crypto`.

## I quattro passi per accendere

### 1. Account Stripe
Crea l'account su [stripe.com](https://dashboard.stripe.com). Per provare senza
soldi veri lavora in **modalità test** (l'interruttore in alto a destra):
le chiavi cominciano con `sk_test_` e la carta `4242 4242 4242 4242` con una
scadenza futura e un CVC qualsiasi paga sempre.

### 2. Metodi di pagamento
Dashboard → **Settings → Payment methods**. Attiva quello che vuoi offrire:

- **Carte** — già attivo di default.
- **PayPal** — va abilitato esplicitamente (in Europa è disponibile).
- **Apple Pay e Google Pay** — compaiono da soli sui dispositivi compatibili
  quando le carte sono attive. Non serve codice: usiamo Stripe Checkout ospitato,
  e la verifica del dominio per Apple Pay la fa Stripe.

I metodi non sono elencati nel nostro codice apposta: quello che accendi qui
compare nel gioco senza toccare una riga.

### 3. Il webhook
Dashboard → **Developers → Webhooks → Add endpoint**.

- URL: `https://www.chauffeurempire.com/api/dc-webhook`
- Eventi da inviare: `checkout.session.completed` e
  `checkout.session.async_payment_succeeded`

Stripe ti mostra un **signing secret** che comincia con `whsec_`. Serve al passo
successivo, ed è la sola cosa che distingue una conferma di pagamento vera da una
richiesta HTTP che qualcuno si è inventato.

### 4. Le variabili su Vercel
Progetto → **Settings → Environment Variables**. Quattro voci, tutte per
*Production* (e *Preview* se vuoi provare lì):

| Nome | Valore | Dove si prende |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` / `sk_test_…` | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | dal webhook creato al passo 3 |
| `SUPABASE_URL` | `https://twstjbykstaioaahfqbe.supabase.co` | — |
| `SUPABASE_SERVICE_ROLE_KEY` | la chiave `service_role` | Supabase → Settings → API |

⚠️ La `service_role` è la chiave che **può accreditare Driver Coins**. Sta solo
qui e in `~/.config/`. Se finisce in un file del repo o in una chat, va ruotata
subito da Supabase.

Dopo averle salvate serve un **redeploy** perché le funzioni le leggano.

## Come si prova che funziona

In modalità test, dal gioco:

1. apri Executive Club → Acquista sullo Starter Pack;
2. paga con `4242 4242 4242 4242`;
3. torni sul gioco e i 50 DC compaiono entro pochi secondi.

Poi controlla che sia rimasta traccia:

```sql
SELECT user_id, pack_key, dc, amount_cents, created_at
FROM dc_purchases ORDER BY id DESC LIMIT 5;
```

Se il pagamento risulta su Stripe ma i coin non arrivano, guarda i log della
funzione su Vercel → Deployments → la funzione `dc-webhook`. Un pagamento
incassato senza accredito viene scritto lì con la dicitura
`DA VERIFICARE A MANO`.

## Cambiare i prezzi

Solo con una migrazione SQL — mai dal browser, mai da `ui-store.js`:

```sql
UPDATE dc_packs SET price_cents = 599, dc = 60 WHERE pack_key = 'starter';
```

Il negozio legge il listino dal server e mostra quei valori, così il prezzo
mostrato e quello addebitato restano lo stesso numero. I colori e le icone dei
pacchetti stanno invece in `ui-store.js`: quella è grafica, non prezzo.

## La regola che non si tocca

Nessun Driver Coin viene accreditato senza un pagamento confermato da Stripe.
Il browser non può accreditare — non perché il codice glielo impedisca, ma
perché `rpc_credit_dc_purchase` è **revocata** ad `anon` e `authenticated`:
la chiave capace di eseguirla non è mai stata nel browser. Anche riscrivendo
`ui-store.js` dalla console del browser non si ottiene un coin.

Test che difendono questa proprietà: `test/store/pagamenti-dc.test.js` e
`test/store/executive-pack-payment.test.js`.
