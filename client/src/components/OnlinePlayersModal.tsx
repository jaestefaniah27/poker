import { useEffect, useState } from 'react';
import Avatar from './Avatar';
import { socket, fmtChips } from '../utils';

interface PublicUser {
  id: string;
  name: string;
  avatar: string;
  balance: number;
  level?: number;
}

interface OnlinePlayersModalProps {
  onClose: () => void;
}

const OnlinePlayersModal = ({ onClose }: OnlinePlayersModalProps) => {
  const [players, setPlayers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    socket.emit('getOnlinePlayers', {}, (res: { ok?: boolean, players?: PublicUser[] }) => {
      setLoading(false);
      if (res?.ok && res.players) {
        setPlayers(res.players);
      }
    });
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-md bg-surface rounded-3xl p-6 border border-surfaceLight max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Jugadores en línea ({players.length})
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 space-y-2 pr-1 scrollbar-hide">
          {loading ? (
            <p className="text-gray-500 text-center py-4 text-sm">Cargando...</p>
          ) : players.length === 0 ? (
            <p className="text-gray-500 text-center py-4 text-sm">Nadie conectado.</p>
          ) : (
            players.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background border border-transparent hover:border-gray-700 transition-colors">
                <div className="shrink-0 relative">
                  <Avatar seed={p.avatar || p.id} size={28} decorationId={p.equippedAvatarDecoration} />
                  <span className="absolute -top-1 -left-1 z-10 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 border border-black/40 flex items-center justify-center text-[9px] font-black text-black leading-none">
                    {p.level ?? 1}
                  </span>
                </div>
                <span className="text-sm font-medium truncate flex-1 text-gray-300">
                  {p.name}
                </span>
                <span className={`font-mono text-sm font-semibold shrink-0 ${p.balance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {p.balance < 0 ? `-$${fmtChips(Math.abs(p.balance))}` : `$${fmtChips(p.balance)}`}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default OnlinePlayersModal;
