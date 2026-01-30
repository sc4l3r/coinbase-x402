# @x402/keeta

Keeta implementation of the x402 payment protocol.

## Installation

```bash
npm install @x402/keeta
# or
pnpm add @x402/keeta
```

## Usage

### Client

```typescript
import * as KeetaNet from "@keetanetwork/keetanet-client";
import { registerExactKeetaScheme, toClientKeetaSigner } from "@x402/keeta";

const account = KeetaNet.lib.Account.fromSeed(
  await KeetaNet.lib.Account.seedFromPassphrase(process.env.CLIENT_PASSPHRASE),
  0
);

const clientKeetaSigner = toClientKeetaSigner(account);

const client = new x402Client();
registerExactKeetaScheme(client, { signer: clientKeetaSigner });
```

### Facilitator

```typescript
import * as KeetaNet from "@keetanetwork/keetanet-client";
import { toFacilitatorKeetaSigner } from "@x402/keeta";
import { registerExactKeetaScheme } from "@x402/keeta/exact/facilitator";

const account = KeetaNet.lib.Account.fromSeed(
  await KeetaNet.lib.Account.seedFromPassphrase(
    process.env.FACILITATOR_PASSPHRASE,
  ),
  0,
);

const keetaSigner = toFacilitatorKeetaSigner([account]);

const facilitator = new x402Facilitator();

registerExactKeetaScheme(facilitator, {
  signer: keetaSigner,
  // Keeta Testnet
  networks: "keeta:1413829460",
  feeSponsored: process.env.FACILITATOR_SPONSOR_FEES === "true",
});
```

### Server

```typescript
import { registerExactKeetaScheme } from "@x402/keeta/exact/server";

const facilitatorClient = new HTTPFacilitatorClient({
  url: "http://localhost:4022"
});

const server = new x402ResourceServer(facilitatorClient);
registerExactKeetaScheme(process.env.SERVER_ADDRESS);
```

## Features


## License

Apache-2.0
