/**
 * Adaptador para el servidor del futbolín hardware.
 *
 * TODO: Cuando conozcas el formato de la API, implementa `fetchLiveState` aquí.
 *
 * Formato esperado (adaptar según lo que devuelva el sensor):
 *   GET <FOOSBALL_SERVER_URL>/estado → JSON:
 *   {
 *     active: boolean,
 *     team1: { p1: string, p2: string },
 *     team2: { p1: string, p2: string },
 *     score1: number,   // goles equipo 1
 *     score2: number    // goles equipo 2
 *   }
 *
 * El panel de simulación (FoosballSimPanel) inyecta estado directamente
 * en el engine via `foosballEngine.injectState()` — ese flujo no usa este módulo.
 * Este módulo solo se usa cuando hay un servidor real de futbolín.
 */

const FOOSBALL_SERVER_URL = process.env.FOOSBALL_SERVER_URL ?? 'http://192.168.1.100:8080';
export const POLL_INTERVAL_MS = 3000;

export interface FoosballLiveState {
  active: boolean;
  team1: { p1: string; p2: string };
  team2: { p1: string; p2: string };
  score1: number;
  score2: number;
}

export async function fetchLiveState(): Promise<FoosballLiveState | null> {
  // ─── MOCK (sin servidor real) ──────────────────────────────────────────────
  // El panel de simulación maneja el estado directamente.
  // Devolvemos null para que el engine ignore el polling mientras estamos en sim.
  return null;
  // ─── FIN MOCK ──────────────────────────────────────────────────────────────

  /* IMPLEMENTACIÓN REAL (descomentar cuando tengas el endpoint):
  try {
    const res = await fetch(`${FOOSBALL_SERVER_URL}/estado`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = await res.json() as FoosballLiveState;
    if (typeof data.active !== 'boolean') return null;
    return data;
  } catch {
    return null;
  }
  */
}
