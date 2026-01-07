# @pact/sdk

The Pact SDK is a TypeScript library for implementing agent negotiation protocols. It provides policy validation, compilation, enforcement, and settlement mechanisms for building decentralized agent marketplaces.

## Installation

```bash
npm install @pact/sdk
# or
pnpm add @pact/sdk
# or
yarn add @pact/sdk
```

## Features

- **Policy System**: JSON Schema-based policy validation and compilation
- **Negotiation Engine**: Multi-phase negotiation protocol implementation
- **Settlement**: Support for hash-reveal and streaming payment modes
- **Reputation**: Agent scoring and reputation computation
- **Provider Directory**: In-memory and persistent JSONL provider registries
- **HTTP Adapters**: Client adapters for communicating with HTTP-based providers

## Quick Start

```typescript
import { acquire, createDefaultPolicy, MockSettlementProvider } from "@pact/sdk";
import nacl from "tweetnacl";

// Generate keypairs
const buyerKeyPair = nacl.sign.keyPair();
const sellerKeyPair = nacl.sign.keyPair();

// Create policy
const policy = createDefaultPolicy();

// Acquire a service
const result = await acquire({
  input: {
    intentType: "weather.data",
    scope: "NYC",
    constraints: { latency_ms: 50, freshness_sec: 10 },
    maxPrice: 0.0001,
  },
  buyerKeyPair,
  sellerKeyPair,
  buyerId: "buyer-id",
  sellerId: "seller-id",
  policy,
  settlement: new MockSettlementProvider(),
});

if (result.ok) {
  console.log("Acquisition successful:", result.receipt);
}
```

## Core Concepts

### Policies

Policies define constraints and rules for agent negotiation across six phases:
- **Identity**: Agent identification and credential presentation
- **Intent**: Intent declaration and admission checks
- **Negotiation**: Quote exchange with bounds and constraints
- **Lock**: Settlement mode selection and escrow/lock establishment
- **Exchange**: Transaction execution with schema validation
- **Resolution**: Completion, cancellation, or dispute resolution

### Settlement Modes

- **Hash-Reveal**: Commit-reveal scheme for secure payment
- **Streaming**: Pay-as-you-go with incremental chunk delivery

### Provider Directory

Discover and select providers using in-memory or persistent JSONL directories:

```typescript
import { JsonlProviderDirectory } from "@pact/sdk";

const directory = new JsonlProviderDirectory({ path: "./providers.jsonl" });
directory.load();

const providers = directory.listProviders("weather.data");
```

## API Reference

See the [full documentation](./docs) for detailed API reference.

## License

MIT


