import { AvatarFrame } from './AvatarFrame';

const Avatar = ({ seed, opacity = 1, size = 48, decorationId }: { seed?: string; opacity?: number; size?: number; decorationId?: string }) => {
  const safeSeed = seed || 'default';
  const isBase64 = safeSeed.startsWith('data:image/');
  const src = isBase64 ? safeSeed : `https://api.dicebear.com/7.x/notionists/svg?seed=${safeSeed}&backgroundColor=transparent`;
  
  return (
    <div className="relative flex items-center justify-center" style={{ opacity, width: size, height: size }}>
      <div className="rounded-full flex items-center justify-center overflow-hidden w-full h-full relative z-10">
        <img src={src} alt="avatar" className={`w-full h-full object-cover ${!isBase64 ? 'scale-125' : ''}`} />
      </div>
      {decorationId && <AvatarFrame id={decorationId} />}
    </div>
  );
};

export default Avatar;
