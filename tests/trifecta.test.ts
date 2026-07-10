import { describe, expect, it } from "vitest";

import {
  exposureFromSteps,
  gateStepForTrifecta,
  stepAcceptsUntrusted,
  stepCommunicatesExternally,
} from "@/lib/agent/trifecta";

describe("stepAcceptsUntrusted", () => {
  it("flags research/web steps", () => {
    expect(stepAcceptsUntrusted("Research competitor pricing online")).toBe(true);
    expect(stepAcceptsUntrusted("Search the web for reviews")).toBe(true);
  });
  it("flags inbox reads", () => {
    expect(stepAcceptsUntrusted("Read my emails from this week")).toBe(true);
    expect(stepAcceptsUntrusted("Triage the inbox")).toBe(true);
  });
  it("does not flag pure drafting/summarizing", () => {
    expect(stepAcceptsUntrusted("Draft the summary document")).toBe(false);
    expect(stepAcceptsUntrusted("Review the output for accuracy")).toBe(false);
  });
  it("respects explicit intake action types", () => {
    expect(stepAcceptsUntrusted("anything", "read_email")).toBe(true);
  });
});

describe("stepCommunicatesExternally", () => {
  it("flags outward actions", () => {
    for (const a of ["send_email", "send_message", "calendar_write", "code_commit", "external_share"]) {
      expect(stepCommunicatesExternally(a)).toBe(true);
    }
  });
  it("does not flag safe/draft actions", () => {
    expect(stepCommunicatesExternally("safe")).toBe(false);
    expect(stepCommunicatesExternally("draft_email")).toBe(false);
  });
});

describe("exposureFromSteps", () => {
  it("is untouched before any untrusted step completes", () => {
    const e = exposureFromSteps([
      { summary: "Research the market", done: false },
      { summary: "Draft a plan", done: true },
    ]);
    expect(e.touchedUntrusted).toBe(false);
  });
  it("becomes touched once an untrusted step completed (and stays sticky)", () => {
    const e = exposureFromSteps([
      { summary: "Research the market", done: true },
      { summary: "Draft a plan", done: true },
    ]);
    expect(e.touchedUntrusted).toBe(true);
  });
});

describe("gateStepForTrifecta", () => {
  const touched = { touchedUntrusted: true };
  const clean = { touchedUntrusted: false };

  it("escalates a level-0 external step to 2 after untrusted exposure", () => {
    const d = gateStepForTrifecta({ baseRisk: 0, actionType: "send_message", exposure: touched });
    expect(d.effectiveRisk).toBe(2);
    expect(d.escalated).toBe(true);
    expect(d.reason).toBeTruthy();
  });
  it("escalates a level-1 draft-classified send to 2 after untrusted exposure", () => {
    const d = gateStepForTrifecta({ baseRisk: 1, actionType: "calendar_write", exposure: touched });
    expect(d.effectiveRisk).toBe(2);
    expect(d.escalated).toBe(true);
  });
  it("does not escalate when no untrusted content was ingested", () => {
    const d = gateStepForTrifecta({ baseRisk: 1, actionType: "send_email", exposure: clean });
    expect(d.effectiveRisk).toBe(1);
    expect(d.escalated).toBe(false);
  });
  it("does not escalate non-external steps even after exposure", () => {
    const d = gateStepForTrifecta({ baseRisk: 0, actionType: "safe", exposure: touched });
    expect(d.effectiveRisk).toBe(0);
    expect(d.escalated).toBe(false);
  });
  it("never lowers an already-high risk (2/3/4 pass through)", () => {
    expect(gateStepForTrifecta({ baseRisk: 3, actionType: "payment", exposure: clean }).effectiveRisk).toBe(3);
    expect(gateStepForTrifecta({ baseRisk: 4, actionType: "expose_secret", exposure: touched }).effectiveRisk).toBe(4);
  });
});
