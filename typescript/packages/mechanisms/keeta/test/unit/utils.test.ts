import { describe, it, expect, beforeAll } from "vitest";
import {
  getUsdcAddress,
  networkToKeetaNetwork,
  convertToTokenAmount,
  validateTokenAsset,
} from "../../src/utils";
import { KEETA_MAINNET_CAIP2, KEETA_TESTNET_CAIP2 } from "../../src/constants";
import { getNewKeetaAccount } from "./utils";

const KEETA_ACCOUNT = getNewKeetaAccount().publicKeyString.toString();

describe("Keeta utilities", () => {
  let usdcMainnetAddress: string;
  let usdcTestnetAddress: string;

  beforeAll(async () => {
    [usdcTestnetAddress, usdcMainnetAddress] = await Promise.all([
      await getUsdcAddress(KEETA_TESTNET_CAIP2),
      await getUsdcAddress(KEETA_MAINNET_CAIP2),
    ]);
  });

  describe("getUsdcAddress", () => {
    it("returns mainnet USDC address for mainnet network", async () => {
      await expect(getUsdcAddress(KEETA_MAINNET_CAIP2)).resolves.toBe(usdcMainnetAddress);
    });

    it("returns testnet USDC address for testnet network", async () => {
      await expect(getUsdcAddress(KEETA_TESTNET_CAIP2)).resolves.toBe(usdcTestnetAddress);
    });

    it("throws for unknown network", async () => {
      await expect(getUsdcAddress("keeta:99999")).rejects.toThrow(
        "No USDC address configured for network",
      );
    });

    it("throws for non-keeta network", async () => {
      await expect(getUsdcAddress("ethereum:1")).rejects.toThrow(
        "No USDC address configured for network",
      );
    });
  });

  describe("networkToKeetaNetwork", () => {
    it("returns main for Keeta mainnet", () => {
      expect(networkToKeetaNetwork(KEETA_MAINNET_CAIP2)).toBe("main");
    });

    it("returns test for Keeta Testnet", () => {
      expect(networkToKeetaNetwork(KEETA_TESTNET_CAIP2)).toBe("test");
    });

    it("throws for unknown network", () => {
      expect(() => networkToKeetaNetwork("keeta:99999")).toThrow("Unsupported network");
    });

    it("throws for non-keeta network", () => {
      expect(() => networkToKeetaNetwork("ethereum:1")).toThrow("Unsupported network");
    });
  });

  describe("convertToTokenAmount", () => {
    it("converts 1 USDC to 1000000 atomic units (6 decimals)", () => {
      expect(convertToTokenAmount("1", 6)).toBe("1000000");
    });

    it("converts 1.0 to 1000000", () => {
      expect(convertToTokenAmount("1.0", 6)).toBe("1000000");
    });

    it("converts 0.10 to 100000", () => {
      expect(convertToTokenAmount("0.10", 6)).toBe("100000");
    });

    it("converts 0.000001 to 1 (minimum unit)", () => {
      expect(convertToTokenAmount("0.000001", 6)).toBe("1");
    });

    it("truncates extra decimal places beyond precision", () => {
      expect(convertToTokenAmount("1.1234567", 6)).toBe("1123456");
    });

    it("converts whole number without decimals", () => {
      expect(convertToTokenAmount("100", 6)).toBe("100000000");
    });

    it("handles zero amount", () => {
      expect(convertToTokenAmount("0", 6)).toBe("0");
    });

    it("works with different decimal precision", () => {
      expect(convertToTokenAmount("1.5", 2)).toBe("150");
    });

    it("throws for invalid amount string", () => {
      expect(() => convertToTokenAmount("invalid", 6)).toThrow("Invalid amount");
    });
  });

  describe("validateTokenAsset", () => {
    it("returns true for valid token address", () => {
      expect(validateTokenAsset(usdcTestnetAddress)).toBe(true);
    });

    it("returns false when address is not a token type", () => {
      expect(validateTokenAsset(KEETA_ACCOUNT)).toBe(false);
    });

    it("returns false when address is invalid", () => {
      expect(validateTokenAsset("keeta_invalidaddress")).toBe(false);
      expect(validateTokenAsset("invalid-address")).toBe(false);
    });
  });
});
