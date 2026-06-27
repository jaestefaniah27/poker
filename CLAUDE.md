# CLAUDE.md — Poker App

Texas Hold'em multiplayer en tiempo real. Spanish UI. Stack: React + TypeScript (client) / Node.js + Express + Socket.IO + SQLite (server).

## Cómo arrancar

```powershell
# Terminal 1 — servidor (puerto 3001)
cd server && npm run dev

# Terminal 2 — cliente (puerto 5173)
cd client && npm run dev
```

Client conecta a `http://localhost:3001` via Socket.IO.

## Arquitectura

| Fichero | Responsabilidad |
|---------|----------------|
| `server/src/index.ts` | Express HTTP + Socket.IO server, autenticación, event handlers (~502 líneas) |
| `server/src/pokerEngine.ts` | Deck, reparto, evaluación de manos (pokersolver), fases del juego |
| `server/src/roomManager.ts` | Lifecycle de salas, jugadores, turnos, blinds, apuestas |
| `server/src/db.ts` | SQLite — usuarios, saldos, avatares, bcryptjs para contraseñas |
| `shared/types.ts` | Tipos compartidos: Room, Player, PublicUser, Card |
| `client/src/App.tsx` | Socket server, game state, game table render (~600 líneas) |
| `client/src/utils.ts` | Constantes (STAKE_TIERS, BLIND_LABELS, HAND_RANKINGS), helpers (fmtChips, blindsFor, vibrate, playCheckSound) |
| `client/src/components/PlayingCard.tsx` | Tarjeta individual (oculta o revelada, responsive) |
| `client/src/components/Avatar.tsx` | Avatar DiceBear con seed |
| `client/src/components/ProfileModal.tsx` | Modal cambiar nombre, avatar, contraseña |
| `client/src/components/LoginScreen.tsx` | Login con usuario/password |
| `client/src/components/Lobby.tsx` | Seleccionar/crear salas, configurar blinds |
| `client/src/components/HandRankingsModal.tsx` | Ranking manos (tappable) |
| `client/src/components/HandHistoryModal.tsx` | Historial manos jugadas (NEW) |
| `client/src/components/TurnPie.tsx` | Timer "quesito" de turno |
| `client/src/components/DealerBadge.tsx` | "D" en dealer |
| `client/src/components/BetChip.tsx` | Ficha apuesta |
| `client/src/components/MiniCard.tsx` | Carta pequeña para ranking |
| `client/src/components/Slider.tsx` | Custom slider (NEW) |
| `client/src/main.tsx` | Entry point React |

## Stack completo

**Client:** React 19, TypeScript 6, Vite 5, Tailwind 3, Framer Motion 12, Socket.IO Client 4  
**Server:** Node.js, TypeScript 5, Express 4, Socket.IO 4, SQLite3, bcryptjs, pokersolver, uuid

## Patrones clave

- **Saldo NO puede ser negativo** (desde 2026-06-14, antes era "indicativo/puede ser negativo"): hay suficientes juegos que dan dinero, ya no se permite negativo. `applyBalanceDelta` clampa con `MAX(0, balance + delta)`. Toda apuesta/compra/buy-in debe validar `balance >= coste` ANTES de descontar y rechazar con "Saldo insuficiente". Si te quedas a 0, te fastidias. (Guards en jackpot/mines/crash/ruleta, buy-ins poker/BJ, compras tienda, desbloqueos.)
- **Mesa = torneo unificado**: NO existe entidad "torneo" aparte. Toda partida es una `Room` creada con la misma UI. La ÚNICA diferencia configurable es `blindLevelDuration` (ms por nivel). Si es 0 → mesa cash (ciegas fijas, recompra permitida, no termina sola). Si >0 → modo torneo (`isTournament=true`): las ciegas suben cada `blindLevelDuration` (helper `nextBlinds`), sin recompra (busted=espectador), termina cuando un solo jugador conserva fichas (`checkTournamentEnd`) → `tournamentEnded=true` + pantalla `TournamentResults` con "Volver a empezar" (admin=`players[0]`, `restartTournament`) o "Salir". Winner-takes-all es automático (cash-out de fichas→saldo). Lógica en `roomManager.ts` (escalado/fin/reinicio) y `gameHandlers.ts` (eventos `nextHand`/`restartTournament`).
- **Server-authoritative**: toda la lógica del juego vive en el servidor. El cliente solo renderiza estado.
- **Anti-cheat**: cada socket recibe solo sus propias cartas. Cartas rivales se revelan únicamente en showdown.
- **Persistencia**: SQLite con WAL mode. Salas en memoria (se pierden al reiniciar, excepto "Sala Presidencial").
- **Sesiones**: tokens opacos en memoria del servidor — se invalidan al reiniciar.
- **Fases**: `waiting → preflop → flop → turn → river → showdown`
- **Blinds**: SB=1, BB=2. Buy-in=1000 chips (descontado del saldo persistente).
- **Temporizadores**: 15s normal + 5s grace (online), 8s sin grace (offline). Default action: fold/check.

## Convenciones

- UI en **español** (labels, mensajes, nombres de sala).
- Mobile-first, max-width 420px, safe-area-inset support.
- Avatares: DiceBear API con seed basado en nombre de usuario.
- Sin tests automatizados — verificar cambios con `/verify` o arrancando la app.
- **Socket.IO en App.tsx** — importado en utils.ts, los componentes emiten events via socket (pasado por props).
- **Props simples**: evitar pasar toda la room/player — pasar lo mínimo necesario.
- **Mobile UX**: vibration (vibrate function), sound effects (playCheckSound), notchsafe padding.

