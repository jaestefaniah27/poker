import { useState, useEffect } from 'react';
import Avatar from './Avatar';
import ProfileModal from './ProfileModal';
import Slider from './Slider';
import { socket, STAKE_TIERS, BLIND_DIVISORS, DEFAULT_BLIND_DIVISOR, BLIND_LABELS, blindsFor, fmtChips } from '../utils';
import type { Tournament, TournamentSummary } from '../../../shared/types';

const TOURNAMENT_BUY_INS = [100, 500, 1000, 5000, 10000];
const BLIND_STRUCTURE_OPTIONS = [
  { key: 'turbo', label: 'Turbo', sub: '3 min/nivel' },
  { key: 'normal', label: 'Normal', sub: '5 min/nivel' },
  { key: 'deep', label: 'Deep Stack', sub: '8 min/nivel' },
];

interface LobbyProps {
  user: { id: string; name: string; balance: number; avatar: string; hasPassword: boolean };
  token: string | null;
  rooms: any[];
  tournaments: TournamentSummary[];
  onJoinRoom: (roomId: string) => void;
  onJoinTournamentRoom: (tournamentId: string) => void;
  onLogout: () => void;
  onUpdateUser: (u: any) => void;
}

const Lobby = ({ user, token, rooms, tournaments, onJoinRoom, onJoinTournamentRoom, onLogout, onUpdateUser }: LobbyProps) => {
  const [showProfile, setShowProfile] = useState(false);

  // Create section
  const [createMode, setCreateMode] = useState<'table' | 'tournament'>('table');
  const [newRoomName, setNewRoomName] = useState('');
  const [showStakeSlider, setShowStakeSlider] = useState(false);
  const [createTierIndex, setCreateTierIndex] = useState(STAKE_TIERS.length - 1);
  const [createBlindDivisor, setCreateBlindDivisor] = useState(DEFAULT_BLIND_DIVISOR);

  // Tournament create form
  const [tName, setTName] = useState('');
  const [tBuyIn, setTBuyIn] = useState(1000);
  const [tMaxPlayers, setTMaxPlayers] = useState(6);
  const [tBlindStructure, setTBlindStructure] = useState('normal');
  const [tCreating, setTCreating] = useState(false);

  // Tournament detail modal
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [tLoading, setTLoading] = useState(false);
  const [tError, setTError] = useState('');

  // Listen for real-time tournament updates
  useEffect(() => {
    socket.on('tournamentUpdated', (t: Tournament) => {
      setSelectedTournament(prev => prev?.id === t.id ? t : prev);
    });
    socket.on('tournamentRequestResponse', ({ tournamentId, approved, reason }: any) => {
      if (selectedTournament?.id === tournamentId) {
        if (approved) {
          // Refresh tournament detail
          socket.emit('getTournament', { tournamentId }, (res: any) => {
            if (res?.tournament) setSelectedTournament(res.tournament);
          });
          setTError('');
        } else {
          setTError(reason || 'Solicitud rechazada');
        }
      }
    });
    socket.on('tournamentRequestReceived', ({ tournamentId }: any) => {
      if (selectedTournament?.id === tournamentId) {
        socket.emit('getTournament', { tournamentId }, (res: any) => {
          if (res?.tournament) setSelectedTournament(res.tournament);
        });
      }
    });
    return () => {
      socket.off('tournamentUpdated');
      socket.off('tournamentRequestResponse');
      socket.off('tournamentRequestReceived');
    };
  }, [selectedTournament?.id]);

  // ---- Table creation ----
  const openStakeSlider = () => {
    if (!newRoomName.trim()) return;
    setCreateTierIndex(STAKE_TIERS.length - 1);
    setCreateBlindDivisor(DEFAULT_BLIND_DIVISOR);
    setShowStakeSlider(true);
  };

  const confirmCreateRoom = () => {
    if (!newRoomName.trim()) return;
    socket.emit('createRoom', { roomName: newRoomName, tierIndex: createTierIndex, blindDivisor: createBlindDivisor }, (res: any) => {
      if (!res?.roomId) return;
      setShowStakeSlider(false);
      sessionStorage.setItem('pokerRoomId', res.roomId);
      socket.emit('joinRoom', { roomId: res.roomId, token });
    });
  };

  // ---- Tournament creation ----
  const confirmCreateTournament = () => {
    if (!tName.trim()) return;
    setTCreating(true);
    socket.emit('createTournament', {
      name: tName.trim(), buyIn: tBuyIn, maxPlayers: tMaxPlayers,
      blindStructure: tBlindStructure, token,
    }, (res: any) => {
      setTCreating(false);
      if (res?.ok && res?.tournament) {
        setSelectedTournament(res.tournament);
        socket.join?.(`tournament:${res.tournament.id}`);
        setTName('');
      }
    });
  };

  // ---- Tournament detail actions ----
  const openTournament = (id: string) => {
    setTLoading(true);
    setTError('');
    socket.emit('getTournament', { tournamentId: id }, (res: any) => {
      setTLoading(false);
      if (res?.tournament) {
        setSelectedTournament(res.tournament);
      }
    });
  };

  const handleRequestJoin = () => {
    if (!selectedTournament) return;
    setTLoading(true);
    setTError('');
    socket.emit('requestJoinTournament', { tournamentId: selectedTournament.id, token }, (res: any) => {
      setTLoading(false);
      if (res?.error) { setTError(res.error); return; }
      // Refresh
      socket.emit('getTournament', { tournamentId: selectedTournament.id }, (r: any) => {
        if (r?.tournament) setSelectedTournament(r.tournament);
      });
    });
  };

  const handleWithdraw = () => {
    if (!selectedTournament) return;
    socket.emit('withdrawTournament', { tournamentId: selectedTournament.id, token }, (res: any) => {
      if (res?.ok) setSelectedTournament(null);
      else if (res?.error) setTError(res.error);
    });
  };

  const handleApprove = (requestUserId: string) => {
    if (!selectedTournament) return;
    socket.emit('approveTournamentRequest', { tournamentId: selectedTournament.id, requestUserId, token }, (res: any) => {
      if (res?.error) setTError(res.error);
    });
  };

  const handleReject = (requestUserId: string) => {
    if (!selectedTournament) return;
    socket.emit('rejectTournamentRequest', { tournamentId: selectedTournament.id, requestUserId, token }, (res: any) => {
      if (res?.error) setTError(res.error);
    });
  };

  const handleStartTournament = () => {
    if (!selectedTournament) return;
    socket.emit('startTournament', { tournamentId: selectedTournament.id, token }, (res: any) => {
      if (res?.error) setTError(res.error);
    });
  };

  const handleGoToTable = () => {
    if (!selectedTournament?.roomId) return;
    onJoinTournamentRoom(selectedTournament.id);
  };

  // ---- Computed state for selected tournament ----
  const myStatus = selectedTournament ? (() => {
    if (selectedTournament.players.some(p => p.userId === user.id)) return 'accepted';
    if (selectedTournament.pendingRequests?.some(r => r.userId === user.id)) return 'pending';
    return 'none';
  })() : 'none';
  const isHost = selectedTournament?.creatorId === user.id;
  const canStart = isHost && (selectedTournament?.players.length ?? 0) >= 2 && selectedTournament?.status === 'registering';

  // ---- Mixed list: rooms + tournaments ----
  type ListItem =
    | { type: 'room'; data: any }
    | { type: 'tournament'; data: TournamentSummary };

  const listItems: ListItem[] = [
    ...rooms.map(r => ({ type: 'room' as const, data: r })),
    ...tournaments.map(t => ({ type: 'tournament' as const, data: t })),
  ].sort((a, b) => {
    // Tournaments first, then rooms
    if (a.type === 'tournament' && b.type === 'room') return -1;
    if (a.type === 'room' && b.type === 'tournament') return 1;
    return 0;
  });

  return (
    <div className="min-h-screen bg-background text-primary flex flex-col items-center font-sans" style={{ padding: 'max(1.5rem, env(safe-area-inset-top, 0px)) 1.5rem max(1.5rem, env(safe-area-inset-bottom, 0px))' }}>
      {showProfile && (
        <ProfileModal user={user} token={token} onClose={() => setShowProfile(false)} onUpdate={onUpdateUser} />
      )}

      {/* Tournament detail modal */}
      {selectedTournament && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center" onClick={() => { setSelectedTournament(null); setTError(''); }}>
          <div
            className="bg-[#1a1a1a] w-full max-w-md rounded-t-3xl p-6 pb-safe max-h-[90vh] overflow-y-auto"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5" />

            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">🏆 {selectedTournament.name}</h2>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  selectedTournament.status === 'registering' ? 'bg-amber-500/20 text-amber-400' :
                  selectedTournament.status === 'running' ? 'bg-emerald-500/20 text-emerald-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {selectedTournament.status === 'registering' ? 'Registro abierto' :
                   selectedTournament.status === 'running' ? 'En curso' : 'Finalizado'}
                </span>
              </div>
              <button onClick={() => { setSelectedTournament(null); setTError(''); }} className="text-gray-500 hover:text-white text-xl leading-none ml-4">✕</button>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-surface rounded-xl p-3 text-center border border-surfaceLight">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Buy-in</p>
                <p className="text-lg font-bold text-rose-300">${fmtChips(selectedTournament.buyIn)}</p>
              </div>
              <div className="bg-surface rounded-xl p-3 text-center border border-surfaceLight">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Premio</p>
                <p className="text-lg font-bold text-emerald-300">${fmtChips(selectedTournament.prizePool)}</p>
              </div>
              <div className="bg-surface rounded-xl p-3 text-center border border-surfaceLight">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Jugadores</p>
                <p className="text-lg font-bold text-white">{selectedTournament.players.length}/{selectedTournament.maxPlayers}</p>
              </div>
              <div className="bg-surface rounded-xl p-3 text-center border border-surfaceLight">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Fichas iniciales</p>
                <p className="text-lg font-bold text-white">1,500</p>
              </div>
            </div>

            {/* Prize structure */}
            {selectedTournament.prizeStructure && selectedTournament.prizeStructure.length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Premios</p>
                <div className="space-y-1">
                  {selectedTournament.prizeStructure.map((pct: number, i: number) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <span className="text-gray-300">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} {i + 1}º lugar</span>
                      <span className="font-semibold text-emerald-300">${fmtChips(Math.floor(selectedTournament.prizePool * pct / 100))} ({pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Accepted players */}
            <div className="mb-4">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Participantes ({selectedTournament.players.length})</p>
              <div className="space-y-1.5">
                {selectedTournament.players.map((p: any) => (
                  <div key={p.userId} className={`flex items-center gap-2.5 p-2 rounded-xl ${p.isEliminated ? 'opacity-40' : 'bg-surface'}`}>
                    <Avatar seed={p.avatar} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">{p.name}</p>
                      {p.isEliminated && p.finishPosition && (
                        <p className="text-xs text-gray-500">{p.finishPosition === 1 ? '🏆 Ganador' : `Eliminado ${p.finishPosition}º`}{p.prizeWon > 0 ? ` • +$${fmtChips(p.prizeWon)}` : ''}</p>
                      )}
                    </div>
                    {p.userId === selectedTournament.creatorId && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-semibold">Host</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Pending requests — only host sees these */}
            {isHost && selectedTournament.pendingRequests && selectedTournament.pendingRequests.length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] text-amber-400 uppercase tracking-wider font-semibold mb-2">Solicitudes pendientes ({selectedTournament.pendingRequests.length})</p>
                <div className="space-y-2">
                  {selectedTournament.pendingRequests.map((req: any) => (
                    <div key={req.userId} className="flex items-center gap-2.5 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <Avatar seed={req.avatar} />
                      <span className="text-sm font-semibold text-white flex-1">{req.name}</span>
                      <button
                        onClick={() => handleApprove(req.userId)}
                        className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-full font-semibold transition-colors"
                      >
                        ✓ Aceptar
                      </button>
                      <button
                        onClick={() => handleReject(req.userId)}
                        className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 rounded-full font-semibold transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tError && <p className="text-amber-400 text-xs text-center mb-3">{tError}</p>}

            {/* Action buttons */}
            {selectedTournament.status === 'registering' && (
              <div className="flex gap-2 flex-col">
                {myStatus === 'none' && (
                  <button
                    onClick={handleRequestJoin}
                    disabled={tLoading}
                    className="w-full py-3.5 rounded-2xl bg-white text-black font-bold text-sm active:scale-95 transition-transform disabled:opacity-50"
                  >
                    Solicitar inscripción (${fmtChips(selectedTournament.buyIn)})
                  </button>
                )}
                {myStatus === 'pending' && (
                  <div className="space-y-2">
                    <p className="text-center text-amber-400 text-sm font-semibold">⏳ Esperando aprobación del host...</p>
                    <button onClick={handleWithdraw} className="w-full py-3 rounded-2xl bg-background border border-gray-700 text-gray-400 text-sm font-semibold">
                      Cancelar solicitud
                    </button>
                  </div>
                )}
                {myStatus === 'accepted' && !isHost && (
                  <div className="space-y-2">
                    <p className="text-center text-emerald-400 text-sm font-semibold">✓ Inscrito</p>
                    <button onClick={handleWithdraw} className="w-full py-3 rounded-2xl bg-background border border-gray-700 text-gray-400 text-sm font-semibold">
                      Abandonar torneo
                    </button>
                  </div>
                )}
                {isHost && (
                  <div className="space-y-2">
                    {canStart ? (
                      <button onClick={handleStartTournament} className="w-full py-3.5 rounded-2xl bg-white text-black font-bold text-sm active:scale-95 transition-transform">
                        ¡Iniciar torneo! ({selectedTournament.players.length} jugadores)
                      </button>
                    ) : (
                      <p className="text-center text-gray-500 text-sm py-2">
                        {selectedTournament.players.length < 2 ? 'Mínimo 2 jugadores para iniciar' : 'Esperando jugadores...'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedTournament.status === 'running' && myStatus === 'accepted' && selectedTournament.roomId && (
              <button onClick={handleGoToTable} className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors">
                Ir a la mesa 🎯
              </button>
            )}
          </div>
        </div>
      )}

      <div className="w-full max-w-md">
        {/* Header */}
        <header className="flex justify-between items-center mb-8 pt-4">
          <h1 className="text-3xl font-bold tracking-tight">Lobby</h1>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end leading-tight">
              <span className="text-xs text-gray-400 font-medium">{user.name}</span>
              <span className={`font-mono text-sm ${user.balance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {user.balance < 0 ? `-$${fmtChips(Math.abs(user.balance))}` : `$${fmtChips(user.balance)}`}
              </span>
            </div>
            <button onClick={() => setShowProfile(true)} title="Mi perfil" className="rounded-full ring-2 ring-transparent hover:ring-gray-500 transition-all relative">
              <Avatar seed={user.avatar} />
              {user.hasPassword && (
                <span className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
              )}
            </button>
            <button onClick={onLogout} title="Cerrar sesión" className="text-gray-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </header>

        <div className="space-y-5">
          {/* ---- Create Game ---- */}
          <div className="bg-surface p-5 rounded-3xl border border-surfaceLight">
            <h2 className="text-sm text-gray-400 uppercase tracking-wider font-semibold mb-4">Create Game</h2>

            {/* Mode toggle */}
            <div className="flex bg-background rounded-xl p-1 mb-4 border border-gray-800">
              <button
                onClick={() => setCreateMode('table')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${createMode === 'table' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}
              >
                🃏 Mesa
              </button>
              <button
                onClick={() => setCreateMode('tournament')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${createMode === 'tournament' ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'}`}
              >
                🏆 Torneo
              </button>
            </div>

            {createMode === 'table' ? (
              <div className="flex gap-2">
                <input
                  type="text" value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                  placeholder="Room name..."
                  className="flex-1 bg-background border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-gray-400 text-sm"
                />
                <button onClick={openStakeSlider} className="bg-white text-black px-6 py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform">
                  Create
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <input
                  type="text" value={tName}
                  onChange={e => setTName(e.target.value)}
                  placeholder="Nombre del torneo..."
                  className="w-full bg-background border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-gray-400 text-sm"
                />

                <div>
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-1.5">Buy-in</p>
                  <div className="flex gap-1.5">
                    {TOURNAMENT_BUY_INS.map(b => (
                      <button key={b} onClick={() => setTBuyIn(b)}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${b === tBuyIn ? 'bg-rose-500 text-white' : 'bg-background border border-gray-700 text-gray-400'}`}>
                        ${fmtChips(b)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-1.5">Máx. jugadores</p>
                  <div className="flex gap-1.5">
                    {[2, 3, 4, 5, 6, 7, 8].map(n => (
                      <button key={n} onClick={() => setTMaxPlayers(n)}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${n === tMaxPlayers ? 'bg-emerald-500 text-black' : 'bg-background border border-gray-700 text-gray-400'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-1.5">Velocidad</p>
                  <div className="flex gap-1.5">
                    {BLIND_STRUCTURE_OPTIONS.map(opt => (
                      <button key={opt.key} onClick={() => setTBlindStructure(opt.key)}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${opt.key === tBlindStructure ? 'bg-amber-500 text-black' : 'bg-background border border-gray-700 text-gray-400'}`}>
                        <div>{opt.label}</div>
                        <div className="text-[9px] opacity-70">{opt.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-background rounded-xl px-4 py-2.5 flex justify-between text-xs text-gray-400">
                  <span>Premio estimado: <span className="text-emerald-300 font-semibold">${fmtChips(tBuyIn * tMaxPlayers)}</span></span>
                  <span>Fichas: <span className="text-white font-semibold">1,500</span></span>
                </div>

                <button
                  onClick={confirmCreateTournament}
                  disabled={tCreating || !tName.trim()}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-black py-3.5 rounded-xl font-bold text-sm active:scale-95 transition-transform disabled:opacity-50"
                >
                  {tCreating ? 'Creando...' : `Crear torneo ($${fmtChips(tBuyIn)} buy-in)`}
                </button>
              </div>
            )}
          </div>

          {/* ---- Join Game (rooms + tournaments mixed) ---- */}
          <div className="bg-surface p-5 rounded-3xl border border-surfaceLight">
            <h2 className="text-sm text-gray-400 uppercase tracking-wider font-semibold mb-4">Join Game</h2>
            {listItems.length === 0 ? (
              <p className="text-gray-500 text-center py-4 text-sm">No active games found.</p>
            ) : (
              <div className="space-y-2">
                {listItems.map(item => {
                  if (item.type === 'room') {
                    const room = item.data;
                    return (
                      <button key={room.id} onClick={() => onJoinRoom(room.id)}
                        className="w-full flex justify-between items-center bg-background p-4 rounded-2xl border border-gray-800 hover:border-gray-500 transition-colors text-left">
                        <div>
                          <h3 className="font-semibold text-base">{room.name}</h3>
                          <p className="text-xs text-gray-500">{room.playerCount}/8 Players • {room.phase}</p>
                          {room.bigBlind != null && (
                            <p className="text-xs mt-0.5">
                              <span className="text-emerald-300/80 font-semibold">{fmtChips(room.smallBlind)}/{fmtChips(room.bigBlind)}</span>
                              <span className="text-gray-600"> • </span>
                              <span className="text-rose-300/80 font-semibold">Buy-in {fmtChips(room.buyIn)}</span>
                            </p>
                          )}
                        </div>
                        <div className="bg-surfaceLight w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    );
                  } else {
                    const t = item.data;
                    return (
                      <button key={t.id} onClick={() => openTournament(t.id)}
                        className="w-full flex justify-between items-center bg-background p-4 rounded-2xl border border-amber-900/40 hover:border-amber-600/60 transition-colors text-left">
                        <div>
                          <h3 className="font-semibold text-base">🏆 {t.name}</h3>
                          <p className="text-xs text-gray-500">
                            {t.playerCount}/{t.maxPlayers} aceptados
                            {t.pendingCount > 0 && <span className="text-amber-500"> • {t.pendingCount} solicitando</span>}
                            {' • '}
                            <span className={t.status === 'registering' ? 'text-amber-400' : 'text-emerald-400'}>
                              {t.status === 'registering' ? 'Registro' : 'En curso'}
                            </span>
                          </p>
                          <p className="text-xs mt-0.5">
                            <span className="text-rose-300/80 font-semibold">Buy-in ${fmtChips(t.buyIn)}</span>
                            <span className="text-gray-600"> • </span>
                            <span className="text-emerald-300/80 font-semibold">Premio ${fmtChips(t.prizePool)}</span>
                          </p>
                        </div>
                        <div className="bg-amber-500/20 w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    );
                  }
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table stake slider modal */}
      {showStakeSlider && (() => {
        const buyIn = STAKE_TIERS[createTierIndex];
        const { smallBlind, bigBlind } = blindsFor(buyIn, createBlindDivisor);
        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setShowStakeSlider(false)}>
            <div className="w-full max-w-md bg-surface rounded-3xl p-6 border border-surfaceLight" onClick={e => e.stopPropagation()}>
              <h2 className="text-center text-lg font-bold mb-1 truncate">{newRoomName}</h2>
              <p className="text-center text-xs text-gray-500 mb-6 uppercase tracking-wider">Elige la entrada</p>

              <div className="text-center mb-4">
                <p className="text-sm text-emerald-300/80 font-semibold">Ciegas</p>
                <p className="text-4xl font-extrabold text-emerald-200">{fmtChips(smallBlind)} / {fmtChips(bigBlind)}</p>
              </div>
              <div className="text-center mb-6">
                <p className="text-sm text-rose-300/80 font-semibold">Buy-in</p>
                <p className="text-4xl font-extrabold text-rose-300">{fmtChips(buyIn)}</p>
              </div>

              <p className="text-[11px] text-gray-500 mb-1 px-1">Entrada</p>
              <Slider min={0} max={STAKE_TIERS.length - 1} step={1} value={createTierIndex} onChange={v => setCreateTierIndex(v)} accent="rose" formatLabel={v => fmtChips(STAKE_TIERS[v])} />
              <div className="flex justify-between px-1 mb-5 mt-1">
                {STAKE_TIERS.map((b, i) => (
                  <button key={i} onClick={() => setCreateTierIndex(i)} className={`text-[9px] ${i === createTierIndex ? 'text-white font-bold' : 'text-gray-600'}`}>{fmtChips(b)}</button>
                ))}
              </div>

              <p className="text-[11px] text-gray-500 mb-1 px-1">Ciegas</p>
              <div className="flex gap-1.5 mb-6">
                {BLIND_DIVISORS.map(d => (
                  <button key={d} onClick={() => setCreateBlindDivisor(d)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${d === createBlindDivisor ? 'bg-emerald-500 text-black' : 'bg-background border border-gray-700 text-gray-400'}`}>
                    {BLIND_LABELS[d]}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button onClick={() => setShowStakeSlider(false)} className="flex-1 bg-background border border-gray-700 text-gray-300 py-3 rounded-xl font-semibold text-sm active:scale-95 transition-transform">Cancelar</button>
                <button onClick={confirmCreateRoom} className="flex-1 bg-white text-black py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform">Start Game</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Lobby;
