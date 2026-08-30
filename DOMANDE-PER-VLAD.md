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