## Estado actual (2026-06-02)

**COMPLETADO:**
- ✅ Monolito App.tsx (1283 líneas) → 12 componentes pequeños + utils
- ✅ Tipo-seguro: shared/types.ts para Room/Player/PublicUser
- ✅ Features mobile: vibração (ganador, turno), safe-area-inset
- ✅ Nuevos componentes: HandHistoryModal, Slider custom
- ✅ Sin `any` casts en componentes (antes 26 en App.tsx)

**PENDIENTE:**
- Error handling en server (solo 10 catch blocks, agregar try/catch en handlers)
- Tests unitarios (pokerEngine.ts, roomManager.ts)
- Chat en mesa
- Estadísticas jugador (win rate, hands played)
- Torneos/bracket
- Migraciones DB formal
- Rate limiting sockets

## Gotchas

- Salas dinámicas se pierden al reiniciar servidor (solo "Sala Presidencial" persiste via DB).
- Sesiones se invalidan al reiniciar — usuarios deben re-loguearse.
- `pokersolver` usa notación de cartas estilo `['Ah', 'Kd', ...]` — ver `pokerEngine.ts` para formato.
- Framer Motion 12 usa `motion()` factory, no HOC — cuidado con imports.
- TypeScript strict en server, menos en client — no asumir que todo está tipado en App.tsx.

## Flujo de deploy — CRÍTICO

El flujo correcto es **siempre**:

1. Editar código en rama `dev`
2. `git add` + `git commit` + `git push origin dev`
3. `deploy_staging` → verificar en `/staging/`
4. Si aprobado: `git checkout main && git merge dev && git push origin main`
5. `deploy` (MCP) → construye desde `main` → producción

**NUNCA** llamar a `deploy` sin haber mergeado `dev → main` primero.
El MCP `deploy` siempre despliega `main`. Si `main` no tiene el commit, producción no cambia.

## Comandos útiles

```powershell
# Type-check client sin build
cd client && npx tsc --noEmit

# Type-check server
cd server && npx tsc --noEmit

# Lint client
cd client && npm run lint
```

## Optimización de tokens — OBLIGATORIO

Este proyecto usa **caveman mode** activo por defecto (hook en settings). Reglas adicionales:

1. **Nunca leer ficheros enteros** — Grep primero, Read solo la sección necesaria (usar `offset`+`limit`).
2. **Delegar investigación a `cavecrew-investigator`** — output ~60% más pequeño que `Explore` vanilla.
3. **Ediciones quirúrgicas via `cavecrew-builder`** — no leer contexto innecesario en main thread.
4. **`/caveman:caveman-compress`** — comprimir outputs grandes antes de procesar en main thread.
5. **`/caveman:caveman-stats`** — monitorizar uso de tokens si la sesión se alarga.
6. **Parallelizar tool calls independientes** — múltiples Grep/Read en un mismo mensaje.
7. **No re-leer ficheros recién editados** — Edit/Write ya confirman el cambio.
8. **Respuestas cortas por defecto** — caveman mode activo, no repetir contexto ya conocido.

### Orden de prioridad para búsqueda de código
```
Grep → Read(offset+limit) → cavecrew-investigator → Read(full)
```
Nunca saltar a Read(full) sin pasar por Grep primero.

### Flujo Opus-planifica / Sonnet-ejecuta
Para ahorrar tokens en tareas grandes: usar **Opus solo para planificar** y **Sonnet para implementar**. Cambio **manual** con `/model` — no hay enrutado automático por fase.

1. `/model claude-opus-4-8` + plan mode → diseñar (EnterPlanMode → ExitPlanMode).
2. Aprobado el plan: `/model claude-sonnet-4-6` → programar.

⚠️ `/setup-cowork` NO sirve para esto (es onboarding de Cowork, no enrutado de modelos).

## Skills de Claude útiles para este proyecto

| Skill | Cuándo usar |
|-------|-------------|
| `/run` | Arrancar y verificar la app visualmente |
| `/verify` | Confirmar que un cambio funciona en la app real |
| `/code-review` | Revisar diff antes de commit |
| `/simplify` | Limpiar código tras añadir features |
| `/caveman:cavecrew` | Investigar código / editar 1-2 ficheros / revisar diff con contexto comprimido |
| `/caveman:caveman` | Activar/configurar modo caveman (lite/full/ultra) |
| `/caveman:caveman-compress` | Comprimir output grande antes de procesarlo |
| `/caveman:caveman-stats` | Ver estadísticas de uso de tokens en la sesión |
| `/caveman:caveman-commit` | Commits concisos en Conventional Commits |

## Estructura de ficheros

```
poker/
├── client/
│   ├── src/
│   │   ├── main.tsx          # Entry point
│   │   └── App.tsx           # Todo el frontend (monolítico)
│   ├── public/               # Assets estáticos
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── package.json
├── server/
│   ├── src/
│   │   ├── index.ts          # Server + sockets
│   │   ├── pokerEngine.ts    # Lógica de cartas
│   │   ├── roomManager.ts    # Gestión de salas
│   │   └── db.ts             # SQLite
│   ├── poker.sqlite          # Base de datos (no commitear cambios accidentales)
│   └── package.json
├── .claude/
│   ├── settings.local.json   # Permisos Claude Code
│   └── dev-method.md         # Método de desarrollo optimizado
└── CLAUDE.md                 # Este fichero
```
