# Evidence Viewer: Summary State Machine

The Summary panel in the Evidence Viewer derives a single **SummaryState** from the pack’s integrity verdict and outcome signals. That state drives header badges (Integrity + Outcome), which sections are shown, and whether responsibility/outcome are treated as fact or hidden.

**Source of truth:** `apps/evidence-viewer/src/lib/summaryState.ts`  
- `SummaryState` enum  
- `deriveSummaryState()`  
- `classifyOutcome()`  
- `getIntegrityBadge()`, `getOutcomeBadge()`  
- Gating: `isSummaryBlocked()`, `isIndeterminate()`

---

## Truth table

| Integrity verdict | Classified outcome | SummaryState           | Integrity badge | Outcome badge |
|-------------------|--------------------|------------------------|-----------------|---------------|
| VERIFIED          | COMPLETED          | TRUSTED_COMPLETED      | VERIFIED        | COMPLETED     |
| VERIFIED          | ABORTED            | TRUSTED_ABORTED        | VERIFIED        | ABORTED       |
| VERIFIED          | FAILED             | TRUSTED_FAILED         | VERIFIED        | FAILED        |
| VERIFIED          | TIMEOUT            | TRUSTED_TIMEOUT        | VERIFIED        | TIMEOUT       |
| VERIFIED          | UNKNOWN            | TRUSTED_UNKNOWN        | VERIFIED        | UNKNOWN       |
| INDETERMINATE     | *                  | INDETERMINATE          | INDETERMINATE   | (outcome)     |
| INVALID           | *                  | UNTRUSTED_INVALID      | INVALID         | UNTRUSTED     |
| TAMPERED          | *                  | UNTRUSTED_TAMPERED     | TAMPERED        | UNTRUSTED     |

Outcome classification (e.g. PACT-420 → TIMEOUT, PACT-101 → ABORTED) is defined in `classifyOutcome()` and is applied only when integrity is VERIFIED.

---

## Rules

1. **Untrusted states hide semantic sections**  
   When `SummaryState` is `UNTRUSTED_INVALID` or `UNTRUSTED_TAMPERED`, the UI must not show Result, Responsibility, or Economic snapshot as fact. The panel shows a single “Hidden due to untrusted evidence” note and a “See Technical Verification” CTA instead. `isSummaryBlocked(state)` is true for these states.

2. **420 shows TIMEOUT/FAILED only when integrity is verified**  
   Provider-unreachable or timeout outcomes (e.g. PACT-420) are shown as TIMEOUT (or FAILED) only when the pack’s integrity verdict is VERIFIED. If the pack is INVALID or TAMPERED, the outcome badge is UNTRUSTED and the semantic sections are hidden.

3. **Tamper/invalid never show responsibility or outcome as fact**  
   For `UNTRUSTED_TAMPERED` and `UNTRUSTED_INVALID`, the viewer must not present responsibility or outcome as trustworthy. The header shows the integrity and “UNTRUSTED” outcome badges; Result/Responsibility/Economic are gated as in rule 1.

4. **Indeterminate**  
   When integrity is INDETERMINATE, the panel shows an indeterminate banner and may show outcome with a warning; semantic sections can be shown but should be clearly caveated.

---

## Golden tests

- **State and badges:** `apps/evidence-viewer/src/lib/__tests__/summaryState.test.ts`  
  Golden tests assert `deriveSummaryState` and badge labels for canonical packs (success → VERIFIED + COMPLETED; 101 → VERIFIED + ABORTED; 420 → VERIFIED + TIMEOUT when pack is verified, else untrusted; tamper → TAMPERED + UNTRUSTED; invalid mock → INVALID + UNTRUSTED).

- **SummaryPanel rendering:** `apps/evidence-viewer/src/components/__tests__/SummaryPanel.snap.test.tsx`  
  Renders SummaryPanel with minimal pack mocks for each state; asserts header badges, presence of “Hidden due to untrusted evidence” and “See Technical Verification” for untrusted states, and that Result/Responsibility/Economic are hidden when blocked.

Any UI change that breaks these semantics should fail the tests above.
