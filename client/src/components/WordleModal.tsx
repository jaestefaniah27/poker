import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, fmtChips } from '../utils';
import { sfx } from '../sounds';

interface WordleModalProps {
  user: { id: string; name: string; balance: number };
  token: string | null;
  onClose: () => void;
  onUpdateUser: (u: any) => void;
}

const WORDS = [
  'ABRIR','ACASO','ACERO','AGUAS','AHORA','AJENO','ALMAS','ALTAS','AMIGA','AMIGO',
  'ANCHO','ANTES','ARBOL','ARENA','ARTES','ASADO','ATRAS','AUTOR','AVISO','AYUDA',
  'AZOTE','BANCO','BARCO','BARRO','BELLA','BELLO','BESAR','BLUSA','BOLSA','BOMBA',
  'BRAVO','BREVE','BUENA','BUENO','BURRO','BUSCA','CABLE','CAIDA','CALLE','CALMA',
  'CALOR','CAMPO','CANTO','CAPAZ','CARTA','CARRO','CAUSA','CAZAR','CERCA','CERDO',
  'CHICO','CIELO','CINCO','CIRCO','CLARO','CLASE','CLIMA','COCHE','COMER','CORTO',
  'CORTE','COSTA','CREER','CRIAR','CUEVA','CULPA','CURSO','CURVA','DELTA','DEBER',
  'DECIR','DICHO','DISCO','DOLOR','DUCHA','DUELO','DULCE','ENERO','ERROR','ESTAR',
  'ETAPA','EXITO','EXTRA','FALTA','FANGO','FARSA','FATAL','FAVOR','FECHA','FELIZ',
  'FERIA','FINAL','FIRMA','FLACO','FLOTA','FONDO','FORMA','FRENO','FRESA','FRITO',
  'FUEGO','FUERA','GAFAS','GALLO','GANSO','GARRA','GASTO','GLOBO','GOLPE','GORDO',
  'GORRA','GRAMO','GRANO','GRASA','GRAVE','GRIPE','GRITO','GRUPO','GUAPO','GUSTO',
  'HABLA','HACER','HEBRA','HIELO','HOGAR','HONDA','HONOR','HOTEL','HUESO','HUEVO',
  'HUIDA','HUMOR','IDEAL','INDIO','JARRA','JUEGO','JUGAR','JUNTO','KARMA','LABOR',
  'LARGO','LASER','LATIR','LAVAR','LECHE','LENTO','LETRA','LIBRE','LIBRO','LIMON',
  'LISTA','LISTO','LLAMA','LLANO','LLAVE','LLENO','LOGRO','LUCIR','LUGAR','LUNAR',
  'LUCHA','MADRE','MAGIA','MANGA','MANGO','MANTA','MARCO','MAREA','MAYOR','MEDIA',
  'MEDIO','MEJOR','MENOR','MENOS','MENTE','METRO','MIEDO','MIRAR','MISMO','MITAD',
  'MOLDE','MONTE','MORAL','MORBO','MORIR','MOTOR','MOVER','MUNDO','NADIE','NEGAR',
  'NEGRA','NEGRO','NOCHE','NOBLE','NORMA','NORTE','NOVIA','NOVIO','NUEVO','OBRAR',
  'OBVIO','OCASO','OLIVO','OPERA','ORDEN','OREJA','PADRE','PAGAR','PALCO','PALMA',
  'PANEL','PARAR','PARED','PASAR','PASTA','PATIO','PAUSA','PECHO','PELEA','PERLA',
  'PERRO','PESAR','PESCA','PIANO','PISTA','PLANA','PLANO','PLATA','PLAYA','PLAZA',
  'PLOMO','PODER','POEMA','POETA','PONER','POSTE','PRISA','PRIMA','PRIMO','PULPO',
  'PUNTO','PUNTA','QUESO','RANGO','RAZON','REINO','RENTA','RESTO','REZAR','RIEGO',
  'RIVAL','ROBAR','ROBOT','RODAR','RONCO','RONDA','RUBIO','RUEDA','RUINA','RUMBA',
  'RUMOR','SABER','SACAR','SALIR','SALSA','SALUD','SALVO','SANTO','SAUNA','SELLO',
  'SELVA','SERIE','SIETE','SIGLO','SITIO','SOBRE','SOLAR','SONAR','SOPLO','SUCIO',
  'SUELO','SUMAR','TALLA','TANTO','TAREA','TARRO','TECHO','TEJER','TEMER','TEXTO',
  'TIBIO','TIGRE','TIMON','TINTO','TIRAR','TOCAR','TOMAR','TORPE','TORRE','TOTAL',
  'TRAER','TRAMA','TRAMO','TRIPA','TROZO','TUTOR','UNION','VALOR','VELAR','VENAS',
  'VENTA','VERDE','VERSO','VIAJE','VIEJO','VIGOR','VILLA','VIRAL','VISTA','VIVIR',
  'VOCAL','VOLAR','VUELA','VUELO','YERNO',
];

