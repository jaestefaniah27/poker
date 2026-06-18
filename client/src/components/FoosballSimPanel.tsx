import { useState, useEffect, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { FoosballState, FoosballPlayerStats } from '../../../shared/types';
import { fmtChips } from '../utils';

interface Props {
  socket: Socket;
  onClose: () => void;
}

interface PlayerInput {
  name: string;
  elo: number;
}

const DEFAULT_ELO = 1200;

export default function FoosballSimPanel({ socket, onClose }: Props) {
  const [state, setState] = useState<FoosballState | null>(null);
  const [players, setPlayers] = useState<FoosballPlayerStats[]>([]);
  const [team1, setTeam1] = useState<[PlayerInput, PlayerInput]>([
    { name: '', elo: DEFAULT_ELO }, { name: '', elo: DEFAULT_ELO },
  ]);
  const [team2, setTeam2] = useState<[PlayerInput, PlayerInput]>([
    { name: '', elo: DEFAULT_ELO }, { name: '', elo: DEFAULT_ELO },
  ]);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3000);
  };

  const sync = useCallback(() => {
    socket.emit('foosball_sync', {}, (res: any) => {
      if (res?.state) setState(res.state);
      if (res?.players) setPlayers(res.players);
    });
  }, [socket]);

  useEffect(() => {
    sync();
    const handler = (s: FoosballState) => setState(s);
    const elosHandler = () => { socket.emit('foosball_get_players', {}, (r: any) => { if (r?.players) setPlayers(r.players); }); };
    socket.on('foosball_updated', handler);
    socket.on('foosball_elos_updated', elosHandler);
    return () => {
      socket.off('foosball_updated', handler);
      socket.off('foosball_elos_updated', elosHandler);
    };
  }, [sync, socket]);

  // Auto-fill ELO cuando el usuario escribe un nombre conocido
  const handleNameChange = (
    team: 'team1' | 'team2', idx: 0 | 1, name: string
  ) => {
    const known = players.find(p => p.name.toLowerCase() === name.toLowerCase());
    const elo = known?.elo ?? DEFAULT_ELO;
    if (team === 'team1') {
      setTeam1(prev => { const copy: [PlayerInput, PlayerInput] = [...prev] as any; copy[idx] = { name, elo }; return copy; });
    } else {
      setTeam2(prev => { const copy: [PlayerInput, PlayerInput] = [...prev] as any; copy[idx] = { name, elo }; return copy; });
    }
  };

  const handleEloChange = (team: 'team1' | 'team2', idx: 0 | 1, elo: number) => {
    if (team === 'team1') {
      setTeam1(prev => { const copy: [PlayerInput, PlayerInput] = [...prev] as any; copy[idx] = { ...prev[idx], elo }; return copy; });
    } else {
      setTeam2(prev => { const copy: [PlayerInput, PlayerInput] = [...prev] as any; copy[idx] = { ...prev[idx], elo }; return copy; });
    }
  };

  const startMatch = () => {
    const all = [team1[0].name, team1[1].name, team2[0].name, team2[1].name];
    if (all.some(n => !n.trim())) { flash('Rellena todos los nombres', false); return; }
    const unique = new Set(all.map(n => n.trim().toLowerCase()));
    if (unique.size < 4) { flash('Los 4 jugadores deben ser diferentes', false); return; }

    setLoading(true);
    // Primero actualizar ELOs individuales por si el admin los modificó
    Promise.all([...team1, ...team2].map(p =>
      new Promise(res => socket.emit('foosball_sim_set_elo', { name: p.name.trim(), elo: p.elo }, res))
    )).then(() => {
      socket.emit('foosball_sim_start', {
        team1_p1: team1[0].name.trim(),
        team1_p2: team1[1].name.trim(),
        team2_p1: team2[0].name.trim(),
        team2_p2: team2[1].name.trim(),
      }, (res: any) => {
        setLoading(false);
        if (res?.error) { flash(res.error, false); return; }
        flash('Partido iniciado', true);
      });
    });
  };

  const scoreGoal = (team: 1 | 2) => {
    setLoading(true);
    socket.emit('foosball_sim_goal', { team }, (res: any) => {
      setLoading(false);
      if (res?.error) flash(res.error, false);
    });
  };

  const endMatch = () => {
    socket.emit('foosball_sim_end', {}, (res: any) => {
      if (res?.error) flash(res.error, false);
      else flash('Partido finalizado', true);
    });
  };

  const m = state?.match;
  const active = m && m.status !== 'finished';
  const teamElo = (t: [PlayerInput, PlayerInput]) => Math.round((t[0].elo + t[1].elo) / 2);
  const eloColor = (elo: number) => elo >= 1400 ? 'text-amber-400' : elo >= 1200 ? 'text-emerald-400' : 'text-gray-400';

  return (
    <div className="fixed inset-0 bg-black/90 z-[60] flex items-end justify-center" style={{ paddingTop: 'env(safe-area-inset-top,0px)', paddingBottom: 'env(safe-area-inset-bottom,0px)' }} onClick={onClose}>
      <div className="bg-[#0F0F14] border border-white/10 w-full max-w-md h-full sm:h-auto sm:max-h-[95vh] rounded-t-3xl sm:rounded-[32px] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5 flex-shrink-0">
          <div className="w-8" />
          <div className="flex items-center gap-2">
            <span className="text-base">🎮</span>
            <h2 className="text-base font-bold text-white">Simulador Futbolín</h2>
            <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">ADMIN</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-gray-300 text-sm">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ touchAction: 'pan-y' }}>

          {/* Flash */}
          {msg && (
            <div className={`px-4 py-2 rounded-xl text-sm font-medium text-center ${msg.ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
              {msg.text}
            </div>
          )}

          {/* ─── Sin partido: formulario de inicio ─── */}
          {!active && (
            <div className="space-y-3">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Configurar partido</p>

              {/* Equipos */}
              {([['team1', team1, setTeam1], ['team2', team2, setTeam2]] as const).map(([key, team, _set], ti) => (
                <div key={key} className={`bg-white/5 rounded-2xl p-3 border ${ti === 0 ? 'border-blue-500/20' : 'border-orange-500/20'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold ${ti === 0 ? 'text-blue-400' : 'text-orange-400'}`}>Equipo {ti + 1}</span>
                    <span className="text-[10px] text-gray-500">ELO medio: <span className={`font-bold ${eloColor(teamElo(team))}`}>{teamElo(team)}</span></span>
                  </div>
                  <div className="space-y-2">
                    {([0, 1] as const).map(idx => (
                      <div key={idx} className="flex gap-2 items-center">
                        {/* Nombre con autocompletado */}
                        <div className="flex-1 relative">
                          <input
                            value={team[idx].name}
                            onChange={e => handleNameChange(key as any, idx, e.target.value)}
                            placeholder={`Jugador ${idx + 1}`}
                            list={`players-${key}-${idx}`}
                            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/30"
                          />
                          <datalist id={`players-${key}-${idx}`}>
                            {players.map(p => <option key={p.name} value={p.name} />)}
                          </datalist>
                        </div>
                        {/* ELO */}
                        <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-xl px-2 py-2">
                          <span className="text-[10px] text-gray-500">ELO</span>
                          <input
                            type="number"
                            value={team[idx].elo}
                            onChange={e => handleEloChange(key as any, idx, parseInt(e.target.value) || DEFAULT_ELO)}
                            className="w-14 bg-transparent text-sm font-bold text-amber-400 text-right focus:outline-none"
                            min={100} max={3000} step={10}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <button
                onClick={startMatch}
                disabled={loading}
                className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-sm transition-all active:scale-95"
              >
                ⚽ Iniciar partido
              </button>
            </div>
          )}

          {/* ─── Partido en curso: panel de control ─── */}
          {active && m && (
            <div className="space-y-3">
              {/* Estado */}
              <div className="flex items-center justify-between">
                <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${m.status === 'active' ? 'text-emerald-400' : 'text-orange-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${m.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-orange-400'}`} />
                  {m.status === 'active' ? 'Apuestas abiertas' : 'Apuestas cerradas'}
                </span>
                <span className="text-[10px] text-gray-500">Primero a 4 goles gana</span>
              </div>

              {/* Marcador */}
              <div className="bg-gradient-to-b from-white/5 to-transparent rounded-3xl p-4">
                <div className="flex items-stretch gap-3">
                  {/* Equipo 1 */}
                  <div className="flex-1 text-center">
                    <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-1">Equipo 1</p>
                    <p className="text-xs text-gray-300 truncate">{m.team1_p1}</p>
                    <p className="text-xs text-gray-300 truncate">{m.team1_p2}</p>
                    <p className="text-4xl font-black text-white mt-2">{m.score1}</p>
                    <p className="text-[10px] text-gray-600">ELO {m.team1_elo}</p>
                  </div>
                  <div className="flex items-center text-gray-700 font-bold text-xl">—</div>
                  {/* Equipo 2 */}
                  <div className="flex-1 text-center">
                    <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider mb-1">Equipo 2</p>
                    <p className="text-xs text-gray-300 truncate">{m.team2_p1}</p>
                    <p className="text-xs text-gray-300 truncate">{m.team2_p2}</p>
                    <p className="text-4xl font-black text-white mt-2">{m.score2}</p>
                    <p className="text-[10px] text-gray-600">ELO {m.team2_elo}</p>
                  </div>
                </div>
              </div>

              {/* Botones de gol */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => scoreGoal(1)}
                  disabled={loading}
                  className="py-4 rounded-2xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 font-bold text-sm transition-all active:scale-95 disabled:opacity-50"
                >
                  ⚽ Gol Equipo 1
                </button>
                <button
                  onClick={() => scoreGoal(2)}
                  disabled={loading}
                  className="py-4 rounded-2xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 text-orange-300 font-bold text-sm transition-all active:scale-95 disabled:opacity-50"
                >
                  ⚽ Gol Equipo 2
                </button>
              </div>

              <button
                onClick={endMatch}
                className="w-full py-2.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-semibold text-sm hover:bg-red-500/20 transition-all"
              >
                Terminar partido manualmente
              </button>
            </div>
          )}

          {/* ─── Ranking de jugadores ─── */}
          {players.length > 0 && (
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Ranking jugadores</p>
              <div className="space-y-1.5">
                {players.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-3 bg-white/4 rounded-xl px-3 py-2">
                    <span className="text-gray-600 text-xs w-4 text-center">{i + 1}</span>
                    <span className="flex-1 text-sm text-gray-200 font-medium">{p.name}</span>
                    <span className={`font-mono text-sm font-bold ${eloColor(p.elo)}`}>{p.elo}</span>
                    <span className="text-[10px] text-gray-500">{p.wins}W {p.losses}L</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
