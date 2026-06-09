const fs = require('fs');
const path = require('path');

const chipsPath = path.join(__dirname, 'client', 'src', 'components', 'Chips.tsx');
let content = fs.readFileSync(chipsPath, 'utf-8');

const keypadModalCode = `
// --- Keypad Modal ---
const KeypadModal = ({ initialValue, maxBet, onSave, onClose }: { initialValue: number, maxBet: number, onSave: (v: number) => void, onClose: () => void }) => {
  const [numStr, setNumStr] = useState('');
  const [scale, setScale] = useState<number>(1_000_000); // Default M

  useEffect(() => {
    if (initialValue >= 1_000_000_000_000_000) { setScale(1_000_000_000_000_000); setNumStr(Math.floor(initialValue / 1_000_000_000_000_000).toString()); }
    else if (initialValue >= 1_000_000_000_000) { setScale(1_000_000_000_000); setNumStr(Math.floor(initialValue / 1_000_000_000_000).toString()); }
    else if (initialValue >= 1_000_000_000) { setScale(1_000_000_000); setNumStr(Math.floor(initialValue / 1_000_000_000).toString()); }
    else { setScale(1_000_000); setNumStr(Math.floor(initialValue / 1_000_000).toString()); }
  }, [initialValue]);

  const handleKey = (k: string) => {
    if (k === 'DEL') {
      setNumStr(s => s.slice(0, -1));
    } else {
      setNumStr(s => {
        if (s.length > 8) return s; // limit length
        if (s === '0' && k !== '.') return k;
        return s + k;
      });
    }
  };

  const handleSave = () => {
    let finalNum = parseFloat(numStr || '0') * scale;
    if (isNaN(finalNum) || finalNum < 30_000_000) finalNum = 30_000_000;
    if (finalNum > maxBet && maxBet >= 30_000_000) finalNum = maxBet;
    onSave(finalNum);
  };

  const scaleLabel = scale === 1_000_000_000_000_000 ? 'Q' : scale === 1_000_000_000_000 ? 'T' : scale === 1_000_000_000 ? 'B' : 'M';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-slate-900/90 border border-white/10 rounded-3xl p-5 shadow-2xl w-full max-w-[320px] flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-1">
          <h3 className="text-white/80 font-bold text-lg">Ficha Pro</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors w-8 h-8 flex items-center justify-center rounded-full bg-white/5 active:bg-white/10">✕</button>
        </div>

        <div className="bg-black/50 border border-white/5 rounded-2xl p-4 flex flex-col items-end justify-center min-h-[80px] shadow-inner relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 pointer-events-none" />
          <div className="flex items-baseline gap-2 relative z-10">
            <span className="text-4xl font-black text-white tracking-tight">{numStr || '0'}</span>
            <span className="text-xl font-bold text-cyan-400">{scaleLabel}</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[{l:'M', v:1_000_000}, {l:'B', v:1_000_000_000}, {l:'T', v:1_000_000_000_000}, {l:'Q', v:1_000_000_000_000_000}].map(s => (
            <button 
              key={s.l} 
              onClick={() => setScale(s.v)}
              className={\`py-3 rounded-xl font-bold text-sm transition-all \${scale === s.v ? 'bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'bg-white/5 text-white/60 hover:bg-white/10 active:bg-white/20'}\`}
            >
              {s.l}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {['1','2','3','4','5','6','7','8','9','0'].map(k => (
            <button 
              key={k} 
              onClick={() => handleKey(k)}
              className={\`py-4 rounded-xl font-bold text-xl transition-all bg-white/5 text-white hover:bg-white/10 active:bg-white/20 \${k === '0' ? 'col-span-2' : ''}\`}
            >
              {k}
            </button>
          ))}
          <button 
            onClick={() => handleKey('DEL')}
            className="py-4 rounded-xl font-bold text-lg transition-all bg-red-500/20 text-red-400 hover:bg-red-500/30 active:bg-red-500/40 flex items-center justify-center"
          >
            ⌫
          </button>
        </div>

        <button 
          onClick={handleSave}
          className="w-full py-4 rounded-xl font-black text-lg transition-all bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_4px_15px_rgba(16,185,129,0.3)] hover:brightness-110 active:scale-[0.98] active:brightness-90 mt-1"
        >
          OK
        </button>
      </motion.div>
    </div>
  );
};
// ----------------------
`;

const customChipControlStart = content.indexOf('export const CustomChipControl =');
const chipRailStart = content.indexOf('export const ChipRail =');

if (customChipControlStart === -1 || chipRailStart === -1) {
  console.error("Could not find boundaries for CustomChipControl");
  process.exit(1);
}

