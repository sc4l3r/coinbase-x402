# @x402/keeta

Keeta implementation of the x402 payment protocol.

## Installation

```bash
npm install @x402/keeta
# or
pnpm add @x402/keeta
```

## Overview

This package provides three main components for handling x402 payments on Keeta:

- **Client** - For applications that need to make payments (have wallets/signers)
- **Facilitator** - For payment processors that verify and settle blocks
- **Server** - For resource servers that accept payments and build payment requirements

**Key Differences from EVM/SVM:**

- **Block-based** - payments are encoded as signed Keeta blocks
- **Fee payer settlement** - the facilitator submits blocks on behalf of clients via a fee payer account
- **Instant settlement** - Once the server's call to `/settle` completes the payment has been settled on the network
- **Per-fee-payer serialization** - a built-in `SettlementQueue` ensures blocks are submitted sequentially per fee payer while allowing parallelism across different fee payers

## Package Exports

### Main Package (`@x402/keeta`)

**Client:**

- `ExactKeetaScheme` - Client implementation for creating payment blocks
- `toClientKeetaSigner(account)` - Converts a Keeta `Account` to a client signer
- `ClientKeetaSigner` - TypeScript type for client signers

**Facilitator:**

- `ExactKeetaScheme` - Facilitator for payment verification and settlement
- `toFacilitatorKeetaSigner(accounts)` - Converts Keeta `Account` array to a facilitator signer
- `FacilitatorKeetaSigner` - TypeScript type for facilitator signers

**Server:**

- `ExactKeetaScheme` - Server for building payment requirements

**Utilities:**

- `getUsdcAddress(network)` - Get USDC token address for a network
- `networkToKeetaNetwork(network)` - Convert CAIP-2 identifier to Keeta network name

**Types:**

- `ExactKeetaPayload` - Payment payload type

**Constants:**

- `KEETA_MAINNET_CAIP2` = `"keeta:21378"`
- `KEETA_TESTNET_CAIP2` = `"keeta:1413829460"`
- `KTA_MAINNET_ADDRESS` = Base token address for mainnet
- `KTA_TESTNET_ADDRESS` = Base token address for testnet

## Usage

### Client

```typescript
import * as KeetaNet from "@keetanetwork/keetanet-client";
import { ExactKeetaScheme, toClientKeetaSigner, KEETA_TESTNET_CAIP2 } from "@x402/keeta";

const account = KeetaNet.lib.Account.fromSeed(
  await KeetaNet.lib.Account.seedFromPassphrase(process.env.CLIENT_PASSPHRASE),
  0
);

const clientKeetaSigner = toClientKeetaSigner(account);

const client = new x402Client();
client.register(KEETA_TESTNET_CAIP2, new ExactKeetaScheme(clientKeetaSigner));
```

### Facilitator

```typescript
import * as KeetaNet from "@keetanetwork/keetanet-client";
import { x402Facilitator } from "@x402/core/facilitator";
import { toFacilitatorKeetaSigner, KEETA_TESTNET_CAIP2 } from "@x402/keeta";
import { ExactKeetaScheme } from "@x402/keeta/exact/facilitator";

const account = KeetaNet.lib.Account.fromSeed(
  await KeetaNet.lib.Account.seedFromPassphrase(
    process.env.FACILITATOR_PASSPHRASE,
  ),
  0,
);

const keetaSigner = toFacilitatorKeetaSigner([account]);

const facilitator = new x402Facilitator();
// Register Keeta faciliator with console logger
facilitator.register(KEETA_TESTNET_CAIP2, new ExactKeetaScheme(signer, console));
```

### Server

```typescript
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { KEETA_TESTNET_CAIP2 } from "@x402/keeta";
import { ExactKeetaScheme } from "@x402/keeta/exact/server";

const facilitatorClient = new HTTPFacilitatorClient({
  url: "http://localhost:4022"
});

const server = new x402ResourceServer(facilitatorClient);
server.register(KEETA_TESTNET_CAIP2, new ExactKeetaScheme());
```

## Features


## License

Apache-2.0
