/**
 * Cryptographic utilities for MTProto
 * Implements AES-IGE, SHA-256, and RSA operations
 */

import CryptoJS from 'crypto-js';
import { concatBytes, xorBytes } from '../utils/helpers';

/**
 * AES-IGE (Infinite Garble Extension) implementation for MTProto
 */
export class AESIGE {
  private key: Uint8Array;
  private iv: Uint8Array;

  constructor(key: Uint8Array, iv: Uint8Array) {
    if (key.length !== 32) {
      throw new Error('AES key must be 32 bytes');
    }
    if (iv.length !== 32) {
      throw new Error('IV must be 32 bytes for IGE mode');
    }
    this.key = key;
    this.iv = iv;
  }

  /**
   * Encrypt data using AES-IGE
   */
  encrypt(plaintext: Uint8Array): Uint8Array {
    const blockSize = 16;
    const blocks = Math.ceil(plaintext.length / blockSize);
    const paddedLength = blocks * blockSize;
    
    // Pad plaintext to block size
    const padded = new Uint8Array(paddedLength);
    padded.set(plaintext);
    
    const result = new Uint8Array(paddedLength);
    let xPrev = this.iv.slice(0, 16);
    let yPrev = this.iv.slice(16, 32);
    
    const cipher = CryptoJS.AES.encrypt(
      CryptoJS.lib.WordArray.create(Array.from(this.key)),
      CryptoJS.lib.WordArray.create(Array.from(this.key)),
      { 
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.NoPadding
      }
    );

    for (let i = 0; i < blocks; i++) {
      const offset = i * blockSize;
      const block = padded.slice(offset, offset + blockSize);
      
      // XOR with previous ciphertext
      const xored = xorBytes(block, yPrev);
      
      // AES encrypt
      const wordArray = CryptoJS.lib.WordArray.create(Array.from(xored));
      const keyWords = CryptoJS.lib.WordArray.create(Array.from(this.key));
      const encrypted = CryptoJS.AES.encrypt(wordArray, keyWords, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.NoPadding
      });
      
      const encryptedBytes = this.wordArrayToUint8Array(encrypted.ciphertext);
      
      // XOR with previous plaintext
      const output = xorBytes(encryptedBytes, xPrev);
      
      result.set(output, offset);
      
      xPrev = block;
      yPrev = output;
    }
    
    return result;
  }

  /**
   * Decrypt data using AES-IGE
   */
  decrypt(ciphertext: Uint8Array): Uint8Array {
    const blockSize = 16;
    const blocks = ciphertext.length / blockSize;
    
    if (ciphertext.length % blockSize !== 0) {
      throw new Error('Ciphertext length must be multiple of block size');
    }
    
    const result = new Uint8Array(ciphertext.length);
    let xPrev = this.iv.slice(0, 16);
    let yPrev = this.iv.slice(16, 32);
    
    for (let i = 0; i < blocks; i++) {
      const offset = i * blockSize;
      const block = ciphertext.slice(offset, offset + blockSize);
      
      // XOR with previous plaintext
      const xored = xorBytes(block, xPrev);
      
      // AES decrypt
      const wordArray = CryptoJS.lib.WordArray.create(Array.from(xored));
      const keyWords = CryptoJS.lib.WordArray.create(Array.from(this.key));
      const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: wordArray } as CryptoJS.lib.CipherParams,
        keyWords,
        {
          mode: CryptoJS.mode.ECB,
          padding: CryptoJS.pad.NoPadding
        }
      );
      
      const decryptedBytes = this.wordArrayToUint8Array(decrypted);
      
      // XOR with previous ciphertext
      const output = xorBytes(decryptedBytes, yPrev);
      
      result.set(output, offset);
      
      xPrev = output;
      yPrev = block;
    }
    
    return result;
  }

  private wordArrayToUint8Array(wordArray: CryptoJS.lib.WordArray): Uint8Array {
    const words = wordArray.words;
    const sigBytes = wordArray.sigBytes;
    const bytes = new Uint8Array(sigBytes);
    
    for (let i = 0; i < sigBytes; i++) {
      const wordIndex = Math.floor(i / 4);
      const byteIndex = i % 4;
      const word = words[wordIndex];
      if (word !== undefined) {
        bytes[i] = (word >>> (24 - (byteIndex * 8))) & 0xFF;
      }
    }
    
    return bytes;
  }
}

