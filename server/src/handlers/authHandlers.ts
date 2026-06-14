import { Socket } from 'socket.io';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  createUser,
  getUser,
  getUserByName,
  isNameTaken,
  setPasswordHash,
  updateUserName,
  updateUserAvatar,
  toPublicUser,
  getAllUsersRanked,
  getAllUsersAdmin,
  deleteUser,
  getMatchHistoryForUser,
  applyBalanceDelta,
  addXp,
  resetUserLevels,
  setJackpotUnlockLevel,
  updateLastSeen,
  addHaciendaTotal,
  getHaciendaTotal,
  payIsrael,
  bumpStat,
  addUnlockedShopItem,
  equipShopItem,
  setMovedToAndorra,
  addIsraelDonation,
  dbRun,
  resetShopPurchases
} from '../db';
import { issueToken, authUser, broadcastPresence, kickOtherSessions } from '../socketHelpers';
import { getShopCatalog, saveShopCatalog } from '../db';
import { levelFromXp, PAGUITA_MAX_LEVEL, DIETA_MAX_LEVEL, RULETA_MAX_LEVEL, TRIVIA_MAX_LEVEL, TRACK_BOOST_MAX, boostCost, TrackBoosts, LevelTrack, trackBoostCount } from '../../../shared/types';
import { sanitizeInput } from '../security';
import { findActiveRoomForUser, chipsInPlayFor } from '../roomManager';

const BCRYPT_ROUNDS = 10;

