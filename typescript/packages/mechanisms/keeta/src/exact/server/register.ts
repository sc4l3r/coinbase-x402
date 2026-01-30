import { x402ResourceServer } from "@x402/core/server";
import { Network } from "@x402/core/types";
import { ExactKeetaScheme } from "./scheme";

/**
 * Configuration options for registering Keeta schemes to an x402ResourceServer
 */
export interface KeetaServerConfig {
  /**
   * Optional specific networks to register
   */
  networks?: Network[];
}

/**
 * Registers Keeta payment schemes to an existing x402ResourceServer instance.
 *
 * @param server - The x402ResourceServer instance to register schemes to
 * @param config - Configuration for Keeta server registration
 * @returns The server instance for chaining
 */
export function registerExactKeetaScheme(
  server: x402ResourceServer,
  config: KeetaServerConfig = {},
): x402ResourceServer {
  const scheme = new ExactKeetaScheme();

  if (config.networks && config.networks.length > 0) {
    config.networks.forEach(network => {
      server.register(network, scheme);
    });
  } else {
    server.register("keeta:*", scheme);
  }

  return server;
}
