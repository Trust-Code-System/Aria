/**
 * Agent Teams (pipelines) + Self-Checking Loops.
 *
 * Design follows the "light loop" guidance: everything runs on-demand, in-app,
 * with a stop condition — no cron, no background billing. The loop uses a
 * maker/checker split (a separate critic scores each pass) so the model that
 * produced the work is not the one grading it.
 */

export interface AgentStepDef {
  key: string;
  name: string;
  /** What this agent does + how (role + instructions + output format). */
  instructions: string;
  /** Short label for the produced artifact. */
  outputLabel: string;
}

export interface TeamTemplate {
  key: string;
  name: string;
  description: string;
  steps: AgentStepDef[];
}

const BASE_AGENT = `You are one specialist agent in a pipeline. Do ONLY your step, and do it well.
Be specific and concrete — no filler, no generic statements. If you lack information, say so rather than inventing it.
Output clean Markdown that the next agent (or the user) can use directly.`;

// --- Team templates (adapted from the agent-team playbooks) ----------------
export const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    key: "content",
    name: "Content Production Team",
    description: "Research → Outline → Writer → Editor. Turns a topic into a polished article.",
    steps: [
      {
        key: "research",
        name: "Research Agent",
        outputLabel: "Research brief",
        instructions:
          "Research the given topic and produce a structured research brief. Identify the 5 most important subtopics; for each, give key facts, statistics, and expert viewpoints. Note any contradictions or debates. End with a 'Key Takeaways' section of 3–5 actionable insights. Every claim must be specific.",
      },
      {
        key: "outline",
        name: "Outline Agent",
        outputLabel: "Content outline",
        instructions:
          "Turn the research brief into a detailed content outline. Pick the strongest angle. Write a headline that includes a specific number and a curiosity hook. Build a section-by-section outline: section headline, 3–5 key points each, specific examples/data to include, and an estimated word count. Write the opening hook paragraph and the closing CTA paragraph. The outline must be detailed enough that someone else could write the article without asking questions.",
      },
      {
        key: "writer",
        name: "Writer Agent",
        outputLabel: "Draft article",
        instructions:
          "Write the full article from the outline, following its structure exactly. Short paragraphs (max 3 sentences). Bold key phrases for scannability. Include every specific number and example from the outline. Direct, conversational, zero fluff — like talking to a smart friend. Do not sound like a corporate blog or academic paper.",
      },
      {
        key: "editor",
        name: "Editor Agent",
        outputLabel: "Final article",
        instructions:
          "Edit the draft to publication quality. Fix weak openings, vague statements, missing transitions, and anticlimactic endings. Enforce short paragraphs, bolded key phrases, and specific numbers over vague claims. Cut any sentence that doesn't add value. Ensure the opening hooks in the first two lines, every section delivers on its headline, and the CTA is clear. Output the final polished article.",
      },
    ],
  },
  {
    key: "business",
    name: "Business Intelligence Team",
    description: "Collect → Analyze → Report → Recommend. Turns raw data/notes into an exec summary with actions.",
    steps: [
      { key: "collect", name: "Data Collection Agent", outputLabel: "Organized data", instructions: "Organize the provided metrics/notes into a clean, structured dataset. Label what each figure means, flag gaps or missing data, and never invent numbers." },
      { key: "analyze", name: "Analysis Agent", outputLabel: "Analysis", instructions: "Analyze the organized data. Identify trends, anomalies, and opportunities. Quantify where possible and state your confidence. Separate signal from noise." },
      { key: "report", name: "Report Agent", outputLabel: "Executive summary", instructions: "Compile the analysis into a crisp executive summary: situation, key findings (bulleted), and what changed. Lead with the most important point." },
      { key: "recommend", name: "Recommendation Agent", outputLabel: "Recommendations", instructions: "Propose 3–5 concrete, prioritized actions based on the analysis. For each: the action, the expected impact, and the first step. Lead with your top recommendation." },
    ],
  },
  {
    key: "social",
    name: "Social Media Team",
    description: "Trends → Plan → Write → Optimize. Turns a niche into ready-to-post content.",
    steps: [
      { key: "trend", name: "Trend Agent", outputLabel: "Trends", instructions: "Identify what's currently performing in the given niche: themes, formats, and angles. Be specific about why each works." },
      { key: "plan", name: "Content Planning Agent", outputLabel: "Content plan", instructions: "Build a focused content plan from the trends: 5 post ideas, each with the platform, the hook, and the goal." },
      { key: "write", name: "Writing Agent", outputLabel: "Drafted posts", instructions: "Draft each planned post in the right format for its platform (X, Instagram, LinkedIn). Native tone per platform, strong first line, no generic hashtags." },
      { key: "optimize", name: "Optimization Agent", outputLabel: "Optimized posts", instructions: "Review and sharpen each post: stronger hooks, tighter copy, a clear CTA. Output the final posts grouped by platform." },
    ],
  },
  {
    key: "product",
    name: "Product Strategy Team",
    description: "Research -> Position -> Roadmap -> Risks. Turns an idea into a product plan.",
    steps: [
      { key: "customer", name: "Customer Research Agent", outputLabel: "Customer brief", instructions: "Identify target users, painful jobs-to-be-done, current alternatives, and buying triggers. Separate evidence from assumptions." },
      { key: "positioning", name: "Positioning Agent", outputLabel: "Positioning", instructions: "Turn the customer brief into a crisp positioning statement, primary value proposition, differentiators, and anti-positioning." },
      { key: "roadmap", name: "Roadmap Agent", outputLabel: "Roadmap", instructions: "Create a practical phased roadmap: MVP, v1, and expansion. For each phase list features, dependencies, and success metrics." },
      { key: "risk", name: "Risk Agent", outputLabel: "Risk review", instructions: "Review the roadmap for technical, market, distribution, and operational risks. Give mitigations and the top 5 decisions to make next." },
    ],
  },
  {
    key: "sales",
    name: "Sales Outreach Team",
    description: "ICP -> Offer -> Sequence -> Objections. Builds a usable outbound campaign.",
    steps: [
      { key: "icp", name: "ICP Agent", outputLabel: "ICP definition", instructions: "Define the ideal customer profile, buyer roles, urgent pain points, and qualification criteria from the brief." },
      { key: "offer", name: "Offer Agent", outputLabel: "Offer angle", instructions: "Create a specific outreach offer with proof points, before/after value, and a low-friction call to action." },
      { key: "sequence", name: "Sequence Agent", outputLabel: "Outbound sequence", instructions: "Write a 5-step outbound sequence with subject lines, short emails, LinkedIn touchpoints, and follow-up timing." },
      { key: "objections", name: "Objection Agent", outputLabel: "Objection handling", instructions: "List likely objections and write concise responses. Include when to disqualify instead of pushing." },
    ],
  },
  {
    key: "engineering",
    name: "Engineering Planning Team",
    description: "Scope -> Architecture -> Tasks -> QA. Converts a feature into an execution plan.",
    steps: [
      { key: "scope", name: "Scope Agent", outputLabel: "Feature scope", instructions: "Clarify the feature goal, users, non-goals, edge cases, and acceptance criteria. Flag missing information." },
      { key: "architecture", name: "Architecture Agent", outputLabel: "Technical design", instructions: "Propose a pragmatic architecture: data flow, components, APIs, persistence, permissions, and failure modes." },
      { key: "tasks", name: "Task Breakdown Agent", outputLabel: "Implementation tasks", instructions: "Break the design into ordered implementation tasks with file/module ownership, dependencies, and risk notes." },
      { key: "qa", name: "QA Agent", outputLabel: "Test plan", instructions: "Create a focused test plan: unit, integration, browser, data, error, and regression checks. Include manual QA steps." },
    ],
  },
  {
    key: "customer_success",
    name: "Customer Success Team",
    description: "Account -> Health -> Playbook -> Message. Plans retention and expansion moves.",
    steps: [
      { key: "account", name: "Account Review Agent", outputLabel: "Account summary", instructions: "Summarize the account context, stakeholders, goals, usage signals, open issues, and recent activity." },
      { key: "health", name: "Health Agent", outputLabel: "Health score", instructions: "Assess retention risk and expansion potential. Score health 1-10 and justify the score with evidence." },
      { key: "playbook", name: "Playbook Agent", outputLabel: "Success plan", instructions: "Create a concrete success playbook: next actions, owner, timing, desired outcome, and escalation triggers." },
      { key: "message", name: "Messaging Agent", outputLabel: "Customer message", instructions: "Draft the customer-facing message in a helpful, concise tone. Include a clear ask and next step." },
    ],
  },
  {
    key: "research_synthesis",
    name: "Research Synthesis Team",
    description: "Questions -> Evidence -> Insights -> Brief. Turns messy notes into a decision brief.",
    steps: [
      { key: "questions", name: "Question Agent", outputLabel: "Research questions", instructions: "Extract the core research questions and decision criteria from the brief. Prioritize what matters most." },
      { key: "evidence", name: "Evidence Agent", outputLabel: "Evidence table", instructions: "Organize the supplied material into evidence, source, confidence, and implication. Do not invent sources." },
      { key: "insights", name: "Insight Agent", outputLabel: "Insights", instructions: "Synthesize patterns, contradictions, and implications. Separate facts, interpretations, and open questions." },
      { key: "brief", name: "Decision Brief Agent", outputLabel: "Decision brief", instructions: "Write a decision brief: recommendation, rationale, tradeoffs, risks, and next actions. Make it executive-ready." },
    ],
  },
];

