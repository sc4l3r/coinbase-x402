import type { Network } from "@x402/core/types";
import * as KeetaNet from "@keetanetwork/keetanet-client";
import {
  KEETA_MAINNET_CAIP2,
  KEETA_TESTNET_CAIP2,
  USDC_MAINNET_ADDRESS,
  USDC_TESTNET_ADDRESS,
} from "./constants";

/**
 * Get the default USDC token address for a network
 *
 * @param network - Network identifier (CAIP-2 format)
 * @returns USDC token address for the network
 */
export function getUsdcAddress(network: Network): string {
  switch (network) {
    case KEETA_MAINNET_CAIP2:
      return USDC_MAINNET_ADDRESS;
    case KEETA_TESTNET_CAIP2:
      return USDC_TESTNET_ADDRESS;
    default:
      throw new Error(`No USDC address configured for network: ${network}`);
  }
}

/**
 * Convert a network identifier (CAIP-2 format) to a Keeta network identifier
 *
 * @param network - The network in CAIP-2 format
 * @returns The Keeta network identifier
 */
export function networkToKeetaNetwork(network: Network): "main" | "test" {
  switch (network) {
    case KEETA_MAINNET_CAIP2:
      return "main";
    case KEETA_TESTNET_CAIP2:
      return "test";
    default:
      throw new Error(`Unsupported network: ${network}`);
  }
}

/**
 * Convert a decimal amount to token smallest units
 *
 * @param decimalAmount - The decimal amount (e.g., "0.10")
 * @param decimals - The number of decimals for the token (e.g., 6 for USDC)
 * @returns The amount in smallest units as a string
 */
export function convertToTokenAmount(decimalAmount: string, decimals: number): string {
  const amount = parseFloat(decimalAmount);
  if (isNaN(amount)) {
    throw new Error(`Invalid amount: ${decimalAmount}`);
  }
  // Convert to smallest unit (e.g., for USDC with 6 decimals: 0.10 * 10^6 = 100000)
  const [intPart, decPart = ""] = String(amount).split(".");
  const paddedDec = decPart.padEnd(decimals, "0").slice(0, decimals);
  const tokenAmount = (intPart + paddedDec).replace(/^0+/, "") || "0";
  return tokenAmount;
}

/**
 * Validate that an asset address is a valid token address.
 *
 * @param asset - The asset address to validate
 * @returns True if the asset is a valid token address, false otherwise
 */
export function validateTokenAsset(asset: string): boolean {
  let token: InstanceType<typeof KeetaNet.lib.Account>;
  try {
    token = KeetaNet.lib.Account.fromPublicKeyString(asset);
  } catch {
    return false;
  }

  if (!token.isToken()) {
    return false;
  }

  return true;
}

/**
 * Validate that an account address is a valid account address to send tokens to.
 *
 * @param address - The account address to validate
 * @returns True if the account is a valid account address to send tokens to, false otherwise
 */
export function validateAccountAddress(address: string): boolean {
  let account: InstanceType<typeof KeetaNet.lib.Account>;
  try {
    account = KeetaNet.lib.Account.fromPublicKeyString(address);
  } catch {
    return false;
  }

  if (!account.isAccount() && !account.isStorage()) {
    return false;
  }

  return true;
}

/**
 * Create a KeetaNet UserClient for the given network and signer.
 *
 * @param account - Account to use for the KeetaNet UserClient
 * @param network - The network to use for the KeetaNet UserClient
 * @returns The KeetaNet UserClient for the given network and signer
 */
export function createKeetaUserClient(
  account: InstanceType<typeof KeetaNet.lib.Account>,
  network: Network,
): KeetaNet.UserClient {
  const keetaNetwork = networkToKeetaNetwork(network);

  if (!account.isAccount()) {
    throw new Error("Account must be an account");
  }

  if (!account.hasPrivateKey) {
    throw new Error("Keeta account with private key is required");
  }

  return KeetaNet.UserClient.fromNetwork(keetaNetwork, account);
}

