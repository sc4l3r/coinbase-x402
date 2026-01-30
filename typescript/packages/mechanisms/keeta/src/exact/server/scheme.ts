import type {
  AssetAmount,
  Money,
  MoneyParser,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
} from "@x402/core/types";
import { convertToTokenAmount, getUsdcAddress, validateTokenAsset } from "../../utils";

/**
 * Keeta server implementation for the Exact payment scheme.
 */
export class ExactKeetaScheme implements SchemeNetworkServer {
  readonly scheme = "exact";
  private moneyParsers: MoneyParser[] = [];

  /**
   * Register a custom money parser in the parser chain.
   *
   * @param parser - Custom function to convert amount to AssetAmount (or null to skip)
   * @returns The service instance for chaining
   */
  registerMoneyParser(parser: MoneyParser): ExactKeetaScheme {
    this.moneyParsers.push(parser);
    return this;
  }

  /**
   * Parses a price into an asset amount.
   *
   * @param price - The price to parse
   * @param network - The network to use
   * @returns Promise that resolves to the parsed asset amount
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    if (typeof price === "object" && price !== null && "amount" in price) {
      if (!price.asset) {
        throw new Error(`Asset address must be specified for AssetAmount on network ${network}`);
      }

      if (!validateTokenAsset(price.asset)) {
        throw new Error(`Invalid asset address: ${price.asset}`);
      }

      return { amount: price.amount, asset: price.asset, extra: price.extra || {} };
    }

    const amount = this.parseMoneyToDecimal(price as Money);

    for (const parser of this.moneyParsers) {
      const result = await parser(amount, network);
      if (result !== null) {
        return result;
      }
    }

    return this.defaultMoneyConversion(amount, network);
  }

  /**
   * Build payment requirements for this scheme/network combination
   *
   * @param paymentRequirements - The base payment requirements
   * @param supportedKind - The supported kind configuration
   * @param supportedKind.x402Version - The x402 protocol version
   * @param supportedKind.scheme - The payment scheme
   * @param supportedKind.network - The network identifier
   * @param supportedKind.extra - Extra metadata including feePayer address and feeSponsored
   * @param extensionKeys - Extension keys supported by the facilitator
   * @returns Enhanced payment requirements with feePayer and feeSponsored in extra
   */
  enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    extensionKeys: string[],
  ): Promise<PaymentRequirements> {
    void extensionKeys;

    const extra: Record<string, unknown> = { ...paymentRequirements.extra };

    // Add feePayer from supportedKind.extra to payment requirements
    // The facilitator provides its address as the fee payer for transaction fees
    if (typeof supportedKind.extra?.feePayer === "string") {
      extra.feePayer = supportedKind.extra.feePayer;
    }

    // Add feeSponsored from supportedKind.extra to payment requirements
    // The facilitator defines whether it sponsors transaction fees
    if (typeof supportedKind.extra?.feeSponsored === "boolean") {
      extra.feeSponsored = supportedKind.extra.feeSponsored;
    }

    // TODO: Add `external` field once we have support for it such
    //       as an integration of asset movement anchors.
    return Promise.resolve({ ...paymentRequirements, extra });
  }

  /**
   * Parse Money (string | number) to a decimal number.
   * Handles formats like "$1.50", "1.50", 1.50, etc.
   *
   * @param money - The money value to parse
   * @returns Decimal number
   */
  private parseMoneyToDecimal(money: string | number): number {
    if (typeof money === "number") {
      return money;
    }

    // Remove $ sign and whitespace, then parse
    const cleanMoney = money.replace(/^\$/, "").trim();
    const amount = parseFloat(cleanMoney);

    if (isNaN(amount)) {
      throw new Error(`Invalid money format: ${money}`);
    }

    return amount;
  }

  /**
   * Default money conversion implementation.
   * Converts decimal amount to USDC on the specified network.
   *
   * @param amount - The decimal amount (e.g., 1.50)
   * @param network - The network to use
   * @returns The parsed asset amount in USDC
   */
  private defaultMoneyConversion(amount: number, network: Network): AssetAmount {
    // Convert decimal amount to token amount (USDC has 6 decimals)
    const tokenAmount = convertToTokenAmount(amount.toString(), 6);

    return {
      amount: tokenAmount,
      asset: getUsdcAddress(network),
      extra: {},
    };
  }
}
