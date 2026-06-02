import { useState } from 'react';
import Avatar from './Avatar';
import ProfileModal from './ProfileModal';
import { socket, STAKE_TIERS, BLIND_DIVISORS, DEFAULT_BLIND_DIVISOR, BLIND_LABELS, blindsFor, fmtChips } from '../utils';

interface LobbyProps {
  user: { id: string; name: string; balance: number; avatar: string; hasPassword: boolean };
  token: string | null;
  rooms: any[];
  onJoinRoom: (roomId: string) => void;
  onLogout: () => void;
  onUpdateUser: (u: any) => void;
}

const Lobby = ({ user, token, rooms, onJoinRoom, onLogout, onUpdateUser }: LobbyProps) => {
  const [showProfile, setShowProfile] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [showStakeSlider, setShowStakeSlider] = useState(false);
  const [createTierIndex, setCreateTierIndex] = useState(STAKE_TIERS.length - 1);
  const [createBlindDivisor, setCreateBlindDivisor] = useState(DEFAULT_BLIND_DIVISOR);

  const openStakeSlider = () => {
    if (!newRoomName.trim()) return;
    setCreateTierIndex(STAKE_TIERS.length - 1);
    setCreateBlindDivisor(DEFAULT_BLIND_DIVISOR);
    setShowStakeSlider(true);
  };

  const confirmCreateRoom = () => {
    if (!newRoomName.trim()) return;
    socket.emit('createRoom', { roomName: newRoomName, tierIndex: createTierIndex, blindDivisor: createBlindDivisor }, (res: any) => {
      if (!res?.roomId) return;
      setShowStakeSlider(false);
      sessionStorage.setItem('pokerRoomId', res.roomId);
      socket.emit('joinRoom', { roomId: res.roomId, token });
    });
  };

  return (
    <div className="min-h-screen bg-background text-primary p-6 flex flex-col items-center font-sans">
      {showProfile && (
        <ProfileModal
          user={user}
          token={token}
          onClose={() => setShowProfile(false)}
          onUpdate={onUpdateUser}
        />
      )}
      <div className="w-full max-w-md">
        <header className="flex justify-between items-center mb-10 pt-4">
          <h1 className="text-3xl font-bold tracking-tight">Lobby</h1>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end leading-tight">
              <span className="text-xs text-gray-400 font-medium">{user.name}</span>
              <span className={`font-mono text-sm ${user.balance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {user.balance < 0 ? `-$${fmtChips(Math.abs(user.balance))}` : `$${fmtChips(user.balance)}`}
              </span>
            </div>
            <button
              onClick={() => setShowProfile(true)}
              title="Mi perfil"
              className="rounded-full ring-2 ring-transparent hover:ring-gray-500 transition-all relative"
            >
              <Avatar seed={user.avatar} />
              {user.hasPassword && (
                <span className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
              )}
            </button>
            <button
              onClick={onLogout}
              title="Cerrar sesión"
              className="text-gray-500 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </header>

        <div className="space-y-6">
          <div className="bg-surface p-5 rounded-3xl border border-surfaceLight">
            <h2 className="text-sm text-gray-400 uppercase tracking-wider font-semibold mb-4">Create Game</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Room name..."
                className="flex-1 bg-background border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-gray-400 text-sm"
              />
              <button
                onClick={openStakeSlider}
                className="bg-white text-black px-6 py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform"
              >
                Create
              </button>
            </div>
          </div>

          <div className="bg-surface p-5 rounded-3xl border border-surfaceLight">
            <h2 className="text-sm text-gray-400 uppercase tracking-wider font-semibold mb-4">Join Game</h2>
            {rooms.length === 0 ? (
              <p className="text-gray-500 text-center py-4 text-sm">No active games found.</p>
            ) : (
              <div className="space-y-2">
                {rooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => onJoinRoom(room.id)}
                    className="w-full flex justify-between items-center bg-background p-4 rounded-2xl border border-gray-800 hover:border-gray-500 transition-colors text-left"
                  >
                    <div>
                      <h3 className="font-semibold text-lg">{room.name}</h3>
                      <p className="text-xs text-gray-500">{room.playerCount} Players • {room.phase}</p>
                      {room.bigBlind != null && (
                        <p className="text-xs mt-0.5">
                          <span className="text-emerald-300/80 font-semibold">{fmtChips(room.smallBlind)}/{fmtChips(room.bigBlind)}</span>
                          <span className="text-gray-600"> • </span>
                          <span className="text-rose-300/80 font-semibold">Buy-in {fmtChips(room.buyIn)}</span>
                        </p>
                      )}
                    </div>
                    <div className="bg-surfaceLight w-8 h-8 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {showStakeSlider && (() => {
          const buyIn = STAKE_TIERS[createTierIndex];
          const { smallBlind, bigBlind } = blindsFor(buyIn, createBlindDivisor);
          return (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setShowStakeSlider(false)}>
              <div className="w-full max-w-md bg-surface rounded-3xl p-6 border border-surfaceLight" onClick={e => e.stopPropagation()}>
                <h2 className="text-center text-lg font-bold mb-1 truncate">{newRoomName}</h2>
                <p className="text-center text-xs text-gray-500 mb-6 uppercase tracking-wider">Elige la entrada</p>

                <div className="text-center mb-4">
                  <p className="text-sm text-emerald-300/80 font-semibold">Ciegas</p>
                  <p className="text-4xl font-extrabold text-emerald-200">{fmtChips(smallBlind)} / {fmtChips(bigBlind)}</p>
                </div>
                <div className="text-center mb-6">
                  <p className="text-sm text-rose-300/80 font-semibold">Buy-in</p>
                  <p className="text-4xl font-extrabold text-rose-300">{fmtChips(buyIn)}</p>
                </div>

                <p className="text-[11px] text-gray-500 mb-1 px-1">Entrada</p>
                <input
                  type="range" min={0} max={STAKE_TIERS.length - 1} step={1}
                  value={createTierIndex}
                  onChange={e => setCreateTierIndex(parseInt(e.target.value))}
                  className="w-full accent-rose-400 mb-2"
                />
                <div className="flex justify-between px-1 mb-5">
                  {STAKE_TIERS.map((b, i) => (
                    <button key={i} onClick={() => setCreateTierIndex(i)} className={`text-[9px] ${i === createTierIndex ? 'text-white font-bold' : 'text-gray-600'}`}>{fmtChips(b)}</button>
                  ))}
                </div>

                <p className="text-[11px] text-gray-500 mb-1 px-1">Ciegas</p>
                <div className="flex gap-1.5 mb-6">
                  {BLIND_DIVISORS.map(d => (
                    <button
                      key={d}
                      onClick={() => setCreateBlindDivisor(d)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${d === createBlindDivisor ? 'bg-emerald-500 text-black' : 'bg-background border border-gray-700 text-gray-400'}`}
                    >
                      {BLIND_LABELS[d]}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setShowStakeSlider(false)} className="flex-1 bg-background border border-gray-700 text-gray-300 py-3 rounded-xl font-semibold text-sm active:scale-95 transition-transform">Cancelar</button>
                  <button onClick={confirmCreateRoom} className="flex-1 bg-white text-black py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform">Start Game</button>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
};

export default Lobby;
