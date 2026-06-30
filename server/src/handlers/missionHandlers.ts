import { Socket } from 'socket.io';
import { authUser } from '../socketHelpers';
import {
  getDailyMissionsView, claimDailyMission, getBrocheStateView, claimBroche,
  getAchievementsView, claimAchievement, spendMisionLevelPoint, getUser, toPublicUser,
} from '../db';

export const missionHandlers = (socket: Socket) => {
  // Estado completo de misiones (diarias + progreso + broches + logros) para el modal.
  socket.on('getMissions', async ({ token }: { token: string }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const daily = await getDailyMissionsView(user.id);
    const broches = await getBrocheStateView(user.id);
    const achievements = await getAchievementsView(user.id);

    callback({
      ok: true,
      missionDate: daily.missionDate,
      misionLevel: daily.misionLevel,
      missions: daily.missions,
      broches,
      achievements,
    });
  });

  // Reclama una diaria concreta (slot 0-4).
  socket.on('claimMission', async ({ token, slot }: { token: string; slot: number }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    if (typeof slot !== 'number' || slot < 0 || slot > 4) { callback({ error: 'Slot inválido' }); return; }

    const result = await claimDailyMission(user.id, slot);
    if (!result.ok) { callback({ error: result.error }); return; }

    const updated = await getUser(user.id);
    callback({ ok: true, rewardChips: result.rewardChips, rewardXp: result.rewardXp, user: updated ? toPublicUser(updated) : undefined });
  });

  // Reclama un broche (bronze/silver/gold).
  socket.on('claimBroche', async ({ token, tier }: { token: string; tier: 'bronze' | 'silver' | 'gold' }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    if (!['bronze', 'silver', 'gold'].includes(tier)) { callback({ error: 'Broche inválido' }); return; }

    const result = await claimBroche(user.id, tier);
    if (!result.ok) { callback({ error: result.error }); return; }

    const updated = await getUser(user.id);
    callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
  });

  // Reclama un logro permanente.
  socket.on('claimAchievement', async ({ token, achievementId }: { token: string; achievementId: string }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    if (!achievementId) { callback({ error: 'Logro inválido' }); return; }

    const result = await claimAchievement(user.id, achievementId);
    if (!result.ok) { callback({ error: result.error }); return; }

    const updated = await getUser(user.id);
    callback({ ok: true, rewardChips: result.rewardChips, rewardXp: result.rewardXp, user: updated ? toPublicUser(updated) : undefined });
  });

  // Sube 1 nivel el track de Misiones (gasta 1 punto de nivel, máx 5/día).
  socket.on('upgradeMisionTrack', async ({ token }: { token: string }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const result = await spendMisionLevelPoint(user.id);
    if (!result.ok) { callback({ error: result.error }); return; }

    const updated = await getUser(user.id);
    callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
  });
};
