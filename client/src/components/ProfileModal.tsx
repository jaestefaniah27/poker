import { useState, useEffect } from 'react';
import { socket } from '../utils';

interface ProfileModalProps {
  user: { id: string; name: string; balance: number; avatar: string; hasPassword: boolean };
  token: string | null;
  onClose: () => void;
  onUpdate: (u: any) => void;
}

const ProfileModal = ({ user, token, onClose, onUpdate }: ProfileModalProps) => {
  const [name, setName] = useState(user.name);
  const [avatarSeed, setAvatarSeed] = useState(user.avatar);
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  
  const [adminUsers, setAdminUsers] = useState<any[]>([]);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const emit = (event: string, payload: any, okText: string) => {
    socket.emit(event, { token, ...payload }, (res: any) => {
      if (res?.error) { flash(false, res.error); return; }
      if (res?.user) onUpdate(res.user);
      flash(true, okText);
      setCurPwd(''); setNewPwd('');
    });
  };

  const loadAdminUsers = () => {
    socket.emit('getAdminUsers', { token }, (res: any) => {
      if (res?.ok) setAdminUsers(res.users);
    });
  };

  useEffect(() => {
    if (user.name === 'Jorge') loadAdminUsers();
  }, [user.name]);

  const saveName = () => {
    if (name.trim() === user.name) { flash(false, 'El nombre no ha cambiado'); return; }
    emit('changeName', { newName: name.trim() }, 'Nombre actualizado');
  };
  const saveAvatar = () => emit('changeAvatar', { avatar: avatarSeed }, 'Avatar actualizado');
  const shuffleAvatar = () => setAvatarSeed(Math.random().toString(36).slice(2, 10));
  const savePassword = () => emit('setPassword', { currentPassword: curPwd, newPassword: newPwd },
    user.hasPassword ? 'Contraseña cambiada' : 'Contraseña añadida');
  const removePassword = () => emit('removePassword', { currentPassword: curPwd }, 'Contraseña eliminada');

  const deleteUser = (targetId: string) => {
    if (!window.confirm('¿Seguro que quieres borrar este usuario?')) return;
    socket.emit('adminDeleteUser', { token, targetId }, (res: any) => {
      if (res?.error) { alert(res.error); return; }
      loadAdminUsers();
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-[#1a1a1a] rounded-2xl p-6 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-hide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-white font-bold text-lg">Mi perfil</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-surfaceLight flex items-center justify-center">
            <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=transparent`} alt="avatar" className="w-full h-full object-cover scale-125" />
          </div>
          <div className="flex gap-2">
            <button onClick={shuffleAvatar} className="bg-surfaceLight hover:bg-gray-700 text-gray-200 text-xs px-3 py-2 rounded-full transition-colors">🎲 Aleatorio</button>
            <button onClick={saveAvatar} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2 rounded-full transition-colors">Guardar avatar</button>
          </div>
        </div>

        {/* Nombre */}
        <div className="mb-6">
          <label className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Nombre</label>
          <div className="flex gap-2 mt-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 bg-background border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gray-400"
            />
            <button onClick={saveName} className="bg-surfaceLight hover:bg-gray-700 text-white text-sm px-4 rounded-xl transition-colors">Guardar</button>
          </div>
        </div>

        {/* Contraseña */}
        <div className="mb-2">
          <label className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
            {user.hasPassword ? 'Contraseña' : 'Añadir contraseña (opcional)'}
          </label>
          <div className="space-y-2 mt-2">
            {user.hasPassword && (
              <input
                type="password" value={curPwd} onChange={(e) => setCurPwd(e.target.value)}
                placeholder="Contraseña actual"
                className="w-full bg-background border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gray-400"
              />
            )}
            <input
              type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
              placeholder={user.hasPassword ? 'Nueva contraseña' : 'Contraseña (mín. 4)'}
              className="w-full bg-background border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gray-400"
            />
            <div className="flex gap-2">
              <button onClick={savePassword} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm py-2.5 rounded-xl transition-colors">
                {user.hasPassword ? 'Cambiar contraseña' : 'Añadir contraseña'}
              </button>
              {user.hasPassword && (
                <button onClick={removePassword} className="flex-1 bg-red-600 hover:bg-red-500 text-white text-sm py-2.5 rounded-xl transition-colors">
                  Quitar
                </button>
              )}
            </div>
          </div>
        </div>

        {msg && (
          <p className={`text-xs text-center mt-4 ${msg.ok ? 'text-emerald-400' : 'text-amber-400'}`}>{msg.text}</p>
        )}

        {/* Admin Panel */}
        {user.name === 'Jorge' && (
          <div className="mt-8 border-t border-gray-700 pt-6">
            <h3 className="text-rose-400 font-bold mb-3 uppercase text-xs tracking-widest flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Admin Panel
            </h3>
            <div className="space-y-2">
              {adminUsers.map((u) => (
                <div key={u.id} className="flex justify-between items-center bg-background p-2.5 rounded-lg border border-gray-800">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{u.name}</span>
                    <span className="text-[10px] text-gray-500 font-mono">${u.balance}</span>
                  </div>
                  {u.id !== user.id && (
                    <button 
                      onClick={() => deleteUser(u.id)}
                      className="bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition-colors"
                    >
                      Borrar
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ProfileModal;
