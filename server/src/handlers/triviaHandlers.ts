import { Socket } from 'socket.io';
import { authUser } from '../socketHelpers';
import { applyBalanceDelta, getUser, addOneFreeSpin, toPublicUser, addXp } from '../db';
import { TRIVIA_QUESTIONS } from '../triviaQuestions';
import { triviaRewardsFor, TriviaReward, XP_PER_TRIVIA_CORRECT, XP_PER_TRIVIA_PARTICIPATION, triviaCooldownMs, triviaSpinCount } from '../../../shared/types';

const triviaState = new Map<string, { lastAnswered: number; pendingId: number | null; seenIds: Set<number> }>();

// Elige recompensa del pool filtrado por el nivel de trivia del jugador.
function pickReward(triviaLevel: number): TriviaReward {
  const pool = triviaRewardsFor(triviaLevel);
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickQuestion(userId: string) {
  const state = triviaState.get(userId);
  let seenIds = state?.seenIds ?? new Set<number>();
  // Si ya se vieron todas, reiniciar ciclo
  if (seenIds.size >= TRIVIA_QUESTIONS.length) seenIds = new Set<number>();
  const pool = TRIVIA_QUESTIONS.filter(q => !seenIds.has(q.id));
  return pool[Math.floor(Math.random() * pool.length)];
}

export const triviaHandlers = (socket: Socket) => {
  socket.on('getTriviaQuestion', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const dbUser = await getUser(user.id);
    const cooldownMs = triviaCooldownMs(dbUser?.trivia_level ?? 0);
    const state = triviaState.get(user.id);
    const remaining = cooldownMs - (Date.now() - (state?.lastAnswered ?? 0));
    if (remaining > 0) { callback({ cooldown: Math.ceil(remaining / 1000) }); return; }

    // Si ya hay pregunta pendiente (salió y volvió a entrar), devolver la misma
    if (state?.pendingId != null) {
      const existing = TRIVIA_QUESTIONS.find(q => q.id === state.pendingId);
      if (existing) {
        callback({ question: { id: existing.id, question: existing.question, options: existing.options, category: existing.category } });
        return;
      }
    }

    const q = pickQuestion(user.id);
    const seenIds = new Set(state?.seenIds ?? []);
    seenIds.add(q.id);
    triviaState.set(user.id, { lastAnswered: state?.lastAnswered ?? 0, pendingId: q.id, seenIds });

    callback({ question: { id: q.id, question: q.question, options: q.options, category: q.category } });
  });

  socket.on('submitTriviaAnswer', async ({ token, questionId, answerIndex }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const state = triviaState.get(user.id);
    if (!state || state.pendingId !== questionId) {
      callback({ error: 'Pregunta no válida o ya respondida' }); return;
    }

    const q = TRIVIA_QUESTIONS.find(q => q.id === questionId);
    if (!q) { callback({ error: 'Pregunta no encontrada' }); return; }

    triviaState.set(user.id, { lastAnswered: Date.now(), pendingId: null, seenIds: state.seenIds });

    const isCorrect = answerIndex === q.correct;
    if (isCorrect) {
      await addXp(user.id, XP_PER_TRIVIA_CORRECT);
      const dbUser = await getUser(user.id);
      const reward = pickReward(dbUser?.trivia_level ?? 0);
      if (reward.type === 'chips') {
        const newBalance = await applyBalanceDelta(user.id, reward.amount);
        socket.emit('balanceUpdated', { balance: newBalance });
        const updated = await getUser(user.id);
        callback({ correct: true, correctIndex: q.correct, reward, newBalance, user: updated ? toPublicUser(updated) : undefined, addedXp: XP_PER_TRIVIA_CORRECT });
      } else {
        const spins = triviaSpinCount(dbUser?.trivia_level ?? 0);
        await addOneFreeSpin(user.id, reward.value, spins);
        const updated = await getUser(user.id);
        const newBalance = updated?.balance ?? user.balance;
        socket.emit('balanceUpdated', { balance: newBalance });
        callback({ correct: true, correctIndex: q.correct, reward: { ...reward, spins }, newBalance, user: updated ? toPublicUser(updated) : undefined, addedXp: XP_PER_TRIVIA_CORRECT });
      }
    } else {
      await addXp(user.id, XP_PER_TRIVIA_PARTICIPATION);
      const updated = await getUser(user.id);
      callback({ correct: false, correctIndex: q.correct, addedXp: XP_PER_TRIVIA_PARTICIPATION, user: updated ? toPublicUser(updated) : undefined });
    }
  });
};
