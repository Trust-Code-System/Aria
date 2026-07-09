import { GlassCard } from "@/components/ui/glass-card";

export function PerformanceChart() {
  return (
    <GlassCard className="col-span-1 lg:col-span-2 relative min-h-[250px]">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-semibold text-white">Performance Analytics</h3>
        <div className="h-5 w-5 rounded bg-white/10" />
      </div>
      
      {/* Mock Chart Area */}
      <div className="relative h-40 w-full mt-2">
        {/* Y Axis Mock */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-white/40">
          <span>400</span>
          <span>300</span>
          <span>200</span>
          <span>100</span>
          <span>0</span>
        </div>
        
        {/* Chart Lines Container */}
        <div className="absolute left-8 right-0 top-2 bottom-6 border-b border-white/10">
          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            {/* Area gradient under line */}
            <defs>
              <linearGradient id="area-gradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(181, 140, 255, 0.36)" />
                <stop offset="100%" stopColor="rgba(181, 140, 255, 0)" />
              </linearGradient>
            </defs>
            <path
              d="M0,80 Q20,20 40,60 T80,30 T100,10 L100,100 L0,100 Z"
              fill="url(#area-gradient)"
            />
            {/* The primary glowing line */}
            <path
              d="M0,80 Q20,20 40,60 T80,30 T100,10"
              fill="none"
              stroke="#b58cff"
              strokeWidth="2"
              className="drop-shadow-[0_0_8px_rgba(147,64,255,0.58)]"
            />
            {/* Secondary line */}
            <path
              d="M0,90 Q30,70 50,80 T90,50 T100,60"
              fill="none"
              stroke="#d7c8aa"
              strokeWidth="1.5"
              className="drop-shadow-[0_0_6px_rgba(215,200,170,0.44)] opacity-70"
            />
          </svg>
        </div>

        {/* X Axis Mock */}
        <div className="absolute left-8 right-0 bottom-0 flex justify-between text-[10px] text-white/40">
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
          <span>Sun</span>
        </div>
      </div>
    </GlassCard>
  );
}
