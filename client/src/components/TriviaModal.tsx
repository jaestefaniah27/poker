import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, fmtChips } from '../utils';

interface TriviaQuestion {
  id: number;
  question: string;
  options: string[];
  category: string;
}

interface TriviaResult {
  correct: boolean;
  correctIndex: number;
  reward?: { type: 'chips'; amount: number } | { type: 'spin'; value: number };
  newBalance?: number;
  newFreeSpins?: number;
}

type Phase = 'loading' | 'question' | 'answered' | 'cooldown';

const CATEGORY_COLORS: Record<string, string> = {
  'Historia española': 'bg-rose-500/20 text-rose-300',
  'Historia mundial': 'bg-amber-500/20 text-amber-300',
  'Política internacional': 'bg-blue-500/20 text-blue-300',
  'Economía y sociedad': 'bg-emerald-500/20 text-emerald-300',
  'Escándalos políticos': 'bg-orange-500/20 text-orange-300',
  'Franco': 'bg-red-500/20 text-red-300',
  'Hitler': 'bg-zinc-500/20 text-zinc-300',
};

export const TriviaModal = ({
  token,
  onClose,
  onUpdateUser,
}: {
  token: string | null;
  onClose: () => void;
  onUpdateUser: (u: any) => void;
}) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [question, setQuestion] = useState<TriviaQuestion | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<TriviaResult | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const loadQuestion = useCallback(() => {
    setPhase('loading');
    setQuestion(null);
    setSelected(null);
    setResult(null);
    socket.emit('getTriviaQuestion', { token }, (res: any) => {
      if (res.cooldown) {
        setCooldown(res.cooldown);
        setPhase('cooldown');
      } else if (res.question) {
        setQuestion(res.question);
        setPhase('question');
      }
    });
  }, [token]);

  useEffect(() => { loadQuestion(); }, [loadQuestion]);

  // Countdown timer when on cooldown
  useEffect(() => {
    if (phase !== 'cooldown' || cooldown <= 0) return;
    const id = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { clearInterval(id); loadQuestion(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, cooldown, loadQuestion]);

  const submitAnswer = (idx: number) => {
    if (!question || selected !== null) return;
    setSelected(idx);
    socket.emit('submitTriviaAnswer', { token, questionId: question.id, answerIndex: idx }, (res: any) => {
      setResult(res);
      setPhase('answered');
      if (res.user) onUpdateUser(res.user);
    });
  };

  const categoryColor = question ? (CATEGORY_COLORS[question.category] ?? 'bg-gray-500/20 text-gray-300') : '';

  const optionStyle = (idx: number) => {
    const base = 'w-full text-left px-4 py-3 rounded-xl font-medium text-sm transition-all border';
    if (phase !== 'answered') {
      return `${base} border-gray-700 bg-background hover:border-gray-500 active:scale-95`;
    }
    if (idx === result?.correctIndex) return `${base} border-emerald-500 bg-emerald-500/15 text-emerald-200`;
    if (idx === selected && !result?.correct) return `${base} border-rose-500 bg-rose-500/15 text-rose-300`;
    return `${base} border-gray-800 bg-background text-gray-600`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="w-full max-w-md bg-surface rounded-3xl border border-surfaceLight overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-surfaceLight">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 uppercase tracking-wider">Trivia</span>
            <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-lg leading-none">✕</button>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Acierta y gana fichas o giros de jackpot</p>
        </div>

        <div className="px-6 py-6 min-h-[320px] flex flex-col">
          <AnimatePresence mode="wait">
            {phase === 'loading' && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex-1 flex items-center justify-center">
                <div className="text-gray-500 text-sm">Cargando pregunta...</div>
              </motion.div>
            )}

            {phase === 'cooldown' && (
              <motion.div key="cooldown" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
                <div className="text-4xl">⏳</div>
                <p className="text-gray-300 font-semibold">Siguiente pregunta en</p>
                <p className="text-5xl font-extrabold text-purple-300">{cooldown}s</p>
                <p className="text-xs text-gray-600">Vuelve en un momento para seguir ganando</p>
              </motion.div>
            )}

            {(phase === 'question' || phase === 'answered') && question && (
              <motion.div key="question" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex-1 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${categoryColor}`}>{question.category}</span>
                </div>

                <p className="text-base font-semibold text-white leading-snug">{question.question}</p>

                <div className="flex flex-col gap-2 mt-1">
                  {question.options.map((opt, idx) => (
                    <button key={idx} className={optionStyle(idx)} onClick={() => submitAnswer(idx)} disabled={phase === 'answered'}>
                      <span className="text-gray-500 mr-2 text-xs">{String.fromCharCode(65 + idx)})</span>
                      {opt}
                    </button>
                  ))}
                </div>

                {/* Resultado */}
                <AnimatePresence>
                  {phase === 'answered' && result && (
                    <motion.div key="result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      className={`rounded-2xl p-4 text-center ${result.correct ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-rose-500/10 border border-rose-500/30'}`}>
                      {result.correct ? (
                        <>
                          <p className="text-emerald-300 font-bold text-base mb-1">✓ ¡Correcto!</p>
                          {result.reward?.type === 'chips' && (
                            <p className="text-emerald-200 text-sm">+{fmtChips(result.reward.amount)} fichas</p>
                          )}
                          {result.reward?.type === 'spin' && (
                            <p className="text-purple-300 text-sm">🎰 Recompensa: giro de jackpot de {fmtChips(result.reward.value)}</p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-rose-300 font-bold text-base mb-1">✗ Incorrecto</p>
                          <p className="text-gray-400 text-xs">La respuesta correcta era la {String.fromCharCode(65 + result.correctIndex)}</p>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {phase === 'answered' && (
                  <button onClick={loadQuestion}
                    className="w-full bg-purple-500/20 border border-purple-500/40 text-purple-300 py-2.5 rounded-xl font-bold text-sm active:scale-95 transition-transform mt-auto">
                    Siguiente pregunta
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default TriviaModal;