const PRIZES = [5_000_000, 1_000_000, 500_000, 100_000, 50_000, 10_000];

const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','←'],
];

type TileState = 'empty' | 'typing' | 'correct' | 'present' | 'absent';

function getHourSlot(): string {
  return new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

function getWordForUser(userId: string): string {
  const seed = userId + getHourSlot();
  let h = 0;
  for (const c of seed) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return WORDS[Math.abs(h) % WORDS.length];
}

function checkGuess(guess: string, answer: string): TileState[] {
  const result: TileState[] = Array(5).fill('absent');
  const ans = answer.split('');
  const used = Array(5).fill(false);
  for (let i = 0; i < 5; i++) {
    if (guess[i] === ans[i]) { result[i] = 'correct'; used[i] = true; }
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] === 'correct') continue;
    const j = ans.findIndex((c, k) => c === guess[i] && !used[k]);
    if (j !== -1) { result[i] = 'present'; used[j] = true; }
  }
  return result;
}

const STORAGE_KEY = (userId: string) => `wordle_${userId}_${getHourSlot()}`;

interface SavedState {
  guesses: string[];
  states: TileState[][];
  done: boolean;
  won: boolean;
  claimed: boolean;
}

function loadSaved(userId: string): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(userId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveToDisk(userId: string, s: SavedState) {
  try { localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(s)); } catch {}
}

const TILE_COLORS: Record<TileState, string> = {
  empty: 'transparent',
  typing: 'transparent',
  correct: '#16a34a',
  present: '#ca8a04',
  absent: '#374151',
};

const KEY_COLORS: Record<TileState | 'unused', string> = {
  unused: '#374151',
  empty: '#374151',
  typing: '#374151',
  correct: '#16a34a',
  present: '#ca8a04',
  absent: '#1f2937',
};

