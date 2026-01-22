import type { NegotiationPhase, FailureCode, CompiledPolicy } from "./types";
import type { PhaseContext } from "./context";

export interface PolicyGuard {
  check(
    phase: NegotiationPhase,
    ctx: PhaseContext,
    intent?: string
  ): { ok: true } | { ok: false; code: FailureCode };
}

