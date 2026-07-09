import { GlassCard } from "@/components/ui/glass-card";
import { MapPin } from "lucide-react";

export function MapView() {
  return (
    <GlassCard className="col-span-1 lg:col-span-2 row-span-2 relative overflow-hidden flex flex-col min-h-[300px]">
      <div className="flex justify-between items-center mb-4 z-10">
        <h3 className="font-semibold text-white">Field Map</h3>
        <div className="flex gap-2">
          <div className="h-6 w-16 bg-white/10 rounded-full border border-white/20" />
        </div>
      </div>
      
      {/* Mock Map Background */}
      <div className="absolute inset-0 top-14 rounded-xl overflow-hidden bg-[#302c25]">
        {/* Grid lines */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px]" />
        
        {/* Glowing connecting line mock */}
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <path
            d="M 50 150 Q 200 50 350 200 T 600 100"
            fill="transparent"
            stroke="url(#glow-gradient)"
            strokeWidth="3"
            className="drop-shadow-[0_0_10px_rgba(147,64,255,0.55)]"
          />
          <defs>
            <linearGradient id="glow-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#d7c8aa" />
              <stop offset="50%" stopColor="#9340ff" />
              <stop offset="100%" stopColor="#d7c8aa" />
            </linearGradient>
          </defs>
        </svg>

        {/* Mock Pin */}
        <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="bg-neon-purple/20 p-2 rounded-full mb-1">
            <MapPin className="text-neon-purple h-6 w-6 drop-shadow-[0_0_8px_rgba(147,64,255,0.78)]" />
          </div>
          <div className="bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs px-3 py-1.5 rounded-lg shadow-xl">
            <div className="font-semibold">Ethan Park</div>
            <div className="text-white/60">En Route • ETA 12m</div>
          </div>
        </div>
        
        {/* Overlay gradient for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#302c25] to-transparent opacity-50" />
      </div>
    </GlassCard>
  );
}
