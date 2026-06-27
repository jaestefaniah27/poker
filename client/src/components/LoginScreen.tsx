import { useState } from 'react';
import { socket, getStorage } from '../utils';
import PrivacyPolicyModal from './PrivacyPolicyModal';

interface LoginScreenProps {
  onLogin: (user: any, token: string, activeRoomId?: string) => void;
}

const LoginScreen = ({ onLogin }: LoginScreenProps) => {
  const [playerName, setPlayerName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showPrivacy, setShowPrivacy] = useState(false);

  const handleLogin = () => {
    if (!playerName.trim()) return;
    setLoginError('');
    socket.emit('login', { name: playerName.trim(), password: loginPassword || undefined }, (response: any) => {
      if (response.needPassword) {
        setNeedPassword(true);
        setLoginError('Esta cuenta tiene contraseña. Introdúcela para entrar.');
        return;
      }
      if (response.error) {
        setLoginError(response.error);
        return;
      } else if (response.user && response.token) {
        getStorage().setItem('pokerToken', response.token);
        onLogin(response.user, response.token, response.activeRoomId);
      }
    });
  };

  return (
    <div className="min-h-screen bg-background text-primary flex items-center justify-center p-4 font-sans">
      <div className="max-w-sm w-full space-y-8">
        <div className="text-center">
          <h1 className="text-5xl font-extrabold tracking-tighter mb-2">Poker</h1>
          <p className="text-gray-400 text-sm tracking-wide uppercase">Cards. Chips. Glory.</p>
        </div>
        <div className="bg-surface p-6 rounded-3xl shadow-2xl border border-surfaceLight space-y-4">
          <div>
            <input
              type="text"
              value={playerName}
              disabled={needPassword}
              onChange={(e) => { setPlayerName(e.target.value); setNeedPassword(false); setLoginPassword(''); setLoginError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className={`w-full bg-background border border-gray-700 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-gray-400 transition-colors text-center text-lg placeholder-gray-600 ${needPassword ? 'opacity-60' : ''}`}
              placeholder="Tu nombre"
            />
          </div>
          {needPassword && (
            <div>
              <input
                type="password"
                autoFocus
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full bg-background border border-amber-500 rounded-2xl px-5 py-4 text-white focus:outline-none transition-colors text-center text-lg placeholder-gray-600"
                placeholder="Contraseña"
              />
            </div>
          )}
          {loginError && (
            <p className={`text-xs text-center ${needPassword ? 'text-amber-400' : 'text-red-400'}`}>{loginError}</p>
          )}
          <button
            className="w-full bg-white text-black font-bold py-4 px-4 rounded-2xl transition-transform active:scale-95"
            onClick={handleLogin}
          >
            {needPassword ? 'Entrar' : 'Play'}
          </button>
          {needPassword && (
            <button
              className="w-full text-gray-500 hover:text-white text-xs transition-colors"
              onClick={() => { setNeedPassword(false); setLoginPassword(''); setLoginError(''); }}
            >
              ← Cambiar de usuario
            </button>
          )}
        </div>
        
        <div className="text-center mt-6">
          <button 
            onClick={() => setShowPrivacy(true)} 
            className="text-gray-500 hover:text-gray-300 text-xs transition-colors underline decoration-gray-600 underline-offset-4"
          >
            Política de Privacidad
          </button>
        </div>
      </div>
      
      {showPrivacy && <PrivacyPolicyModal onClose={() => setShowPrivacy(false)} />}
    </div>
  );
};

export default LoginScreen;
