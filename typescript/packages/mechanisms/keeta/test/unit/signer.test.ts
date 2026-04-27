import { describe, it, expect, beforeAll } from "vitest";
import * as KeetaNet from "@keetanetwork/keetanet-client";
import { KeetaUserClientCache, KTA_TESTNET_ADDRESS } from "../../src/utils";
import { toClientKeetaSigner, toFacilitatorKeetaSigner } from "../../src/signer";
import { KEETA_TESTNET_CAIP2, KEETA_MAINNET_CAIP2 } from "../../src/constants";
import { AccountKeyAlgorithm } from "@keetanetwork/keetanet-client/lib/account";
import { getNewKeetaAccount } from "./utils";

describe("Keeta Signer", () => {
  let accountWithKey: InstanceType<typeof KeetaNet.lib.Account>;
  let accountWithKey2: InstanceType<typeof KeetaNet.lib.Account>;
  let accountPublicKeyOnly: InstanceType<typeof KeetaNet.lib.Account>;
  let tokenAccount: InstanceType<typeof KeetaNet.lib.Account<AccountKeyAlgorithm.TOKEN>>;

  beforeAll(() => {
    accountWithKey = getNewKeetaAccount();
    accountWithKey2 = getNewKeetaAccount();
    accountPublicKeyOnly = KeetaNet.lib.Account.fromPublicKeyString(
      accountWithKey.publicKeyString.toString(),
    );
    tokenAccount = KeetaNet.lib.Account.fromPublicKeyString(KTA_TESTNET_ADDRESS);
  });

  describe("KeetaUserClientCache", () => {
    it("creates and returns a UserClient on first access (cache miss)", () => {
      const cache = new KeetaUserClientCache();
      const client = cache.get(accountWithKey, KEETA_TESTNET_CAIP2);
      expect(client).toBeDefined();
    });

    it("returns the same UserClient instance on subsequent calls (cache hit)", () => {
      const cache = new KeetaUserClientCache();
      const first = cache.get(accountWithKey, KEETA_TESTNET_CAIP2);
      const second = cache.get(accountWithKey, KEETA_TESTNET_CAIP2);
      expect(first).toBe(second);
    });

    it("creates separate UserClients for different networks", () => {
      const cache = new KeetaUserClientCache();
      const testnet = cache.get(accountWithKey, KEETA_TESTNET_CAIP2);
      const mainnet = cache.get(accountWithKey, KEETA_MAINNET_CAIP2);
      expect(testnet).not.toBe(mainnet);
    });

    it("creates separate UserClients for different accounts", () => {
      const cache = new KeetaUserClientCache();
      const client1 = cache.get(accountWithKey, KEETA_TESTNET_CAIP2);
      const client2 = cache.get(accountWithKey2, KEETA_TESTNET_CAIP2);
      expect(client1).not.toBe(client2);
    });

    it("throws when account.isAccount() returns false (token account)", () => {
      const cache = new KeetaUserClientCache();
      expect(() => cache.get(tokenAccount, KEETA_TESTNET_CAIP2)).toThrow(
        "Account must be an account",
      );
    });

    it("throws when account has no private key", () => {
      const cache = new KeetaUserClientCache();
      expect(() => cache.get(accountPublicKeyOnly, KEETA_TESTNET_CAIP2)).toThrow(
        "Keeta account with private key is required",
      );
    });
  });

  describe("toClientKeetaSigner", () => {
    it("returns a signer with a computePaymentBlock method", () => {
      const signer = toClientKeetaSigner(accountWithKey);
      expect(typeof signer.computePaymentBlock).toBe("function");
    });
  });

  describe("toFacilitatorKeetaSigner", () => {
    it("throws during creation when an account has no private key", () => {
      expect(() => toFacilitatorKeetaSigner([accountPublicKeyOnly])).toThrow(
        "has no private key and cannot sign",
      );
    });

    it("throws during creation when no accounts are provided", () => {
      expect(() => toFacilitatorKeetaSigner([])).toThrow(
        "At least one account is required for the facilitator signer",
      );
    });

    describe("getAddresses", () => {
      it("returns addresses of all provided accounts", () => {
        const signer = toFacilitatorKeetaSigner([accountWithKey, accountWithKey2]);
        expect(signer.getAddresses()).toEqual([
          accountWithKey.publicKeyString.toString(),
          accountWithKey2.publicKeyString.toString(),
        ]);
      });
    });

    describe("submitBlock", () => {
      it("throws when the fee payer address is not in the configured accounts", async () => {
        const signer = toFacilitatorKeetaSigner([accountWithKey]);
        await expect(
          signer.submitBlock("unknown-address", "encoded-block", KEETA_TESTNET_CAIP2),
        ).rejects.toThrow("Fee payer account unknown-address not found");
      });
    });
  });
});