export default function WordleModal({ user, token, onClose, onUpdateUser }: WordleModalProps) {
  const answer = getWordForUser(user.id);
  const saved = loadSaved(user.id);

  const [guesses, setGuesses] = useState<string[]>(saved?.guesses ?? []);
  const [tileStates, setTileStates] = useState<TileState[][]>(saved?.states ?? []);
  const [current, setCurrent] = useState('');
  const [done, setDone] = useState(saved?.done ?? false);
  const [won, setWon] = useState(saved?.won ?? false);
  const [claimed, setClaimed] = useState(saved?.claimed ?? false);
  const [shake, setShake] = useState(false);
  const [balance, setBalance] = useState(user.balance);
  const [claiming, setClaiming] = useState(false);

  // Keyboard letter → best state achieved
  const letterStates = useCallback((): Record<string, TileState> => {
    const map: Record<string, TileState> = {};
    const priority: TileState[] = ['correct', 'present', 'absent'];
    tileStates.forEach((row, ri) => {
      row.forEach((state, ci) => {
        const letter = guesses[ri]?.[ci];
        if (!letter) return;
        const cur = map[letter];
        if (!cur || priority.indexOf(state) < priority.indexOf(cur)) map[letter] = state;
      });
    });
    return map;
  }, [tileStates, guesses]);

  const lStates = letterStates();

  const submit = useCallback(() => {
    if (current.length !== 5 || done) return;
    const states = checkGuess(current, answer);
    const newGuesses = [...guesses, current];
    const newTiles = [...tileStates, states];
    const isWon = current === answer;
    const isDone = isWon || newGuesses.length >= 6;

    setGuesses(newGuesses);
    setTileStates(newTiles);
    setCurrent('');
    if (isWon) sfx.bigWin();
    else if (isDone) sfx.lose();
    else sfx.card();
    if (isWon) setWon(true);
    if (isDone) setDone(true);

    const newSaved: SavedState = { guesses: newGuesses, states: newTiles, done: isDone, won: isWon, claimed };
    saveToDisk(user.id, newSaved);
  }, [current, done, guesses, tileStates, answer, claimed]);

  const pressKey = useCallback((key: string) => {
    if (done) return;
    if (key === '←' || key === 'BACKSPACE') {
      setCurrent(p => p.slice(0, -1));
    } else if (key === 'ENTER') {
      if (current.length < 5) { setShake(true); setTimeout(() => setShake(false), 500); return; }
      submit();
    } else if (/^[A-Z]$/.test(key) && current.length < 5) {
      setCurrent(p => p + key);
    }
  }, [done, current, submit]);

  // Physical keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => pressKey(e.key.toUpperCase());
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pressKey]);

  const claimReward = () => {
    if (!token || claiming || claimed) return;
    setClaiming(true);
    socket.emit('wordleComplete', { token, won, attempts: guesses.length }, (res: any) => {
      setClaiming(false);
      if (res.error) { alert(res.error); return; }
      sfx.cashout();
      setClaimed(true);
      if (res.newBalance != null) setBalance(res.newBalance);
      if (res.user) onUpdateUser(res.user);
      const updated: SavedState = { guesses, states: tileStates, done, won, claimed: true };
      saveToDisk(user.id, updated);
    });
  };

  // Build grid rows (6 total)
  const rows: { letters: string[]; states: TileState[] }[] = [];
  for (let r = 0; r < 6; r++) {
    if (r < guesses.length) {
      rows.push({ letters: guesses[r].split(''), states: tileStates[r] });
    } else if (r === guesses.length && !done) {
      const letters = current.split('');
      rows.push({ letters, states: letters.map(() => 'typing') });
    } else {
      rows.push({ letters: [], states: [] });
    }
  }

  const prize = won ? PRIZES[Math.min(guesses.length - 1, PRIZES.length - 1)] : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-end justify-center" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-md bg-[#111] rounded-t-3xl flex flex-col"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))', maxHeight: '95vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
          <div>
            <h2 className="text-xl font-bold tracking-widest">WORDLE</h2>
            <p className="text-xs text-gray-500">Saldo: {fmtChips(balance)}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Grid */}
        <div className="flex flex-col items-center gap-1.5 px-6 py-3 shrink-0">
          {rows.map((row, ri) => (
            <motion.div key={ri} className="flex gap-1.5"
              animate={ri === guesses.length && shake ? { x: [0, -6, 6, -6, 6, 0] } : {}}
              transition={{ duration: 0.4 }}>
              {Array(5).fill(0).map((_, ci) => {
                const letter = row.letters[ci] ?? '';
                const state = row.states[ci] ?? 'empty';
                const isRevealed = state === 'correct' || state === 'present' || state === 'absent';
                return (
                  <motion.div key={ci}
                    animate={isRevealed ? { rotateX: [0, 90, 0], backgroundColor: TILE_COLORS[state] } : {}}
                    transition={{ delay: ci * 0.1, duration: 0.4 }}
                    className="w-12 h-12 flex items-center justify-center rounded-lg text-lg font-black border-2 select-none"
                    style={{
                      borderColor: state === 'typing' || letter ? '#6b7280' : '#1f2937',
                      backgroundColor: isRevealed ? TILE_COLORS[state] : 'transparent',
                      color: isRevealed || letter ? 'white' : 'transparent',
                    }}>
                    {letter}
                  </motion.div>
                );
              })}
            </motion.div>
          ))}
        </div>

        {/* Result message */}
        <AnimatePresence>
          {done && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center px-6 py-2 shrink-0">
              {won
                ? <p className="text-green-400 font-bold text-sm">🎉 ¡Correcto en {guesses.length} {guesses.length === 1 ? 'intento' : 'intentos'}! Premio: {fmtChips(prize)}</p>
                : <p className="text-red-400 font-bold text-sm">Era <span className="text-white">{answer}</span>. ¡Mañana más!</p>
              }
              {!claimed && (
                <button onClick={claimReward} disabled={claiming}
                  className="mt-2 px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-xl active:scale-95 transition-all disabled:opacity-50 text-sm">
                  {claiming ? 'Reclamando...' : won ? `Reclamar ${fmtChips(prize)}` : 'Registrar resultado'}
                </button>
              )}
              {claimed && <p className="text-xs text-gray-500 mt-1">Premio reclamado ✓</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Keyboard */}
        <div className="flex flex-col items-center gap-1.5 px-3 pt-2 pb-1 shrink-0">
          {KEYBOARD_ROWS.map((row, ri) => (
            <div key={ri} className="flex gap-1">
              {row.map(key => {
                const isSpecial = key === 'ENTER' || key === '←';
                const keyState = lStates[key] ?? 'unused';
                return (
                  <button key={key} onPointerDown={e => { e.preventDefault(); pressKey(key); }}
                    className={`h-12 rounded-lg font-bold text-white text-xs active:scale-90 transition-transform select-none ${isSpecial ? 'px-2 min-w-[52px]' : 'w-8'}`}
                    style={{ backgroundColor: isSpecial ? '#4b5563' : KEY_COLORS[keyState] }}>
                    {key}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
