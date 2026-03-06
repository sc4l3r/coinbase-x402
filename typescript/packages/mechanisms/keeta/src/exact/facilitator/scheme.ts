import * as KeetaNet from "@keetanetwork/keetanet-client";
import type {
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
   * @returns ExactKeetaFacilitator instance
   */
  constructor(private readonly signer: FacilitatorKeetaSigner) {}

  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   *
   * @param _ - The network identifier (unused)
   * @returns undefined (no facilitator-specific extra data needed)
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    return undefined;
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
    const exactKeetaPayload = payload.payload as ExactKeetaPayload;

    // 1. Verify x402Version is 2
    if (payload.x402Version !== 2) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_keeta_payload_unsupported_version",
        payer: "",
      };
    }

    // 2. Verify the scheme matches
    if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
      return { isValid: false, invalidReason: "unsupported_scheme", payer: "" };
    }

    // 3. Verify the network matches
    if (payload.accepted.network !== requirements.network) {
      return { isValid: false, invalidReason: "network_mismatch", payer: "" };
    }

    // 4. Decode payload block and
    // 4.1 Verify signature, done by the SDK when decoding the block
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

    // 4.3 Verify the block contains exactly one operation
    if (block.operations.length !== 1) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_keeta_payload_operations_length",
        payer: "",
      };
    }

    // 4.4 Verify the payment operation
    const [payOperation] = block.operations;
    const payOperationVerificationResult = this.verifyPaymentOperation(payOperation, requirements);
    if (payOperationVerificationResult !== null) {
      return payOperationVerificationResult;
    }

    return {
      isValid: true,
      invalidReason: undefined,
      payer: block.account.publicKeyString.toString(),
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

    const valid = await this.verify(payload, requirements);
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
      const feePayer = this.getRandomFeePayer();

      const blockHash = await this.signer.submitBlock(
        feePayer,
        exactKeetaPayload.block,
        requirements.network,
      );

      return {
        success: true,
        transaction: blockHash,
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
   * Chooses a random fee payer address from the available addresses of the facilitator's signer.
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
    // 4.4 The operation is a SEND operation
    if (payOperation.type !== KeetaNet.lib.Block.OperationType.SEND) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_keeta_payload_payment_operation_type",
        payer: "",
      };
    }

    // 4.4.1 The token matches the requirements.asset
    if (!payOperation.token.comparePublicKey(requirements.asset)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_keeta_payload_payment_asset_mismatch",
        payer: "",
      };
    }

    // 4.4.2 The amount matches the requirements.amount
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

    // 4.4.3 The to matches the requirements.payTo
    if (!payOperation.to.comparePublicKey(requirements.payTo)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_keeta_payload_payment_to_mismatch",
        payer: "",
      };
    }

    // 4.4.4 The external matches the extra.external if set
    if (requirements.extra?.external && payOperation.external !== requirements.extra.external) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_keeta_payload_payment_external_mismatch",
        payer: "",
      };
    }

    return null;
  }
}
