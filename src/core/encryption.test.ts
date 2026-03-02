/**
 * Tests for Encryption Feature
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import {
  generateSalt,
  deriveKey,
  generateIV,
  encryptBackup,
  decryptBackup,
  verifyBackupIntegrity,
  promptPassword,
} from "./encryption";
import type { BackupMetadata } from "./types";

describe("Encryption Module", () => {
  const testDir = join(homedir(), ".config", "agent-manager", "test-encryption");
  const password = "test-password-12345";
  const testData: BackupMetadata = {
    version: "1.0.0",
    backedUpAt: new Date().toISOString(),
    agents: {
      "claude-code": {
        installed: true,
        configPath: "/path/to/claude-code/config.json",
        extensions: [],
      },
    },
  };

  describe("generateSalt()", () => {
    it("should generate a salt of 32 bytes", () => {
      const salt = generateSalt();
      expect(salt).toBeInstanceOf(Buffer);
      expect(salt.length).toBe(32);
    });

    it("should generate different salts each time", () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(salt1.toString()).not.toBe(salt2.toString());
    });
  });

  describe("deriveKey()", () => {
    const password = "test-password";
    const salt = generateSalt();

    it("should derive consistent key from same password and salt", () => {
      const key1 = deriveKey(password, salt);
      const key2 = deriveKey(password, salt);
      expect(key1).toEqual(key2);
    });

    it("should derive different keys from different salts", () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      const key1 = deriveKey(password, salt1);
      const key2 = deriveKey(password, salt2);
      expect(key1).not.toEqual(key2);
    });
  });

  describe("generateIV()", () => {
    it("should generate IV of 16 bytes", () => {
      const iv = generateIV();
      expect(iv).toBeInstanceOf(Buffer);
      expect(iv.length).toBe(16);
    });

    it("should generate different IVs each time", () => {
      const iv1 = generateIV();
      const iv2 = generateIV();
      expect(iv1.toString()).not.toBe(iv2.toString());
    });
  });

  describe("encryptBackup()", () => {
    it("should encrypt backup data with password-derived key", async () => {
      const result = await encryptBackup(testData, { key: password });

      expect(result.success).toBe(true);
      expect(result.encryptedData).toBeInstanceOf(Buffer);
      expect(result.iv).toBeInstanceOf(Buffer);
      expect(result.authTag).toBeInstanceOf(Buffer);
      expect(result.authTag!.length).toBe(16);
    });

    it("should use provided key directly", async () => {
      // Buffer key must be 32 bytes for AES-256 (64 hex chars)
      const testKey = Buffer.from(
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "hex",
      );
      const result = await encryptBackup(testData, { key: testKey });

      expect(result.success).toBe(true);
    });

    it("should use provided IV", async () => {
      const testIV = Buffer.from("0123456789abcdef0123456", "hex");
      const result = await encryptBackup(testData, { key: password, iv: testIV });

      expect(result.success).toBe(true);
    });

    it("should handle errors gracefully", async () => {
      const result = await encryptBackup({} as BackupMetadata, { key: "invalid" });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("decryptBackup()", () => {
    it("should decrypt encrypted backup with correct password", async () => {
      // First encrypt
      const encryptResult = await encryptBackup(testData, { key: password });
      expect(encryptResult.success).toBe(true);

      // Then decrypt
      const decryptResult = await decryptBackup(encryptResult.encryptedData!, password);

      expect(decryptResult.success).toBe(true);
      expect(decryptResult.data).toEqual(testData);
    });

    it("should throw error for wrong password", async () => {
      const encryptResult = await encryptBackup(testData, { key: password });

      const wrongPassword = "wrong-password";
      const decryptResult = await decryptBackup(encryptResult.encryptedData!, wrongPassword);

      expect(decryptResult.success).toBe(false);
      expect(decryptResult.error).toContain("Decryption failed");
    });

    it("should handle errors gracefully", async () => {
      const result = await decryptBackup(Buffer.from("invalid"), password);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("verifyBackupIntegrity()", () => {
    it("should verify correct backup integrity", () => {
      const result = verifyBackupIntegrity(testData);

      expect(result.valid).toBe(true);
      expect(result.hash).toBeDefined();
      expect(result.hash).toMatch(/^[a-f0-9]{40}/);
    });

    it("should detect hash mismatch", () => {
      const modifiedData = { ...testData, version: "1.1.0" };
      const result = verifyBackupIntegrity(modifiedData, "expectedhash");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("hash mismatch");
    });

    it("should handle errors gracefully", () => {
      const result = verifyBackupIntegrity({} as BackupMetadata);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("promptPassword()", () => {
    it("should throw error when called without UI context", () => {
      expect(() => promptPassword()).toThrow();
    });
  });
});
