import React from 'react';

const PrivacyPolicyModal = ({ onClose }: { onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }} onClick={onClose}>
      <div
        className="bg-surface rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[85vh] overflow-y-auto scrollbar-hide text-sm text-gray-300 border border-surfaceLight"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-white font-bold text-lg">Política de Privacidad</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>
        
        <div className="space-y-4 leading-relaxed">
          <p>
            Al acceder y utilizar esta aplicación, aceptas los términos de esta Política de Privacidad. Esta plataforma ha sido creada estrictamente con fines de entretenimiento.
          </p>
          
          <div>
            <h3 className="text-white font-semibold mb-1">1. Datos que recopilamos</h3>
            <ul className="list-disc pl-5 space-y-1 text-gray-400">
              <li><strong>Nombre de usuario:</strong> Para identificarte en las partidas.</li>
              <li><strong>Contraseña (opcional):</strong> Encriptada de forma segura mediante algoritmos estándar (Bcrypt). Nunca se almacena en texto plano.</li>
              <li><strong>Avatar:</strong> Tu imagen de perfil seleccionada o subida.</li>
              <li><strong>Historial:</strong> Registro de tus partidas, saldo y resultados para mostrar estadísticas y clasificaciones.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-1">2. Uso de los datos</h3>
            <p className="text-gray-400">
              Tus datos se utilizan <strong>exclusivamente</strong> para el funcionamiento interno del juego: mantener tu saldo, mostrar tu perfil a otros jugadores en la mesa y gestionar tu progreso. No compartimos, vendemos ni cedemos tu información a terceros bajo ninguna circunstancia.
            </p>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-1">3. Retención y eliminación</h3>
            <p className="text-gray-400">
              Los datos se mantienen en nuestros servidores mientras la aplicación siga operativa para preservar tu progreso. Si deseas eliminar tu cuenta y todo tu historial, puedes pedírselo a un administrador dentro del juego.
            </p>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-1">4. Almacenamiento local</h3>
            <p className="text-gray-400">
              No utilizamos cookies de rastreo de terceros ni fines publicitarios. Únicamente empleamos el almacenamiento local de tu navegador (`localStorage`) para mantener tu sesión segura sin que tengas que introducir tu contraseña constantemente.
            </p>
          </div>
        </div>

        <button onClick={onClose} className="w-full mt-6 bg-white hover:bg-gray-200 text-black font-bold py-3 rounded-2xl transition-colors">
          Entendido
        </button>
      </div>
    </div>
  );
};

export default PrivacyPolicyModal;
