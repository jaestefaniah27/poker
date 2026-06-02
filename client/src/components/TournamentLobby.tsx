import { useState, useEffect } from 'react';
import Avatar from './Avatar';
import { socket, fmtChips } from '../utils';
import type { Tournament, TournamentSummary, BlindLevel, TOURNAMENT_BLIND_STRUCTURES } from '../../../shared/types';

const BLIND_STRUCTURE_OPTIONS: { key: string; label: string }[] = [
  { key: 'turbo', label: 'Turbo (3 min)' },
  { key: 'normal', label: 'Normal (5 min)' },
  { key: 'deep', label: 'Deep Stack (8 min)' },
];

const BUY_IN_OPTIONS = [100, 500, 1000, 5000, 10000];

interface TournamentLobbyProps {
  user: { id: string; name: string; balance: number; avatar: string; hasPassword: boolean };
  token: string | null;
  onBack: () => void;
}

const TournamentLobby = ({ user, token, onBack }: TournamentLobbyProps) => {
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [finishedTournaments, setFinishedTournaments] = useState<TournamentSummary[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);

  // Create form
  const [tName, setTName] = useState('');
  const [tBuyIn, setTBuyIn] = useState(1000);
  const [tMaxPlayers, setTMaxPlayers] = useState(6);
  const [tBlindStructure, setTBlindStructure] = useState('normal');

  useEffect(() => {
    // Initial fetch
    socket.emit('getTournaments', (res: any) => {
      if (res?.tournaments) setTournaments(res.tournaments);
      if (res?.finished) setFinishedTournaments(res.finished);
    });

    socket.on('tournamentsUpdated', (list: TournamentSummary[]) => {
      setTournaments(list);
    });

    socket.on('tournamentUpdated', (t: Tournament) => {
      setSelectedTournament(prev => prev?.id === t.id ? t : prev);
    });

    socket.on('tournamentStarted', ({ tournamentId, roomId }: { tournamentId: string; roomId: string }) => {
      // Auto-join the tournament room
      sessionStorage.setItem('pokerRoomId', roomId);
      sessionStorage.setItem('tournamentId', tournamentId);
      socket.emit('joinTournamentRoom', { tournamentId, token });
    });

    return () => {
      socket.off('tournamentsUpdated');
      socket.off('tournamentUpdated');
      socket.off('tournamentStarted');
    };
  }, [token]);

  const handleCreate = () => {
    if (!tName.trim()) return;
    socket.emit('createTournament', {
      name: tName.trim(),
      buyIn: tBuyIn,
      maxPlayers: tMaxPlayers,
      blindStructure: tBlindStructure,
      token,
    }, (res: any) => {
      if (res?.tournament) {
        setShowCreate(false);
        setSelectedTournament(res.tournament);
        setTName('');
      }
    });
  };

  const handleJoin = (tournamentId: string) => {
    socket.emit('joinTournament', { tournamentId, token }, (res: any) => {
      if (res?.ok) {
        socket.emit('getTournament', { tournamentId }, (r: any) => {
          if (r?.tournament) setSelectedTournament(r.tournament);
        });
      }
    });
  };

  const handleLeave = (tournamentId: string) => {
    socket.emit('leaveTournament', { tournamentId, token }, (res: any) => {
      if (res?.ok) setSelectedTournament(null);
    });
  };

  const handleStart = (tournamentId: string) => {
    socket.emit('startTournament', { tournamentId, token }, (res: any) => {
      // tournamentStarted event will handle the room join
    });
  };

  const handleOpenTournament = (id: string) => {
    socket.emit('getTournament', { tournamentId: id }, (res: any) => {
      if (res?.tournament) {
        setSelectedTournament(res.tournament);
        socket.join?.(`tournament:${id}`);
      }
    });
  };

  // Tournament detail view
  if (selectedTournament) {
    const t = selectedTournament;
    const isRegistered = t.players.some(p => p.userId === user.id);
    const isCreator = t.creatorId === user.id;
    const alive = t.players.filter(p => !p.isEliminated).length;

    return (
      <div className="min-h-screen bg-background text-primary p-6 flex flex-col items-center font-sans" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top, 0px))' }}>
        <div className="w-full max-w-md">
          <header className="flex items-center gap-3 mb-6 pt-4">
            <button onClick={() => setSelectedTournament(null)} className="text-white opacity-80 hover:opacity-100">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold tracking-tight">🏆 {t.name}</h1>
          </header>

          {/* Status badge */}
          <div className="flex justify-center mb-4">
            <span className={`px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wider ${
              t.status === 'registering' ? 'bg-amber-500/20 text-amber-400' :
              t.status === 'running' ? 'bg-emerald-500/20 text-emerald-400' :
              'bg-gray-500/20 text-gray-400'
            }`}>
              {t.status === 'registering' ? 'Registro abierto' :
               t.status === 'running' ? 'En curso' : 'Finalizado'}
            </span>
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-surface rounded-2xl p-4 text-center border border-surfaceLight">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Buy-in</p>
              <p className="text-xl font-bold text-rose-300">${fmtChips(t.buyIn)}</p>
            </div>
            <div className="bg-surface rounded-2xl p-4 text-center border border-surfaceLight">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Premio</p>
              <p className="text-xl font-bold text-emerald-300">${fmtChips(t.prizePool)}</p>
            </div>
            <div className="bg-surface rounded-2xl p-4 text-center border border-surfaceLight">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Jugadores</p>
              <p className="text-xl font-bold text-white">
                {t.status === 'registering' ? `${t.players.length}/${t.maxPlayers}` : `${alive}/${t.players.length}`}
              </p>
            </div>
            <div className="bg-surface rounded-2xl p-4 text-center border border-surfaceLight">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Ciegas</p>
              <p className="text-lg font-bold text-white">
                {t.blindLevels[t.currentBlindLevel]
                  ? `${fmtChips(t.blindLevels[t.currentBlindLevel].smallBlind)}/${fmtChips(t.blindLevels[t.currentBlindLevel].bigBlind)}`
                  : '-'}
              </p>
              <p className="text-[10px] text-gray-500">Nivel {t.currentBlindLevel + 1}/{t.blindLevels.length}</p>
            </div>
          </div>

          {/* Prize structure */}
          {t.prizeStructure && t.prizeStructure.length > 0 && (
            <div className="bg-surface rounded-2xl p-4 mb-6 border border-surfaceLight">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-3">Premios</p>
              <div className="space-y-2">
                {t.prizeStructure.map((pct, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-sm text-gray-300">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} {i + 1}º lugar
                    </span>
                    <span className="text-sm font-bold text-emerald-300">
                      ${fmtChips(Math.floor(t.prizePool * pct / 100))} ({pct}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Players list */}
          <div className="bg-surface rounded-2xl p-4 mb-6 border border-surfaceLight">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-3">Jugadores</p>
            <div className="space-y-2">
              {t.players.map((p, i) => (
                <div key={p.userId} className={`flex items-center gap-3 p-2 rounded-xl ${p.isEliminated ? 'opacity-40' : ''}`}>
                  <span className="text-xs text-gray-500 w-5 text-right">{i + 1}</span>
                  <Avatar seed={p.avatar} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{p.name}</p>
                    {t.status === 'running' && !p.isEliminated && (
                      <p className="text-xs text-gray-400">{fmtChips(p.chips)} fichas</p>
                    )}
                    {p.isEliminated && p.finishPosition && (
                      <p className="text-xs text-gray-500">
                        {p.finishPosition === 1 ? '🏆 Ganador' : `Eliminado ${p.finishPosition}º`}
                        {p.prizeWon > 0 && ` — +$${fmtChips(p.prizeWon)}`}
                      </p>
                    )}
                  </div>
                  {p.userId === t.creatorId && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-semibold">Host</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          {t.status === 'registering' && (
            <div className="flex gap-3">
              {isRegistered ? (
                <>
                  {!isCreator && (
                    <button
                      onClick={() => handleLeave(t.id)}
                      className="flex-1 py-3.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition-colors"
                    >
                      Abandonar
                    </button>
                  )}
                  {isCreator && t.players.length >= 2 && (
                    <button
                      onClick={() => handleStart(t.id)}
                      className="flex-1 py-3.5 rounded-full bg-white text-black font-bold text-sm transition-transform active:scale-95"
                    >
                      ¡Empezar torneo!
                    </button>
                  )}
                  {isCreator && t.players.length < 2 && (
                    <p className="flex-1 text-center text-gray-500 text-sm py-3.5">Esperando jugadores...</p>
                  )}
                </>
              ) : (
                <button
                  onClick={() => handleJoin(t.id)}
                  className="flex-1 py-3.5 rounded-full bg-white text-black font-bold text-sm transition-transform active:scale-95"
                >
                  Inscribirse (${fmtChips(t.buyIn)})
                </button>
              )}
            </div>
          )}

          {t.status === 'running' && isRegistered && t.roomId && (
            <button
              onClick={() => {
                sessionStorage.setItem('pokerRoomId', t.roomId!);
                sessionStorage.setItem('tournamentId', t.id);
                socket.emit('joinTournamentRoom', { tournamentId: t.id, token });
              }}
              className="w-full py-3.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors"
            >
              Ir a la mesa
            </button>
          )}
        </div>
      </div>
    );
  }

  // Tournament list view
  return (
    <div className="min-h-screen bg-background text-primary p-6 flex flex-col items-center font-sans" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top, 0px))' }}>
      <div className="w-full max-w-md">
        <header className="flex items-center gap-3 mb-8 pt-4">
          <button onClick={onBack} className="text-white opacity-80 hover:opacity-100">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold tracking-tight">🏆 Torneos</h1>
        </header>

        {/* Create button */}
        <button
          onClick={() => setShowCreate(true)}
          className="w-full bg-surface p-4 rounded-2xl border border-surfaceLight hover:border-gray-500 transition-colors mb-6 flex items-center justify-center gap-2"
        >
          <span className="text-lg">+</span>
          <span className="text-sm font-semibold text-gray-300">Crear torneo</span>
        </button>

        {/* Active tournaments */}
        {tournaments.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm text-gray-400 uppercase tracking-wider font-semibold mb-3">Torneos activos</h2>
            <div className="space-y-2">
              {tournaments.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleOpenTournament(t.id)}
                  className="w-full flex justify-between items-center bg-surface p-4 rounded-2xl border border-surfaceLight hover:border-gray-500 transition-colors text-left"
                >
                  <div>
                    <h3 className="font-semibold text-base">🏆 {t.name}</h3>
                    <p className="text-xs text-gray-500">
                      {t.playerCount}/{t.maxPlayers} Players •{' '}
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
                  <div className="bg-surfaceLight w-8 h-8 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {tournaments.length === 0 && (
          <p className="text-gray-500 text-center py-8 text-sm">No hay torneos activos. ¡Crea uno!</p>
        )}

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setShowCreate(false)}>
            <div className="w-full max-w-md bg-surface rounded-3xl p-6 border border-surfaceLight" onClick={e => e.stopPropagation()}>
              <h2 className="text-center text-lg font-bold mb-6">Crear torneo</h2>

              <div className="mb-4">
                <label className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-1 block">Nombre</label>
                <input
                  type="text"
                  value={tName}
                  onChange={e => setTName(e.target.value)}
                  placeholder="Nombre del torneo..."
                  className="w-full bg-background border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-gray-400 text-sm"
                />
              </div>

              <div className="mb-4">
                <label className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-2 block">Buy-in</label>
                <div className="flex gap-1.5">
                  {BUY_IN_OPTIONS.map(b => (
                    <button
                      key={b}
                      onClick={() => setTBuyIn(b)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                        b === tBuyIn ? 'bg-rose-500 text-white' : 'bg-background border border-gray-700 text-gray-400'
                      }`}
                    >
                      ${fmtChips(b)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-2 block">Jugadores máx.</label>
                <div className="flex gap-1.5">
                  {[2, 3, 4, 5, 6, 7, 8].map(n => (
                    <button
                      key={n}
                      onClick={() => setTMaxPlayers(n)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                        n === tMaxPlayers ? 'bg-emerald-500 text-black' : 'bg-background border border-gray-700 text-gray-400'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-2 block">Velocidad</label>
                <div className="flex gap-1.5">
                  {BLIND_STRUCTURE_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setTBlindStructure(opt.key)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                        opt.key === tBlindStructure ? 'bg-amber-500 text-black' : 'bg-background border border-gray-700 text-gray-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-background rounded-xl p-3 mb-6 text-center">
                <p className="text-xs text-gray-500">Fichas iniciales: <span className="text-white font-semibold">1,500</span></p>
                <p className="text-xs text-gray-500 mt-1">
                  Premio estimado: <span className="text-emerald-300 font-semibold">${fmtChips(tBuyIn * tMaxPlayers)}</span>
                </p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 bg-background border border-gray-700 text-gray-300 py-3 rounded-xl font-semibold text-sm active:scale-95 transition-transform">
                  Cancelar
                </button>
                <button onClick={handleCreate} className="flex-1 bg-white text-black py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform">
                  Crear
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TournamentLobby;
