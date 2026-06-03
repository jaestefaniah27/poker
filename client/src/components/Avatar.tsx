const Avatar = ({ seed, opacity = 1, size = 48 }: { seed: string; opacity?: number; size?: number }) => {
  return (
    <div className="rounded-full flex items-center justify-center overflow-hidden" style={{ opacity, width: size, height: size }}>
      <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=transparent`} alt="avatar" className="w-full h-full object-cover scale-125" />
    </div>
  );
};

export default Avatar;
