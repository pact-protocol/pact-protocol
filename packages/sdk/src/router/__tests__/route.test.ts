import { describe, it, expect } from "vitest";
import { routeExecution } from "../route";

describe("routeExecution", () => {
  it("should route to posted regime with deep history and low dispersion", () => {
    const plan = routeExecution({
      intentType: "weather.data",
      urgency: false,
      tradeCount: 30,
      p50: 100,
      p90: 115,
      policyMaxRounds: 3,
    });

    expect(plan.regime).toBe("posted");
    expect(plan.fanout).toBe(3);
    expect(plan.maxRounds).toBe(0);
    expect(plan.reason).toContain("posted: deep history + low dispersion");
  });

  it("should route to negotiated regime with medium history", () => {
    const plan = routeExecution({
      intentType: "weather.data",
      urgency: false,
      tradeCount: 10,
      p50: 100,
      p90: 200,
      policyMaxRounds: 3,
    });

    expect(plan.regime).toBe("negotiated");
    expect(plan.fanout).toBe(5);
    expect(plan.maxRounds).toBe(1);
    expect(plan.reason).toContain("negotiated: medium history");
  });

  it("should route to bespoke regime with sparse history", () => {
    const plan = routeExecution({
      intentType: "weather.data",
      urgency: false,
      tradeCount: 2,
      p50: null,
      p90: null,
      policyMaxRounds: 3,
    });

    expect(plan.regime).toBe("bespoke");
    expect(plan.fanout).toBe(1);
    expect(plan.maxRounds).toBe(3);
    expect(plan.reason).toContain("bespoke: sparse history");
  });

  it("should route to streaming settlement for compute intent", () => {
    const plan = routeExecution({
      intentType: "compute.verify",
      urgency: false,
      tradeCount: 10,
      p50: 100,
      p90: 200,
      policyMaxRounds: 3,
    });

    expect(plan.settlement).toBe("streaming");
    expect(plan.reason).toContain("streaming: compute/stream/inference intent");
  });

  it("should route to streaming settlement when urgent", () => {
    const plan = routeExecution({
      intentType: "weather.data",
      urgency: true,
      tradeCount: 10,
      p50: 100,
      p90: 200,
      policyMaxRounds: 3,
    });

    expect(plan.settlement).toBe("streaming");
    expect(plan.reason).toContain("streaming: urgent");
  });

  it("should route to hash_reveal for standard data delivery", () => {
    const plan = routeExecution({
      intentType: "weather.data",
      urgency: false,
      tradeCount: 10,
      p50: 100,
      p90: 200,
      policyMaxRounds: 3,
    });

    expect(plan.settlement).toBe("hash_reveal");
    expect(plan.reason).toContain("hash_reveal: standard data delivery");
  });

  it("should handle edge case: tradeCount exactly 5", () => {
    const plan = routeExecution({
      intentType: "weather.data",
      urgency: false,
      tradeCount: 5,
      p50: 100,
      p90: 200,
      policyMaxRounds: 3,
    });

    expect(plan.regime).toBe("negotiated");
    expect(plan.maxRounds).toBe(1);
  });

  it("should handle edge case: tradeCount exactly 20 with high dispersion", () => {
    const plan = routeExecution({
      intentType: "weather.data",
      urgency: false,
      tradeCount: 20,
      p50: 100,
      p90: 150, // dispersion > 1.2
      policyMaxRounds: 3,
    });

    expect(plan.regime).toBe("negotiated");
  });
});



