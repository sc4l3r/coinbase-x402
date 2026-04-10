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

facilitator.register(KEETA_TESTNET_CAIP2, new ExactKeetaScheme(keetaSigner));
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
