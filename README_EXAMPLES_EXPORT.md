# Pact Examples

This repository contains the **runtime SDK**, **provider adapter**, and **example workflows** for integrating Pact into agents.

Use this repo if you are:

- Building agents that negotiate or settle
- Running example flows
- Emitting Pact transcripts for verification

## What this repo is

**Agent-side runtime + integrations.**

This is where:

- Negotiation logic runs
- Policies are enforced
- Settlements are attempted
- Pact transcripts are generated

Those transcripts are later verified by **pact-protocol**.

## Quickstart

```bash
pnpm install --frozen-lockfile
pnpm -r test
pnpm example:happy
```

This runs a full agent flow and produces a Pact transcript under `.pact/transcripts/`.

## Directory map

| Path | Purpose |
|------|---------|
| `packages/sdk` | Runtime SDK (negotiation, policy, boundary, transcript store) |
| `packages/provider-adapter` | Demo provider server + registry |
| `examples/` | End-to-end flows (happy, timeout, dispute, reconcile, providers) |

## Minimal docs

- **How to run examples** — run flows and tests
- **How to start demo provider** — run the provider server
- **How to verify with pact-protocol** — pass transcripts to the offline verifier

## Mental model

Pact splits agent systems into two layers:

- **Runtime (SDK):** agents negotiate, settle, and emit signed transcripts
- **Protocol (Verifier):** an offline system verifies those transcripts, attributes blame, and produces audit-grade evidence

Agents create evidence. Pact judges it.

## How the repos fit together

```
pact-examples (this repo)
  └─ runs agents
  └─ produces transcripts

pact-protocol
  └─ verifies transcripts
  └─ attributes blame
  └─ produces audit artifacts
```

If you care about evidence, disputes, or verification, go to **pact-protocol**.
