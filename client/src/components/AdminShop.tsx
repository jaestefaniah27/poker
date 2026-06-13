import React, { useState, useEffect } from 'react';
import { socket, fmtChips } from '../utils';
import type { ShopItem } from '../../../shared/types';
import { SHOP_CATALOG as DEFAULT_CATALOG } from '../../../shared/types'; // Fallback just in case

// Precio en formato corto: 10M, 2.5B, 750B, 1.5T...
const UNITS: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

const abbrevPrice = (n: number): string => {
  if (!n || n === 0) return '0';
  for (const [v, s] of UNITS) {
    if (Math.abs(n) >= v) {
      const num = n / v;
      const str = Number.isInteger(num) ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '');
      return str + s;
    }
  }
  return n.toString();
};

const parsePrice = (str: string): number | null => {
  const m = str.trim().replace(/\s/g, '').replace(/,/g, '.').match(/^([\d.]+)([kKmMbBtT]?)$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return null;
  const mult: Record<string, number> = { '': 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  return Math.round(num * (mult[m[2].toLowerCase()] ?? 1));
};

const PriceField = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => {
  const [str, setStr] = useState(abbrevPrice(value));
  const parsed = parsePrice(str);
  return (
    <>
      <input
        value={str}
        onChange={(e) => {
          setStr(e.target.value);
          const p = parsePrice(e.target.value);
          if (p !== null) onChange(p);
        }}
        placeholder="ej: 10M, 2.5B, 1T"
        className={`w-full bg-black border rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 outline-none ${parsed === null ? 'border-red-500' : 'border-gray-700'}`}
      />
      <div className={`text-[10px] mt-0.5 font-mono ${parsed === null ? 'text-red-400' : 'text-emerald-400'}`}>
        {parsed === null ? 'Formato inválido' : `${parsed.toLocaleString('es-ES')} fichas · ${fmtChips(parsed)}`}
      </div>
    </>
  );
};

const AdminShop = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  
  const [catalog, setCatalog] = useState<ShopItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      socket.emit('getShopCatalog', {}, (data: ShopItem[]) => {
        if (data && data.length > 0) setCatalog(data);
        else setCatalog(DEFAULT_CATALOG);
      });
    }
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    socket.emit('login', { name: username, password }, (res: any) => {
      if (res?.error) {
        alert(res.error);
        return;
      }
      if (res?.user?.name === 'Jorge') {
        setToken(res.token);
        setIsAuthenticated(true);
      } else {
        alert('Acceso denegado: Solo Jorge puede entrar a esta página.');
      }
    });
  };

  const handleSave = () => {
    if (!token) return;
    setSaving(true);
    socket.emit('adminSaveShopCatalog', { token, catalog }, (res: any) => {
      setSaving(false);
      if (res?.ok) {
        alert('¡Catálogo guardado correctamente en la base de datos!');
      } else {
        alert('Error: ' + res?.error);
      }
    });
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newCat = [...catalog];
    const temp = newCat[index - 1];
    newCat[index - 1] = newCat[index];
    newCat[index] = temp;
    setCatalog(newCat);
  };

  const moveDown = (index: number) => {
    if (index === catalog.length - 1) return;
    const newCat = [...catalog];
    const temp = newCat[index + 1];
    newCat[index + 1] = newCat[index];
    newCat[index] = temp;
    setCatalog(newCat);
  };

  const updateItem = (index: number, field: keyof ShopItem, value: any) => {
    const newCat = [...catalog];
    (newCat[index] as any)[field] = value;
    setCatalog(newCat);
  };

  if (!isAuthenticated) {
    return (
      <div className="h-screen w-full overflow-y-auto bg-black text-white flex flex-col items-center justify-center p-6 font-sans">
        <h1 className="text-3xl font-black mb-6 text-amber-500">Admin Tienda</h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-4 w-full max-w-sm">
          <input 
            type="text" placeholder="Usuario" value={username} onChange={e => setUsername(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white"
          />
          <input 
            type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white"
          />
          <button type="submit" className="bg-amber-600 font-bold text-black py-3 rounded-xl mt-2 active:scale-95 transition-transform">
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-y-auto bg-black text-white p-4 font-sans pb-32">
      <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 pt-4 sticky top-0 bg-black/80 backdrop-blur-md z-50 py-4 border-b border-gray-800">
        <h1 className="text-2xl font-black text-amber-500">Editor Tienda</h1>
        <button 
          onClick={handleSave} 
          disabled={saving}
          className="bg-emerald-600 text-white font-bold px-6 py-2 rounded-xl active:scale-95 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar Todos'}
        </button>
      </div>

      <div className="space-y-4">
        {catalog.map((item, i) => (
          <div key={item.id} className="bg-gray-900 border border-gray-800 p-4 rounded-2xl flex flex-col gap-3 relative">
            <div className="absolute top-4 right-4 flex flex-col gap-1">
              <button onClick={() => moveUp(i)} className="bg-gray-800 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white active:scale-95">↑</button>
              <button onClick={() => moveDown(i)} className="bg-gray-800 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white active:scale-95">↓</button>
            </div>
            
            <div className="pr-12">
              <div className="text-[10px] text-gray-500 font-mono mb-1">ID: {item.id} | Tipo: {item.type}</div>
              
              <label className="text-xs text-gray-400 block">Nombre</label>
              <input 
                value={item.name} 
                onChange={(e) => updateItem(i, 'name', e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white mb-2 focus:border-amber-500 outline-none"
              />
              
              <div className="flex gap-2 mb-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 block">Precio</label>
                  <PriceField value={item.price} onChange={(n) => updateItem(i, 'price', n)} />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400 block">Nivel Mínimo</label>
                  <input 
                    type="number"
                    value={item.minLevel ?? 0} 
                    onChange={(e) => updateItem(i, 'minLevel', Number(e.target.value))}
                    className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>
              </div>
              
              <label className="text-xs text-gray-400 block">Descripción (Opcional)</label>
              <textarea 
                value={item.description || ''} 
                onChange={(e) => updateItem(i, 'description', e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm text-white min-h-[60px] focus:border-amber-500 outline-none"
              />
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
};

export default AdminShop;
