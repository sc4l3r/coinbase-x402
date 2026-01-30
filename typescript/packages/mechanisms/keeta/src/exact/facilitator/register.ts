import { x402Facilitator } from "@x402/core/facilitator";
import { Network } from "@x402/core/types";
import { FacilitatorKeetaSigner } from "../../signer";
import { ExactKeetaScheme } from "./scheme";

/**
 * Configuration options for registering Keeta schemes to an x402Facilitator
 */
export interface KeetaFacilitatorConfig {
  /**
   * The Keeta signer for facilitator operations
   */
  signer: FacilitatorKeetaSigner;

  /**
   * Whether to sponsor transaction fees
   */
  feeSponsored?: boolean;

  /**
   * Networks to register (single network or array of networks)
   * Examples: "keeta:21378", ["keeta:21378", "keeta:1413829460"]
   */
  networks: Network | Network[];
}

/**
 * Registers Keeta payment schemes to an existing x402Facilitator instance.
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for Keeta facilitator registration
 * @returns The facilitator instance for chaining
 *
 * @example
 * ```typescript
 * // Single network
 * registerExactKeetaScheme(facilitator, {
 *   signer: keetaSigner,
 *   networks: "keeta:1413829460"  // Testnet
 * });
 *
 * // Multiple networks
 * registerExactKeetaScheme(facilitator, {
 *   signer: keetaSigner,
 *   networks: ["keeta:21378", "keeta:1413829460"]
 * });
 * ```
 */
export function registerExactKeetaScheme(
  facilitator: x402Facilitator,
  config: KeetaFacilitatorConfig,
): x402Facilitator {
  facilitator.register(config.networks, new ExactKeetaScheme(config.signer, config.feeSponsored));

  return facilitator;
}