/**
 * SHA-256 hash function
 */
export function sha256(data: Uint8Array): Uint8Array {
  const wordArray = CryptoJS.lib.WordArray.create(Array.from(data));
  const hash = CryptoJS.SHA256(wordArray);
  return new Uint8Array(hash.words.flatMap(word => [
    (word >>> 24) & 0xFF,
    (word >>> 16) & 0xFF,
    (word >>> 8) & 0xFF,
    word & 0xFF
  ]));
}

/**
 * SHA-1 hash function (used in some MTProto operations)
 */
export function sha1(data: Uint8Array): Uint8Array {
  const wordArray = CryptoJS.lib.WordArray.create(Array.from(data));
  const hash = CryptoJS.SHA1(wordArray);
  return new Uint8Array(hash.words.flatMap(word => [
    (word >>> 24) & 0xFF,
    (word >>> 16) & 0xFF,
    (word >>> 8) & 0xFF,
    word & 0xFF
  ]));
}

/**
 * Generate message authentication code
 */
export function generateMsgKey(authKey: Uint8Array, plaintext: Uint8Array, incoming: boolean = false): Uint8Array {
  const x = incoming ? 8 : 0;
  const authKeyPart = authKey.slice(88 + x, 88 + x + 32);
  const msgKeyInput = concatBytes(authKeyPart, plaintext);
  const hash = sha256(msgKeyInput);
  return hash.slice(8, 24); // 16 bytes
}

/**
 * Derive AES key and IV from auth key and message key
 */
export function deriveAESParams(authKey: Uint8Array, msgKey: Uint8Array, incoming: boolean = false): { key: Uint8Array; iv: Uint8Array } {
  const x = incoming ? 8 : 0;
  
  const sha256a = sha256(concatBytes(msgKey, authKey.slice(x, x + 36)));
  const sha256b = sha256(concatBytes(authKey.slice(40 + x, 40 + x + 36), msgKey));
  
  const key = concatBytes(
    sha256a.slice(0, 8),
    sha256b.slice(8, 24),
    sha256a.slice(24, 32)
  );
  
  const iv = concatBytes(
    sha256b.slice(0, 8),
    sha256a.slice(8, 24),
    sha256b.slice(24, 32)
  );
  
  return { key, iv };
}

/**
 * Encrypt MTProto message
 */
export function encryptMessage(plaintext: Uint8Array, authKey: Uint8Array): { encrypted: Uint8Array; msgKey: Uint8Array } {
  const msgKey = generateMsgKey(authKey, plaintext, false);
  const { key, iv } = deriveAESParams(authKey, msgKey, false);
  
  const aes = new AESIGE(key, iv);
  const encrypted = aes.encrypt(plaintext);
  
  return { encrypted, msgKey };
}

/**
 * Decrypt MTProto message
 */
export function decryptMessage(encrypted: Uint8Array, msgKey: Uint8Array, authKey: Uint8Array): Uint8Array {
  const { key, iv } = deriveAESParams(authKey, msgKey, true);
  
  const aes = new AESIGE(key, iv);
  return aes.decrypt(encrypted);
}

/**
 * Password-based key derivation (PBKDF2)
 */
export async function pbkdf2(password: string, salt: Uint8Array, iterations: number = 100000): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  
  const importedKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256'
    },
    importedKey,
    256 // 32 bytes
  );
  
  return new Uint8Array(derivedBits);
}

/**
 * Generate secure random bytes for cryptographic operations
 */
export function generateSecureRandom(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}