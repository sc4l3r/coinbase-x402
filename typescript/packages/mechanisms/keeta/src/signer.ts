import * as KeetaNet from "@keetanetwork/keetanet-client";
import { computeFees, FeesByToken, getSumOfFeesByToken, KeetaUserClientCache } from "./utils";
import { Network } from "@x402/core/types";

/**
 * Client-side signer for creating and signing Keeta transactions
 */
export type ClientKeetaSigner = {
  /**
   * Creates and signs a block to pay the specified amount to the recipient and optionally
   * fees to the specified fee payer.
   *
   * @param network - The network to create the block for
   * @param recipient - The recipient account to pay the amount to
   * @param amount - The amount to pay to the recipient
   * @param token - The token to send to the payment
   * @param isSponsored - Whether the fees are sponsored by the fee payer
   * @param external - Optional external data to include in the block
   * @param feePayer - The fee payer account if fee sponsoring is disabled
   */
  computePaymentBlock(
    network: Network,
    recipient: InstanceType<typeof KeetaNet.lib.Account>,
    amount: bigint,
    token: InstanceType<
      typeof KeetaNet.lib.Account<typeof KeetaNet.lib.Account.AccountKeyAlgorithm.TOKEN>
    >,
    isSponsored: boolean,
    external?: string,
    feePayer?: string,
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
      isSponsored: boolean,
      external?: string,
      feePayer?: string,
    ): Promise<InstanceType<typeof KeetaNet.lib.Block>> {
      const userClient = userClients.get(account, network);

      const builder = userClient.initBuilder();
      builder.send(recipient, amount, token, external);

      // Type check is necessary again as TypeScript doesn't get that we ensured this above already.
      if (isSponsored === false && typeof feePayer === "string") {
        const feePayerAccount = KeetaNet.lib.Account.fromPublicKeyString(feePayer);

        const fees = await computeFees(userClient, feePayer, recipient, token, amount);
        for (const [feeTokenAddress, feeAmount] of fees) {
          const feeToken = KeetaNet.lib.Account.fromPublicKeyString(feeTokenAddress);
          if (!feeToken.isToken()) {
            throw new Error(`Fee token ${feeTokenAddress} is not a token account`);
          }

          builder.send(feePayerAccount, feeAmount, feeToken);
        }
      }

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
   * Get the vote quotes containing the network's fees for the given block
   *
   * @param feePayer - The fee payer account
   * @param block - The block to get fees for
   * @param network - The network to get fees for
   * @returns Promise resolving to an array of fees by token and an array of vote quotes
   */
  getFeesForBlock(
    feePayer: string,
    block: InstanceType<typeof KeetaNet.lib.Block>,
    network: Network,
  ): Promise<[FeesByToken, InstanceType<typeof KeetaNet.lib.Vote.Quote>[]]>;

  /**
   * Sign a fee block and submit it with the given block as a vote staple
   *
   * @param feePayer - The fee payer account
   * @param encodedBlock - The Base64 and ASN.1 DER encoded block to submit
   * @param network - The network to submit the block to
   * @param quotes - Optional array of vote quotes
   * @returns Promise resolving to the submitted vote staple hash
   */
  submitBlock(
    feePayer: string,
    encodedBlock: string,
    network: Network,
    quotes?: InstanceType<typeof KeetaNet.lib.Vote.Quote>[],
  ): Promise<string>;
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

    getFeesForBlock: async (
      feePayer: string,
      block: InstanceType<typeof KeetaNet.lib.Block>,
      network: Network,
    ): Promise<[FeesByToken, InstanceType<typeof KeetaNet.lib.Vote.Quote>[]]> => {
      const feePayerAccount = publicKeyToAccount.get(feePayer);
      if (!feePayerAccount) {
        throw new Error(`Fee payer account ${feePayer} not found`);
      }

      const userClient = userClients.get(feePayerAccount, network);

      const quotes = await userClient.getQuotes([block]);

      const fees = await getSumOfFeesByToken(userClient, quotes);

      return [fees, quotes];
    },

    submitBlock: async (
      feePayer: string,
      encodedBlock: string,
      network: Network,
      quotes?: InstanceType<typeof KeetaNet.lib.Vote.Quote>[],
    ) => {
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
        quotes,
      });

      await userClient.destroy();

      return ret.voteStaple.blocksHash.toString();
    },
  };
}
