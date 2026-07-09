import { GlassCard } from "@/components/ui/glass-card";

export function SystemStatus() {
  return (
    <GlassCard className="mb-4">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-semibold text-white text-sm">System Status</h3>
      </div>
      
      <div className="flex flex-col items-center justify-center py-4 relative">
        <div className="text-xs text-neon-cyan flex items-center gap-2 mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-cyan opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-cyan"></span>
          </span>
          All Systems Operational
        </div>
        
        {/* Glowing Orb */}
        <div className="relative w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 bg-neon-cyan rounded-full opacity-20 blur-xl animate-pulse-glow" />
          <div className="absolute inset-2 bg-neon-cyan rounded-full opacity-40 blur-md" />
          <div className="absolute inset-6 bg-white rounded-full shadow-[0_0_15px_#d7c8aa]" />
          
          {/* Orbital rings */}
          <svg className="absolute inset-[-20px] w-[120px] h-[120px] animate-spin" style={{ animationDuration: '10s' }}>
            <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(215, 200, 170, 0.22)" strokeWidth="1" strokeDasharray="4 4" />
          </svg>
        </div>
      </div>
    </GlassCard>
  );
}
