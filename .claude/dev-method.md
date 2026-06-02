# Método de desarrollo optimizado — Poker App

## Principios

1. **CLAUDE.md ya existe** — Claude no necesita explorar la estructura en cada sesión.
2. **Cavecrew para contexto largo** — Delegar búsquedas a subagentes comprimidos evita saturar el contexto.
3. **Server-authoritative** — Los bugs de lógica de juego están en server/src, no en client.
4. **App.tsx es grande** — Leer solo las secciones relevantes, no el fichero completo.
5. **Token budget es finito** — cada token gastado en contexto es un token menos para razonar. Optimizar siempre.

---

## Workflow estándar por tipo de tarea

### Bug en lógica de juego
1. `cavecrew-investigator` → localizar evento Socket.IO o función en server/src
2. Editar `roomManager.ts` o `index.ts` directamente (scope ≤2 ficheros → `cavecrew-builder`)
3. `/verify` para confirmar fix en app real

### Bug en UI / animación
1. Grep en `App.tsx` por nombre del componente/handler
2. Editar inline o con `cavecrew-builder` si scope claro
3. `/run` para ver visualmente

### Nueva feature
1. Decidir: ¿solo UI? solo `App.tsx`. ¿Lógica? `roomManager.ts` + event handler en `index.ts` + UI en `App.tsx`
2. Para features ≥3 ficheros: main thread, no subagentes
3. `/verify` al final

### Refactor / limpieza
1. `/simplify` si el código ya funciona
2. `cavecrew-reviewer` para revisar el diff antes de commit
3. `/code-review` si quieres análisis más profundo

---

## Mapa mental: ¿dónde está X?

| Busco... | Miro en... |
|----------|-----------|
| Lógica de turno/blinds/apuestas | `roomManager.ts` |
| Evaluación de manos, barajar, repartir | `pokerEngine.ts` |
| Autenticación, rooms Socket.IO, timers | `index.ts` |
| Usuarios, saldos, contraseñas, avatares | `db.ts` |
| Animaciones, UI, estado React, socket events del cliente | `App.tsx` |

---

## Delegación a cavecrew

### Cuándo usar investigator
- "¿Dónde se maneja X evento?"
- "¿Qué llama a esta función?"
- "¿Dónde se guarda este estado?"

```
cavecrew-investigator: "Locate all socket.on handlers in server/src/index.ts that deal with betting (raise/call/fold)"
```

### Cuándo usar builder
- Fix conocido, ≤2 ficheros, scope obvio
- Siempre incluir path:line exacto

```
cavecrew-builder: "In server/src/roomManager.ts:145, change condition X to Y"
```

### Cuándo usar reviewer
- Antes de cada commit significativo
- Después de editar App.tsx (fácil introducir regresiones)

```
cavecrew-reviewer: "Review changes to server/src/roomManager.ts for correctness"
```

---

## Permisos frecuentes (añadir a settings.local.json si se necesitan)

```json
"Bash(cd client && npm run dev)",
"Bash(cd server && npm run dev)",
"Bash(cd client && npx tsc --noEmit)",
"Bash(cd server && npx tsc --noEmit)",
"Bash(cd client && npm run lint)"
```

---

## Anti-patrones — NO hacer

- No leer App.tsx entero para buscar algo — usar Grep primero
- No editar `poker.sqlite` directamente — usar db.ts o queries SQL via Bash
- No añadir estado global en cliente sin pasarlo por socket — el servidor es la fuente de verdad
- No usar `useEffect` para lógica de juego en cliente — solo renderizado
- No commitear `poker.sqlite` con datos de usuarios reales

---

## Optimización de tokens

### Skills instalados para reducir consumo

| Skill | Reducción | Cuándo |
|-------|-----------|--------|
| `/caveman:caveman` (full, activo por hook) | ~75% en respuestas | Siempre activo |
| `cavecrew-investigator` | ~60% vs Explore vanilla | Búsquedas en codebase |
| `cavecrew-builder` | Elimina re-lectura en main thread | Edits quirúrgicos |
| `cavecrew-reviewer` | ~60% vs reviewer vanilla | Review de diffs |
| `/caveman:caveman-compress` | Variable | Comprimir outputs grandes antes de procesar |
| `/caveman:caveman-stats` | — | Monitorizar uso cuando sesión larga |

### Reglas de lectura de ficheros

```
SIEMPRE: Grep → Read(offset+limit) → cavecrew-investigator
NUNCA: Read(full file) sin Grep primero
```

- `App.tsx` (~1171 líneas) — **nunca leer completo**. Grep por nombre de función/estado/evento.
- `index.ts` (~502 líneas) — Grep por nombre del evento Socket.IO primero.
- Ficheros pequeños (`db.ts`, `pokerEngine.ts`) — OK leer completo si necesario.

### Paralelización

Siempre lanzar tool calls independientes en paralelo:
```
✓ [Grep en App.tsx] + [Grep en roomManager.ts] — mismo mensaje
✗ Grep App.tsx → esperar → Grep roomManager.ts — desperdicio
```

### Gestión de sesiones largas

Si contexto se acerca al límite:
1. `/caveman:caveman-stats` — ver qué consume más
2. Delegar siguientes búsquedas a `cavecrew-investigator` (output comprimido)
3. Evitar re-leer ficheros ya procesados en la sesión
4. Commits intermedios para poder iniciar sesión nueva con contexto limpio

---

## Skills instalados y relevantes

| Skill | Uso en este proyecto |
|-------|---------------------|
| `/run` | Arrancar cliente+servidor y ver la app |
| `/verify` | Confirmar feature/fix visualmente |
| `/code-review [low\|medium\|high]` | Revisar diff. Usar `medium` para PRs normales |
| `/simplify` | Limpiar App.tsx tras añadir features |
| `/caveman:cavecrew` | Investigar + editar con contexto comprimido |
| `/caveman:caveman-commit` | Commits concisos con formato Conventional Commits |

---

## Tareas comunes y estimación

| Tarea | Complejidad | Ficheros tocados |
|-------|------------|-----------------|
| Cambiar duración de timer | Baja | `index.ts` (1 constante) |
| Añadir tipo de apuesta | Media | `roomManager.ts` + `App.tsx` |
| Nueva sala con reglas distintas | Media | `roomManager.ts` + `index.ts` |
| Extraer componente de App.tsx | Media | `App.tsx` + nuevo fichero |
| Sistema de chat en mesa | Alta | `index.ts` + `roomManager.ts` + `App.tsx` |
| Torneos / bracket | Muy alta | Nuevo módulo + todo lo anterior |

---

## Comandos de desarrollo rápido

```powershell
# Arrancar todo (dos terminales)
cd server; npm run dev
cd client; npm run dev

# Verificar tipos sin build
cd client; npx tsc --noEmit
cd server; npx tsc --noEmit

# Ver errores de lint
cd client; npm run lint

# Inspeccionar DB
sqlite3 server/poker.sqlite ".tables"
sqlite3 server/poker.sqlite "SELECT name, balance FROM users;"
```
