# Mini-juegos & Economía — Backlog

Ordenado por ROI: impacto alto / esfuerzo bajo primero.

---

## 🟢 TIER 1 — Quick wins (alto impacto, bajo esfuerzo)

### 1. Botón de Recarga (Reset)
**Esfuerzo:** 30 min | **Impacto:** QoL inmediato

- Añadir botón "🔄 Recargar" en el header del Lobby (o como FAB)
- Llama `window.location.reload()`
- Opcional: confirmar si hay partida activa

---

### 2. Monedas diarias (Daily Coins)
**Esfuerzo:** 2-3h | **Impacto:** retención diaria

**Server (`db.ts`, `index.ts`):**
- Columna `last_daily_claim` (timestamp) en tabla `users`
- Endpoint/evento `claimDaily` → si han pasado ≥24h, da monedas y resetea timestamp
- Cantidad base: 5.000 fichas. Streak bonus: +1.000 por día consecutivo (hasta 7)
- Columna `daily_streak` en DB

**Client:**
- Botón "Reclamar bonus diario" en Lobby con cuenta atrás hasta próxima reclamación
- Animación de monedas cayendo (o `AnimatedNumber` en saldo)
- Badge con racha actual

---

### 3. Tiradas gratis de Jackpot (Free Spins)
**Esfuerzo:** 1h (depende de que Jackpot esté hecho) | **Impacto:** engagement loop

- Columna `free_spins` en DB
- Se acumulan (diario: +1 gratis cada 24h, máx 5 acumuladas)
- Al usar tirada gratis, no descuenta fichas
- Mostrar contador de tiradas gratis en UI del Jackpot
- Eventos: `claimFreeSpins`, `useFreeSpín`

---

## 🟡 TIER 2 — Core features (alto impacto, esfuerzo medio)

### 4. Sistema XP y Niveles
**Esfuerzo:** 4-6h | **Impacto:** retención a largo plazo (prerequisito de loot boxes)

**Server:**
- Columnas en DB: `xp` (int), `level` (int, empieza en 1)
- Helper `addXp(userId, amount)` → calcula si sube nivel, devuelve `{ newLevel, leveledUp }`
- Curva XP: `xpRequired(level) = level * 500` (nivel 1→2: 500xp, 2→3: 1000xp, etc.)
- Fuentes de XP:
  - Ganar mano de poker: +50xp
  - Ganar mano de blackjack: +30xp
  - Jackpot: +10xp por tirada
  - Trivia correcta: +75xp
  - Daily claim: +100xp

**Client:**
- Barra de XP en Lobby debajo del nombre del jugador
- Animación de nivel subiendo (toast + partículas)
- Nivel visible en avatar/perfil

---

### 5. Jackpot / Tragaperras
**Esfuerzo:** 5-8h | **Impacto:** mini-juego más popular, fácil de entender

**Server (`blackjackEngine.ts` o nuevo `jackpotEngine.ts`):**
- Evento `playJackpot` → recibe `{ roomId?, userId, bet }`
- 3 carretes × 7 símbolos: 🍒🍋🍊🍇⭐💎7️⃣
- Tabla de premios:
  - 3×💎 → x50 (jackpot)
  - 3×7️⃣ → x20
  - 3×⭐ → x10
  - 3× igual → x5
  - 2× igual → x1.5
  - nada → x0
- Guardar historial en DB: tabla `jackpot_history`

**Client (nuevo `JackpotModal.tsx`):**
- Animación de carretes girando (CSS keyframes o Framer Motion)
- Apuesta configurable (slider, como BJ)
- Mostrar premio con animación
- Integrar contador de tiradas gratis
- Acceso desde Lobby (botón "🎰 Jackpot")

---