export type FeesByToken = Map<string, bigint>;

/**
 * Computes the fees required for a block which includes a payment SEND operation and
 * a SEND operation to pay fees to the fee payer.
 *
 * @param userClient - KeetaNet UserClient to use for network requests
 * @param feePayerAddress - Address of the account that will pay the fees
 * @param recipient - Address of the account that will receive the tokens
 * @param token - Token to send
 * @param amount - Amount of tokens to send
 * @returns Map of fee token addresses to their respective amounts
 */
export async function computeFees(
  userClient: KeetaNet.UserClient,
  feePayerAddress: string,
  recipient: InstanceType<typeof KeetaNet.lib.Account>,
  token: InstanceType<
    typeof KeetaNet.lib.Account<typeof KeetaNet.lib.Account.AccountKeyAlgorithm.TOKEN>
  >,
  amount: bigint,
): Promise<FeesByToken> {
  const feePayer = KeetaNet.lib.Account.fromPublicKeyString(feePayerAddress);

  const tempBuilder = userClient.initBuilder();
  tempBuilder.send(recipient, amount, token);

  // Include an operation to pay the fees in the fee calculation
  // to more accurately reflect the blocks that will be sent and with
  // that the fees that will have to be paid.
  tempBuilder.send(feePayer, 1n, userClient.baseToken);
  const { blocks } = await tempBuilder.computeBlocks();

  // Get up-to-date quotes from the network
  const quotes = await userClient.getQuotes(blocks);

  return getSumOfFeesByToken(userClient, quotes);
}

/**
 * Calculates the sum of fees by token for the given quotes.
 *
 * @param userClient - The KeetaNet UserClient to use for the calculation.
 * @param quotes - The quotes to calculate the sum of fees by token for.
 * @returns A map of token addresses to the sum of fees for that token.
 */
export async function getSumOfFeesByToken(
  userClient: InstanceType<typeof KeetaNet.UserClient>,
  quotes: InstanceType<typeof KeetaNet.lib.Vote.Quote>[],
): Promise<FeesByToken> {
  const fees = new Map() as FeesByToken;

  for (const quote of quotes) {
    if (!quote.fee) continue;
    const feeTokenAddress = quote.fee.token ?? userClient.baseToken;

    const feeSum = fees.get(feeTokenAddress.publicKeyString.toString()) ?? 0n;
    fees.set(feeTokenAddress.publicKeyString.toString(), feeSum + quote.fee.amount);
  }

  return fees;
}

/**
 * A cache of Keeta UserClients to keep only one UserClient per network and address combination.
 * This avoids creating new instances every time a network operation is performed since it
 * removes the initialization overhead of always requesting the current reps.
 * It's especially helpful when signing multiple blocks in rapid succession.
 */
export class KeetaUserClientCache {
  private cache = new Map<string, InstanceType<typeof KeetaNet.UserClient>>();

  /**
   * Retrieves a KeetaNet UserClient instance for the given network and account.
   * Creates a new UserClient instance if one does not exist for the given network and account.
   *
   * @param account - The account address to use for the UserClient.
   * @param network - The network to retrieve the UserClient for.
   * @returns A Promise that resolves to the UserClient instance.
   */
  get(
    account: InstanceType<typeof KeetaNet.lib.Account>,
    network: Network,
  ): InstanceType<typeof KeetaNet.UserClient> {
    const key = `${network.toString()}:${account.publicKeyString.toString()}`;
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const keetaNetwork = networkToKeetaNetwork(network);

    if (!account.isAccount()) {
      throw new Error("Account must be an account");
    }

    if (!account.hasPrivateKey) {
      throw new Error("Keeta account with private key is required");
    }

    const client = KeetaNet.UserClient.fromNetwork(keetaNetwork, account);

    this.cache.set(key, client);

    return client;
  }
}
