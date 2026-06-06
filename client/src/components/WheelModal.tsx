import { useState } from 'react';
import { socket, fmtChips } from '../utils';

interface WheelModalProps {
  user: any;
  token: string | null;
  onClose: () => void;
  onUpdateUser: (u: any) => void;
}

export const WheelModal = ({ user, token, onClose, onUpdateUser }: WheelModalProps) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [wonValue, setWonValue] = useState<number | null>(null);
  const [hasSpun, setHasSpun] = useState(false);
  
  const options = [100, 250, 500, 1000, 2500, 5000];
  const colors = [
    '#3b82f6', // blue (100)
    '#10b981', // green (250)
    '#f59e0b', // amber (500)
    '#8b5cf6', // purple (1000)
    '#ec4899', // pink (2500)
    '#ef4444'  // red (5000)
  ];

  const handleSpin = () => {
    if (isSpinning || hasSpun) return;
    setIsSpinning(true);
    setError(null);

    socket.emit('claimFreeSpinsWheel', { token }, (res: any) => {
      if (!res || res.error) {
        setError(res?.error || 'Error de conexión');
        setIsSpinning(false);
        return;
      }

      const { chosenIndex, chosenValue, user: updatedUser } = res;

      // 6 slices, each slice is 60 degrees.
      // Slices counter-clockwise/clockwise placement.
      // To align chosenIndex with the pointer (top, 0 degrees / 360 degrees),
      // we need to rotate the wheel backwards by chosenIndex * 60, plus a buffer.
      // Let's do 3600 (10 full spins) minus chosenIndex * 60, offset by 30 to align center.
      const spinAngle = 3600 - (chosenIndex * 60) - 30;
      setRotation(spinAngle);

      setTimeout(() => {
        setIsSpinning(false);
        setHasSpun(true);
        setWonValue(chosenValue);
        if (updatedUser) {
          onUpdateUser(updatedUser);
        }
      }, 4000); // 4 seconds transition
    });
  };

  const now = Date.now();
  const nextClaim = user.lastFreeSpinsClaim ? user.lastFreeSpinsClaim + 60 * 60 * 1000 : 0;
  const isAvailable = now >= nextClaim;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4" onClick={() => !isSpinning && onClose()}>
      <div 
        className="relative bg-surface rounded-3xl p-6 w-full max-w-sm border border-surfaceLight shadow-2xl flex flex-col items-center overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <button 
          disabled={isSpinning}
          onClick={onClose} 
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl disabled:opacity-20"
        >
          ✕
        </button>

        <h2 className="text-xl font-extrabold text-white mb-1">Ruleta de Tiradas</h2>
        <p className="text-xs text-gray-400 text-center mb-6">
          Gira para conseguir 10 tiradas gratis con el valor seleccionado
        </p>

        {error && (
          <div className="w-full bg-red-950/40 border border-red-500/30 text-red-400 text-xs py-2 px-3 rounded-xl mb-4 text-center">
            {error === 'Demasiado pronto' ? 'Ya has girado la ruleta hace poco.' : error}
          </div>
        )}

        {/* Wheel Container */}
        <div className="relative w-64 h-64 flex items-center justify-center mb-6">
          {/* Outer Ring Glow */}
          <div className="absolute inset-0 rounded-full bg-purple-500/10 blur-xl animate-pulse" />

          {/* Pointer */}
          <div className="absolute top-[-8px] z-20 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[20px] border-t-white drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)]" />

          {/* Outer Rim */}
          <div className="w-full h-full rounded-full border-[6px] border-surfaceLight bg-black/40 shadow-inner overflow-hidden relative">
            {/* Spinning Wheel */}
            <div 
              className="w-full h-full rounded-full relative overflow-hidden"
              style={{ 
                transform: `rotate(${rotation}deg)`,
                transition: isSpinning ? 'transform 4s cubic-bezier(0.1, 0.8, 0.2, 1)' : 'none'
              }}
            >
              {options.map((val, idx) => {
                const angle = idx * 60;
                return (
                  <div 
                    key={val} 
                    className="absolute top-0 left-0 w-full h-full origin-center"
                    style={{ transform: `rotate(${angle}deg)` }}
                  >
                    {/* Wedge segment */}
                    <div 
                      className="absolute top-0 left-1/2 w-0 h-0 -translate-x-1/2"
                      style={{
                        borderLeft: '37px solid transparent',
                        borderRight: '37px solid transparent',
                        borderTop: '128px solid',
                        borderTopColor: colors[idx],
                        opacity: 0.85,
                        transformOrigin: '50% 100%',
                      }}
                    />
                    {/* Text Label */}
                    <div 
                      className="absolute top-[28px] left-1/2 -translate-x-1/2 text-white font-extrabold text-xs tracking-wider select-none origin-bottom flex flex-col items-center"
                      style={{ transform: 'rotate(30deg)' }}
                    >
                      <span className="text-[10px] opacity-75">BET</span>
                      <span>${fmtChips(val)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Center Pin / Spin Button */}
            <button
              disabled={isSpinning || hasSpun || !isAvailable}
              onClick={handleSpin}
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full flex flex-col items-center justify-center font-bold text-[11px] tracking-wider transition-all select-none border-4 shadow-lg
                ${isSpinning 
                  ? 'bg-gray-800 border-gray-700 text-gray-500 scale-95' 
                  : hasSpun 
                    ? 'bg-purple-950 border-purple-900 text-purple-400'
                    : !isAvailable
                      ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-white border-white text-black hover:scale-105 active:scale-95 cursor-pointer glow-pulse'
                }
              `}
              style={{
                boxShadow: (!isSpinning && !hasSpun && isAvailable) ? '0 0 15px rgba(255,255,255,0.6)' : 'none'
              }}
            >
              {isSpinning ? '...' : hasSpun ? 'OK' : 'GIRAR'}
            </button>
          </div>
        </div>

        {/* Won State Success Screen */}
        {hasSpun && wonValue && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            <div className="text-center text-emerald-400 font-extrabold text-sm mb-2 uppercase tracking-wide">
              🎉 ¡PREMIO CONSEGUIDO! 🎉
            </div>
            <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-4 w-full text-center flex flex-col gap-1">
              <span className="text-xs text-gray-400">Has desbloqueado</span>
              <span className="text-xl font-black text-white">10 Tiradas Gratis</span>
              <span className="text-lg font-bold text-emerald-300">Valor de apuesta: ${fmtChips(wonValue)}/giro</span>
            </div>
            <button
              onClick={onClose}
              className="mt-5 w-full bg-white text-black hover:bg-gray-200 transition-colors py-3 rounded-2xl font-bold text-sm"
            >
              ¡A jugar! 🎰
            </button>
          </div>
        )}

        {!hasSpun && !isSpinning && !isAvailable && (
          <div className="text-xs text-gray-500 text-center mt-2">
            La ruleta no está disponible en este momento.
          </div>
        )}
      </div>
    </div>
  );
};
