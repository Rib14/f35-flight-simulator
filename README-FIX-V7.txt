F-35 v7 — CORREZIONE ALTEZZA AEREO SULLA PISTA

Problema risolto: il punto di origine del modello GLB si trova nel centro geometrico, non sotto le ruote. Nella v6 il pivot era posizionato alla quota della pista: quindi parte dell’aereo attraversava il suolo.

Modifiche:
- distanza ruote-terreno calcolata automaticamente dal bounding box del GLB;
- pista distinta dal terreno con quota reale 4.15;
- quota iniziale e vincolo di rullaggio/atterraggio coerenti;
- stesso criterio per la portaerei;
- cache PWA aggiornata.

Per aggiornare GitHub Pages sostituire js/game.js e service-worker.js. Se il vecchio asset rimane in cache, chiudere e riaprire la PWA.

Il rendering non e stato provato su dispositivo fisico.
