import React, { useState } from 'react';
import type { PublicUser } from '../../../shared/types';
import { SHOP_CATALOG } from '../../../shared/types';
import { fmtChips, socket, getStorage } from '../utils';
import Avatar from './Avatar';
import { DecoratedName } from './Decorations';

interface ShopModalProps {
  user: PublicUser;
  onClose: () => void;
  onUpdateUser: (user: PublicUser) => void;
  onError: (msg: string) => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({ user, onClose, onUpdateUser, onError }) => {
  const [tab, setTab] = useState<'cosmetics' | 'social'>('cosmetics');
  const [israelDonation, setIsraelDonation] = useState('');

  const israelParsed = parseInt(israelDonation.replace(/\D/g, ''), 10) || 0;
  const israelValid = israelParsed > 0;

  const israelQuickAmounts = (balance: number): number[] => {
    const n = Math.floor(Math.log10(Math.max(balance, 10)));
    const base = Math.pow(10, Math.max(0, n - 6));
    return [base, base * 100, base * 10_000, base * 1_000_000];
  };

  const items = SHOP_CATALOG;

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
      else onUpdateUser(res.user);
    });
  };

  const handleEquip = (id: string, type: string) => {
    const isCurrentlyEquipped = isEquipped(id, type);
    // If clicking an already equipped item, unequip it
    const newId = isCurrentlyEquipped ? null : id;
    socket.emit('equipShopItem', { token: getStorage().getItem('pokerToken'), type, itemId: newId }, (res: any) => {
      if (res.error) onError(res.error);
      else onUpdateUser(res.user);
    });
  };

  const handleDonateIsrael = () => {
    if (!israelValid) return onError('Cantidad inválida');
    socket.emit('donateToIsrael', { token: getStorage().getItem('pokerToken'), amount: israelParsed }, (res: any) => {
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

    return (
      <div key={item.id} className={`h-full p-5 rounded-2xl border flex flex-col justify-between transition-all ${
        equipped ? 'bg-gradient-to-b from-yellow-500/20 to-gray-800 border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.4)] transform scale-[1.02]' : 
        owned ? 'bg-gradient-to-b from-green-900/30 to-gray-800 border-green-500/50' : 
        'bg-gray-800 border-gray-700 hover:border-gray-500 hover:bg-gray-750'
      }`}>
        {/* PREVIEW BOX */}
        <div className="h-32 mb-4 bg-black/40 rounded-xl flex items-center justify-center border border-white/5 relative overflow-hidden">
          {item.type === 'avatar' && (
            <Avatar seed={user.avatar} size={72} decorationId={item.id} />
          )}
          {item.type === 'name' && (
            <DecoratedName name="Tu Nombre" decorationId={item.id} className="text-2xl" />
          )}
          {item.type === 'felt' && (
            <div className={`w-full h-full ${
              item.id === 'felt_red' ? 'bg-gradient-to-b from-red-800 to-red-900' :
              item.id === 'felt_blue' ? 'bg-gradient-to-b from-blue-800 to-blue-900' :
              item.id === 'felt_purple' ? 'bg-gradient-to-b from-purple-800 to-purple-900' :
              item.id === 'felt_vip' ? 'bg-gradient-to-b from-gray-900 to-black border-[3px] border-yellow-600' :
              'bg-green-800'
            } flex items-center justify-center`}>
              <div className="w-24 h-12 border-2 border-white/20 rounded-[50%] flex items-center justify-center opacity-50">
                <span className="text-white/50 text-xs font-bold tracking-widest uppercase">Tapete</span>
              </div>
            </div>
          )}
          {item.type === 'social' && (
            <div className="text-5xl drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
              {item.id === 'social_andorra' ? '🇦🇩' : '🌟'}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col">
          <h3 className={`text-xl font-black mb-1 ${equipped ? 'text-yellow-400' : 'text-white'}`}>{item.name}</h3>
          <p className="text-yellow-400 font-bold text-lg mb-3 flex items-center gap-1 bg-black/30 w-fit px-3 py-1 rounded-lg">
            ${fmtChips(item.price)}
          </p>
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
                  className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-black py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-yellow-500/20"
                >
                  Mejorar
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
                className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-black py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-yellow-500/20"
              >
                Comprar
              </button>
            )
          ) : !owned ? (
            <button
              onClick={() => handleBuy(item.id)}
              className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-black py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-yellow-500/20"
            >
              Comprar
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
      <div className="bg-gray-900 border border-yellow-500/30 p-6 rounded-2xl w-full max-w-5xl max-h-full overflow-y-auto relative shadow-2xl shadow-yellow-500/10 text-white">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-200 mb-6 flex items-center gap-3">
          🛒 Tienda Exclusiva
        </h2>

        {/* TABS */}
        <div className="flex gap-2 mb-6 bg-gray-800 p-1 rounded-lg overflow-x-auto">
          {[
            { id: 'cosmetics', label: 'Cosméticos' },
            { id: 'social', label: 'Beneficios' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`flex-1 px-4 py-2 rounded-md font-bold whitespace-nowrap transition-all ${
                tab === t.id ? 'bg-yellow-500 text-black shadow-lg' : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'social' ? (
          <div>
            <div className="mb-8 p-6 bg-blue-900/30 border border-blue-500/30 rounded-2xl">
              <h3 className="text-xl font-bold text-blue-400 mb-1">🇮🇱 Donar a Israel</h3>
              <p className="text-sm text-gray-300 mb-1">
                Apoya la causa y serás bendecido. Tu RTP en minijuegos se verá potenciado hasta recuperar x1.5 lo que hayas donado.
              </p>
              <p className="text-sm text-yellow-400 font-bold mb-4">Pool actual de bendición: {fmtChips(user.israelPool || 0)}</p>

              <div className="space-y-3">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 text-center text-3xl font-black text-blue-300 focus:outline-none focus:border-blue-500/50 transition-colors"
                  value={israelDonation}
                  onChange={e => setIsraelDonation(e.target.value.replace(/\D/g, ''))}
                />

                <div className="grid grid-cols-4 gap-2">
                  {israelQuickAmounts(user.balance).map(amt => (
                    <button
                      key={amt}
                      onClick={() => setIsraelDonation(String(israelParsed + amt))}
                      className="py-2 rounded-xl bg-white/5 border border-white/5 text-xs font-bold text-gray-300 hover:bg-white/10 active:scale-95 transition-all"
                    >
                      +{fmtChips(amt)}
                    </button>
                  ))}
                </div>

                <div className="flex justify-between items-center px-1">
                  <span className="text-xs text-gray-500">Saldo disponible:</span>
                  <span className="text-sm font-bold text-emerald-400">{fmtChips(user.balance)}</span>
                </div>

                <button
                  onClick={handleDonateIsrael}
                  disabled={!israelValid}
                  className={`w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all active:scale-[0.98] ${
                    israelValid
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]'
                      : 'bg-white/5 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Donar
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
              <h3 className="text-2xl font-black text-white mb-4">Marcos de Avatar</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {['bronze', 'silver', 'gold', 'diamond', 'ruby', 'emerald'].map(material => {
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
              <h3 className="text-2xl font-black text-white mb-4">Placas de Nombre</h3>
              <div className="flex gap-6 overflow-x-auto pb-4 snap-x scrollbar-hide">
                {items.filter(i => i.type === 'name').map(item => (
                  <div key={item.id} className="w-[300px] shrink-0 snap-center">
                    {renderItemCard(item)}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-2xl font-black text-white mb-4">Tapetes de Blackjack</h3>
              <div className="flex gap-6 overflow-x-auto pb-4 snap-x scrollbar-hide">
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