export const authHandlers = (socket: Socket) => {
  socket.on('login', async ({ name, password }, callback) => {
    const cleanName = sanitizeInput((name || '').trim());
    if (!cleanName) { callback({ error: 'Nombre vacío' }); return; }

    let user = await getUserByName(cleanName);

    if (!user) {
      const id = uuidv4();
      await createUser(id, cleanName);
      user = await getUser(id);
    } else if (user.password_hash) {
      if (!password) { callback({ needPassword: true }); return; }
      const ok = await bcrypt.compare(String(password), user.password_hash);
      if (!ok) { callback({ error: 'Contraseña incorrecta' }); return; }
    }

    if (!user) { callback({ error: 'No se pudo crear el usuario' }); return; }
    const token = await issueToken(user.id);
    console.log(`Login: ${user.name} -> ${user.id} (balance ${user.balance})`);
    const activeRoomId = findActiveRoomForUser(user.id);
    const publicUser = toPublicUser(user);
    socket.data.user = publicUser;
    kickOtherSessions(user.id, socket.id);
    updateLastSeen(user.id).catch(console.error);
    broadcastPresence();
    callback({ user: publicUser, token, activeRoomId, shopCatalog: await getShopCatalog() });
  });

  socket.on('resumeSession', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'sesión no válida' }); return; }
    const activeRoomId = findActiveRoomForUser(user.id);
    const publicUser = toPublicUser(user);
    socket.data.user = publicUser;
    kickOtherSessions(user.id, socket.id);
    updateLastSeen(user.id).catch(console.error);
    broadcastPresence();
    callback({ user: publicUser, token, activeRoomId, shopCatalog: await getShopCatalog() });
  });

  socket.on('setPassword', async ({ token, currentPassword, newPassword }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    const pwd = String(newPassword || '');
    if (pwd.length < 4) { callback({ error: 'La contraseña debe tener al menos 4 caracteres' }); return; }
    if (user.password_hash) {
      const ok = await bcrypt.compare(String(currentPassword || ''), user.password_hash);
      if (!ok) { callback({ error: 'Contraseña actual incorrecta' }); return; }
    }
    const hash = await bcrypt.hash(pwd, BCRYPT_ROUNDS);
    await setPasswordHash(user.id, hash);
    const updated = await getUser(user.id);
    callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('removePassword', async ({ token, currentPassword }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    if (!user.password_hash) { callback({ error: 'La cuenta no tiene contraseña' }); return; }
    const ok = await bcrypt.compare(String(currentPassword || ''), user.password_hash);
    if (!ok) { callback({ error: 'Contraseña incorrecta' }); return; }
    await setPasswordHash(user.id, null);
    const updated = await getUser(user.id);
    callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('changeName', async ({ token, newName }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    const clean = sanitizeInput((newName || '').trim());
    if (clean.length < 2) { callback({ error: 'Nombre demasiado corto' }); return; }
    if (await isNameTaken(clean, user.id)) { callback({ error: 'Ese nombre ya está en uso' }); return; }
    await updateUserName(user.id, clean);
    const updated = await getUser(user.id);
    const publicUser = updated ? toPublicUser(updated) : undefined;
    if (publicUser) socket.data.user = publicUser;
    callback({ ok: true, user: publicUser });
  });

  socket.on('changeAvatar', async ({ token, avatar }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    const rawAvatar = String(avatar || '').trim();
    let seed = user.id;
    if (rawAvatar.startsWith('data:image/')) {
      if (rawAvatar.length > 100000) { callback({ error: 'La imagen es demasiado grande' }); return; }
      seed = rawAvatar;
    } else {
      seed = sanitizeInput(rawAvatar.slice(0, 64)) || user.id;
    }
    await updateUserAvatar(user.id, seed);
    const updated = await getUser(user.id);
    const publicUser = updated ? toPublicUser(updated) : undefined;
    if (publicUser) socket.data.user = publicUser;
    callback({ ok: true, user: publicUser });
  });

  socket.on('getLeaderboard', async (_data, callback) => {
    const { io } = require('../socketHelpers');
    const onlineUserIds = new Set<string>();
    if (io) {
      for (const [, s] of io.sockets.sockets) {
        if (s.data?.user?.id) onlineUserIds.add(s.data.user.id);
      }
    }
    const users = await getAllUsersRanked();
    callback(users.map(u => ({
      name: u.name,
      balance: u.balance,
      avatar: u.avatar || u.id,
      level: levelFromXp(u.xp ?? 0),
      lastSeen: u.last_seen,
      isOnline: onlineUserIds.has(u.id),
      equippedAvatarDecoration: u.equipped_avatar_decoration || undefined,
      equippedNameDecoration: u.equipped_name_decoration || undefined,
      movedToAndorra: !!u.moved_to_andorra
    })));
  });

  socket.on('buyShopItem', async ({ token, itemId }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const catalog = await getShopCatalog();
    const item = catalog.find(i => i.id === itemId);
    if (!item) { callback({ error: 'Item no encontrado' }); return; }

    const dbUser = await getUser(user.id);
    if (!dbUser) { callback({ error: 'Usuario no encontrado' }); return; }

    const userLevel = levelFromXp(dbUser.xp ?? 0);
    if (item.minLevel && userLevel < item.minLevel) {
      callback({ error: `Necesitas nivel ${item.minLevel} para comprar esto` }); return;
    }

    if (item.type === 'social' && itemId === 'social_andorra') {
      if (dbUser.moved_to_andorra) { callback({ error: 'Ya vives en Andorra' }); return; }
    } else if (item.type !== 'social') {
      let isUnlocked = false;
      const getUnlocked = (col: string) => dbUser[col as keyof typeof dbUser] ? JSON.parse(dbUser[col as keyof typeof dbUser] as string) : [];
      if (item.type === 'avatar') isUnlocked = getUnlocked('unlocked_avatar_decorations').includes(item.id);
      if (item.type === 'name') isUnlocked = getUnlocked('unlocked_name_decorations').includes(item.id);
      if (item.type === 'felt') isUnlocked = getUnlocked('unlocked_bj_felts').includes(item.id);
      if (isUnlocked) { callback({ error: 'Ya tienes este item' }); return; }
    }

    if (dbUser.balance < item.price) {
      callback({ error: 'Saldo insuficiente' }); return;
    }

    await applyBalanceDelta(user.id, -item.price);

    if (item.type === 'social' && itemId === 'social_andorra') {
      const { setMovedToAndorra } = require('../db');
      await setMovedToAndorra(user.id);
    } else if (item.type !== 'social') {
      await addUnlockedShopItem(user.id, item.type, item.id);
      await equipShopItem(user.id, item.type, item.id);
    }

    const updated = await getUser(user.id);
    if (updated) {
      socket.data.user = toPublicUser(updated);
      callback({ ok: true, user: socket.data.user });
      
      const { findActiveRoomForUser, broadcastRoom } = require('../roomManager');
      const room = findActiveRoomForUser(user.id);
      if (room) {
        const p = room.players.find((pl: any) => pl.userId === user.id);
        if (p) {
          p.equippedAvatarDecoration = updated.equipped_avatar_decoration || undefined;
          p.equippedNameDecoration = updated.equipped_name_decoration || undefined;
          p.equippedBjFelt = updated.equipped_bj_felt || undefined;
          broadcastRoom(room.id);
        }
      }
    }
  });

  socket.on('equipShopItem', async ({ token, type, itemId }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    if (!['avatar', 'name', 'felt'].includes(type)) { callback({ error: 'Tipo inválido' }); return; }

    if (itemId) {
      const dbUser = await getUser(user.id);
      let isUnlocked = false;
      const getUnlocked = (col: string) => dbUser?.[col as keyof typeof dbUser] ? JSON.parse(dbUser[col as keyof typeof dbUser] as string) : [];
      if (type === 'avatar') isUnlocked = getUnlocked('unlocked_avatar_decorations').includes(itemId);
      if (type === 'name') isUnlocked = getUnlocked('unlocked_name_decorations').includes(itemId);
      if (type === 'felt') isUnlocked = getUnlocked('unlocked_bj_felts').includes(itemId);
      if (!isUnlocked) { callback({ error: 'No tienes este item' }); return; }
    }

    await equipShopItem(user.id, type as any, itemId);
    const updated = await getUser(user.id);
    if (updated) {
      socket.data.user = toPublicUser(updated);
      callback({ ok: true, user: socket.data.user });
      
      const { findActiveRoomForUser, broadcastRoom } = require('../roomManager');
      const room = findActiveRoomForUser(user.id);
      if (room) {
        const p = room.players.find((pl: any) => pl.userId === user.id);
        if (p) {
          p.equippedAvatarDecoration = updated.equipped_avatar_decoration || undefined;
          p.equippedNameDecoration = updated.equipped_name_decoration || undefined;
          p.equippedBjFelt = updated.equipped_bj_felt || undefined;
          broadcastRoom(room.id);
        }
      }
      
      const { broadcastPresence } = require('../socketHelpers');
      broadcastPresence();
    }
  });

  socket.on('getHaciendaTotal', async (_data, callback) => {
    const total = await getHaciendaTotal();
    callback({ total });
  });

  socket.on('payIsrael', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    
    const dbUserBefore = await getUser(user.id);
    const debt = dbUserBefore?.israel_debt ?? 0;
    
    await payIsrael(user.id);
    
    const israelUser = await getUserByName('Israel');
    if (israelUser && debt > 0) {
      await applyBalanceDelta(israelUser.id, debt);
      
      const { notifyUser } = require('../socketHelpers');
      const updatedIsrael = await getUser(israelUser.id);
      if (updatedIsrael) {
        notifyUser(israelUser.id, 'userUpdated', toPublicUser(updatedIsrael));
        notifyUser(israelUser.id, 'giftReceived', { 
          from: `Deuda de ${user.name}`, 
          amount: debt
        });
      }
    }
    
    const updatedUser = await getUser(user.id);
    callback({ ok: true, user: updatedUser ? toPublicUser(updatedUser) : undefined });
  });

  socket.on('adminSetIsraelDebt', async ({ token, targetId, amount }, callback) => {
    const user = await authUser(token);
    if (!user || user.name !== 'Jorge') { callback({ error: 'No autorizado' }); return; }
    
    const amt = Math.floor(Number(amount));
    if (isNaN(amt) || amt < 0) { callback({ error: 'Cantidad inválida' }); return; }
    
    const { dbRun } = require('../db');
    await dbRun('UPDATE users SET israel_debt = ? WHERE id = ?', [amt, targetId]);
    
    const targetUser = await getUser(targetId);
    if (targetUser) {
      const { notifyUser } = require('../socketHelpers');
      notifyUser(targetId, 'userUpdated', toPublicUser(targetUser));
    }
    
    callback({ ok: true });
  });

  socket.on('getAdminUsers', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user || user.name !== 'Jorge') { callback({ error: 'No autorizado' }); return; }
    const users = await getAllUsersAdmin();
    callback({ ok: true, users: users.map(toPublicUser) });
  });

  socket.on('getMatchHistory', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    const rows = await getMatchHistoryForUser(user.id, 30);
    callback({
      ok: true,
      matches: rows.map(r => ({
        id: r.id,
        roomName: r.room_name,
        buyIn: r.buy_in,
        maxChips: r.max_chips,
        cashOut: r.cash_out,
        playedAt: r.played_at
      }))
    });
  });

  socket.on('adminAddBalance', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user || user.name !== 'Jorge') { callback({ error: 'No autorizado' }); return; }
    const newBalance = await applyBalanceDelta(user.id, 20_000_000);
    const updated = await getUser(user.id);
    callback({ ok: true, newBalance, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('adminAddBalance1B', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user || user.name !== 'Jorge') { callback({ error: 'No autorizado' }); return; }
    const newBalance = await applyBalanceDelta(user.id, 1_000_000_000);
    const updated = await getUser(user.id);
    callback({ ok: true, newBalance, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('adminAddBalance500B', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user || user.name !== 'Jorge') { callback({ error: 'No autorizado' }); return; }
    const newBalance = await applyBalanceDelta(user.id, 500_000_000_000);
    const updated = await getUser(user.id);
    callback({ ok: true, newBalance, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('adminAddBalance500T', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user || user.name !== 'Jorge') { callback({ error: 'No autorizado' }); return; }
    const newBalance = await applyBalanceDelta(user.id, 500_000_000_000_000);
    const updated = await getUser(user.id);
    callback({ ok: true, newBalance, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('adminAddXp', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user || user.name !== 'Jorge') { callback({ error: 'No autorizado' }); return; }
    await addXp(user.id, 1000);
    const updated = await getUser(user.id);
    callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('adminResetJackpotLevel', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user || user.name !== 'Jorge') { callback({ error: 'No autorizado' }); return; }
    await setJackpotUnlockLevel(user.id, 0);
    const updated = await getUser(user.id);
    callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('adminResetXp', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user || user.name !== 'Jorge') { callback({ error: 'No autorizado' }); return; }
    await resetUserLevels(user.id);
    const updated = await getUser(user.id);
    callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('adminResetShopPurchases', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user || user.name !== 'Jorge') { callback({ error: 'No autorizado' }); return; }
    await resetShopPurchases(user.id);
    const updated = await getUser(user.id);
    
    if (updated) {
      socket.data.user = toPublicUser(updated);
      callback({ ok: true, user: socket.data.user });
      
      const { findActiveRoomForUser, broadcastRoom } = require('../roomManager');
      const room = findActiveRoomForUser(user.id);
      if (room) {
        const p = room.players.find((pl: any) => pl.userId === user.id);
        if (p) {
          p.equippedAvatarDecoration = undefined;
          p.equippedNameDecoration = undefined;
          p.equippedBjFelt = undefined;
          broadcastRoom(room.id);
        }
      }
      
      const { broadcastPresence } = require('../socketHelpers');
      broadcastPresence();
    }
  });

  socket.on('adminSaveShopCatalog', async ({ token, catalog }, callback) => {
    const user = await authUser(token);
    if (!user || user.name !== 'Jorge') { callback({ error: 'No autorizado' }); return; }
    
    await saveShopCatalog(catalog);
    callback({ ok: true });
    
    const { io } = require('../socketHelpers');
    if (io) io.emit('shopCatalogUpdated', catalog);
  });

  socket.on('getShopCatalog', async (_data, callback) => {
    const catalog = await getShopCatalog();
    callback(catalog);
  });

  socket.on('adminDeleteUser', async ({ token, targetId }, callback) => {
    const user = await authUser(token);
    if (!user || user.name !== 'Jorge') { callback({ error: 'No autorizado' }); return; }
    if (user.id === targetId) { callback({ error: 'No te puedes borrar a ti mismo' }); return; }
    await deleteUser(targetId);
    console.log(`[ADMIN] User ${user.name} deleted user ${targetId}`);
    callback({ ok: true });
  });

  socket.on('getOnlinePlayers', async (_data, callback) => {
    const { io } = require('../socketHelpers');
    const userIds = new Set<string>();
    if (io) {
      for (const [, s] of io.sockets.sockets) {
        if (s.data.user) userIds.add(s.data.user.id);
      }
    }
    const players = (await Promise.all(Array.from(userIds).map(id => getUser(id))))
      .filter(Boolean)
      .map(u => {
        const pub = toPublicUser(u!);
        // Patrimonio real: saldo fuera de mesa + fichas en juego (si está sentado all-in, su saldo de BD es 0).
        return { ...pub, balance: pub.balance + chipsInPlayFor(u!.id) };
      });
    callback({ ok: true, players });
  });

  socket.on('sendGift', async ({ token, targetName, amount }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    
    const amt = Math.floor(Number(amount));
    if (isNaN(amt) || amt <= 0) {
      callback({ error: 'Cantidad inválida' }); return;
    }
    
    const dbUser = await getUser(user.id);
    if (!dbUser || dbUser.balance < amt) {
      callback({ error: 'Saldo insuficiente' }); return;
    }
    
    const target = await getUserByName(targetName);
    if (!target) {
      callback({ error: 'Usuario no encontrado' }); return;
    }
    
    if (target.id === user.id) {
      callback({ error: 'No puedes regalarte a ti mismo' }); return;
    }
    
    await applyBalanceDelta(user.id, -amt);

    const tax = Math.floor(amt * 0.2);
    const finalAmount = amt - tax;
    await applyBalanceDelta(target.id, finalAmount);
    bumpStat(user.id, 'gifts_sent', amt);
    bumpStat(target.id, 'gifts_received', finalAmount);
    
    if (tax > 0) {
      const newTotal = await addHaciendaTotal(tax);
      const { io } = require('../socketHelpers');
      if (io) io.emit('haciendaUpdated', { total: newTotal });
    }
    
    let extraXp = 0;
    if (amt >= 1_000_000) {
      extraXp = Math.floor(Math.log10(amt / 1_000_000 + 1) * 500);
    }
    const xpReward = Math.min(500, 100 + extraXp);
    await addXp(user.id, xpReward);
    
    const updated = await getUser(user.id);
    const updatedTarget = await getUser(target.id);
    
    const { notifyUser, broadcastPresence } = require('../socketHelpers');
    notifyUser(target.id, 'giftReceived', { 
      from: user.name, 
      amount: finalAmount,
      updatedUser: updatedTarget ? toPublicUser(updatedTarget) : undefined
    });
    if (updatedTarget) {
      notifyUser(target.id, 'userUpdated', toPublicUser(updatedTarget));
    }
    broadcastPresence();
    
    callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('donateToIsrael', async ({ token, amount }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const amt = Math.floor(Number(amount));
    if (isNaN(amt) || amt <= 0) { callback({ error: 'Cantidad inválida' }); return; }

    await addIsraelDonation(user.id, amt);

    const updated = await getUser(user.id);
    callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('buyTrackBoost', async ({ token, track }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const validTracks: LevelTrack[] = ['paguita', 'dieta', 'ruleta', 'trivia'];
    if (!validTracks.includes(track)) { callback({ error: 'Track inválido' }); return; }
    const t = track as LevelTrack;

    const dbUser = await getUser(user.id);
    if (!dbUser) { callback({ error: 'Usuario no encontrado' }); return; }

    // Require max level
    const maxLevelMap: Record<LevelTrack, number> = { paguita: PAGUITA_MAX_LEVEL, dieta: DIETA_MAX_LEVEL, ruleta: RULETA_MAX_LEVEL, trivia: TRIVIA_MAX_LEVEL };
    const userLevelMap: Record<LevelTrack, number> = { paguita: dbUser.paguita_level ?? 0, dieta: dbUser.dieta_level ?? 0, ruleta: dbUser.ruleta_level ?? 0, trivia: dbUser.trivia_level ?? 0 };
    const maxLevel = maxLevelMap[t];
    const userLevel = userLevelMap[t];
    if (userLevel < maxLevel) { callback({ error: `Necesitas ${track} al nivel máximo (${maxLevel})` }); return; }

    const boosts: TrackBoosts = (() => { try { const p = JSON.parse(dbUser.unlocked_boosts || '{}'); return (!Array.isArray(p) && typeof p === 'object') ? p : {}; } catch { return {}; } })();
    const currentCount = trackBoostCount(t, boosts);
    const maxBoosts = TRACK_BOOST_MAX[t];
    if (currentCount >= maxBoosts) { callback({ error: 'Ya tienes el máximo de mejoras para este track' }); return; }

    const cost = boostCost(t, currentCount);
    if (dbUser.balance < cost) { callback({ error: 'Saldo insuficiente' }); return; }

    await applyBalanceDelta(user.id, -cost);
    const newBoosts: TrackBoosts = { ...boosts, [t]: currentCount + 1 };
    await dbRun('UPDATE users SET unlocked_boosts = ? WHERE id = ?', [JSON.stringify(newBoosts), user.id]);

    const updated = await getUser(user.id);
    if (updated) {
      socket.data.user = toPublicUser(updated);
      callback({ ok: true, user: socket.data.user });
    }
  });
};
