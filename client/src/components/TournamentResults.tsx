import Avatar from './Avatar';
import { fmtChips } from '../utils';
import type { Room, Player } from '../../../shared/types';

interface Props {
  room: Room;
  currentUserId: string;
  isAdmin: boolean;
  onRestart: () => void;
  onExit: () => void;
}

const medal = (pos: number) => (pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `${pos}º`);

const TournamentResults = ({ room, currentUserId, isAdmin, onRestart, onExit }: Props) => {
  const players = room.players.filter(p => p.isActive);
  // Clasificación: ganador (con fichas) primero; resto por orden inverso de eliminación.
  const ranked = [...players].sort((a, b) => {
    const aAlive = a.chips > 0 ? 1 : 0;
    const bAlive = b.chips > 0 ? 1 : 0;
    if (aAlive !== bAlive) return bAlive - aAlive;
    return (b.bustedSeq || 0) - (a.bustedSeq || 0); // último eliminado = mejor puesto
  });
  const winner: Player | undefined = ranked[0];

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center bg-background/97 text-primary font-sans overflow-y-auto"
      style={{ padding: 'max(1.5rem, env(safe-area-inset-top, 0px)) 1.5rem max(1.5rem, env(safe-area-inset-bottom, 0px))' }}>
      <div className="w-full max-w-md flex flex-col items-center">
        <p className="text-[11px] text-amber-400 uppercase tracking-widest font-bold mb-1">Torneo finalizado</p>
        <h1 className="text-2xl font-bold tracking-tight mb-1 text-center">{room.name}</h1>

        {winner && (
          <div className="flex flex-col items-center my-5">
            <div className="ring-4 ring-amber-400 rounded-full">
              <Avatar seed={winner.avatar || winner.userId} decorationId={winner.equippedAvatarDecoration} />
            </div>
            <p className="mt-2 text-lg font-bold text-amber-300">{winner.name}</p>
            <p className="text-xs text-gray-400">Se lleva todo • {fmtChips(winner.chips)} fichas</p>
          </div>
        )}

        <div className="w-full space-y-1.5 mt-2">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Clasificación</p>
          {ranked.map((p, i) => {
            const isMe = p.userId === currentUserId;
            return (
              <div
                key={p.userId}
                className={`flex items-center gap-3 p-2.5 rounded-xl ${isMe ? 'bg-amber-500/15 border border-amber-500/30' : 'bg-surface'}`}
              >
                <span className="w-7 text-center text-sm font-bold text-gray-300">{medal(i + 1)}</span>
                <Avatar seed={p.avatar || p.userId} decorationId={p.equippedAvatarDecoration} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{p.name}{isMe ? ' (tú)' : ''}</p>
                </div>
                {p.chips > 0 && <span className="text-sm font-semibold text-emerald-300">{fmtChips(p.chips)}</span>}
              </div>
            );
          })}
        </div>

        <div className="w-full flex flex-col gap-2 mt-8">
          {isAdmin ? (
            <button
              onClick={onRestart}
              className="w-full py-3.5 rounded-2xl bg-white text-black font-bold text-sm active:scale-95 transition-transform"
            >
              Volver a empezar
            </button>
          ) : (
            <p className="text-center text-gray-500 text-xs">Esperando a que el anfitrión reinicie...</p>
          )}
          <button
            onClick={onExit}
            className="w-full py-3 rounded-2xl bg-surface border border-gray-700 text-gray-300 font-semibold text-sm active:scale-95 transition-transform"
          >
            Salir al lobby
          </button>
        </div>
      </div>
    </div>
  );
};

export default TournamentResults;
