const fs = require('fs');
const { io } = require('socket.io-client');
const OUT = 'C:/Users/jaest/AppData/Local/Temp/timerresult.txt';
fs.writeFileSync(OUT, '');
const log = (...a) => fs.appendFileSync(OUT, a.join(' ') + '\n');
const mk = () => io('http://localhost:3097', { transports: ['websocket'] });
const emit = (s, ev, p) => new Promise(r => s.emit(ev, p, r));
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  try {
    const A = mk(), B = mk();
    await new Promise(r => { let n = 0; const f = () => { if (++n === 2) r(); }; A.on('connect', f); B.on('connect', f); });
    const ra = await emit(A, 'login', { name: 'TmrA_' + Date.now() });
    const rb = await emit(B, 'login', { name: 'TmrB_' + Date.now() });
    let roomA = null; A.on('roomUpdated', r => roomA = r);
    await emit(A, 'joinRoom', { roomId: 'presidential', token: ra.token });
    await emit(B, 'joinRoom', { roomId: 'presidential', token: rb.token });
    await wait(300);
    A.emit('startGame', { roomId: 'presidential' });
    await wait(800);
    log('1 start: phase=' + roomA.phase + ' turnIdx=' + roomA.currentTurnIndex + ' turnDuration=' + roomA.turnDuration + ' turnStartedAt?' + !!roomA.turnStartedAt);
    const snap = JSON.stringify({ turn: roomA.currentTurnIndex, phase: roomA.phase, folds: roomA.players.map(p => p.hasFolded), pot: roomA.pot });
    B.close();
    await wait(700);
    const b = roomA.players.find(p => p.name.startsWith('TmrB'));
    log('2 tras desconectar B -> presente:' + !!b + ' isOnline:' + (b && b.isOnline) + ' chips:' + (b && b.chips) + ' (asiento retenido)');
    log('3 esperando 22s a la accion por defecto por timeout...');
    await wait(22000);
    const now = JSON.stringify({ turn: roomA.currentTurnIndex, phase: roomA.phase, folds: roomA.players.map(p => p.hasFolded), pot: roomA.pot });
    log('4 estado cambio por timeout (accion por defecto aplicada): ' + (now !== snap));
    log('   ahora phase=' + roomA.phase + ' turnIdx=' + roomA.currentTurnIndex + ' folds=' + JSON.stringify(roomA.players.map(p => p.hasFolded)) + ' pot=' + roomA.pot);
    log('ALL DONE');
  } catch (e) { log('ERR ' + e.message); }
  await wait(200); process.exit(0);
})();
