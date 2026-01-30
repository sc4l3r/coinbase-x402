import * as KeetaNet from "@keetanetwork/keetanet-client";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import type { FacilitatorKeetaSigner } from "../../signer";
import type { ExactKeetaPayload } from "../../types";

/**
 * Keeta facilitator implementation for the Exact payment scheme.
 */
export class ExactKeetaScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = "keeta:*";

  /**
   * Creates a new ExactKeetaFacilitator instance.
   *
   * @param signer - The Keeta client for facilitator operations
   * @param feeSponsored - Whether to sponsor transaction fees. Defaults to false.
   * @returns ExactKeetaFacilitator instance
   */
  constructor(
    private readonly signer: FacilitatorKeetaSigner,
    private readonly feeSponsored: boolean = false,
  ) {}

  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   *
   * @param _ - The network identifier (unused)
   * @returns Extra data with feeSponsored boolean and feePayer address if fees are sponsored
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    if (!this.feeSponsored) {
      return {
        feeSponsored: false,
        feePayer: this.getRandomFeePayer(),
      };
    }

    return {
      feeSponsored: true,
    };
  }

  /**
   * Get signer addresses used by this facilitator.
   *
   * @param _ - The network identifier (unused for Keeta)
   * @returns Array of fee payer addresses
   */
  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()];
  }

  /**
   * Verifies a payment payload.
   *
   * @param payload - The payment payload to verify
   * @param requirements - The payment requirements
   * @returns Promise resolving to verification response
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const result = await this.verifyWithQuotes(payload, requirements);

    return {
      isValid: result.isValid,
      invalidReason: result.invalidReason,
      payer: result.payer,
    };
  }

  /**
   * Settles a payment by submitting the transaction.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Promise resolving to settlement response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const exactKeetaPayload = payload.payload as ExactKeetaPayload;

    const valid = await this.verifyWithQuotes(payload, requirements);
    if (!valid.isValid) {
      return {
        success: false,
        network: payload.accepted.network,
        transaction: "",
        errorReason: valid.invalidReason ?? "verification_failed",
        payer: valid.payer || "",
      };
    }

    try {
      // feePayer is set in requirements if feeSponsored is false (already validated in verify).
      // If feeSponsored is true, we use a randomly selected feePayer.
      const feePayer = requirements.extra.feeSponsored
        ? this.getRandomFeePayer()
        : (requirements.extra.feePayer as string);

      // Sign and submit transaction with the feePayer's signer
      const stapleHash = await this.signer.submitBlock(
        feePayer,
        exactKeetaPayload.block,
        requirements.network,
        valid.quotes,
      );

      return {
        success: true,
        transaction: stapleHash,
        network: payload.accepted.network,
        payer: valid.payer,
      };
    } catch (error) {
      console.error("Failed to settle transaction:", error);
      return {
        success: false,
        errorReason: "transaction_failed",
        transaction: "",
        network: payload.accepted.network,
        payer: valid.payer || "",
      };
    }
  }

  /**
   * Verifies a payment payload and returns the vote quotes used to verify the fees.
   * These can be used to submit the block to the network and pay the exact fees that were
   * verified to be paid by the client (if fee sponsorship is disabled).
   *
   * @param payload - The payment payload to verify
   * @param requirements - The payment requirements
   * @returns Promise resolving to verification response including vote quotes
   */
  private async verifyWithQuotes(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse & { quotes?: InstanceType<typeof KeetaNet.lib.Vote.Quote>[] }> {
    const exactKeetaPayload = payload.payload as ExactKeetaPayload;

    const signerAddresses = this.signer.getAddresses();
    const feeSponsored = requirements.extra?.feeSponsored === true;

    // 1. Verify x402Version is 2
    if (payload.x402Version !== 2) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_keeta_payload_unsupported_version",
        payer: "",
      };
    }

    // 2. Verify the network matches
    if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
      return { isValid: false, invalidReason: "unsupported_scheme", payer: "" };
    }

    if (payload.accepted.network !== requirements.network) {
      return { isValid: false, invalidReason: "network_mismatch", payer: "" };
    }

    // 3. Verify extra.feeSponsored matches our configuration
    if (feeSponsored) {
      // 3.1 If fee sponsorship is supported and extra.feeSponsored is true, verify that feePayer is managed by this facilitator
      if (!this.feeSponsored) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_keeta_payload_fee_sponsorship_not_supported",
          payer: "",
        };
      }
    } else {
      // 3.2 If feeSponsored is false, verify that feePayer is set and managed by this facilitator
      if (!requirements.extra?.feePayer || typeof requirements.extra.feePayer !== "string") {
        return {
          isValid: false,
          invalidReason: "invalid_exact_keeta_payload_missing_fee_payer",
          payer: "",
        };
      }

      if (!signerAddresses.includes(requirements.extra.feePayer)) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_keeta_payload_invalid_fee_payer",
          payer: "",
        };
      }
    }

    // 4. Decode payload block.
    // 4.1 Verify that the block can be decoded and that the signature is valid. This is done by the SDK automatically after the block is decoded.
    let block;
    try {
      block = new KeetaNet.lib.Block(exactKeetaPayload.block);
    } catch (error) {
      console.error("Error decoding block:", error);

      return {
        isValid: false,
        invalidReason: "invalid_exact_keeta_payload_block_could_not_be_decoded",
        payer: "",
      };
    }

    const caip = requirements.network.split(":");
    const networkId = BigInt(caip[1]);

    // 4.2 Verify the network id matches
    if (block.network !== networkId) {
      return { isValid: false, invalidReason: "network_mismatch", payer: "" };
    }

    // 4.3 Verify the amount of operations depending on the fee sponsorship
    if (feeSponsored) {
      if (block.operations.length !== 1) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_keeta_payload_operations_length",
          payer: "",
        };
      }
    } else if (block.operations.length <= 1) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_keeta_payload_operations_length",
        payer: "",
      };
    }

    const [payOperation, ...feeOperations] = block.operations;

    // 4.4 Verify that the first operation pays the required funds to the server
    const payOperationVerificationResult = this.verifyPaymentOperation(payOperation, requirements);
    if (payOperationVerificationResult !== null) {
      return payOperationVerificationResult;
    }

    // 4.5 Verify that the remaining operations pay the fees if not sponsored
    let quotes: InstanceType<typeof KeetaNet.lib.Vote.Quote>[] | undefined;
    if (!feeSponsored) {
      const feeOperationResult = await this.verifyFeeOperations(
        block,
        feeOperations,
        requirements.network,
        requirements.extra.feePayer as string,
      );
      if ("isValid" in feeOperationResult) {
        return feeOperationResult;
      }

      quotes = feeOperationResult;
    }

    return {
      isValid: true,
      invalidReason: undefined,
      payer: block.account.publicKeyString.toString(),
      quotes,
    };
  }

  /**
   * Chooses a random fee payers address from the available addresses of the facilitator's signer.
   * This can be used to distribute load across multiple signers.
   *
   * @returns Random fee payer address
   */
  private getRandomFeePayer(): string {
    const addresses = this.signer.getAddresses();
    const randomIndex = Math.floor(Math.random() * addresses.length);

    return addresses[randomIndex];
  }

  /**
   * Verifies that the given payment operation matches the requirements.
   *
   * @param payOperation - Operation that should pay the required funds to the server
   * @param requirements - Requirements the operation must fulfill
   * @returns VerifyResponse on failure, null on success
   */
  private verifyPaymentOperation(
    payOperation: InstanceType<typeof KeetaNet.lib.Block>["operations"][0],
    requirements: PaymentRequirements,
  ): VerifyResponse | null {
    if (payOperation.type !== KeetaNet.lib.Block.OperationType.SEND) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_keeta_payload_payment_operation_type",
        payer: "",
      };
    }

    // The token matches the requirements.asset
    if (!payOperation.token.comparePublicKey(requirements.asset)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_keeta_payload_payment_asset_mismatch",
        payer: "",
      };
    }

    // The amount matches the requirements.amount
    let amount;
    try {
      amount = BigInt(payOperation.amount);
    } catch (error) {
      console.error("Error parsing payment amount:", error);

      return {
        isValid: false,
        invalidReason: "invalid_exact_keeta_payload_payment_amount_invalid",
        payer: "",
      };
    }

    if (payOperation.amount !== amount) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_keeta_payload_payment_amount_mismatch",
        payer: "",
      };
    }

    // The to matches the requirements.payTo
    if (!payOperation.to.comparePublicKey(requirements.payTo)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_keeta_payload_payment_to_mismatch",
        payer: "",
      };
    }

    // The external matches the extra.external if set
    if (requirements.extra.external && payOperation.external !== requirements.extra.external) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_keeta_payload_payment_external_mismatch",
        payer: "",
      };
    }

    return null;
  }

  /**
   * Verifies that the feeOperations pay the required network fees to the facilitator and
   * contain no other operation than SEND to the feePayer.
   *
   * @param block - The client's payment block
   * @param feeOperations - Operations that should pay the required network fees
   * @param network - The network to use for fee calculation
   * @param feePayer - The public key of the fee payer
   * @returns VerifyResponse on failure, Array of vote quotes for fees on success
   */
  private async verifyFeeOperations(
    block: InstanceType<typeof KeetaNet.lib.Block>,
    feeOperations: InstanceType<typeof KeetaNet.lib.Block>["operations"],
    network: Network,
    feePayer: string,
  ): Promise<VerifyResponse | InstanceType<typeof KeetaNet.lib.Vote.Quote>[]> {
    const [fees, quotes] = await this.signer.getFeesForBlock(feePayer, block, network);

    for (const feeOperation of feeOperations) {
      if (feeOperation.type !== KeetaNet.lib.Block.OperationType.SEND) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_keeta_payload_fee_invalid_operation_type",
          payer: "",
        };
      }

      if (!feeOperation.to.comparePublicKey(feePayer)) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_keeta_payload_fee_invalid_operation_to",
          payer: "",
        };
      }

      const feeTokenPublicKeyString = feeOperation.token.publicKeyString.toString();
      const fee = fees.get(feeTokenPublicKeyString);
      if (!fee) {
        return {
          isValid: false,
          invalidReason: "invalid_exact_keeta_payload_fee_token_not_found",
          payer: "",
        };
      }

      fees.set(feeTokenPublicKeyString, fee - feeOperation.amount);
    }

    for (const [token, fee] of fees) {
      if (fee > 0) {
        console.error(`Client paid insufficient fees for token ${token}: ${fee} remaining`);

        return {
          isValid: false,
          invalidReason: "invalid_exact_keeta_payload_fee_amount_insufficient",
          payer: "",
        };
      }
    }

    return quotes;
  }
}
