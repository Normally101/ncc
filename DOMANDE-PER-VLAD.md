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

### 4. Gli eventi globali non sono mai esistiti, e riaccenderli è una scelta tua
La tabella `global_events` è **vuota**: da quando il gioco è online non è mai
accaduto un solo mega-evento (Fashion Week, GP di Monza, Natale…). L'impianto
funziona — il client li mostra e i moltiplicatori arrivano davvero al motore —
ma il seed di `21_global_events.sql` non è mai stato applicato.

**Non l'ho applicato io, e la ragione è che scriverebbe un calendario sbagliato.**
Quelle otto date sono scritte come «fra 1 giorno», «fra 30 giorni», contate dal
momento in cui si lancia il file: applicandolo oggi, «Natale & Capodanno»
cadrebbe il 29 settembre e «Ferragosto» il 2 settembre. E dopo il novantesimo
giorno finirebbero tutti, per sempre, perché niente ne genera di nuovi.

Le tre strade, in ordine di lavoro: (a) date vere fissate al calendario, e ogni
anno si ripetono; (b) un generatore che pesca da un catalogo, come fa
`_process_tourism_tenders` per i bandi; (c) si lascia spento e si toglie il
banner. **Ipotesi mia se non rispondi: resta spento** — un evento che promette
+40% di mance e cade a settembre è peggio di nessun evento.

### 5. Il premio di accesso giornaliero: due tabelle diverse, e quella vera è nel browser
Il premio del login lo calcola **il browser** (`engine-daily.js`), che si fida di
`lastDailyClaim` salvato nel salvataggio locale: chi sa modificare il salvataggio
lo riscuote quante volte vuole. Sul server esiste già `rpc_claim_daily_reward`,
scritta bene (controlla l'identità, il giorno, la serie) e **non la chiama
nessuno**.

Il problema per te non è tecnico, è che **le due tabelle dei premi non coincidono**:

| | client (attivo) | server (mai usato) |
|---|---|---|
| Giorno 1 | €500 | €500 |
| Giorno 3 | €1.500 + 1 DC | €1.500 |
| Giorno 7 | €5.000 + 5 DC | 10 DC, zero contanti |
| Giorno 30 | €25.000 + 25 DC | la serie riparta da 1 dopo il 7 |

Spostare il premio sul server (che è la strada giusta per il denaro) significa
**cambiare i premi**, e quello è game design. Dimmi quale delle due tabelle è
quella buona e la faccio valere lato server; oppure dimmene una terza.

### 6. Il prezzo del gasolio: uno per tutti o uno per ciascuno?
Ogni giocatore oggi ha il **suo** prezzo del carburante, sorteggiato dal suo
browser (`engine-daily.js`). Sul server c'è una tabella `fuel_market` con dentro
una sola riga, ferma al 15 agosto, che non legge nessuno.

Un prezzo unico per tutti darebbe una cosa che ora manca: un fatto del mondo di
cui i giocatori possono parlare («il gasolio è a 2,80, non conviene uscire»), e
renderebbe sensato il levy dei depositi carburante fra giocatori. Costa poco:
una sveglia esiste già scritta. **Ipotesi mia se non rispondi: resta com'è**,
perché toccare il costo del carburante tocca l'equilibrio di ogni corsa.

### 7. La nemesi che finanzia i rivali è una stampante di denaro, ed è spenta
`rpc_nemesis_fund_rival` regala fino a €50.000 a un altro giocatore, cinque volte
l'ora, e l'unico controllo è «non a te stesso». Due account d'accordo si passano
€250.000 l'ora dal nulla. È **revocata** sul server (giustamente), ma `nemesis.js`
continua a chiamarla: la meccanica «il VIP arrabbiato finanzia un tuo rivale» non
è mai accaduta a nessuno.

Per riaccenderla il server deve decidere lui **chi** e **quanto**, senza che il
browser possa dirglielo — cioè va riscritta. Vale la pena? È una delle poche cose
che fanno sentire la presenza degli altri giocatori, ma è lavoro vero, e in questi
giorni sto chiudendo, non aggiungendo. **Ipotesi mia: la lascio spenta e la
segnalo qui.**

---

## Risposte già date (non richiedere)

- **Leasing**: resta com'è. «L'ho testato un po' meglio e per me va bene così.»
- **Corsie taxi e camion**: dopo il rilascio, sono una vera espansione.
- **Dispatcher junior/senior**: non è un problema, è staff che si assume.
- **Elicottero e jet non vendibili**: fanno parte di un update futuro.
- **Toccare il database**: sì, finché non ci sono giocatori veri.
- **Pubblicare**: sì, se ho controllato e non creo bug nuovi.
