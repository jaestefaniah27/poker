import { useEffect, useRef, useState } from 'react';
import { fmtChips } from '../utils';

interface AnimatedNumberProps {
  value: number | string; // string para saldos grandes (se anima en aprox. number, exacto al mostrar)
  className?: string;
  maxDurationMs?: number; // tope superior (default 2000)
  baseStepMs?: number;    // ms ideales por "+1" de cuenta (default ~16.7ms / 60fps)
  raw?: boolean;          // si true, no aplica fmtChips
}

// Cuenta progresivamente del valor anterior al nuevo. Visualmente "+1 por frame"
// hasta que el delta es tan grande que excedería maxDurationMs; entonces el paso
// por frame crece para llegar siempre en <= maxDurationMs.
const AnimatedNumber = ({
  value,
  className,
  maxDurationMs = 2000,
  baseStepMs = 1000 / 60,
  raw = false,
}: AnimatedNumberProps) => {
  const numValue = Number(value); // saldos grandes: aproximado para la animación (el display final es exacto vía fmtChips de la prop)
  const [display, setDisplay] = useState(numValue);
  const fromRef = useRef(numValue);
  const targetRef = useRef(numValue);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const target = numValue;
    targetRef.current = target;

    if (from === target) {
      setDisplay(target);
      return;
    }

    const diff = Math.abs(target - from);
    // Duración ideal: 1 unidad por frame (~16.7ms), pero limitada al máximo.
    const duration = Math.min(maxDurationMs, diff * baseStepMs);

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startRef.current = performance.now();
    const startVal = from;

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(1, elapsed / duration);
      // Easing lineal: incremento constante por unidad de tiempo
      const current = Math.round(startVal + (target - startVal) * progress);
      setDisplay(current);
      fromRef.current = current;
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(target);
        fromRef.current = target;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, maxDurationMs, baseStepMs]);

  return <span className={className}>{raw ? display : fmtChips(display)}</span>;
};

export default AnimatedNumber;
