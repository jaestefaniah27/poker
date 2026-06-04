import { useEffect, useState } from 'react';
import { socket, fmtChips } from '../utils';

interface MatchHistoryEntry {
  id: number;
  roomName: string;
  buyIn: number;
  maxChips: number;
  cashOut: number;
  playedAt: number;
}

interface MatchHistoryModalProps {
  token: string | null;
  onClose: () => void;
}

const formatDate = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

const MatchHistoryModal = ({ token, onClose }: MatchHistoryModalProps) => {
  const [matches, setMatches] = useState<MatchHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    socket.emit('getMatchHistory', { token }, (res: any) => {
      if (res?.error) { setError(res.error); setMatches([]); return; }
      setMatches(Array.isArray(res?.matches) ? res.matches : []);
    });
  }, [token]);

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      onClick={onClose}
    >
      <div
        className="bg-[#1F1F23] w-full max-w-md h-full sm:h-auto sm:max-h-[85vh] rounded-t-3xl sm:rounded-[32px] flex flex-col relative overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-2 border-b border-white/5">
          <div className="w-8" />
          <h2 className="text-lg font-semibold text-white">Historial de Partidas</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-gray-300"
            aria-label="Cerrar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-3 space-y-2">
          {matches === null && (
            <p className="text-center text-gray-500 text-sm py-8">Cargando...</p>
          )}
          {matches && matches.length === 0 && !error && (
            <p className="text-center text-gray-500 text-sm py-8">Aún no has jugado ninguna partida.</p>
          )}
          {error && (
            <p className="text-center text-red-400 text-sm py-8">{error}</p>
          )}
          {matches && matches.map(m => {
            const diff = m.cashOut - m.buyIn;
            const positive = diff > 0;
            const zero = diff === 0;
            return (
              <div key={m.id} className="bg-background border border-gray-800 rounded-2xl p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm text-white truncate flex-1 pr-2">{m.roomName}</h3>
                  <span className="text-[10px] text-gray-500 shrink-0">{formatDate(m.playedAt)}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div>
                    <p className="text-[9px] text-gray-500 uppercase tracking-wider">Entrada</p>
                    <p className="font-mono text-sm font-semibold text-rose-300">{fmtChips(m.buyIn)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-500 uppercase tracking-wider">Máximo</p>
                    <p className="font-mono text-sm font-semibold text-amber-300">{fmtChips(m.maxChips)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-500 uppercase tracking-wider">Salida</p>
                    <p className="font-mono text-sm font-semibold text-sky-300">{fmtChips(m.cashOut)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-500 uppercase tracking-wider">Dif.</p>
                    <p className={`font-mono text-sm font-bold ${zero ? 'text-gray-400' : positive ? 'text-emerald-400' : 'text-red-400'}`}>
                      {positive ? '+' : diff < 0 ? '-' : ''}{fmtChips(Math.abs(diff))}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MatchHistoryModal;
