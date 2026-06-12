import { motion, AnimatePresence } from 'framer-motion';

// Misma lista cerrada que valida el servidor (gameHandlers.ts).
export const EMOTES = ['😂', '😭', '🔥', '💀', '🐔', '😡', '🤑', '👏'];

export interface ActiveEmote {
  emote: string;
  key: number;
}

interface EmoteBubbleProps {
  emote: ActiveEmote | undefined;
}

// Overlay centrado sobre el avatar. inset-0 garantiza visibilidad sin riesgo de overflow clip.
const EmoteBubble = ({ emote }: EmoteBubbleProps) => (
  <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
    <AnimatePresence>
      {emote && (
        <motion.div
          key={emote.key}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1.2, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 20 }}
          className="text-4xl select-none"
          style={{ filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.9))' }}
        >
          {emote.emote}
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

export default EmoteBubble;
