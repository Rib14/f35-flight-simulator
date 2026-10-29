# F-35 Coop — versione 5

## Novità giocabili ora
- Base alleata ampliata: pista lunga, hangar e sei piazzole
- Base nemica con edifici e obiettivi distruttibili
- Nuova missione **OPERAZIONE: BASE NEMICA** nel menu missioni (giocatore singolo)
- Il gioco resta compatibile con GitHub Pages e i comandi touch esistenti.

## Alpha stanze multiplayer
Il pulsante **STANZA AMICI** apre la creazione/accesso con codice. Richiede un server Node.js separato. Il server incluso sincronizza le **posizioni degli aerei**, non i danni, i missili, gli edifici, IA, punteggi o vittoria condivisa. Questi ultimi restano locali: NON è ancora una missione cooperativa completa. I velivoli remoti sono segnaposto 3D.

1. Pubblica soltanto i file web (`index.html`, `css/`, `js/`, `models/`, `icons/`, `manifest.webmanifest`, `service-worker.js`) nella root del repository GitHub Pages. **Non pubblicare la cartella multiplayer-server nel sito pubblico**: tienila in un repository privato separato.
2. In un server Node 20+ esegui `cd multiplayer-server && npm install && npm start`.
3. Pubblica questo server con un servizio che fornisce WebSocket via TLS: URL `wss://...`. GitHub Pages non può eseguire Node.js.
4. Nel gioco premi STANZA AMICI, inserisci l'URL wss, scegli il nome e crea/entra in una stanza; l'host avvia il volo.
5. Per test locali `ws://localhost:3000` funziona solo sul dispositivo che esegue il server.

## Limiti e roadmap
- Spostamenti remoti con aggiornamenti ~10 Hz, senza interpolazione: è un prototipo.
- Server in memoria: le stanze si perdono al riavvio. Nessuna autenticazione né anti-cheat; non adatto a giocatori sconosciuti.
- Fase successiva: modelli F-35 remoti, interpolazione, autorità del server per bersagli e danni, IA condivisa, respawn e ritorno alla base.
- Non promettiamo un multiplayer operativo su GitHub Pages senza prima distribuire il backend.
