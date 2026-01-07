# CHANGELOG.md

All notable changes to the PACT protocol and its reference implementations are documented here.

This project follows **Semantic Versioning** and prioritizes backward compatibility and determinism.

---

## [0.1.0] — Initial Public Release

### Added
- Core PACT protocol primitives
- Signed, canonical message envelopes
- Commit / reveal settlement flow
- Streaming settlement with tick-based payment
- Deterministic receipt generation
- Policy compilation and validation
- Reference price and reputation system
- Provider directory (in-memory and JSONL)
- HTTP provider adapter
- Explainable acquire flow (coarse and full modes)
- Comprehensive test suite

### Guarantees
- Deterministic execution
- Explicit failure modes
- Verifiable receipts
- Buyer-controlled settlement exits
- Provider accountability via signatures

### Notes
This is the first public release intended for:
- Agent-to-agent coordination
- Deterministic negotiation
- Pay-as-you-go data and service exchange

The API surface is considered **provisionally stable** but may evolve prior to `1.0.0`.

---

## Versioning Notes

- Breaking changes will increment the major version
- Protocol changes are always documented
- Silent behavioral changes are treated as bugs

---

## Upcoming (Planned)

These items are not committed and may change:

- Additional policy primitives
- Enhanced provider reputation signals
- Multi-intent batching
- Formal protocol specification (PDF)

---

## Security Fixes

Security-relevant changes will always be:
- Documented explicitly
- Released promptly
- Accompanied by migration notes when applicable

---

## Migration Guidance

When breaking changes occur:
- Clear upgrade paths will be provided
- Old behavior will not be removed without notice
- Receipts from prior versions remain valid

---

## Philosophy

The changelog exists to preserve trust.

If behavior changes, it belongs here.
