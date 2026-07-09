import { GlassCard } from "@/components/ui/glass-card";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export function StatsRow() {
  const stats = [
    { label: "Jobs Completed", value: "128", change: "+12%", up: true },
    { label: "Response Time", value: "28 min", change: "-5%", up: false },
    { label: "First-Time Fix Rate", value: "92%", change: "+2%", up: true },
    { label: "Customer Satisfaction", value: "4.8/5", change: "+1%", up: true },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      {stats.map((stat, i) => (
        <GlassCard key={i} className="py-4 relative overflow-hidden group">
          <div className="text-xs text-white/60 mb-2">{stat.label}</div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-light text-white text-glow">{stat.value}</span>
            <span className={`text-xs flex items-center ${stat.up ? 'text-neon-cyan' : 'text-neon-purple'}`}>
              {stat.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {stat.change}
            </span>
          </div>
          <div className="text-[10px] text-white/40 mt-1">vs yesterday</div>
          {/* Subtle hover glow effect */}
          <div className="absolute inset-0 bg-gradient-to-tr from-neon-blue/0 to-neon-purple/0 group-hover:from-neon-blue/10 group-hover:to-neon-purple/10 transition-colors duration-500 rounded-2xl pointer-events-none" />
        </GlassCard>
      ))}
    </div>
  );
}
