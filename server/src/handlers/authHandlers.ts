import { Socket } from 'socket.io';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { createUser, getUser, getUserByName, isNameTaken, setPasswordHash, updateUserName, updateUserAvatar, toPublicUser, getAllUsersRanked, getAllUsersAdmin, deleteUser, getMatchHistoryForUser } from '../db';
import { issueToken, authUser } from '../socketHelpers';
import { sanitizeInput } from '../security';
import { findActiveRoomForUser } from '../roomManager';

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
    callback({ user: toPublicUser(user), token, activeRoomId });
  });

  socket.on('resumeSession', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'sesión no válida' }); return; }
    const activeRoomId = findActiveRoomForUser(user.id);
    callback({ user: toPublicUser(user), token, activeRoomId });
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
    callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('changeAvatar', async ({ token, avatar }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    const seed = sanitizeInput(String(avatar || '').trim().slice(0, 64)) || user.id;
    await updateUserAvatar(user.id, seed);
    const updated = await getUser(user.id);
    callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('getLeaderboard', async (_data, callback) => {
    const users = await getAllUsersRanked();
    callback(users.map(u => ({ name: u.name, balance: u.balance, avatar: u.avatar || u.id })));
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

  socket.on('adminDeleteUser', async ({ token, targetId }, callback) => {
    const user = await authUser(token);
    if (!user || user.name !== 'Jorge') { callback({ error: 'No autorizado' }); return; }
    if (user.id === targetId) { callback({ error: 'No te puedes borrar a ti mismo' }); return; }
    await deleteUser(targetId);
    console.log(`[ADMIN] User ${user.name} deleted user ${targetId}`);
    callback({ ok: true });
  });
};
