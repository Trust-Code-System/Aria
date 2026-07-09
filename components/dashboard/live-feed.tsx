import { GlassCard } from "@/components/ui/glass-card";

export function LiveFeed() {
  const feed = [
    { name: "Ethan Park", status: "En Route", detail: "ETA 12 min", img: "https://i.pravatar.cc/150?u=1" },
    { name: "Isabella Martinez", status: "On Site", detail: "Job #8722", img: "https://i.pravatar.cc/150?u=2" },
    { name: "Liam O'Connor", status: "En Route", detail: "ETA 18 min", img: "https://i.pravatar.cc/150?u=3" },
    { name: "Ava Singh", status: "On Site", detail: "Job #8721", img: "https://i.pravatar.cc/150?u=4" },
  ];

  return (
    <GlassCard className="flex-1">
      <h3 className="font-semibold text-white mb-4 text-sm">Live Technician Feed</h3>
      <div className="flex flex-col gap-4">
        {feed.map((user, i) => (
          <div key={i} className="flex items-center gap-3">
            <img src={user.img} alt={user.name} className="w-8 h-8 rounded-full border border-white/20" />
            <div className="flex flex-col flex-1">
              <span className="text-sm text-white font-medium">{user.name}</span>
              <span className="text-[10px] text-white/50">{user.status}</span>
            </div>
            <span className="text-[10px] text-white/40 bg-white/5 px-2 py-1 rounded-md">{user.detail}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
