const { io } = require('socket.io-client');
const mk = () => io('http://localhost:3097', { transports:['websocket'] });
const emit = (s,ev,p) => new Promise(r => s.emit(ev,p,r));
const wait = ms => new Promise(r=>setTimeout(r,ms));
(async () => {
  const A = mk(), B = mk();
  await new Promise(r => { let n=0; const f=()=>{if(++n===2)r()}; A.on('connect',f); B.on('connect',f); });
  const ra = await emit(A,'login',{name:'TmrA_'+Date.now()});
  const rb = await emit(B,'login',{name:'TmrB_'+Date.now()});
  let roomA = null; A.on('roomUpdated', r => roomA = r);
  await emit(A,'joinRoom',{roomId:'presidential', token:ra.token});
  await emit(B,'joinRoom',{roomId:'presidential', token:rb.token});
  await wait(300);
  A.emit('startGame',{roomId:'presidential'});
  await wait(800);
  console.log('start: phase=%s turnIdx=%s turnDuration=%s turnStartedAt?%s',
    roomA.phase, roomA.currentTurnIndex, roomA.turnDuration, !!roomA.turnStartedAt);
  const snap = JSON.stringify({turn:roomA.currentTurnIndex, phase:roomA.phase, folds:roomA.players.map(p=>p.hasFolded)});
  // Desconectamos B y comprobamos que A lo ve offline pero el asiento sigue
  B.close();
  await wait(600);
  const bInRoom = roomA.players.find(p => p.name.startsWith('TmrB'));
  console.log('tras desconexión B -> presente:%s isOnline:%s chips:%s',
    !!bInRoom, bInRoom && bInRoom.isOnline, bInRoom && bInRoom.chips);
  console.log('esperando ~22s a que salte la acción por defecto por timeout...');
  await wait(22000);
  const changed = JSON.stringify({turn:roomA.currentTurnIndex, phase:roomA.phase, folds:roomA.players.map(p=>p.hasFolded)}) !== snap;
  console.log('estado cambió tras timeout (acción por defecto aplicada):', changed);
  console.log('  ahora: phase=%s turnIdx=%s folds=%j', roomA.phase, roomA.currentTurnIndex, roomA.players.map(p=>p.hasFolded));
  console.log('ALL DONE');
  A.close(); process.exit(0);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
