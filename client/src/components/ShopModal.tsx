import React, { useState, useEffect } from 'react';
import type { PublicUser } from '../../../shared/types';
import { SHOP_CATALOG, PAGUITA_MAX_LEVEL, DIETA_MAX_LEVEL, RULETA_MAX_LEVEL, TRIVIA_MAX_LEVEL, TRACK_BOOST_MAX, TRACK_BASE_PRIZE, boostCost, trackBoostCount, boostMultiplier } from '../../../shared/types';
import type { LevelTrack } from '../../../shared/types';
import { fmtChips, socket, getStorage } from '../utils';
import Avatar from './Avatar';
import { DecoratedName } from './Decorations';
import { FeltSurface } from './FeltSurface';
import { sfx } from '../sounds';

interface ShopModalProps {
  user: PublicUser;
  onClose: () => void;
  onUpdateUser: (user: PublicUser) => void;
  onError: (msg: string) => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({ user, onClose, onUpdateUser, onError }) => {
  const [tab, setTab] = useState<'cosmetics' | 'social'>('cosmetics');
  const [israelDonation, setIsraelDonation] = useState('');
  const [israelLoading, setIsraelLoading] = useState(false);

  const israelParsed = parseInt(israelDonation.replace(/\D/g, ''), 10) || 0;
  const israelValid = israelParsed > 0 && israelParsed <= Number(user.balance);

  const quickAmounts = (balance: number): number[] => {
    const n = Math.floor(Math.log10(Math.max(balance, 10)));
    const base = Math.pow(10, Math.max(0, n - 8));
    return [base, base * 100, base * 10_000, base * 1_000_000, base * 100_000_000];
  };

  const israelAddAmount = (val: number) => {
    setIsraelDonation(String(Math.min(Number(user.balance), israelParsed + val)));
  };

  const [items, setItems] = useState<any[]>(SHOP_CATALOG);

  useEffect(() => {
    socket.emit('getShopCatalog', {}, (data: any[]) => {
      if (data && data.length > 0) setItems(data);
    });
    const onUpdate = (data: any[]) => {
      if (data && data.length > 0) setItems(data);
    };
    socket.on('shopCatalogUpdated', onUpdate);
    return () => { socket.off('shopCatalogUpdated', onUpdate); };
  }, []);
  const NEW_ITEM_IDS = ['name_fire', 'name_royal', 'felt_galaxy', 'felt_royal'];

  type Rarity = { label: string; badge: string; border: string; glow: string };
  const rarityOf = (price: number): Rarity => {
    if (price >= 500_000_000_000) return {
      label: 'MÍTICO',
      badge: 'bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white',
      border: 'border-fuchsia-500/60',
      glow: 'shadow-[0_0_25px_rgba(217,70,239,0.25)]',
    };
    if (price >= 100_000_000_000) return {
      label: 'LEGENDARIO',
      badge: 'bg-gradient-to-r from-amber-400 to-yellow-500 text-black',
      border: 'border-amber-500/60',
      glow: 'shadow-[0_0_20px_rgba(245,158,11,0.2)]',
    };
    if (price >= 5_000_000_000) return {
      label: 'ÉPICO',
      badge: 'bg-gradient-to-r from-purple-500 to-violet-500 text-white',
      border: 'border-purple-500/50',
      glow: 'shadow-[0_0_15px_rgba(168,85,247,0.15)]',
    };
    if (price >= 100_000_000) return {
      label: 'RARO',
      badge: 'bg-gradient-to-r from-sky-500 to-blue-500 text-white',
      border: 'border-sky-500/40',
      glow: '',
    };
    return {
      label: 'COMÚN',
      badge: 'bg-gray-600 text-gray-200',
      border: 'border-white/10',
      glow: '',
    };
  };

  const isUnlocked = (id: string, type: string) => {
    if (type === 'avatar') return user.unlockedAvatarDecorations?.includes(id);
    if (type === 'name') return user.unlockedNameDecorations?.includes(id);
    if (type === 'felt') return user.unlockedBjFelts?.includes(id);
    return false;
  };

  const isEquipped = (id: string, type: string) => {
    if (type === 'avatar') return user.equippedAvatarDecoration === id;
    if (type === 'name') return user.equippedNameDecoration === id;
    if (type === 'felt') return user.equippedBjFelt === id;
    return false;
  };

  const handleBuy = (id: string) => {
    socket.emit('buyShopItem', { token: getStorage().getItem('pokerToken'), itemId: id }, (res: any) => {
      if (res.error) onError(res.error);
      else { onUpdateUser(res.user); sfx.buy(); }
    });
  };

  const handleEquip = (id: string, type: string) => {
    const isCurrentlyEquipped = isEquipped(id, type);
    // If clicking an already equipped item, unequip it
    const newId = isCurrentlyEquipped ? null : id;
    socket.emit('equipShopItem', { token: getStorage().getItem('pokerToken'), type, itemId: newId }, (res: any) => {
      if (res.error) onError(res.error);
      else { onUpdateUser(res.user); sfx.click(); }
    });
  };

  const handleDonateIsrael = () => {
    if (!israelValid || israelLoading) return;
    setIsraelLoading(true);
    socket.emit('donateToIsrael', { token: getStorage().getItem('pokerToken'), amount: israelParsed }, (res: any) => {
      setIsraelLoading(false);
      if (res.error) onError(res.error);
      else {
        onUpdateUser(res.user);
        setIsraelDonation('');
      }
    });
  };

  const getActiveAvatarFrame = (material: string): { showItem: any, state: 'buy'|'upgrade'|'max', highestOwned: any } => {
    const level3 = items.find(i => i.id === `avatar_${material}_3`);
    const level2 = items.find(i => i.id === `avatar_${material}_2`);
    const level1 = items.find(i => i.id === `avatar_${material}`);

    if (isUnlocked(`avatar_${material}_3`, 'avatar')) return { showItem: level3, state: 'max', highestOwned: level3 };
    if (isUnlocked(`avatar_${material}_2`, 'avatar')) return { showItem: level3, state: 'upgrade', highestOwned: level2 };
    if (isUnlocked(`avatar_${material}`, 'avatar')) return { showItem: level2, state: 'upgrade', highestOwned: level1 };
    return { showItem: level1, state: 'buy', highestOwned: null };
  };

  const renderItemCard = (item: any, avatarState?: { state: 'buy'|'upgrade'|'max', highestOwned?: any }) => {
    if (!item) return null;
    const unlocked = isUnlocked(item.id, item.type);
    const equipped = isEquipped(item.id, item.type);
    const isAndorra = item.id === 'social_andorra';
    const owned = unlocked || (isAndorra && user.movedToAndorra);

    const rarity = rarityOf(item.price);
    const isNew = NEW_ITEM_IDS.includes(item.id);
    const meetsLevelReq = !item.minLevel || (user.level ?? 1) >= item.minLevel;

    return (
      <div key={item.id} className={`shop-card h-full p-5 rounded-2xl border flex flex-col justify-between transition-all duration-300 ${
        equipped ? 'bg-gradient-to-b from-yellow-500/15 via-black/40 to-black/60 border-yellow-500 shadow-[0_0_25px_rgba(234,179,8,0.35)] scale-[1.02]' :
        owned ? `bg-gradient-to-b from-emerald-500/10 via-black/40 to-black/60 border-emerald-500/50 ${rarity.glow}` :
        `bg-gradient-to-b from-white/[0.06] via-black/40 to-black/60 ${rarity.border} ${rarity.glow} hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]`
      }`}>
        {/* PREVIEW BOX */}
        <div className="h-32 mb-4 rounded-xl flex items-center justify-center border border-white/10 relative overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08)_0%,rgba(0,0,0,0.6)_70%)]">
          {/* Badges */}
          <div className="absolute top-2 left-2 z-20 flex flex-col gap-1 items-start">
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full tracking-widest ${rarity.badge}`}>{rarity.label}</span>
            {isNew && <span className="text-[9px] font-black px-2 py-0.5 rounded-full tracking-widest bg-gradient-to-r from-red-500 to-orange-500 text-white animate-pulse">NUEVO</span>}
          </div>
          {equipped && (
            <span className="absolute top-2 right-2 z-20 text-[9px] font-black px-2 py-0.5 rounded-full tracking-widest bg-yellow-500 text-black">EQUIPADO</span>
          )}
          {item.type === 'avatar' && (
            <Avatar seed={user.avatar} size={72} decorationId={item.id} />
          )}
          {item.type === 'name' && (
            <DecoratedName name="Tu Nombre" decorationId={item.id} className="text-2xl" />
          )}
          {item.type === 'felt' && (
            <div className={`w-full h-full flex items-center justify-center relative ${item.id === 'felt_vip' || item.id === 'felt_royal' ? 'border-[3px] border-yellow-600' : ''}`}>
              <FeltSurface feltId={item.id} compact />
              <div className="w-24 h-12 border-2 border-white/25 rounded-[50%] flex items-center justify-center opacity-60 relative z-10">
                <span className="text-white/60 text-xs font-bold tracking-widest uppercase">Tapete</span>
              </div>
            </div>
          )}
          {item.type === 'social' && (
            <div className="text-5xl drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
              {item.id === 'social_andorra' ? <img src="https://flagcdn.com/ad.svg" alt="Andorra" className="h-[1em] w-auto inline-block drop-shadow-md" /> : '🌟'}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col">
          <h3 className={`text-xl font-black mb-1 ${equipped ? 'text-yellow-400' : 'text-white'}`}>{item.name}</h3>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-amber-300 font-bold text-lg flex items-center gap-1.5 bg-gradient-to-r from-amber-500/15 to-transparent w-fit px-3 py-1 rounded-lg border border-amber-500/20">
              <span className="text-sm">🪙</span>{fmtChips(item.price)}
            </p>
            {item.minLevel && (
              <p className={`text-xs font-bold px-2 py-1 rounded-lg border ${meetsLevelReq ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                Nivel {item.minLevel}
              </p>
            )}
          </div>
          {item.description && (
            <p className="text-xs text-gray-400 mb-4 leading-relaxed line-clamp-3">{item.description}</p>
          )}
        </div>

        <div className="mt-auto pt-2 space-y-2">
          {avatarState ? (
            avatarState.state === 'upgrade' ? (
              <>
                <button
                  onClick={() => handleBuy(item.id)}
                  disabled={!meetsLevelReq}
                  className={`w-full font-black py-3 rounded-xl transition-all shadow-lg ${meetsLevelReq ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black hover:scale-[1.02] active:scale-95 shadow-yellow-500/20' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}
                >
                  {meetsLevelReq ? 'Mejorar' : `Requiere Nivel ${item.minLevel}`}
                </button>
                <button
                  onClick={() => handleEquip(avatarState.highestOwned.id, item.type)}
                  className={`w-full py-2 rounded-xl font-bold transition-all border ${
                    isEquipped(avatarState.highestOwned.id, item.type)
                      ? 'bg-gray-800 border-yellow-500/50 text-yellow-500'
                      : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-750'
                  }`}
                >
                  {isEquipped(avatarState.highestOwned.id, item.type) ? 'Equipado (Nivel Actual)' : 'Equipar Nivel Actual'}
                </button>
              </>
            ) : avatarState.state === 'max' ? (
              <button
                onClick={() => handleEquip(item.id, item.type)}
                className={`w-full py-3 rounded-xl font-black transition-all hover:scale-[1.02] active:scale-95 shadow-lg ${
                  equipped 
                    ? 'bg-gradient-to-r from-red-600 to-red-800 text-white shadow-red-500/20 border border-red-500/50' 
                    : 'bg-gradient-to-r from-green-500 to-green-700 text-white shadow-green-500/20 border border-green-500/50'
                }`}
              >
                {equipped ? 'Quitar Equipado' : 'Equipar (Nivel Máximo)'}
              </button>
            ) : (
              <button
                onClick={() => handleBuy(item.id)}
                disabled={!meetsLevelReq}
                className={`w-full font-black py-3 rounded-xl transition-all shadow-lg ${meetsLevelReq ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black hover:scale-[1.02] active:scale-95 shadow-yellow-500/20' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}
              >
                {meetsLevelReq ? 'Comprar' : `Requiere Nivel ${item.minLevel}`}
              </button>
            )
          ) : !owned ? (
            <button
              onClick={() => handleBuy(item.id)}
              disabled={!meetsLevelReq}
              className={`w-full font-black py-3 rounded-xl transition-all shadow-lg ${meetsLevelReq ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black hover:scale-[1.02] active:scale-95 shadow-yellow-500/20' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}
            >
              {meetsLevelReq ? 'Comprar' : `Requiere Nivel ${item.minLevel}`}
            </button>
          ) : item.type !== 'social' ? (
            <button
              onClick={() => handleEquip(item.id, item.type)}
              className={`w-full py-3 rounded-xl font-black transition-all hover:scale-[1.02] active:scale-95 shadow-lg ${
                equipped 
                  ? 'bg-gradient-to-r from-red-600 to-red-800 text-white shadow-red-500/20 border border-red-500/50' 
                  : 'bg-gradient-to-r from-green-500 to-green-700 text-white shadow-green-500/20 border border-green-500/50'
              }`}
            >
              {equipped ? 'Quitar Equipado' : 'Equipar'}
            </button>
          ) : (
            <div className="w-full py-3 rounded-xl font-black bg-gray-800 text-center text-green-400 border border-green-500/30 flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Adquirido
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center px-4 pt-[max(32px,env(safe-area-inset-top))] pb-[max(32px,env(safe-area-inset-bottom))] z-50">
      <div className="bg-gradient-to-b from-[#16120a] via-[#0d0d0f] to-black border border-amber-500/30 p-6 rounded-2xl w-full max-w-5xl max-h-full overflow-y-auto relative shadow-2xl shadow-amber-500/10 text-white">
        <button onClick={onClose} className="absolute top-4 right-4 z-10 text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-full p-1.5">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-2 pr-10">
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-amber-400 to-yellow-200 animate-gradient-x flex items-center gap-3">
            👑 Tienda Exclusiva
          </h2>
          <div className="flex items-center gap-4">
            {user.name === 'Jorge' && (
              <button
                onClick={() => {
                  socket.emit('adminResetShopPurchases', { token: getStorage().getItem('pokerToken') }, (res: any) => {
                    if (res?.error) onError(res.error);
                    else if (res?.ok && res.user) onUpdateUser(res.user);
                  });
                }}
                className="text-[10px] font-bold text-red-400 border border-red-900/40 bg-red-500/10 px-2 py-1 rounded active:scale-95 transition-all"
              >
                🔄 Reiniciar mis compras
              </button>
            )}
            <div className="flex items-center gap-2 bg-black/50 border border-amber-500/30 rounded-full px-4 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <span className="text-sm">🪙</span>
              <span className="font-black text-amber-300 text-sm">{fmtChips(user.balance)}</span>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-amber-200/40 uppercase tracking-[0.3em] mb-5">Lujo · Estatus · Envidia ajena</p>

        {/* TABS */}
        <div className="flex gap-2 mb-6 bg-black/40 border border-white/10 p-1 rounded-xl overflow-x-auto">
          {[
            { id: 'cosmetics', label: '✨ Cosméticos' },
            { id: 'social', label: '🏛️ Beneficios' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`flex-1 px-4 py-2 rounded-lg font-bold whitespace-nowrap transition-all ${
                tab === t.id ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'social' ? (
          <div>
            <div className="mb-8">
              <h3 className="text-2xl font-black text-white mb-4 flex items-center gap-3">Mejoras x10<span className="flex-1 h-px bg-gradient-to-r from-amber-500/40 to-transparent" /></h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                  { label: 'Paguita', emoji: '💸', track: 'paguita' as LevelTrack, maxLevel: PAGUITA_MAX_LEVEL, basePrize: TRACK_BASE_PRIZE.paguita, userLevel: user.paguitaLevel ?? 0 },
                  { label: 'Dieta', emoji: '🥗', track: 'dieta' as LevelTrack, maxLevel: DIETA_MAX_LEVEL, basePrize: TRACK_BASE_PRIZE.dieta, userLevel: user.dietaLevel ?? 0 },
                  { label: 'Ruleta', emoji: '🎡', track: 'ruleta' as LevelTrack, maxLevel: RULETA_MAX_LEVEL, basePrize: TRACK_BASE_PRIZE.ruleta, userLevel: user.ruletaLevel ?? 0 },
                  { label: 'Trivia', emoji: '🧠', track: 'trivia' as LevelTrack, maxLevel: TRIVIA_MAX_LEVEL, basePrize: TRACK_BASE_PRIZE.trivia, userLevel: user.triviaLevel ?? 0 },
                ]).map(b => {
                  const boosts = user.unlockedBoosts ?? {};
                  const count = trackBoostCount(b.track, boosts);
                  const maxBoosts = TRACK_BOOST_MAX[b.track];
                  const atMax = b.userLevel >= b.maxLevel;
                  const atBoostMax = count >= maxBoosts;
                  const currentPrize = b.basePrize * boostMultiplier(b.track, boosts);
                  const nextPrize = currentPrize * 10;
                  const cost = boostCost(b.track, count);
                  return (
                    <div key={b.track} className={`p-5 rounded-2xl border transition-all ${count > 0 ? 'bg-amber-500/10 border-amber-500/40' : atMax ? 'bg-white/5 border-white/10' : 'bg-white/3 border-white/5 opacity-60'}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-3xl">{b.emoji}</span>
                        <div>
                          <p className="font-black text-white">{b.label} Deluxe</p>
                          <p className="text-xs text-gray-400">Track {b.userLevel}/{b.maxLevel} · Boost {count}/{maxBoosts}</p>
                        </div>
                        {atBoostMax && <span className="ml-auto text-xs font-black text-amber-400 bg-amber-500/20 px-2 py-1 rounded-full">MAX</span>}
                      </div>
                      <div className="flex justify-between text-xs mb-4">
                        <span className="text-gray-400">Premio: <span className="text-white font-bold">{fmtChips(currentPrize)}</span></span>
                        {!atBoostMax && atMax && <span className="text-amber-400">→ <span className="font-bold">{fmtChips(nextPrize)}</span></span>}
                      </div>
                      <button
                        onClick={() => {
                          if (!atMax || atBoostMax) return;
                          socket.emit('buyTrackBoost', { token: getStorage().getItem('pokerToken'), track: b.track }, (res: any) => {
                            if (res.error) onError(res.error);
                            else onUpdateUser(res.user);
                          });
                        }}
                        disabled={!atMax || atBoostMax}
                        className={`w-full py-2.5 rounded-xl font-black text-sm transition-all active:scale-[0.98] ${
                          atBoostMax ? 'bg-amber-500/20 text-amber-400 cursor-not-allowed'
                          : atMax ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                          : 'bg-white/5 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {atBoostMax ? '✓ Máximo alcanzado' : atMax ? `${fmtChips(cost)} fichas` : `Necesitas nivel ${b.maxLevel}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mb-8 bg-surface border border-surfaceLight rounded-3xl p-6 shadow-2xl">
              <div className="flex flex-col items-center gap-3 mb-6">
                <div className="text-5xl">🇮🇱</div>
                <div className="text-center">
                  <h2 className="text-xl font-bold text-white mb-1">Donar a Israel</h2>
                  <p className="text-xs text-gray-400 uppercase tracking-widest">Enviar fichas</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={israelDonation}
                    onChange={e => setIsraelDonation(e.target.value.replace(/\D/g, ''))}
                    placeholder="0"
                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 text-center text-3xl font-black text-amber-400 focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-gray-500 font-bold">$</span>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {quickAmounts(Number(user.balance)).map(amt => (
                    <button
                      key={amt}
                      onClick={() => israelAddAmount(amt)}
                      className="py-2 rounded-xl bg-white/5 border border-white/5 text-xs font-bold text-gray-300 hover:bg-white/10 active:scale-95 transition-all"
                    >
                      +{fmtChips(amt)}
                    </button>
                  ))}
                </div>

                <div className="flex justify-between items-center px-2">
                  <span className="text-xs text-gray-500 font-medium">Saldo disponible:</span>
                  <span className="text-sm font-bold text-emerald-400">${fmtChips(user.balance)}</span>
                </div>

                <button
                  onClick={handleDonateIsrael}
                  disabled={!israelValid || israelLoading}
                  className={`w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider transition-all active:scale-[0.98] ${
                    israelValid
                      ? 'bg-amber-500 text-black shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:bg-amber-400'
                      : 'bg-white/5 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {israelLoading ? 'Enviando...' : 'Donar a Israel'}
                </button>

              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.filter(i => i.type === 'social').map(item => renderItemCard(item))}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <section>
              <h3 className="text-2xl font-black text-white mb-4 flex items-center gap-3">Marcos de Avatar<span className="flex-1 h-px bg-gradient-to-r from-amber-500/40 to-transparent" /></h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {['silver', 'gold', 'diamond'].map(material => {
                  const state = getActiveAvatarFrame(material);
                  return (
                    <div key={material}>
                      {renderItemCard(state.showItem, state)}
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="text-2xl font-black text-white mb-4 flex items-center gap-3">Placas de Nombre<span className="flex-1 h-px bg-gradient-to-r from-amber-500/40 to-transparent" /></h3>
              <div className="flex gap-6 overflow-x-auto pt-4 pb-6 px-2 -mx-2 snap-x scrollbar-hide">
                {items.filter(i => i.type === 'name').map(item => (
                  <div key={item.id} className="w-[300px] shrink-0 snap-center">
                    {renderItemCard(item)}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-2xl font-black text-white mb-4 flex items-center gap-3">Tapetes de Blackjack<span className="flex-1 h-px bg-gradient-to-r from-amber-500/40 to-transparent" /></h3>
              <div className="flex gap-6 overflow-x-auto pt-4 pb-6 px-2 -mx-2 snap-x scrollbar-hide">
                {items.filter(i => i.type === 'felt').map(item => (
                  <div key={item.id} className="w-[300px] shrink-0 snap-center">
                    {renderItemCard(item)}
                  </div>
                ))}
              </div>
            </section>

          </div>
        )}
      </div>
    </div>
  );
};
