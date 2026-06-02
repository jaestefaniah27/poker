import { useRef, useCallback, useState } from 'react';

interface SliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  /** Optional colour accent: 'emerald' | 'rose' | 'white' (default 'white') */
  accent?: 'emerald' | 'rose' | 'white';
  /** Show the current value in a floating bubble above the thumb */
  showBubble?: boolean;
  /** Formatter for the bubble label */
  formatLabel?: (v: number) => string;
}

const accentColors: Record<string, { track: string; thumb: string; bubble: string }> = {
  white:   { track: 'linear-gradient(90deg,#555,#fff)',       thumb: '#ffffff', bubble: 'rgba(255,255,255,0.95)' },
  emerald: { track: 'linear-gradient(90deg,#065f46,#34d399)', thumb: '#34d399', bubble: 'rgba(52,211,153,0.95)' },
  rose:    { track: 'linear-gradient(90deg,#9f1239,#fb7185)', thumb: '#fb7185', bubble: 'rgba(251,113,133,0.95)' },
};

const Slider = ({ min, max, step = 1, value, onChange, accent = 'white' }: SliderProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const colors = accentColors[accent] || accentColors.white;

  const clamp = (v: number) => {
    const stepped = Math.round((v - min) / step) * step + min;
    return Math.max(min, Math.min(max, stepped));
  };

  const fraction = max > min ? (value - min) / (max - min) : 0;

  const resolve = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onChange(clamp(min + ratio * (max - min)));
  }, [min, max, step, onChange]);

  // Pointer events for unified mouse + touch handling
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    resolve(e.clientX);
  }, [resolve]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    resolve(e.clientX);
  }, [dragging, resolve]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);


  return (
    <div
      className="relative w-full select-none"
      style={{ touchAction: 'none', paddingTop: 8, paddingBottom: 8 }}
    >
      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-3 rounded-full cursor-pointer"
        style={{ background: '#2a2a2a' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Filled portion */}
        <div
          className="absolute top-0 left-0 h-full rounded-full transition-[width] duration-75"
          style={{
            width: `${fraction * 100}%`,
            background: colors.track,
          }}
        />

        {/* Thumb */}
        <div
          className="absolute top-1/2 transition-[left] duration-75"
          style={{
            left: `${fraction * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            className="rounded-full shadow-xl border-2 transition-transform duration-100"
            style={{
              width: dragging ? 32 : 26,
              height: dragging ? 32 : 26,
              background: colors.thumb,
              borderColor: 'rgba(0,0,0,0.3)',
              boxShadow: `0 0 12px ${colors.thumb}66`,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default Slider;
