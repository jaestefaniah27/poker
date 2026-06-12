import { useState, useEffect, useRef } from 'react';
import { socket, fmtChips, fmtDuration, HAND_NAMES_ES } from '../utils';
import { CHIP_MULT_THRESHOLD } from './Chips';

const StatCell = ({ label, value, accent }: { label: string; value: string | number; accent?: string }) => (
  <div className="bg-background rounded-xl p-2.5 flex flex-col items-center border border-gray-800">
    <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold text-center leading-tight">{label}</span>
    <span className={`font-mono text-sm font-bold mt-0.5 ${accent || 'text-white'}`}>{value}</span>
  </div>
);

const StatSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mt-3">
    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1.5">{title}</p>
    <div className="grid grid-cols-2 gap-2">{children}</div>
  </div>
);

const fmtMult = (x100: number) => `x${(x100 / 100).toFixed(2)}`;
const pct = (part: number, total: number) => `${Math.round((part / total) * 100)}%`;

interface ProfileModalProps {
  user: { id: string; name: string; balance: number; avatar: string; hasPassword: boolean };
  token: string | null;
  onClose: () => void;
  onUpdate: (u: any) => void;
  onLogout: () => void;
}

const ProfileModal = ({ user, token, onClose, onUpdate, onLogout }: ProfileModalProps) => {
  const [name, setName] = useState(user.name);
  const [avatarSeed, setAvatarSeed] = useState(user.avatar);
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<{ poker: any; general: Record<string, number> } | null>(null);

  // Multiplicador automático de fichas (solo visible si el saldo lo permite).
  const chipMultEligible = user.balance >= CHIP_MULT_THRESHOLD;
  const [chipMultOn, setChipMultOn] = useState(() => localStorage.getItem('chipMultiplierEnabled') !== '0');
  const toggleChipMult = () => setChipMultOn(prev => {
    const next = !prev;
    localStorage.setItem('chipMultiplierEnabled', next ? '1' : '0');
    return next;
  });

  useEffect(() => {
    socket.emit('getUserStats', { userId: user.id }, (res: any) => {
      if (res?.ok) setStats({ poker: res.poker, general: res.general || {} });
    });
  }, [user.id]);

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

  const forceIsrael = (targetId: string) => {
    const amountStr = window.prompt('Cantidad de fichas a exigir para Israel:');
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0) { alert('Cantidad inválida'); return; }
    
    socket.emit('adminSetIsraelDebt', { token, targetId, amount }, (res: any) => {
      if (res?.error) alert(res.error);
      else { alert('Deuda impuesta correctamente'); loadAdminUsers(); }
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check file size limit (e.g., 5MB before compression to avoid browser crash)
    if (file.size > 5 * 1024 * 1024) {
      flash(false, 'La imagen debe ser menor de 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 150;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
          setAvatarSeed(dataUrl);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }} onClick={onClose}>
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
            <img 
              src={avatarSeed.startsWith('data:image/') ? avatarSeed : `https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=transparent`} 
              alt="avatar" 
              className={`w-full h-full object-cover ${!avatarSeed.startsWith('data:image/') ? 'scale-125' : ''}`} 
            />
          </div>
          <div className="flex gap-2">
            <button onClick={shuffleAvatar} className="bg-surfaceLight hover:bg-gray-700 text-gray-200 text-xs px-3 py-2 rounded-full transition-colors">🎲 Aleatorio</button>
            <button onClick={() => fileInputRef.current?.click()} className="bg-surfaceLight hover:bg-gray-700 text-gray-200 text-xs px-3 py-2 rounded-full transition-colors">📷 Foto</button>
            <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            <button onClick={saveAvatar} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2 rounded-full transition-colors">Guardar avatar</button>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="mb-6">
          <label className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Estadísticas</label>
          {stats ? (() => {
            const g = stats.general;
            const p = stats.poker;
            const hasAny = p.hands_played > 0 || Object.values(g).some(v => v > 0);
            if (!hasAny) return <p className="text-gray-500 text-xs mt-2 italic">Aún no has jugado nada. ¡A la mesa!</p>;
            return (
              <div>
                {(g.max_balance > 0 || g.time_played_ms > 0 || g.bonus_claims > 0 || g.gifts_sent > 0 || g.gifts_received > 0) && (
                  <StatSection title="General">
                    {g.max_balance > 0 && <StatCell label="Récord saldo" value={`$${fmtChips(g.max_balance)}`} accent="text-emerald-400" />}
                    {g.time_played_ms > 0 && <StatCell label="Tiempo jugado" value={fmtDuration(g.time_played_ms)} />}
                    {g.bonus_claims > 0 && <StatCell label="Bonus reclamados" value={g.bonus_claims} />}
                    {g.gifts_sent > 0 && <StatCell label="Regalado" value={fmtChips(g.gifts_sent)} accent="text-rose-300" />}
                    {g.gifts_received > 0 && <StatCell label="Recibido en regalos" value={fmtChips(g.gifts_received)} accent="text-emerald-300" />}
                  </StatSection>
                )}
                {p.hands_played > 0 && (
                  <StatSection title="Poker">
                    <StatCell label="Manos" value={p.hands_played} />
                    <StatCell label="Win rate" value={`${pct(p.hands_won, p.hands_played)} (${p.hands_won})`} />
                    <StatCell label="Mayor bote" value={fmtChips(p.biggest_pot)} accent="text-amber-300" />
                    <StatCell label="Mejor mano" value={HAND_NAMES_ES[p.best_hand_name] || p.best_hand_name || '—'} accent="text-emerald-300" />
                  </StatSection>
                )}
                {g.bj_hands > 0 && (
                  <StatSection title="Blackjack">
                    <StatCell label="Manos" value={g.bj_hands} />
                    <StatCell label="Ganadas" value={`${pct(g.bj_wins || 0, g.bj_hands)} (${g.bj_wins || 0})`} />
                    <StatCell label="Blackjacks" value={g.bj_blackjacks || 0} accent="text-amber-300" />
                    <StatCell label="Mayor premio" value={fmtChips(g.bj_biggest_win || 0)} accent="text-amber-300" />
                    <StatCell
                      label="Neto"
                      value={`${(g.bj_net || 0) >= 0 ? '+' : ''}${fmtChips(g.bj_net || 0)}`}
                      accent={(g.bj_net || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}
                    />
                  </StatSection>
                )}
                {g.jackpot_spins > 0 && (
                  <StatSection title="Jackpot">
                    <StatCell label="Tiradas" value={g.jackpot_spins} />
                    <StatCell label="Mayor premio" value={fmtChips(g.jackpot_biggest_win || 0)} accent="text-amber-300" />
                    <StatCell label="Mejor tirada" value={fmtMult(g.jackpot_best_mult_x100 || 0)} accent="text-emerald-300" />
                    {g.jackpot_tax_paid > 0 && <StatCell label="Pagado a Hacienda" value={fmtChips(g.jackpot_tax_paid)} accent="text-rose-300" />}
                    {g.jackpot_frauds > 0 && <StatCell label="Fraudes fiscales" value={g.jackpot_frauds} accent="text-rose-400" />}
                  </StatSection>
                )}
                {g.mines_games > 0 && (
                  <StatSection title="Mines">
                    <StatCell label="Partidas" value={g.mines_games} />
                    <StatCell label="Retiradas" value={g.mines_cashouts || 0} />
                    <StatCell label="Bombas pisadas" value={g.mines_bombs || 0} accent="text-rose-400" />
                    <StatCell label="Mayor premio" value={fmtChips(g.mines_biggest_win || 0)} accent="text-amber-300" />
                    {g.mines_best_mult_x100 > 0 && <StatCell label="Mejor multiplicador" value={fmtMult(g.mines_best_mult_x100)} accent="text-emerald-300" />}
                  </StatSection>
                )}
                {g.crash_games > 0 && (
                  <StatSection title="Crash">
                    <StatCell label="Partidas" value={g.crash_games} />
                    <StatCell label="Retiradas a tiempo" value={g.crash_cashouts || 0} />
                    <StatCell label="Mayor premio" value={fmtChips(g.crash_biggest_win || 0)} accent="text-amber-300" />
                    {g.crash_best_mult_x100 > 0 && <StatCell label="Mejor multiplicador" value={fmtMult(g.crash_best_mult_x100)} accent="text-emerald-300" />}
                  </StatSection>
                )}
                {g.roulette_rounds > 0 && (
                  <StatSection title="Ruleta">
                    <StatCell label="Rondas" value={g.roulette_rounds} />
                    <StatCell label="Apostado" value={fmtChips(g.roulette_total_bet || 0)} />
                    <StatCell label="Ganado" value={fmtChips(g.roulette_total_won || 0)} accent="text-emerald-300" />
                    <StatCell label="Mayor premio" value={fmtChips(g.roulette_biggest_win || 0)} accent="text-amber-300" />
                  </StatSection>
                )}
                {g.wordle_games > 0 && (
                  <StatSection title="Wordle">
                    <StatCell label="Partidas" value={g.wordle_games} />
                    <StatCell label="Victorias" value={`${pct(g.wordle_wins || 0, g.wordle_games)} (${g.wordle_wins || 0})`} />
                    {g.wordle_total_won > 0 && <StatCell label="Ganado" value={fmtChips(g.wordle_total_won)} accent="text-emerald-300" />}
                  </StatSection>
                )}
                {g.trivia_answered > 0 && (
                  <StatSection title="Trivia">
                    <StatCell label="Respondidas" value={g.trivia_answered} />
                    <StatCell label="Aciertos" value={`${pct(g.trivia_correct || 0, g.trivia_answered)} (${g.trivia_correct || 0})`} accent="text-emerald-300" />
                  </StatSection>
                )}
                {g.wheel_claims > 0 && (
                  <StatSection title="Ruleta de premios">
                    <StatCell label="Tiradas reclamadas" value={g.wheel_claims} />
                  </StatSection>
                )}
              </div>
            );
          })() : (
            <p className="text-gray-500 text-xs mt-2 italic">Cargando…</p>
          )}
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

        {/* Ajustes — Multiplicador de fichas */}
        {chipMultEligible && (
          <div className="mt-6">
            <label className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Ajustes</label>
            <button
              onClick={toggleChipMult}
              className="w-full mt-2 flex items-center justify-between bg-background border border-gray-700 rounded-xl px-4 py-3 text-left hover:border-gray-500 transition-colors"
            >
              <span className="flex flex-col pr-3">
                <span className="text-sm text-white font-semibold">Multiplicador de fichas</span>
                <span className="text-[10px] text-gray-500 leading-tight mt-0.5">
                  Tu saldo es enorme: usa fichas que valen x1000 (o más) en blackjack y ruleta.
                </span>
              </span>
              <span className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${chipMultOn ? 'bg-emerald-500' : 'bg-gray-600'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${chipMultOn ? 'left-[22px]' : 'left-0.5'}`} />
              </span>
            </button>
          </div>
        )}

        {msg && (
          <p className={`text-xs text-center mt-4 ${msg.ok ? 'text-emerald-400' : 'text-amber-400'}`}>{msg.text}</p>
        )}

        <div className="mt-6 pt-4 border-t border-gray-800">
          <button 
            onClick={onLogout} 
            className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold py-3 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Cerrar sesión
          </button>
        </div>

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
                    <div className="flex gap-2">
                      <button 
                        onClick={() => forceIsrael(u.id)}
                        className="bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-white px-3 py-1.5 rounded text-[10px] font-bold transition-colors"
                      >
                        Expropiar Israel
                      </button>
                      <button 
                        onClick={() => deleteUser(u.id)}
                        className="bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white px-3 py-1.5 rounded text-[10px] font-bold transition-colors"
                      >
                        Borrar
                      </button>
                    </div>
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
