import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, fmtChips, vibrate } from '../utils';
import { ChipRail, ChipStack, chipsFromAmount, type ChipDenom } from './Chips';
import AnimatedNumber from './AnimatedNumber';

const ROULETTE_NUMBERS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

export default function RouletteModal({
  onClose, balance, updateBalance
}: {
  onClose: () => void; balance: number; updateBalance: (newBalance: number) => void;
}) {
  const [bets, setBets] = useState<Record<string, number>>({});
  const [activeChipPage, setActiveChipPage] = useState(0);
  const [activeChip, setActiveChip] = useState<ChipDenom | null>(null);
  
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ num: number; win: number; net: number } | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [spinDeg, setSpinDeg] = useState(0);

  const totalBet = Object.values(bets).reduce((a, b) => a + b, 0);

  const placeBet = (zone: string, e?: React.MouseEvent) => {
    if (spinning) return;
    if (e && e.type === 'contextmenu') {
      e.preventDefault();
      setBets(prev => {
        const next = { ...prev };
        delete next[zone];
        return next;
      });
      return;
    }
    if (!activeChip) return;
    if (balance - totalBet < activeChip.v) return;
    vibrate(10);
    setBets(prev => ({ ...prev, [zone]: (prev[zone] || 0) + activeChip.v }));
  };

  const clearBets = () => { if (!spinning) setBets({}); };

  const spin = () => {
    if (totalBet <= 0 || spinning || totalBet > balance) return;
    setSpinning(true);
    setResult(null);
    socket.emit('play_roulette', bets, (res: any) => {
      if (res.error) {
        alert(res.error);
        setSpinning(false);
        return;
      }
      
      const targetNum = res.result;
      const targetIndex = ROULETTE_NUMBERS.indexOf(targetNum);
      // Calc angle to stop exactly on the target number
      const slice = 360 / 37;
      const targetAngle = 360 - (targetIndex * slice);
      const spins = 5 * 360; // 5 extra rotations
      const finalDeg = spinDeg + spins + ((targetAngle - (spinDeg % 360)) + 360) % 360;
      
      setSpinDeg(finalDeg);
      
      setTimeout(() => {
        updateBalance(res.balance);
        setResult({ num: res.result, win: res.winnings, net: res.net });
        setHistory(h => [res.result, ...h].slice(0, 10));
        setSpinning(false);
      }, 4000); // 4 seconds animation matches transition
    });
  };

  // Generate table layout
  const rows = [
    [3,6,9,12,15,18,21,24,27,30,33,36],
    [2,5,8,11,14,17,20,23,26,29,32,35],
    [1,4,7,10,13,16,19,22,25,28,31,34]
  ];

  const getNumColor = (n: number) => n === 0 ? '#10b981' : RED_NUMS.has(n) ? '#ef4444' : '#1f2937';

  const renderZone = (zone: string, label: React.ReactNode, colSpan = 1, rowSpan = 1, color = 'rgba(255,255,255,0.05)', textColor = 'white', border = 'border-white/10') => {
    const betAmt = bets[zone] || 0;
    const chips = betAmt > 0 ? chipsFromAmount(betAmt) : [];
    return (
      <div 
        key={zone}
        className={`relative flex items-center justify-center font-bold select-none cursor-pointer border hover:brightness-125 transition-all ${border}`}
        style={{ gridColumn: `span ${colSpan}`, gridRow: `span ${rowSpan}`, backgroundColor: color, color: textColor }}
        onClick={(e) => placeBet(zone, e)}
        onContextMenu={(e) => placeBet(zone, e)}
      >
        <span className="z-0 pointer-events-none text-sm sm:text-base">{label}</span>
        {betAmt > 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none drop-shadow-md">
            <div className="scale-50 sm:scale-75 origin-center">
              <ChipStack chips={chips} size={28} />
            </div>
            <div className="absolute bg-black/60 rounded px-1 text-[9px] text-white bottom-0.5 right-0.5">
              {fmtChips(betAmt)}
            </div>
          </div>
        )}
        {result && result.num !== null && (zone === result.num.toString() || (zone === 'red' && RED_NUMS.has(result.num)) || (zone === 'black' && result.num !== 0 && !RED_NUMS.has(result.num)) || (zone === 'even' && result.num !== 0 && result.num % 2 === 0) || (zone === 'odd' && result.num % 2 !== 0) || (zone === 'low' && result.num >= 1 && result.num <= 18) || (zone === 'high' && result.num >= 19 && result.num <= 36) || (zone.startsWith('dozen') && Math.ceil(result.num / 12) === parseInt(zone.split('_')[1])) || (zone.startsWith('col') && ((result.num - parseInt(zone.split('_')[1])) % 3 === 0))) && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }} 
            animate={{ opacity: [0, 1, 0, 1], scale: [0.8, 1.1, 1, 1.1] }} 
            transition={{ duration: 1 }}
            className="absolute inset-0 ring-2 ring-yellow-400 bg-yellow-400/20 z-0"
          />
        )}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-md"
    >
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-full">
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 sm:px-6 sm:py-4 bg-slate-800/80 border-b border-slate-700/50">
          <div className="flex items-center gap-4">
            <h2 className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
              RULETA VIP
            </h2>
            <div className="hidden sm:flex gap-1.5">
              {history.map((n, i) => (
                <div key={i} className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-inner opacity-${100 - i * 10}`} style={{ backgroundColor: getNumColor(n) }}>
                  {n}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Saldo</div>
              <div className="text-sm sm:text-lg font-black text-amber-400"><AnimatedNumber value={balance} /></div>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col p-4 sm:p-6 gap-6 relative">
          
          {/* Wheel Section */}
          <div className="flex justify-center items-center py-2 relative">
             <div className="relative w-48 h-48 sm:w-64 sm:h-64 rounded-full border-8 border-slate-800 shadow-[0_0_40px_rgba(0,0,0,0.8)] bg-slate-900 overflow-hidden shrink-0">
               <motion.div 
                 className="absolute inset-0 rounded-full"
                 animate={{ rotate: spinDeg }}
                 transition={spinning ? { duration: 4, ease: [0.2, 0.8, 0.2, 1] } : { duration: 0 }}
                 style={{ 
                   background: `conic-gradient(from -4.86deg, ${ROULETTE_NUMBERS.map((n, i) => `${getNumColor(n)} ${(i * 360) / 37}deg ${((i + 1) * 360) / 37}deg`).join(', ')})`
                 }}
               >
                 {ROULETTE_NUMBERS.map((n, i) => (
                   <div 
                     key={n} 
                     className="absolute w-full h-full flex items-start justify-center font-bold text-white text-[10px] sm:text-xs pt-1 sm:pt-2"
                     style={{ transform: `rotate(${i * (360 / 37)}deg)` }}
                   >
                     {n}
                   </div>
                 ))}
                 <div className="absolute inset-[15%] sm:inset-[18%] rounded-full bg-slate-800 shadow-inner flex items-center justify-center border border-slate-700">
                    <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-amber-200 to-amber-600 shadow-lg flex items-center justify-center border-2 border-amber-900/50">
                       <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-full bg-amber-900/40" />
                    </div>
                 </div>
               </motion.div>
               {/* Ball indicator */}
               <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 sm:w-4 sm:h-4 bg-white rounded-full shadow-[0_0_10px_white] z-10" />
             </div>

             {/* Result overlay */}
             <AnimatePresence>
               {result && !spinning && (
                 <motion.div 
                   initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}
                   className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                 >
                   <div className="text-4xl sm:text-6xl font-black text-white drop-shadow-[0_4px_10px_rgba(0,0,0,1)] bg-black/40 px-6 py-2 rounded-xl backdrop-blur-sm border border-white/20">
                     {result.num}
                   </div>
                   {result.net !== 0 && (
                     <div className={`text-center font-bold text-xl mt-2 drop-shadow-md ${result.net > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                       {result.net > 0 ? '+' : ''}{fmtChips(result.net)}
                     </div>
                   )}
                 </motion.div>
               )}
             </AnimatePresence>
          </div>

          {/* Betting Table */}
          <div className="w-full max-w-4xl mx-auto flex gap-1 select-none overflow-x-auto pb-4">
             {/* Zero */}
             <div className="flex-shrink-0 w-12 sm:w-16 flex flex-col">
               {renderZone('0', '0', 1, 3, '#10b981', 'white', 'border-emerald-500/50 rounded-l-2xl h-full')}
             </div>
             
             {/* Numbers grid & Columns */}
             <div className="flex-1 flex flex-col gap-1 min-w-[600px]">
                <div className="grid grid-cols-13 gap-1 flex-1">
                  {/* Rows of numbers (12 cols) + 1 col for 2to1 */}
                  {rows.map((row, rIdx) => (
                    <div key={rIdx} className="contents">
                      {row.map(n => renderZone(n.toString(), n.toString(), 1, 1, getNumColor(n)))}
                      {renderZone(`col_${3-rIdx}`, '2:1', 1, 1, 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.7)', 'border-slate-600 rounded-r-lg')}
                    </div>
                  ))}
                </div>
                
                {/* Dozens */}
                <div className="grid grid-cols-12 gap-1 h-10 sm:h-12 mt-1">
                  {renderZone('dozen_1', '1st 12', 4, 1, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600 rounded-bl-lg')}
                  {renderZone('dozen_2', '2nd 12', 4, 1, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600')}
                  {renderZone('dozen_3', '3rd 12', 4, 1, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600')}
                </div>
                
                {/* Halves, Colors, Evens */}
                <div className="grid grid-cols-12 gap-1 h-10 sm:h-12">
                  {renderZone('low', '1-18', 2, 1, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600 rounded-bl-lg')}
                  {renderZone('even', 'EVEN', 2, 1, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600')}
                  {renderZone('red', <div className="w-4 h-4 sm:w-6 sm:h-6 bg-red-500 rounded-full mx-auto shadow-inner border border-red-700"/>, 2, 1, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600')}
                  {renderZone('black', <div className="w-4 h-4 sm:w-6 sm:h-6 bg-slate-800 rounded-full mx-auto shadow-inner border border-slate-900"/>, 2, 1, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600')}
                  {renderZone('odd', 'ODD', 2, 1, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600')}
                  {renderZone('high', '19-36', 2, 1, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600')}
                </div>
             </div>
          </div>
        </div>

        {/* Controls Footer */}
        <div className="bg-slate-800 p-3 sm:p-4 border-t border-slate-700 flex flex-col sm:flex-row items-center gap-4">
          {/* Chip selector */}
          <div className="flex-1 w-full max-w-sm sm:max-w-md bg-slate-900 rounded-2xl p-2 border border-slate-700/50 relative shadow-inner">
            <ChipRail 
              page={activeChipPage} 
              setPage={setActiveChipPage} 
              onAdd={(d) => setActiveChip(d)} 
              maxBet={Math.max(0, balance - totalBet)} 
              pendingTotal={0} 
              canBet={!spinning} 
            />
            {activeChip && (
               <div className="absolute -top-3 -right-2 bg-emerald-500 text-emerald-950 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-emerald-300 animate-pulse">
                 SELECCIONADA: {activeChip.label}
               </div>
            )}
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={clearBets} 
              disabled={spinning || totalBet === 0}
              className="flex-1 sm:flex-none px-4 py-3 rounded-xl font-bold bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50 transition-colors shadow-lg active:scale-95"
            >
              Borrar
            </button>
            <button 
              onClick={spin}
              disabled={spinning || totalBet === 0 || totalBet > balance}
              className={`flex-[2] sm:flex-none px-8 py-3 rounded-xl font-black text-lg transition-all shadow-xl active:scale-95 ${
                totalBet > 0 && !spinning ? 'bg-gradient-to-r from-emerald-400 to-cyan-500 text-slate-900 hover:brightness-110' : 'bg-slate-700 text-slate-500'
              }`}
            >
              {spinning ? 'GIRANDO...' : `GIRAR (${fmtChips(totalBet)})`}
            </button>
          </div>
        </div>

      </div>
    </motion.div>
  );
}
