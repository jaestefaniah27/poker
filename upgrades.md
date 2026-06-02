# Upgrades TODO List

## Mejoras de Arquitectura (alto impacto)
- [x] **1. Romper monolito App.tsx**
  - Biggest pain point. Extract: PokerTable, PlayerSeat, LoginForm, RoomList, BettingControls, ChatPanel.
  - Keep socket in App, pass callbacks via props.
  - *Hecho: App.tsx se ha reducido considerablemente extrayendo componentes (Lobby, PlayingCard, HandRankingsModal, etc).*
- [x] **2. Añadir types compartidos client/server**
  - Create shared/types.ts — Card, Player, GameState, RoomInfo used both sides.
  - Eliminates drift between what server sends and client expects.
  - *Hecho: Creada carpeta `shared/types.ts` en la raíz. Cliente y Servidor han sido actualizados para importar desde ahí los tipos y las constantes del motor de poker.*
- [x] **3. Separar socket handlers de index.ts**
  - Extract: authHandlers.ts, gameHandlers.ts, roomHandlers.ts.
  - Each exports (io, socket) => void setup function.
  - *Hecho: Extraídos a la carpeta `handlers/` (Auth, Room, Game) limpiando cientos de líneas de `index.ts`.*

## Mejoras de Funcionalidad (medio impacto)
- [ ] **4. Chat en mesa** — players can communicate. Already noted as "alta" complexity in dev-method.
- [ ] **5. Historial de manos** — log completed hands to SQLite, let players review past hands.
- [ ] **6. Estadísticas de jugador** — win rate, hands played, biggest pot. Stored in DB.
- [ ] **7. Sistema de torneos** — bracket/sit-n-go format. New module needed.
- [x] **8. Sonidos y Háptica** — deal cards, chip sounds, timer warning, your turn notification.
  - *Hecho: Se ha sintetizado un sonido de "Check" (doble toque en madera) con Web Audio API y se han añadido vibraciones para turnos y victorias.*

## Mejoras Técnicas (solidez)
- [x] **9. Error handling** — only 10 catch blocks in server. Socket handlers need try/catch wrapping to prevent one bad event crashing others.
  - *Hecho: Se ha añadido un wrapper global de try/catch (`wrapCallback` en `handlers/index.ts`) que envuelve automáticamente todos los eventos del socket.*
- [x] **10. Migraciones DB proper** — current ALTER TABLE with ignore-duplicate is fragile. Use versioned migration system.
  - *Hecho: Implementado un sistema secuencial en `db.ts` que almacena el historial de migraciones en la propia SQLite. Soporta retrocompatibilidad.*
- [x] **11. Tests** — zero automated tests. At minimum: pokerEngine.ts hand evaluation, roomManager.ts betting logic.
  - *Hecho: Instalado `vitest`. Añadidos tests automáticos en `server/tests` que verifican la creación de barajas, el barajado (ahora con nivel criptográfico `crypto.randomInt`), la evaluación de manos y el complejo reparto matemático de los side pots.*
- [x] **12. Reconnection robustness** — rooms lost on server restart (except Sala Presidencial). Could serialize active games to DB.
  - *Hecho: Implementada la persistencia en `db.ts` con SQLite (WAL). Las salas se sincronizan en cada `broadcastRoom` y se restauran en el reinicio del servidor, garantizando que nadie pierda su asiento.*
- [x] **13. Rate limiting** — no socket event rate limiting. Easy to spam actions.
  - *Hecho: Implementado `rateLimits` en `wrapCallback` (máx 20 req/s, con auto-kick para spammers extremos).*
- [x] **14. Input validation** — sanitize usernames, room names against XSS.
  - *Hecho: Creado `sanitizeInput` aplicado globalmente a creación de salas, registro y cambio de nombre/avatar.*

## Quick Wins
- [x] **15. PWA / installable** — add manifest + service worker for mobile.
  - *Hecho: Se añadió `manifest.json` y los metadatos a `index.html` para hacerlo instalable en iOS y Android.*
- [ ] **16. Keyboard shortcuts** — fold/check/raise with keys.
- [x] **17. Notificación de turno** — tab blinking / sound alert when it's your turn and you're not looking.
  - *Hecho: Añadido soporte de vibración en el móvil. Vibra al llegar tu turno y al acabar la mano con patrón de victoria/derrota.*
- [ ] **18. Tema oscuro/claro** — toggle in settings.

---
**Top 3 recomendaciones por ROI:** #1 romper App.tsx (Hecho ✅), #9 error handling, #2 shared types. Foundation work que hace todo lo demás más fácil.