### 6. Caja de Loot al subir de nivel
**Esfuerzo:** 3-4h | **Impacto:** recompensa tangible por progresar (requiere #4)

**Server:**
- Al detectar `leveledUp=true` en `addXp`, generar recompensa:
  - Niveles 1-10: 10.000-50.000 fichas + 2 tiradas gratis
  - Niveles 11-25: 50.000-200.000 fichas + 5 tiradas gratis
  - Niveles 26+: 200.000-1.000.000 fichas + 10 tiradas gratis + título cosmético
- Evento `lootBoxReward` emitido al usuario

**Client (`LootBoxModal.tsx`):**
- Modal con animación de caja abriéndose (shake → open → items fly out)
- Lista de recompensas recibidas con iconos
- Botón "¡Genial!" para cerrar

---

### 7. Rueda de la Suerte
**Esfuerzo:** 5-6h | **Impacto:** visual e impresionante, diferenciador

**Server:**
- Evento `spinWheel` → disponible 1 vez cada 12h (o con ticket)
- 12 segmentos con premios variados:
  - x2 saldo actual (1 segmento)
  - 100.000 fichas (2 segmentos)
  - 50.000 fichas (3 segmentos)
  - 10.000 fichas (3 segmentos)
  - 5 tiradas jackpot (1 segmento)
  - +500xp (2 segmentos)
- Columna `last_wheel_spin` en DB

**Client (`WheelModal.tsx`):**
- SVG/Canvas con 12 segmentos coloreados
- Animación de giro con desaceleración física (ease-out)
- Puntero fijo, rueda gira hasta el segmento ganador
- Cuenta atrás para próxima tirada disponible

---

## 🔴 TIER 3 — Features complejas (alto impacto, esfuerzo alto)

### 8. Trivia
**Esfuerzo:** 8-12h | **Impacto:** retención alta si el contenido es bueno

**Server:**
- Tabla `trivia_questions`: id, pregunta, opciones (JSON), respuesta_correcta, categoría, dificultad
- Seed inicial: 50+ preguntas en español (poker, cultura general, deportes)
- Evento `startTrivia` → devuelve pregunta aleatoria (no repetir en 24h por usuario)
- Evento `answerTrivia` → valida, da XP + fichas si correcta
- Cooldown: 1 pregunta cada 5 min

**Client (`TriviaModal.tsx`):**
- 4 opciones (A/B/C/D), timer de 15s por pregunta
- Feedback visual: verde correcto, rojo incorrecto
- Racha de respuestas correctas → bonus multiplicador
- Historial de puntuación

---

### 9. Sistema de Títulos / Cosméticos
**Esfuerzo:** 4-6h | **Impacto:** status social, retención

- Títulos desbloqueables por nivel (ej: "Novato" lv1, "Apostador" lv10, "Tiburón" lv25, "Leyenda" lv50)
- Marcos de avatar coloreados por nivel
- Mostrar título debajo del nombre en mesa y lobby
- DB: tabla `titles`, columna `equipped_title` en `users`

---

### 10. Logros (Achievements)
**Esfuerzo:** 6-10h | **Impacto:** retención a largo plazo

- ~30 logros: "Primera mano ganada", "Jackpot x50", "Racha 7 días", "Nivel 10", etc.
- DB: tabla `achievements`, tabla `user_achievements`
- Notificación in-app al desbloquear
- Panel de logros en perfil

---

## 📋 Orden de implementación recomendado

```
1. Botón Reset          → 30 min, sin dependencias
2. Daily Coins          → 2-3h, base del loop de retención
3. XP + Niveles         → 4-6h, prerequisito de loot boxes
4. Jackpot              → 5-8h, primer mini-juego
5. Free Spins           → 1h, encima de jackpot
6. Loot Boxes           → 3-4h, encima de XP
7. Rueda de la Suerte   → 5-6h, segundo mini-juego visual
8. Trivia               → 8-12h, tercer mini-juego
9. Títulos              → 4-6h, cosmético social
10. Logros              → 6-10h, retención largo plazo
```

**Total estimado:** ~45-65h de desarrollo

---

## Notas técnicas

- **Saldo nunca bloquea:** mantener convención existente — fichas son marcador, no restricción.
- **Nuevas tablas DB:** añadir en `db.ts` con `CREATE TABLE IF NOT EXISTS`.
- **Nuevos eventos Socket.IO:** registrar en `server/src/handlers/` (crear `minigameHandlers.ts`).
- **Nuevos componentes:** en `client/src/components/` (un fichero por mini-juego).
- **Acceso desde Lobby:** añadir sección "Mini-juegos" en Lobby con botones a cada modal.
- **Estado global:** añadir `xp`, `level`, `freeSpins` al tipo `PublicUser` en `shared/types.ts`.
