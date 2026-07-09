import { GlassCard } from "@/components/ui/glass-card";

export function JobQueue() {
  const jobs = [
    { id: "#8721", title: "HVAC Installation", tech: "Isabella Martinez", loc: "Downtown Plaza", status: "In Progress" },
    { id: "#8722", title: "Electrical Repair", tech: "Liam O'Connor", loc: "Westside Complex", status: "En Route" },
    { id: "#8723", title: "Plumbing Maintenance", tech: "Unassigned", loc: "Lakeside Offices", status: "Pending" },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-white text-sm">Job Queue</h3>
      </div>
      
      <div className="px-4 mb-4 flex gap-2">
        <button className="px-3 py-1 bg-neon-blue/20 text-neon-blue text-xs rounded-full border border-neon-blue/30">All</button>
        <button className="px-3 py-1 bg-white/5 text-white/50 text-xs rounded-full border border-white/10 hover:text-white/80">High Priority</button>
        <button className="px-3 py-1 bg-white/5 text-white/50 text-xs rounded-full border border-white/10 hover:text-white/80">Scheduled</button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 flex flex-col gap-3">
        {jobs.map((job) => (
          <GlassCard key={job.id} className="p-3 bg-white/5">
            <div className="flex justify-between items-start mb-1">
              <span className="text-sm font-semibold text-white">{job.id}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">{job.status}</span>
            </div>
            <div className="text-xs text-white/80 mb-2">{job.title}</div>
            <div className="text-[10px] text-white/40 flex flex-col gap-0.5">
              <span>Tech: {job.tech}</span>
              <span>{job.loc}</span>
            </div>
          </GlassCard>
        ))}
      </div>
      
      <div className="p-4 mt-2">
        <button className="w-full py-2 bg-white/5 hover:bg-white/10 text-white/60 text-xs rounded-lg border border-white/10 transition-colors">
          View All Jobs
        </button>
      </div>
    </div>
  );
}
