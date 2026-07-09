import { describe, it, expect } from "vitest";
import { classifyStepRisk } from "@/lib/agent/risk";

describe("classifyStepRisk", () => {
  it("treats research/summarize/non-email drafts as safe (level 0)", () => {
    for (const s of ["Research the market", "Draft a summary", "Analyze the data", "Find relevant sources"]) {
      const r = classifyStepRisk(s);
      expect(r.risky).toBe(false);
      expect(r.riskLevel).toBe(0);
    }
  });

  it("flags email drafts as low-risk approval steps (level 1)", () => {
    const r = classifyStepRisk("Draft an introductory email explaining the chosen CRM");
    expect(r.risky).toBe(true);
    expect(r.riskLevel).toBe(1);
    expect(r.actionType).toBe("draft_email");
  });

  it("flags sending email as needing approval (level 2)", () => {
    const r = classifyStepRisk("Send an email to the client with the proposal");
    expect(r.risky).toBe(true);
    expect(r.riskLevel).toBe(2);
    expect(r.actionType).toBe("send_email");
  });

  it("flags posting/publishing as level 2", () => {
    expect(classifyStepRisk("Post the update to the blog").riskLevel).toBe(2);
  });

  it("escalates payments to level 3", () => {
    const r = classifyStepRisk("Pay the invoice via the payment portal");
    expect(r.riskLevel).toBe(3);
    expect(r.actionType).toBe("payment");
  });

  it("escalates bulk/mass actions to level 3", () => {
    expect(classifyStepRisk("Send a mass email to all contacts").riskLevel).toBe(3);
  });

  it("blocks secret exposure at level 4", () => {
    expect(classifyStepRisk("Print the API key to the logs").riskLevel).toBe(4);
  });

  it("returns risky=true for any level >= 1", () => {
    expect(classifyStepRisk("write a reply message").risky).toBe(true);
    expect(classifyStepRisk("delete the production database").risky).toBe(true);
  });
});
