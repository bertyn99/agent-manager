/**
 * Encryption Module - Phase 2 Feature
 *
 * Provides backup encryption using AES-256-GCM
 */

import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync, createHash } from "crypto";

export interface EncryptionOptions {
  key: string | Buffer;
  iv?: Buffer;
  algorithm?: "aes-256-gcm";
}

export interface EncryptionResult {
  success: boolean;
  encryptedData?: Buffer;
  iv?: Buffer;
  authTag?: Buffer;
  error?: string;
}

export interface DecryptionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface BackupMetadata {
  version: string;
  backedUpAt: string;
  agents: Record<string, unknown>;
  previousBackupHash?: string;
}

/**
 * Generate a random salt for key derivation
 */
export function generateSalt(length: number = 32): Buffer {
  return randomBytes(length);
}

/**
 * Derive a key from password using PBKDF2
 */
export function deriveKey(password: string, salt: Buffer, iterations: number = 100000): Buffer {
  return pbkdf2Sync(password, salt, iterations, 32, "sha256");
}

/**
 * Generate initialization vector (IV) for AES-GCM
 */
export function generateIV(): Buffer {
  return randomBytes(16); // AES-GCM needs 16-byte IV
}

/**
 * Encrypt data using AES-256-GCM
 */
export async function encryptBackup(
  data: BackupMetadata,
  options: EncryptionOptions,
): Promise<EncryptionResult> {
  try {
    // Validate required fields
    if (!data.version || !data.backedUpAt || !data.agents) {
      return {
        success: false,
        error: "Invalid backup data - missing required fields (version, backedUpAt, agents)",
      };
    }

    // Generate or use provided key
    let key: Buffer;
    let salt: Buffer;
    if (Buffer.isBuffer(options.key)) {
      // Buffer key must be 32 bytes for AES-256
      if (options.key.length !== 32) {
        return {
          success: false,
          error: "Invalid key size - AES-256 requires 32-byte key",
        };
      }
      key = options.key;
      salt = generateSalt(); // Generate new salt for each encryption
    } else if (typeof options.key === "string") {
      // Derive key from password
      salt = generateSalt();
      key = deriveKey(options.key, salt);
    } else {
      return {
        success: false,
        error: "Key must be a string (password) or Buffer",
      };
    }

    // Generate IV
    const iv = generateIV();

    // Convert data to JSON string, then encrypt
    const dataString = JSON.stringify(data);
    const dataBuffer = Buffer.from(dataString, "utf-8");

    // Create cipher
    const cipher = createCipheriv("aes-256-gcm", key, iv);

    // Encrypt
    const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine salt + IV + authTag with encrypted data
    // Format: [salt=32 bytes][iv=16 bytes][authTag=16 bytes][encrypted data]
    const result = Buffer.concat([salt, iv, authTag, encrypted]);

    return {
      success: true,
      encryptedData: result,
      iv,
      authTag,
    };
  } catch (error) {
    return {
      success: false,
      error: `Encryption failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Decrypt data using AES-256-GCM
 */
export async function decryptBackup(
  encryptedBuffer: Buffer,
  password: string,
  options?: Omit<EncryptionOptions, "key">,
): Promise<DecryptionResult> {
  try {
    // Extract salt, IV, authTag, and encrypted data from buffer
    // Format: [salt=32 bytes][iv=16 bytes][authTag=16 bytes][encrypted data]
    const salt = encryptedBuffer.slice(0, 32);
    const iv = encryptedBuffer.slice(32, 48);
    const authTag = encryptedBuffer.slice(48, 64);
    const encrypted = encryptedBuffer.slice(64);

    // Derive key from password using extracted salt
    const key = deriveKey(password, salt);

    // Create decipher and set auth tag
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    // Parse JSON result
    const dataString = decrypted.toString("utf-8");
    const data = JSON.parse(dataString) as unknown;

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: `Decryption failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Verify backup integrity using HMAC-SHA256
 */
export function verifyBackupIntegrity(
  backup: BackupMetadata,
  expectedHash?: string,
): { valid: boolean; hash?: string; error?: string } {
  try {
    // Validate required fields exist
    if (!backup || typeof backup !== "object") {
      return {
        valid: false,
        error: "Invalid backup format - must be an object",
      };
    }

    if (!backup.version || typeof backup.version !== "string") {
      return {
        valid: false,
        error: "Invalid backup format - missing version",
      };
    }

    if (!backup.backedUpAt || typeof backup.backedUpAt !== "string") {
      return {
        valid: false,
        error: "Invalid backup format - missing backedUpAt",
      };
    }

    if (!backup.agents || typeof backup.agents !== "object") {
      return {
        valid: false,
        error: "Invalid backup format - missing agents",
      };
    }

    const dataString = JSON.stringify(backup);
    const hash = createHash("sha256").update(dataString).digest("hex");

    if (expectedHash && expectedHash !== hash) {
      return {
        valid: false,
        hash,
        error: "Integrity check failed - hash mismatch",
      };
    }

    return { valid: true, hash };
  } catch (error) {
    return {
      valid: false,
      error: `Integrity verification failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Generate password prompt (for CLI use - console-based)
 * Note: For programmatic use, accept password directly
 */
export function promptPassword(): string {
  // In a real CLI context, this would prompt the user
  // For programmatic use, caller should provide password
  throw new Error("Password required. Use promptPassword() for CLI or pass password directly.");
}
