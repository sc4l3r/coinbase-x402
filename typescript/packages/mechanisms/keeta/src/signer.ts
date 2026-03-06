import * as KeetaNet from "@keetanetwork/keetanet-client";
import { KeetaUserClientCache } from "./utils";
import { Network } from "@x402/core/types";

/**
 * Client-side signer for creating and signing Keeta transactions
 */
export type ClientKeetaSigner = {
  /**
   * Creates and signs a block to pay the specified amount to the recipient.
   *
   * @param network - The network to create the block for
   * @param recipient - The recipient account to pay the amount to
   * @param amount - The amount to pay to the recipient
   * @param token - The token to send to the payment
   * @param external - Optional external data to include in the block
   */
  computePaymentBlock(
    network: Network,
    recipient: InstanceType<typeof KeetaNet.lib.Account>,
    amount: bigint,
    token: InstanceType<
      typeof KeetaNet.lib.Account<typeof KeetaNet.lib.Account.AccountKeyAlgorithm.TOKEN>
    >,
    external?: string,
  ): Promise<InstanceType<typeof KeetaNet.lib.Block>>;
};

/**
 * Create a Keeta client signer from a signing account.
 *
 * @param account - The signing account to use for signing transactions.
 * @returns A client Keeta signer instance.
 */
export function toClientKeetaSigner(
  account: InstanceType<typeof KeetaNet.lib.Account>,
): ClientKeetaSigner {
  const userClients = new KeetaUserClientCache();

  return {
    async computePaymentBlock(
      network: Network,
      recipient: InstanceType<typeof KeetaNet.lib.Account>,
      amount: bigint,
      token: InstanceType<
        typeof KeetaNet.lib.Account<typeof KeetaNet.lib.Account.AccountKeyAlgorithm.TOKEN>
      >,
      external?: string,
    ): Promise<InstanceType<typeof KeetaNet.lib.Block>> {
      const userClient = userClients.get(account, network);

      const builder = userClient.initBuilder();
      builder.send(recipient, amount, token, external);

      const computedBlocks = await builder.computeBlocks();

      const [paymentBlock] = computedBlocks.blocks;
      if (!paymentBlock) {
        throw new Error("Payment block not found");
      }

      return paymentBlock;
    },
  };
}

/**
 * Minimal facilitator signer interface for Keeta operations
 */
export type FacilitatorKeetaSigner = {
  /**
   * Get all addresses this facilitator can use for signing
   *
   * @returns Array of addresses
   */
  getAddresses(): readonly string[];

  /**
   * Sign a fee block and submit it with the given block as a vote staple
   *
   * @param feePayer - The fee payer account
   * @param encodedBlock - The Base64 and ASN.1 DER encoded block to submit
   * @param network - The network to submit the block to
   * @returns Promise resolving to the block hash
   */
  submitBlock(feePayer: string, encodedBlock: string, network: Network): Promise<string>;
};

/**
 * Create a Keeta facilitator signer from a set of signing accounts.
 *
 * @param accounts - The seed for the feePayer accounts
 * @returns FacilitatorKeetaSigner instance
 */
export function toFacilitatorKeetaSigner(
  accounts: InstanceType<typeof KeetaNet.lib.Account>[],
): FacilitatorKeetaSigner {
  const publicKeyToAccount = new Map<string, InstanceType<typeof KeetaNet.lib.Account>>();
  accounts.forEach(account => {
    // Ensure all accounts can be used for signing
    if (!account.hasPrivateKey) {
      throw new Error(
        `Account ${account.publicKeyString.toString()} has no private key and cannot sign`,
      );
    }

    publicKeyToAccount.set(account.publicKeyString.toString(), account);
  });

  const userClients = new KeetaUserClientCache();

  return {
    getAddresses: () => Array.from(publicKeyToAccount.keys()),

    submitBlock: async (feePayer: string, encodedBlock: string, network: Network) => {
      const feePayerAccount = publicKeyToAccount.get(feePayer);
      if (!feePayerAccount) {
        throw new Error(`Fee payer account ${feePayer} not found`);
      }

      const block = new KeetaNet.lib.Block(encodedBlock);

      const userClient = userClients.get(feePayerAccount, network);

      if (!userClient.config.generateFeeBlock) {
        throw new Error("Fee block can't be generated");
      }

      const ret = await userClient.transmit([block], {
        generateFeeBlock: userClient.config.generateFeeBlock,
      });

      return ret.voteStaple.blocksHash.toString();
    },
  };
}
