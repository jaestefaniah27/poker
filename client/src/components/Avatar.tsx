const Avatar = ({ seed, opacity = 1, size = 48 }: { seed: string; opacity?: number; size?: number }) => {
  const isBase64 = seed.startsWith('data:image/');
  const src = isBase64 ? seed : `https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=transparent`;
  
  return (
    <div className="rounded-full flex items-center justify-center overflow-hidden" style={{ opacity, width: size, height: size }}>
      <img src={src} alt="avatar" className={`w-full h-full object-cover ${!isBase64 ? 'scale-125' : ''}`} />
    </div>
  );
};

export default Avatar;