const customChipControlNew = \`export const CustomChipControl = ({ onAdd, maxBet, pendingTotal, canBet }: { onAdd: (d: ChipDenom) => void; maxBet: number; pendingTotal: number; canBet: boolean }) => {
  const getMostSignificantDigitValue = (num: number) => {
    if (num <= 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(num)));
    return Math.floor(num / magnitude) * magnitude;
  };

  const MIN_PRO_CHIP = 30_000_000;
  const [val, setVal] = useState(() => {
    const stored = localStorage.getItem('customChipValue');
    let init = stored ? parseInt(stored, 10) : MIN_PRO_CHIP;
    if (init > maxBet && maxBet >= MIN_PRO_CHIP) init = getMostSignificantDigitValue(maxBet);
    return Math.max(MIN_PRO_CHIP, init);
  });
  
  const [showKeypad, setShowKeypad] = useState(false);

  useEffect(() => {
    if (val > maxBet && maxBet >= 30_000_000) {
      setVal(Math.max(30_000_000, getMostSignificantDigitValue(maxBet)));
    }
  }, [maxBet, val]);

  useEffect(() => {
    localStorage.setItem('customChipValue', val.toString());
  }, [val]);

  const getStep = (v: number) => {
    if (v >= 1_000_000_000_000_000) return 1_000_000_000_000_000;
    if (v >= 1_000_000_000_000) return 1_000_000_000_000;
    if (v >= 1_000_000_000) return 1_000_000_000;
    if (v >= 1_000_000) return 1_000_000;
    if (v >= 1000) return 1000;
    return 1;
  };

  const applyChange = (type: 'up' | 'down' | 'x10' | '/10') => {
    setVal(v => {
      let nv = v;
      if (type === 'x10') nv = v * 10;
      else if (type === '/10') nv = Math.floor(v / 10);
      else if (type === 'up') {
        const step = getStep(v);
        nv = Math.floor(v / step) * step + step;
      }
      else if (type === 'down') {
        const step = getStep(Math.max(1, v - 1));
        if (v % step === 0) {
          nv = v - step;
        } else {
          nv = Math.floor(v / step) * step;
        }
      }
      
      const upperLimit = Math.max(maxBet, 30_000_000);
      return Math.max(30_000_000, Math.min(upperLimit, nv));
    });
  };

  const d: ChipDenom = { v: val, label: fmtChips(val), color: '', ring: '', isCustom: true };
  const disabled = !canBet || val > maxBet || pendingTotal + val > maxBet;

  return (
    <>
      <div className="flex items-center justify-between w-full px-2 gap-2 h-full">
        <button 
          onClick={() => onAdd(d)}
          disabled={disabled} 
          className="active:scale-95 transition-transform disabled:opacity-30 shrink-0"
        >
          <Chip d={d} size={42} />
        </button>
        
        <div className="flex gap-1.5 flex-1 h-full py-1">
          <button 
            onClick={() => setShowKeypad(true)} 
            className="bg-white/10 hover:bg-white/15 active:bg-white/20 rounded-lg shadow-sm flex flex-col items-center justify-center w-[42px] shrink-0 transition-colors"
          >
            <span className="text-xl">⌨</span>
          </button>
          <div className="grid grid-cols-2 grid-rows-2 gap-1.5 flex-1">
            <button onClick={() => applyChange('up')} className="bg-white/10 hover:bg-white/15 active:bg-white/20 rounded-lg text-xs font-bold text-white/80 shadow-sm flex items-center justify-center transition-colors">▲</button>
            <button onClick={() => applyChange('x10')} className="bg-white/10 hover:bg-white/15 active:bg-white/20 rounded-lg text-[10px] font-bold text-white/80 shadow-sm flex items-center justify-center transition-colors">x10</button>
            <button onClick={() => applyChange('down')} className="bg-white/10 hover:bg-white/15 active:bg-white/20 rounded-lg text-xs font-bold text-white/80 shadow-sm flex items-center justify-center transition-colors">▼</button>
            <button onClick={() => applyChange('/10')} className="bg-white/10 hover:bg-white/15 active:bg-white/20 rounded-lg text-[10px] font-bold text-white/80 shadow-sm flex items-center justify-center transition-colors">/10</button>
          </div>
        </div>
      </div>
      
      <AnimatePresence>
        {showKeypad && (
          <KeypadModal 
            initialValue={val} 
            maxBet={maxBet}
            onSave={(newVal) => {
              setVal(newVal);
              setShowKeypad(false);
            }} 
            onClose={() => setShowKeypad(false)} 
          />
        )}
      </AnimatePresence>
    </>
  );
};

\`;

const newContent = content.substring(0, customChipControlStart) + keypadModalCode + customChipControlNew + content.substring(chipRailStart);

fs.writeFileSync(chipsPath, newContent);
console.log('Chips.tsx updated successfully');