export function getTeam(key: string): TeamTemplate | undefined {
  return TEAM_TEMPLATES.find((t) => t.key === key);
}

/** System prompt for a single pipeline agent. */
export function pipelineSystem(step: AgentStepDef): string {
  return `${BASE_AGENT}\n\nYour role: ${step.name}.\nYour instructions: ${step.instructions}`;
}

/** Prompt handed to a pipeline agent: the topic (first step) or prior output. */
export function pipelinePrompt(
  topic: string,
  priorStepName: string | null,
  priorOutput: string | null,
): string {
  if (!priorOutput) return `Topic / brief from the user:\n${topic}`;
  return `The user's topic was:\n${topic}\n\nHere is the "${priorStepName}" output to build on. Produce YOUR step's output only:\n\n${priorOutput}`;
}

// --- Self-checking loop ----------------------------------------------------
export const LOOP_MAKER_SYSTEM = `You are the MAKER in a self-checking loop. You produce and improve work toward a goal.
Each pass, fix the single weakest point identified by the checker. Output only the improved work (clean Markdown), nothing else.`;

export const LOOP_CHECKER_SYSTEM = `You are the CHECKER in a self-checking loop — a strict, honest evaluator. You did NOT write the work.
Score it against each success criterion from 1–10. Be harsh; do not give soft passes.
Return ONLY a JSON object, no prose, in exactly this shape:
{"scores": {"<criterion>": <1-10>, ...}, "weakest": "<the single most important thing to fix next>", "pass": <true only if EVERY criterion is 8 or higher>}`;

