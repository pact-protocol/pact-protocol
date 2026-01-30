# Compliance Test Vectors

This directory contains compliance test vectors that validate policy enforcement.

## Vector Format

Each test vector includes:
- `name`: Descriptive test name
- `phase`: Negotiation phase being tested
- `policy`: Optional policy override (partial)
- `ctx`: Phase-specific context object
- `expectOk`: Expected validation result (true/false)
- `expectCode`: Expected failure code if `expectOk=false`

## Coverage

Vectors cover all categories defined in compliance.md:
- Time semantics (A)
- Admission & session (B)
- Negotiation bounds (C)
- Counterparty filters (D)
- Reference band (E)
- Lock/escrow/bond (F)
- Exchange (G)
- Observability (H)

