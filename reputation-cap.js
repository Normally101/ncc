/* ELIMINATO. Questo modulo era una porta parallela per il tetto reputazione,
   mai chiamata da nessuno: il calcolo vive SOLO in CE_money.addReputation
   (money.js), gia' usata da tutti i siti di gioco. Il guardrail
   test/reputation-cap.test.js impedisce la ricomparsa di tetti copiati a mano
   e di ogni nuova implementazione parallela.
   Il file resta come tombstone perche' gli strumenti di lavoro non permettono
   la cancellazione fisica; non esportare nulla da qui. */
