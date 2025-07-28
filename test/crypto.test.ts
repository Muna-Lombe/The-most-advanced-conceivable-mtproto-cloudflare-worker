/**
 * Tests for MTProto cryptographic functions
 */

import { 
  AESIGE, 
  sha256, 
  sha1,
  generateMsgKey,
  deriveAESParams,
  encryptMessage,
  decryptMessage,
  generateSecureRandom
} from '../src/crypto/mtproto-crypto';

describe('MTProto Cryptography', () => {
  describe('AES-IGE', () => {
    test('should encrypt and decrypt correctly', () => {
      const key = generateSecureRandom(32);
      const iv = generateSecureRandom(32);
      const plaintext = new TextEncoder().encode('Hello, MTProto World!').slice();
      
      // Pad to 16-byte boundary
      const padded = new Uint8Array(Math.ceil(plaintext.length / 16) * 16);
      padded.set(plaintext);
      
      const aes = new AESIGE(key, iv);
      const encrypted = aes.encrypt(padded);
      const decrypted = aes.decrypt(encrypted);
      
      expect(decrypted.slice(0, plaintext.length)).toEqual(plaintext);
    });

    test('should require correct key length', () => {
      const shortKey = generateSecureRandom(16);
      const iv = generateSecureRandom(32);
      
      expect(() => new AESIGE(shortKey, iv)).toThrow('AES key must be 32 bytes');
    });

    test('should require correct IV length', () => {
      const key = generateSecureRandom(32);
      const shortIv = generateSecureRandom(16);
      
      expect(() => new AESIGE(key, shortIv)).toThrow('IV must be 32 bytes for IGE mode');
    });
  });

  describe('Hash functions', () => {
    test('sha256 should produce 32-byte hash', () => {
      const data = new TextEncoder().encode('test data');
      const hash = sha256(data);
      expect(hash.length).toBe(32);
    });

    test('sha256 should be deterministic', () => {
      const data = new TextEncoder().encode('test data');
      const hash1 = sha256(data);
      const hash2 = sha256(data);
      expect(hash1).toEqual(hash2);
    });

    test('sha1 should produce 20-byte hash', () => {
      const data = new TextEncoder().encode('test data');
      const hash = sha1(data);
      expect(hash.length).toBe(20);
    });
  });

  describe('MTProto specific crypto', () => {
    test('generateMsgKey should produce 16-byte key', () => {
      const authKey = generateSecureRandom(256);
      const plaintext = generateSecureRandom(100);
      
      const msgKey = generateMsgKey(authKey, plaintext);
      expect(msgKey.length).toBe(16);
    });

    test('deriveAESParams should produce correct key and IV lengths', () => {
      const authKey = generateSecureRandom(256);
      const msgKey = generateSecureRandom(16);
      
      const { key, iv } = deriveAESParams(authKey, msgKey);
      expect(key.length).toBe(32);
      expect(iv.length).toBe(32);
    });

    test('encryptMessage and decryptMessage should be reversible', () => {
      const authKey = generateSecureRandom(256);
      const plaintext = generateSecureRandom(100);
      
      const { encrypted, msgKey } = encryptMessage(plaintext, authKey);
      const decrypted = decryptMessage(encrypted, msgKey, authKey);
      
      // The decrypted message should contain the original plaintext
      // (it may have padding, so we check the beginning)
      expect(decrypted.slice(0, plaintext.length)).toEqual(plaintext);
    });
  });

  describe('Secure random generation', () => {
    test('generateSecureRandom should produce array of correct length', () => {
      const bytes = generateSecureRandom(32);
      expect(bytes.length).toBe(32);
    });

    test('generateSecureRandom should produce different values', () => {
      const bytes1 = generateSecureRandom(16);
      const bytes2 = generateSecureRandom(16);
      expect(bytes1).not.toEqual(bytes2);
    });
  });
});