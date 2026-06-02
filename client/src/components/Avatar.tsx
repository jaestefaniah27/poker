const Avatar = ({ seed, opacity = 1 }: { seed: string; opacity?: number }) => {
  return (
    <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden" style={{ opacity }}>
      <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=transparent`} alt="avatar" className="w-full h-full object-cover scale-125" />
    </div>
  );
};

export default Avatar;
