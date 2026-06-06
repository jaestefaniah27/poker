import { Socket } from 'socket.io';
import { authUser } from '../socketHelpers';
import { applyBalanceDelta, getUser, addOneFreeSpin, toPublicUser } from '../db';
import { TRIVIA_QUESTIONS } from '../triviaQuestions';
import { JACKPOT_TIERS } from '../../../shared/types';

const COOLDOWN_MS = process.env.NODE_ENV === 'production' ? 10 * 1000 : 10 * 1000;

const triviaState = new Map<string, { lastAnswered: number; pendingId: number | null }>();

const CHIP_REWARDS = [1000, 2500, 5000, 10000, 25000, 50000, 100000];

function pickReward(): { type: 'chips'; amount: number } | { type: 'spin'; value: number } {
  if (Math.random() < 0.3) {
    const value = JACKPOT_TIERS[Math.floor(Math.random() * JACKPOT_TIERS.length)];
    return { type: 'spin', value };
  }
  return { type: 'chips', amount: CHIP_REWARDS[Math.floor(Math.random() * CHIP_REWARDS.length)] };
}

function pickQuestion(userId: string) {
  const lastId = triviaState.get(userId)?.pendingId;
  const pool = TRIVIA_QUESTIONS.filter(q => q.id !== lastId);
  return pool[Math.floor(Math.random() * pool.length)];
}

export const triviaHandlers = (socket: Socket) => {
  socket.on('getTriviaQuestion', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const state = triviaState.get(user.id);
    const remaining = COOLDOWN_MS - (Date.now() - (state?.lastAnswered ?? 0));
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
    triviaState.set(user.id, { lastAnswered: state?.lastAnswered ?? 0, pendingId: q.id });

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

    triviaState.set(user.id, { lastAnswered: Date.now(), pendingId: null });

    const correct = answerIndex === q.correct;
    if (!correct) { callback({ correct: false, correctIndex: q.correct }); return; }

    const reward = pickReward();
    if (reward.type === 'chips') {
      const newBalance = await applyBalanceDelta(user.id, reward.amount);
      socket.emit('balanceUpdated', { balance: newBalance });
      const updated = await getUser(user.id);
      callback({ correct: true, correctIndex: q.correct, reward, newBalance, user: updated ? toPublicUser(updated) : undefined });
    } else {
      await addOneFreeSpin(user.id, reward.value);
      const updated = await getUser(user.id);
      const newBalance = updated?.balance ?? user.balance;
      socket.emit('balanceUpdated', { balance: newBalance });
      callback({ correct: true, correctIndex: q.correct, reward, newBalance, user: updated ? toPublicUser(updated) : undefined });
    }
  });
};