export function makerPrompt(
  goal: string,
  criteria: string[],
  priorDraft: string | null,
  weakest: string | null,
): string {
  const crit = criteria.map((c, i) => `${i + 1}. ${c}`).join("\n");
  if (!priorDraft) {
    return `GOAL:\n${goal}\n\nSUCCESS CRITERIA:\n${crit}\n\nProduce the best first version you can.`;
  }
  return `GOAL:\n${goal}\n\nSUCCESS CRITERIA:\n${crit}\n\nCurrent version:\n${priorDraft}\n\nThe checker says the weakest point is: "${weakest}".\nRewrite the work to fix that first, without regressing the rest. Output the full improved version.`;
}

export function checkerPrompt(goal: string, criteria: string[], draft: string): string {
  const crit = criteria.map((c) => `- ${c}`).join("\n");
  return `GOAL:\n${goal}\n\nSUCCESS CRITERIA:\n${crit}\n\nWORK TO EVALUATE:\n${draft}\n\nScore each criterion 1–10 and return the JSON object.`;
}

/** Robustly pull the JSON verdict out of a checker response. */
export function parseVerdict(
  text: string,
  criteria: string[],
): { scores: Record<string, number>; weakest: string; pass: boolean } {
  let parsed: any = null;
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      /* fall through */
    }
  }
  const scores: Record<string, number> = {};
  if (parsed?.scores && typeof parsed.scores === "object") {
    for (const [k, v] of Object.entries(parsed.scores)) {
      const n = Number(v);
      if (!Number.isNaN(n)) scores[k] = n;
    }
  }
  const values = Object.values(scores);
  // Pass only if the checker said so AND every score we parsed is >= 8.
  const allHigh = values.length >= Math.min(1, criteria.length) && values.every((n) => n >= 8);
  const pass = Boolean(parsed?.pass) && allHigh;
  const weakest =
    typeof parsed?.weakest === "string" && parsed.weakest.trim()
      ? parsed.weakest.trim()
      : "Tighten the weakest-scoring criterion.";
  return { scores, weakest, pass };
}
