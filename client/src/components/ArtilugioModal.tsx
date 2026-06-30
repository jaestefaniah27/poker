import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, fmtChips, m, mul, add } from '../utils';
import { JACKPOT_TIERS } from '../../../shared/types';

interface SpinResult {
  value: number;
  symbols: string[];
  multiplier: number;
  winAmount: number;
  finalWinAmount: number;
  paid: boolean;
  taxEvent: { type: string; amount: number };
}

interface Props {
  pools: Record<string, number>;
  token: string | null;
  unlockLevel: number;
  balance: number | string | bigint;
  onClose: () => void;
  onUpdateUser: (u: any) => void;
}

export default function ArtilugioModal({ pools, token, unlockLevel, balance, onClose, onUpdateUser }: Props) {
  const [tab, setTab] = useState<'serie' | 'conjurar'>('serie');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SpinResult[] | null>(null);
  const [totalWin, setTotalWin] = useState('0');        // string decimal (Money)
  const [totalPaidCost, setTotalPaidCost] = useState('0');
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set());
  const [conjureMsg, setConjureMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [localPools, setLocalPools] = useState(pools);
  // Apuestas pagadas planificadas: { tier(number) → count }
  const [paidBets, setPaidBets] = useState<Record<string, number>>({});
  const [selTier, setSelTier] = useState<number>(JACKPOT_TIERS[0]);
  const [selCount, setSelCount] = useState<string>('1'); // string: permite borrar/editar libre
  // Plan ordenado: orden de ejecución (claves) + grupos desactivados
  const [order, setOrder] = useState<string[]>([]);
  const [disabled, setDisabled] = useState<Set<string>>(new Set());

  const sortedTiers = Object.entries(localPools)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => Number(a) - Number(b));

  const conjuredValue = [...selectedTiers].reduce((acc, tier) => {
    return add(acc, mul(tier, localPools[tier] || 0));
  }, m(0)).toString();

  const isConjured = (tierKey: string) => !JACKPOT_TIERS.includes(Number(tierKey));
  const unlockedTiers = JACKPOT_TIERS.slice(0, Math.max(unlockLevel, 0));

  // ── Modelo de plan ordenado (gratis + pagadas en una sola lista reordenable) ──
  type PlanItem = { key: string; tier: number; count: number; paid: boolean };
  const itemsByKey: Record<string, PlanItem> = {};
  for (const [tier, count] of Object.entries(localPools)) {
    if (count > 0) itemsByKey[`f:${tier}`] = { key: `f:${tier}`, tier: Number(tier), count, paid: false };
  }
  for (const [tier, count] of Object.entries(paidBets)) {
    if (count > 0) itemsByKey[`p:${tier}`] = { key: `p:${tier}`, tier: Number(tier), count, paid: true };
  }
  const allKeys = Object.keys(itemsByKey);

  // Sincronizar order con las claves disponibles (añadir nuevas, quitar ausentes)
  useEffect(() => {
    setOrder(prev => {
      const kept = prev.filter(k => itemsByKey[k]);
      const added = allKeys.filter(k => !kept.includes(k));
      const next = [...kept, ...added];
      // evitar update si no cambia
      if (next.length === prev.length && next.every((k, i) => k === prev[i])) return prev;
      return next;
    });
  }, [allKeys.join('|')]);

  const orderedItems = order.filter(k => itemsByKey[k]).map(k => itemsByKey[k]);
  const enabledItems = orderedItems.filter(it => !disabled.has(it.key));

  const freeSpins = enabledItems.filter(it => !it.paid).reduce((a, it) => a + it.count, 0);
  const paidCount = enabledItems.filter(it => it.paid).reduce((a, it) => a + it.count, 0);
  const paidCostBig = enabledItems.filter(it => it.paid).reduce((acc, it) => acc.plus(m(it.tier).times(it.count)), m(0));
  const balanceBig = m(balance ?? 0);
  const canAfford = paidCostBig.lte(balanceBig);
  const totalToLaunch = freeSpins + paidCount;

  const addPaidBet = () => {
    if (!unlockedTiers.includes(selTier)) return;
    const c = Math.max(1, Math.min(100, Math.floor(Number(selCount)) || 1));
    setPaidBets(prev => ({ ...prev, [selTier]: Math.min(100, (prev[selTier] || 0) + c) }));
    setSelCount('1');
  };
  const removePaidBet = (tier: number) => {
    setPaidBets(prev => { const n = { ...prev }; delete n[String(tier)]; return n; });
  };
  const toggleEnabled = (key: string) => {
    setDisabled(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };
  const moveItem = (idx: number, dir: -1 | 1) => {
    setOrder(() => {
      const keys = orderedItems.map(it => it.key);
      const j = idx + dir;
      if (j < 0 || j >= keys.length) return keys;
      [keys[idx], keys[j]] = [keys[j], keys[idx]];
      return keys;
    });
  };

  const toggleTier = (tier: string) => {
    setSelectedTiers(prev => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
    setConjureMsg(null);
  };

  const handleSpinAll = () => {
    if (loading || totalToLaunch === 0 || !canAfford) return;
    setLoading(true);
    const planPayload = enabledItems.map(it => ({ tier: it.tier, count: it.count, paid: it.paid }));
    socket.emit('artilugioSpinAll', { token, plan: planPayload }, (res: any) => {
      setLoading(false);
      if (res?.error) { setConjureMsg({ ok: false, text: res.error }); return; }
      setResults(res.spins);
      setTotalWin(String(res.totalWin ?? '0'));
      setTotalPaidCost(String(res.totalPaidCost ?? '0'));
      if (res.user) onUpdateUser(res.user);
      setLocalPools(res.newPools || {}); // pool restante (solo se consumieron las lanzadas)
      setPaidBets({});
      setDisabled(new Set());
    });
  };

  const handleConjure = () => {
    if (loading || selectedTiers.size === 0) return;
    setLoading(true);
    socket.emit('artilugioConjure', { token, selectedTiers: [...selectedTiers] }, (res: any) => {
      setLoading(false);
      if (res?.error) { setConjureMsg({ ok: false, text: res.error }); return; }
      setSelectedTiers(new Set());
      setLocalPools(res.newPools || {});
      if (res.user) onUpdateUser(res.user);
      setConjureMsg({ ok: true, text: `✨ Tirada de ${fmtChips(res.combinedValue)} conjurada` });
    });
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/80"
      style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="w-full max-w-md bg-[#111] rounded-t-3xl border-t border-purple-500/30 px-4 pt-4 pb-4 flex flex-col max-h-[85vh] overflow-hidden"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-purple-300">🔧 Artilugio</h2>
            <p className="text-xs text-gray-500 mt-0.5">{freeSpins} gratis · {paidCount} pagadas</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(['serie', 'conjurar'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setResults(null); setConjureMsg(null); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
                tab === t
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/8 text-gray-400 hover:bg-white/15'
              }`}
            >
              {t === 'serie' ? '🎰 Tirar en serie' : '✨ Conjurar'}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1">
          <AnimatePresence mode="wait">
            {/* ─── TAB SERIE ─── */}
            {tab === 'serie' && !results && (
              <motion.div key="serie" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* Añadir apuestas pagadas */}
                <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5">Añadir apuestas</p>
                {unlockedTiers.length === 0 ? (
                  <p className="text-xs text-gray-600 mb-4">Desbloquea niveles del Jackpot para apostar.</p>
                ) : (
                  <div className="flex gap-2 mb-3">
                    <select
                      value={selTier}
                      onChange={e => setSelTier(Number(e.target.value))}
                      className="flex-1 rounded-xl px-3 py-2 text-sm font-bold outline-none border border-white/15"
                      style={{ background: '#1e1e2e', color: '#fff' }}
                    >
                      {unlockedTiers.map(t => <option key={t} value={t} style={{ background: '#1e1e2e', color: '#fff' }}>{fmtChips(t)}</option>)}
                    </select>
                    <input
                      type="number" min={1} max={100} value={selCount}
                      onChange={e => {
                        const v = e.target.value;
                        if (v === '') { setSelCount(''); return; }
                        const n = Math.floor(Number(v));
                        if (Number.isNaN(n)) return;
                        setSelCount(String(Math.min(100, Math.max(0, n))));
                      }}
                      onBlur={() => { if (selCount === '' || Number(selCount) < 1) setSelCount('1'); }}
                      className="w-16 rounded-xl px-2 py-2 text-sm font-bold text-center outline-none border border-white/15"
                      style={{ background: '#1e1e2e', color: '#fff' }}
                    />
                    <button onClick={addPaidBet} className="px-4 rounded-xl bg-purple-600 text-white text-sm font-bold active:scale-95 transition-transform">+</button>
                  </div>
                )}

                {/* Orden de tiradas — reordenable + activar/desactivar grupos */}
                {orderedItems.length === 0 ? (
                  <p className="text-center text-gray-500 text-sm py-6">No hay tiradas. Añade apuestas o consigue tiradas gratis.</p>
                ) : (
                  <>
                    <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5">Orden de ejecución</p>
                    <div className="flex flex-col gap-2 mb-3">
                      {orderedItems.map((it, idx) => {
                        const on = !disabled.has(it.key);
                        return (
                          <div key={it.key} className={`flex items-center gap-2 rounded-xl px-3 py-2 border transition-colors ${
                            !on ? 'bg-white/5 border-white/5 opacity-50'
                              : it.paid ? 'bg-white/5 border-white/10' : 'bg-emerald-950/30 border-emerald-500/15'
                          }`}>
                            {/* Reordenar */}
                            <div className="flex flex-col gap-0.5">
                              <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="text-gray-500 hover:text-white disabled:opacity-20 text-[10px] leading-none">▲</button>
                              <button onClick={() => moveItem(idx, 1)} disabled={idx === orderedItems.length - 1} className="text-gray-500 hover:text-white disabled:opacity-20 text-[10px] leading-none">▼</button>
                            </div>
                            {/* Toggle incluir */}
                            <button onClick={() => toggleEnabled(it.key)} className={`w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-[11px] font-bold border ${on ? 'bg-purple-600 border-purple-400 text-white' : 'bg-transparent border-white/25 text-transparent'}`}>✓</button>
                            {/* Info */}
                            <span className="text-sm font-bold text-white flex-1 truncate">
                              {it.count} × {fmtChips(it.tier)}
                              {it.paid
                                ? <span className="ml-1 text-[10px] text-purple-400">pagada</span>
                                : isConjured(String(it.tier)) && <span className="ml-1 text-[10px] text-purple-400">conjurada</span>}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              {it.paid && <span className="text-xs text-gray-400">{fmtChips(m(it.tier).times(it.count).toFixed(0))}</span>}
                              {!it.paid && <span className="text-[10px] text-emerald-400/80 font-bold uppercase">gratis</span>}
                              {it.paid && <button onClick={() => removePaidBet(it.tier)} className="text-red-400/70 hover:text-red-400 text-sm">✕</button>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Coste total pagadas */}
                {paidCount > 0 && (
                  <div className={`flex justify-between items-center rounded-xl px-4 py-2 mb-3 text-sm ${canAfford ? 'bg-white/5' : 'bg-red-950/40 border border-red-500/30'}`}>
                    <span className="text-gray-400">Coste apuestas</span>
                    <span className={`font-bold ${canAfford ? 'text-white' : 'text-red-400'}`}>{fmtChips(paidCostBig.toFixed(0))}</span>
                  </div>
                )}
                {paidCount > 0 && !canAfford && (
                  <p className="text-xs text-red-400 mb-3 text-center">Saldo insuficiente para las apuestas</p>
                )}

                <button
                  onClick={handleSpinAll}
                  disabled={loading || totalToLaunch === 0 || !canAfford}
                  className="w-full py-3 rounded-2xl font-extrabold text-lg tracking-wider active:scale-95 transition-all disabled:opacity-50"
                  style={{ background: (loading || totalToLaunch === 0 || !canAfford) ? '#333' : 'linear-gradient(180deg, #a855f7, #7c3aed)', color: (loading || totalToLaunch === 0 || !canAfford) ? '#888' : '#fff' }}
                >
                  {loading
                    ? `Calculando ${totalToLaunch} tiradas…`
                    : totalToLaunch === 0
                      ? 'Sin tiradas que lanzar'
                      : `🎰 LANZAR (${freeSpins} gratis + ${paidCount} pagadas)`}
                </button>
              </motion.div>
            )}

            {/* ─── RESULTADOS SERIE ─── */}
            {tab === 'serie' && results && (() => {
              const numSpins = results.length;
              const numWins = results.filter(r => r.finalWinAmount > 0).length;
              const best = results.reduce((a, r) => r.finalWinAmount > a.finalWinAmount ? r : a, results[0]);
              const numTax = results.filter(r => r.taxEvent.type === 'tax').length;
              const numFraud = results.filter(r => r.taxEvent.type === 'fraud').length;
              const winBig = m(totalWin || '0');
              const costBig = m(totalPaidCost || '0');
              const net = winBig.minus(costBig);  // las gratis no cuestan; solo restamos las pagadas
              return (
              <motion.div key="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {/* Total arriba del todo */}
                <div className={`rounded-2xl p-5 text-center mb-3 ${winBig.gt(0) ? 'bg-emerald-900/30 border border-emerald-500/30' : 'bg-white/5'}`}>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Ganancia total</p>
                  <p className={`text-3xl font-extrabold ${winBig.gt(0) ? 'text-emerald-300' : 'text-gray-500'}`}>{winBig.gt(0) ? `+${fmtChips(winBig.toFixed(0))}` : '—'}</p>
                  <p className={`text-xs font-semibold mt-1 ${net.gte(0) ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                    Neto: {net.gte(0) ? '+' : ''}{fmtChips(net.toFixed(0))}
                  </p>
                </div>

                {/* Resumen escueto */}
                <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                  <div className="bg-white/5 rounded-xl px-3 py-2 flex justify-between"><span className="text-gray-500">Tiradas</span><span className="font-bold text-white">{numSpins}</span></div>
                  <div className="bg-white/5 rounded-xl px-3 py-2 flex justify-between"><span className="text-gray-500">Premiadas</span><span className="font-bold text-emerald-400">{numWins}</span></div>
                  <div className="bg-white/5 rounded-xl px-3 py-2 flex justify-between"><span className="text-gray-500">Mejor</span><span className="font-bold text-amber-300">{best.finalWinAmount > 0 ? `x${best.multiplier}` : '—'}</span></div>
                  <div className="bg-white/5 rounded-xl px-3 py-2 flex justify-between"><span className="text-gray-500">Apostado</span><span className="font-bold text-gray-300">{fmtChips(costBig.toFixed(0))}</span></div>
                  {(numTax > 0 || numFraud > 0) && (
                    <div className="col-span-2 bg-red-950/30 border border-red-500/20 rounded-xl px-3 py-2 flex justify-between text-xs">
                      <span className="text-red-400/80">Hacienda</span>
                      <span className="font-bold text-red-400">{numTax} impuestos · {numFraud} fraudes</span>
                    </div>
                  )}
                </div>

                <button onClick={onClose} className="w-full py-3 rounded-2xl font-bold text-gray-300 bg-white/8 hover:bg-white/15 transition-colors">
                  Cerrar
                </button>
              </motion.div>
              );
            })()}

            {/* ─── TAB CONJURAR ─── */}
            {tab === 'conjurar' && (
              <motion.div key="conjurar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {sortedTiers.length === 0 ? (
                  <p className="text-center text-gray-500 text-sm py-8">No tienes tiradas gratis</p>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 mb-3">Selecciona grupos de tiradas para fusionar en una tirada de mayor valor.</p>
                    <div className="flex flex-col gap-2 mb-4">
                      {sortedTiers.map(([tier, count]) => {
                        const selected = selectedTiers.has(tier);
                        return (
                          <button
                            key={tier}
                            onClick={() => toggleTier(tier)}
                            className={`flex items-center justify-between rounded-xl px-4 py-3 transition-colors border ${
                              selected
                                ? 'bg-purple-900/50 border-purple-500/60 text-purple-200'
                                : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center text-xs ${selected ? 'border-purple-400 bg-purple-500' : 'border-gray-600'}`}>
                                {selected && '✓'}
                              </div>
                              <span className="font-bold">{count} × {fmtChips(tier)}</span>
                              {isConjured(tier) && <span className="text-[10px] text-purple-400">conjurada</span>}
                            </div>
                            <span className="text-xs text-gray-500">{fmtChips(mul(tier, count).toString())}</span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedTiers.size > 0 && (
                      <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-3 mb-4 text-center">
                        <p className="text-xs text-gray-400 mb-1">Resultado</p>
                        <p className="text-lg font-extrabold text-purple-300">1 tirada de {fmtChips(conjuredValue)}</p>
                      </div>
                    )}

                    {conjureMsg && (
                      <div className={`rounded-xl px-4 py-2 mb-3 text-sm text-center font-semibold ${conjureMsg.ok ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-950/40 text-red-400'}`}>
                        {conjureMsg.text}
                      </div>
                    )}

                    <button
                      onClick={handleConjure}
                      disabled={loading || selectedTiers.size === 0}
                      className="w-full py-3 rounded-2xl font-extrabold text-lg tracking-wider active:scale-95 transition-all disabled:opacity-30 disabled:active:scale-100"
                      style={{ background: (loading || selectedTiers.size === 0) ? '#333' : 'linear-gradient(180deg, #a855f7, #7c3aed)', color: (loading || selectedTiers.size === 0) ? '#888' : '#fff' }}
                    >
                      {loading ? '✨ Conjurando…' : '✨ CONJURAR'}
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
