# Domande per Vlad

> Le cose che non decido io. Vlad è al Festival di Venezia dal 31/08/2026 e legge
> poco: qui trova una lista sola invece di venti domande sparse nelle sessioni.
> Regola: se una domanda mi blocca, faccio il resto e la scrivo qui. Se posso
> andare avanti con un'ipotesi ragionevole, la scrivo **insieme all'ipotesi che ho
> usato**, così lui deve solo dire sì o no.

---

## Aperte

### 1. L'acquisto vero di Driver Coins (serve lui, non posso farlo io)
Stripe è in live dal 30/08 e la catena è verificata fino al bordo, ma **nessuno ha
mai comprato davvero**. Serve un acquisto reale con una carta vera, anche il
pacchetto più piccolo, per vedere l'incasso e l'accredito.

### 2. La chiave Stripe da restringere (serve il suo pannello)
Oggi `STRIPE_SECRET_KEY` su Vercel è la chiave segreta piena, ed è passata da una
chat. L'unica chiamata che il sito fa è creare una sessione di pagamento, quindi
basta una **Restricted API Key** con il solo permesso *Checkout Sessions: Write*.
Dopo il cambio, revocare quella piena. Si fa dal pannello Stripe.

### 3. Equilibrio economico (dopo la Fase 5)
Misurerò la curva del denaro su trenta giorni di gioco. Se risulta troppo facile o
troppo bloccata, **la correzione non la decido io**: porto i numeri e una proposta.

---

## Risposte già date (non richiedere)

- **Leasing**: resta com'è. «L'ho testato un po' meglio e per me va bene così.»
- **Corsie taxi e camion**: dopo il rilascio, sono una vera espansione.
- **Dispatcher junior/senior**: non è un problema, è staff che si assume.
- **Elicottero e jet non vendibili**: fanno parte di un update futuro.
- **Toccare il database**: sì, finché non ci sono giocatori veri.
- **Pubblicare**: sì, se ho controllato e non creo bug nuovi.
- **Eventi globali (31/08)**: "date fisse ricorrenti". Fatto:
  `77_eventi_globali_calendario_fisso.sql` — calendario vero (mese/giorno reali,
  si ripete ogni anno), generatore `rpc_seed_upcoming_global_events()` schedulato
  ogni notte, stessi effetti del seed originale. Verificato in produzione: GP di
  Monza già in tavola come "upcoming" (parte stanotte), Ferragosto e le altre
  sette date correttamente proiettate sull'anno giusto.
- **Premio di accesso giornaliero (31/08)**: "tabella server" (giorni 1-6:
  €500×giorno, giorno 7: 10 Driver Coins/€0, poi riparte da 1). Fatto:
  `76_premio_giornaliero_lato_server.sql` — `rpc_claim_daily_reward()` riscritta
  da zero sullo schema vero (la vecchia scriveva su `profiles`, tabella orfana
  scollegata dal gioco), passa dalla porta unica del denaro (`rpc_earn`,
  `rpc_add_driver_coins`). Il client (`engine-daily.js`) non calcola più nulla in
  locale: chiede al server e mostra il risultato.
- **Prezzo del gasolio (31/08)**: "prezzo unico". Fatto:
  `74_carburante_prezzo_unico.sql` — sveglia oraria su `rpc_update_fuel_price()`
  (esisteva già, mai schedulata). Il client (`_tickFuelPrice`) non sorteggia più
  un prezzo locale quando è sincronizzato col server.
- **Nemesi che finanzia i rivali (31/08)**: "cancellala proprio". Fatto:
  `75_nemesi_rivali_rimossa.sql` — `rpc_nemesis_fund_rival` eliminata dal
  server (non solo revocata). `nemesis.js`: tolta la chiamata e la promessa
  narrativa che non manteneva più ("finanzierà i tuoi rivali"). Resta tutto il
  resto del sistema Nemesi (rabbia, corruzione, Agenzia Ombra).
