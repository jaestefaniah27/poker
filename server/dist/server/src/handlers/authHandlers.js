"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authHandlers = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const uuid_1 = require("uuid");
const db_1 = require("../db");
const socketHelpers_1 = require("../socketHelpers");
const security_1 = require("../security");
const roomManager_1 = require("../roomManager");
const BCRYPT_ROUNDS = 10;
const authHandlers = (socket) => {
    socket.on('login', async ({ name, password }, callback) => {
        const cleanName = (0, security_1.sanitizeInput)((name || '').trim());
        if (!cleanName) {
            callback({ error: 'Nombre vacío' });
            return;
        }
        let user = await (0, db_1.getUserByName)(cleanName);
        if (!user) {
            const id = (0, uuid_1.v4)();
            await (0, db_1.createUser)(id, cleanName);
            user = await (0, db_1.getUser)(id);
        }
        else if (user.password_hash) {
            if (!password) {
                callback({ needPassword: true });
                return;
            }
            const ok = await bcryptjs_1.default.compare(String(password), user.password_hash);
            if (!ok) {
                callback({ error: 'Contraseña incorrecta' });
                return;
            }
        }
        if (!user) {
            callback({ error: 'No se pudo crear el usuario' });
            return;
        }
        const token = await (0, socketHelpers_1.issueToken)(user.id);
        console.log(`Login: ${user.name} -> ${user.id} (balance ${user.balance})`);
        const activeRoomId = (0, roomManager_1.findActiveRoomForUser)(user.id);
        callback({ user: (0, db_1.toPublicUser)(user), token, activeRoomId });
    });
    socket.on('resumeSession', async ({ token }, callback) => {
        const user = await (0, socketHelpers_1.authUser)(token);
        if (!user) {
            callback({ error: 'sesión no válida' });
            return;
        }
        const activeRoomId = (0, roomManager_1.findActiveRoomForUser)(user.id);
        callback({ user: (0, db_1.toPublicUser)(user), token, activeRoomId });
    });
    socket.on('setPassword', async ({ token, currentPassword, newPassword }, callback) => {
        const user = await (0, socketHelpers_1.authUser)(token);
        if (!user) {
            callback({ error: 'No autenticado' });
            return;
        }
        const pwd = String(newPassword || '');
        if (pwd.length < 4) {
            callback({ error: 'La contraseña debe tener al menos 4 caracteres' });
            return;
        }
        if (user.password_hash) {
            const ok = await bcryptjs_1.default.compare(String(currentPassword || ''), user.password_hash);
            if (!ok) {
                callback({ error: 'Contraseña actual incorrecta' });
                return;
            }
        }
        const hash = await bcryptjs_1.default.hash(pwd, BCRYPT_ROUNDS);
        await (0, db_1.setPasswordHash)(user.id, hash);
        const updated = await (0, db_1.getUser)(user.id);
        callback({ ok: true, user: updated ? (0, db_1.toPublicUser)(updated) : undefined });
    });
    socket.on('removePassword', async ({ token, currentPassword }, callback) => {
        const user = await (0, socketHelpers_1.authUser)(token);
        if (!user) {
            callback({ error: 'No autenticado' });
            return;
        }
        if (!user.password_hash) {
            callback({ error: 'La cuenta no tiene contraseña' });
            return;
        }
        const ok = await bcryptjs_1.default.compare(String(currentPassword || ''), user.password_hash);
        if (!ok) {
            callback({ error: 'Contraseña incorrecta' });
            return;
        }
        await (0, db_1.setPasswordHash)(user.id, null);
        const updated = await (0, db_1.getUser)(user.id);
        callback({ ok: true, user: updated ? (0, db_1.toPublicUser)(updated) : undefined });
    });
    socket.on('changeName', async ({ token, newName }, callback) => {
        const user = await (0, socketHelpers_1.authUser)(token);
        if (!user) {
            callback({ error: 'No autenticado' });
            return;
        }
        const clean = (0, security_1.sanitizeInput)((newName || '').trim());
        if (clean.length < 2) {
            callback({ error: 'Nombre demasiado corto' });
            return;
        }
        if (await (0, db_1.isNameTaken)(clean, user.id)) {
            callback({ error: 'Ese nombre ya está en uso' });
            return;
        }
        await (0, db_1.updateUserName)(user.id, clean);
        const updated = await (0, db_1.getUser)(user.id);
        callback({ ok: true, user: updated ? (0, db_1.toPublicUser)(updated) : undefined });
    });
    socket.on('changeAvatar', async ({ token, avatar }, callback) => {
        const user = await (0, socketHelpers_1.authUser)(token);
        if (!user) {
            callback({ error: 'No autenticado' });
            return;
        }
        const seed = (0, security_1.sanitizeInput)(String(avatar || '').trim().slice(0, 64)) || user.id;
        await (0, db_1.updateUserAvatar)(user.id, seed);
        const updated = await (0, db_1.getUser)(user.id);
        callback({ ok: true, user: updated ? (0, db_1.toPublicUser)(updated) : undefined });
    });
    socket.on('getLeaderboard', async (_data, callback) => {
        const users = await (0, db_1.getAllUsersRanked)();
        callback(users.map(u => ({ name: u.name, balance: u.balance, avatar: u.avatar || u.id })));
    });
    socket.on('getAdminUsers', async ({ token }, callback) => {
        const user = await (0, socketHelpers_1.authUser)(token);
        if (!user || user.name !== 'Jorge') {
            callback({ error: 'No autorizado' });
            return;
        }
        const users = await (0, db_1.getAllUsersAdmin)();
        callback({ ok: true, users: users.map(db_1.toPublicUser) });
    });
    socket.on('getMatchHistory', async ({ token }, callback) => {
        const user = await (0, socketHelpers_1.authUser)(token);
        if (!user) {
            callback({ error: 'No autenticado' });
            return;
        }
        const rows = await (0, db_1.getMatchHistoryForUser)(user.id, 30);
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
        const user = await (0, socketHelpers_1.authUser)(token);
        if (!user || user.name !== 'Jorge') {
            callback({ error: 'No autorizado' });
            return;
        }
        if (user.id === targetId) {
            callback({ error: 'No te puedes borrar a ti mismo' });
            return;
        }
        await (0, db_1.deleteUser)(targetId);
        console.log(`[ADMIN] User ${user.name} deleted user ${targetId}`);
        callback({ ok: true });
    });
};
exports.authHandlers = authHandlers;
