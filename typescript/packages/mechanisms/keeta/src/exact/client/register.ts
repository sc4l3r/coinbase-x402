import { x402Client, PaymentPolicy } from "@x402/core/client";
import { Network } from "@x402/core/types";
import { ClientKeetaSigner } from "../../signer";
import { ExactKeetaScheme } from "./scheme";

/**
 * Configuration options for registering Keeta schemes to an x402Client
 */
export interface KeetaClientConfig {
  /**
   * The Keeta signer to use for creating payment payloads
   */
  signer: ClientKeetaSigner;

  /**
   * Optional policies to apply to the client
   */
  policies?: PaymentPolicy[];

  /**
   * Optional specific networks to register
   */
  networks?: Network[];
}

/**
 * Registers Keeta payment schemes to an existing x402Client instance.
 *
 * @param client - The x402Client instance to register schemes to
 * @param config - Configuration for Keeta client registration
 * @returns The client instance for chaining
 */
export function registerExactKeetaScheme(
  client: x402Client,
  config: KeetaClientConfig,
): x402Client {
  if (config.networks && config.networks.length > 0) {
    config.networks.forEach(network => {
      client.register(network, new ExactKeetaScheme(config.signer));
    });
  } else {
    client.register("keeta:*", new ExactKeetaScheme(config.signer));
  }

  if (config.policies) {
    config.policies.forEach(policy => {
      client.registerPolicy(policy);
    });
  }

  return client;
}
