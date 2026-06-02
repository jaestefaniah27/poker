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
| `client/src/App.tsx` | Componente monolítico (~1171 líneas) — toda la UI, socket events, estado, animaciones |
| `client/src/main.tsx` | Entry point React |

## Stack completo

**Client:** React 19, TypeScript 6, Vite 5, Tailwind 3, Framer Motion 12, Socket.IO Client 4  
**Server:** Node.js, TypeScript 5, Express 4, Socket.IO 4, SQLite3, bcryptjs, pokersolver, uuid

## Patrones clave

- **Server-authoritative**: toda la lógica del juego vive en el servidor. El cliente solo renderiza estado.
- **Anti-cheat**: cada socket recibe solo sus propias cartas. Cartas rivales se revelan únicamente en showdown.
- **Persistencia**: SQLite con WAL mode. Salas en memoria (se pierden al reiniciar, excepto "Sala Presidencial").
- **Sesiones**: tokens opacos en memoria del servidor — se invalidan al reiniciar.
- **Fases**: `waiting → preflop → flop → turn → river → showdown`
- **Blinds**: SB=1, BB=2. Buy-in=1000 chips (descontado del saldo persistente).
- **Temporizadores**: 15s normal + 5s grace (online), 8s sin grace (offline). Default action: fold/check.

## Convenciones

- UI en **español** (labels, mensajes, nombres de sala).
- Mobile-first, max-width 420px.
- Avatares: DiceBear API con seed basado en nombre de usuario.
- Sin tests automatizados — verificar cambios con `/verify` o arrancando la app.
- Componente App.tsx es monolítico — al extraer componentes, mantener props simples y socket en App.

## Gotchas

- Salas dinámicas se pierden al reiniciar servidor (solo "Sala Presidencial" persiste via DB).
- Sesiones se invalidan al reiniciar — usuarios deben re-loguearse.
- `pokersolver` usa notación de cartas estilo `['Ah', 'Kd', ...]` — ver `pokerEngine.ts` para formato.
- Framer Motion 12 usa `motion()` factory, no HOC — cuidado con imports.
- TypeScript strict en server, menos en client — no asumir que todo está tipado en App.tsx.

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
