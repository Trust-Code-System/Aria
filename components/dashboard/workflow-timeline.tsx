import { GlassCard } from "@/components/ui/glass-card";
import { CheckCircle2, CircleDashed, Clock, FileText, UserCircle2 } from "lucide-react";

export function WorkflowTimeline() {
  const steps = [
    { label: "Job Created", icon: FileText, status: "complete" },
    { label: "Smart Assign", icon: UserCircle2, status: "complete" },
    { label: "In Progress", icon: Clock, status: "current" },
    { label: "QA Check", icon: CircleDashed, status: "pending" },
    { label: "Completed", icon: CheckCircle2, status: "pending" },
  ];

  return (
    <GlassCard className="col-span-1 lg:col-span-2">
      <h3 className="font-semibold text-white mb-6 text-sm">Workflow Automation</h3>
      
      <div className="flex items-center justify-between relative px-2">
        {/* Connecting line background */}
        <div className="absolute left-[10%] right-[10%] top-1/2 -translate-y-1/2 h-[1px] bg-white/20 z-0" />
        
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isComplete = step.status === "complete";
          const isCurrent = step.status === "current";
          
          return (
            <div key={idx} className="relative z-10 flex flex-col items-center gap-3">
              <div 
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center
                  border transition-all duration-300
                  ${isComplete ? 'bg-neon-purple/20 border-neon-purple text-neon-purple drop-shadow-[0_0_8px_rgba(147,64,255,0.46)]' : ''}
                  ${isCurrent ? 'bg-neon-blue/20 border-neon-blue text-neon-blue drop-shadow-[0_0_12px_rgba(215,200,170,0.48)] scale-110' : ''}
                  ${!isComplete && !isCurrent ? 'bg-black/40 border-white/10 text-white/40' : ''}
                `}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="text-[10px] text-center w-16">
                <span className={isCurrent ? 'text-white font-medium' : 'text-white/50'}>
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
