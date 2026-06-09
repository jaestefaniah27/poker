import React, { useState, useEffect } from 'react';
import Avatar from './Avatar';
import { FRAME_CONFIG, overrideFrameConfig, type FrameConfigType } from './AvatarFrame';

export const AvatarAdjuster: React.FC = () => {
  const [configs, setConfigs] = useState<Record<string, FrameConfigType>>(() => {
    return JSON.parse(JSON.stringify(FRAME_CONFIG));
  });
  
  const [selectedId, setSelectedId] = useState('avatar_silver');

  useEffect(() => {
    overrideFrameConfig(configs);
  }, [configs]);

  const currentConfig = configs[selectedId];

  const updateConfig = (key: keyof FrameConfigType, value: number | string) => {
    setConfigs(prev => ({
      ...prev,
      [selectedId]: { ...prev[selectedId], [key]: value }
    }));
  };

  const copyToClipboard = async () => {
    const text = `export const FRAME_CONFIG: Record<string, FrameConfigType> = ${JSON.stringify(configs, null, 2)};`;
    
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        alert('¡Configuración copiada al portapapeles!');
        return;
      } catch (err) {}
    }

    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "absolute";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
      alert('¡Configuración copiada con éxito!');
    } catch (err) {
      alert('Tu navegador ha bloqueado el copiado automático. Por favor, copia el texto de la caja negra de abajo a mano.');
    }
  };

  if (!currentConfig) return <div className="text-white p-4">Selecciona un marco válido</div>;

  return (
    <div className="fixed inset-0 z-[99999] bg-black text-white p-6 flex flex-col md:flex-row overflow-auto gap-8">
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 rounded-3xl p-8 relative min-h-[400px]">
        <h2 className="absolute top-4 left-4 text-xl font-bold text-gray-500">Vista Previa</h2>
        
        <div className="flex flex-wrap items-center justify-center gap-12">
          <div className="flex flex-col items-center gap-2">
            <span className="text-gray-500 text-xs">Mesa (48px)</span>
            <div className="bg-gray-800 p-12 rounded-xl">
              <Avatar seed="data:image/svg+xml;utf8,<svg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'><circle cx='50' cy='50' r='50' fill='white'/></svg>" size={48} decorationId={selectedId} />
            </div>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <span className="text-gray-500 text-xs">Tienda (72px)</span>
            <div className="bg-gray-800 p-16 rounded-xl">
              <Avatar seed="data:image/svg+xml;utf8,<svg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'><circle cx='50' cy='50' r='50' fill='white'/></svg>" size={72} decorationId={selectedId} />
            </div>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <span className="text-gray-500 text-xs">Gigante (150px)</span>
            <div className="bg-gray-800 p-24 rounded-xl">
              <Avatar seed="data:image/svg+xml;utf8,<svg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'><circle cx='50' cy='50' r='50' fill='white'/></svg>" size={150} decorationId={selectedId} />
            </div>
          </div>
        </div>
      </div>

      <div className="w-full md:w-96 bg-gray-800 p-6 rounded-3xl shrink-0 flex flex-col gap-6 h-full overflow-y-auto">
        <div>
          <h2 className="text-2xl font-black text-amber-400 mb-2">Ajuste de Marcos (Imágenes Aisladas)</h2>
          <p className="text-sm text-gray-400">He recortado tus imágenes PNG automáticamente para quitar los huecos transparentes. Usa los sliders para escalar y centrar cada marco perfectamente alrededor del avatar.</p>
        </div>

        <select 
          className="bg-gray-900 text-white border border-gray-600 rounded-xl p-3 w-full font-bold outline-none focus:border-amber-500"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {Object.keys(configs).map(id => (
            <option key={id} value={id}>{id.toUpperCase()}</option>
          ))}
        </select>

        <div className="space-y-5">
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400 font-semibold">Tamaño general (scale)</span>
              <span className="font-mono text-amber-400">{currentConfig.scale}%</span>
            </div>
            <input type="range" min="50" max="600" step="0.5" className="w-full accent-amber-500" 
              value={currentConfig.scale} onChange={(e) => updateConfig('scale', parseFloat(e.target.value))} />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400 font-semibold">Arriba / Abajo (top)</span>
              <span className="font-mono text-amber-400">{currentConfig.top}%</span>
            </div>
            <input type="range" min="-100" max="100" step="0.5" className="w-full accent-amber-500" 
              value={currentConfig.top} onChange={(e) => updateConfig('top', parseFloat(e.target.value))} />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400 font-semibold">Izquierda / Derecha (left)</span>
              <span className="font-mono text-amber-400">{currentConfig.left}%</span>
            </div>
            <input type="range" min="-100" max="100" step="0.5" className="w-full accent-amber-500" 
              value={currentConfig.left} onChange={(e) => updateConfig('left', parseFloat(e.target.value))} />
          </div>
        </div>

        <button 
          onClick={copyToClipboard}
          className="mt-6 bg-amber-500 hover:bg-amber-400 text-black font-black text-lg py-4 rounded-2xl shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-transform active:scale-95 uppercase tracking-wide"
        >
          Copiar Automáticamente
        </button>

        <textarea 
          readOnly
          value={`export const FRAME_CONFIG: Record<string, FrameConfigType> = ${JSON.stringify(configs, null, 2)};`}
          className="w-full h-32 bg-black border border-gray-700 rounded-xl p-3 text-xs font-mono text-gray-300 outline-none"
          onClick={(e) => (e.target as HTMLTextAreaElement).select()}
        />

        <button 
          onClick={() => window.location.hash = ''}
          className="bg-transparent border border-gray-600 hover:bg-gray-700 text-gray-300 font-bold py-3 rounded-2xl transition-colors"
        >
          Volver al juego
        </button>
      </div>
    </div>
  );
};
