import React, { useState } from 'react';
import { PublicUser, SHOP_CATALOG } from '../../../shared/types';
import { fmtChips } from '../utils';
import socket from '../socket';

interface ShopModalProps {
  user: PublicUser;
  onClose: () => void;
  onUpdateUser: (user: PublicUser) => void;
  onError: (msg: string) => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({ user, onClose, onUpdateUser, onError }) => {
  const [tab, setTab] = useState<'avatar' | 'name' | 'felt' | 'social'>('avatar');
  const [israelDonation, setIsraelDonation] = useState('');

  const items = SHOP_CATALOG.filter(i => i.type === tab);

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
    socket.emit('buyShopItem', { token: localStorage.getItem('token'), itemId: id }, (res: any) => {
      if (res.error) onError(res.error);
      else onUpdateUser(res.user);
    });
  };

  const handleEquip = (id: string, type: string) => {
    const isCurrentlyEquipped = isEquipped(id, type);
    // If clicking an already equipped item, unequip it
    const newId = isCurrentlyEquipped ? null : id;
    socket.emit('equipShopItem', { token: localStorage.getItem('token'), type, itemId: newId }, (res: any) => {
      if (res.error) onError(res.error);
      else onUpdateUser(res.user);
    });
  };

  const handleDonateIsrael = () => {
    const amt = parseInt(israelDonation);
    if (isNaN(amt) || amt <= 0) return onError('Cantidad inválida');
    socket.emit('donateToIsrael', { token: localStorage.getItem('token'), amount: amt }, (res: any) => {
      if (res.error) onError(res.error);
      else {
        onUpdateUser(res.user);
        setIsraelDonation('');
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-yellow-500/30 p-6 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative shadow-2xl shadow-yellow-500/10 text-white">
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
            { id: 'avatar', label: 'Marcos Avatar' },
            { id: 'name', label: 'Placas Nombre' },
            { id: 'felt', label: 'Tapetes Blackjack' },
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

        {tab === 'social' && (
          <div className="mb-8 p-6 bg-blue-900/30 border border-blue-500/30 rounded-xl">
            <h3 className="text-xl font-bold text-blue-400 mb-2">🇮🇱 Donar a Israel</h3>
            <p className="text-sm text-gray-300 mb-4">
              Apoya la causa y serás bendecido. Tu RTP en minijuegos se verá potenciado hasta recuperar x1.5 lo que hayas donado.
              <br />
              <span className="text-yellow-400 font-bold">Pool actual de bendición: {fmtChips(user.israelPool || 0)}</span>
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                placeholder="Cantidad a donar..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded p-2 text-white outline-none focus:border-blue-500"
                value={israelDonation}
                onChange={e => setIsraelDonation(e.target.value)}
              />
              <button
                onClick={handleDonateIsrael}
                className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded font-bold transition-colors"
              >
                Donar
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => {
            const unlocked = isUnlocked(item.id, item.type);
            const equipped = isEquipped(item.id, item.type);
            const isAndorra = item.id === 'social_andorra';
            const owned = unlocked || (isAndorra && user.movedToAndorra);

            return (
              <div key={item.id} className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                equipped ? 'bg-yellow-500/10 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' : 
                owned ? 'bg-green-900/20 border-green-500/50' : 
                'bg-gray-800 border-gray-700'
              }`}>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">{item.name}</h3>
                  <p className="text-yellow-400 font-black text-lg mb-2 flex items-center gap-1">
                    <span className="text-gray-400 text-sm font-normal">Precio:</span> {fmtChips(item.price)}
                  </p>
                  {item.description && (
                    <p className="text-sm text-gray-400 mb-4">{item.description}</p>
                  )}
                </div>

                <div className="mt-4">
                  {!owned ? (
                    <button
                      onClick={() => handleBuy(item.id)}
                      className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black py-2 rounded transition-colors"
                    >
                      Comprar
                    </button>
                  ) : item.type !== 'social' ? (
                    <button
                      onClick={() => handleEquip(item.id, item.type)}
                      className={`w-full py-2 rounded font-black transition-colors ${
                        equipped ? 'bg-gray-700 text-white hover:bg-red-900' : 'bg-green-600 text-white hover:bg-green-500'
                      }`}
                    >
                      {equipped ? 'Quitar' : 'Equipar'}
                    </button>
                  ) : (
                    <div className="w-full py-2 rounded font-black bg-gray-700 text-center text-green-400">
                      Adquirido
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
