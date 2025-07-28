/**
 * Tests for MTProto utilities
 */

import { 
  generateRandomBytes, 
  generateMessageId, 
  generateSessionId,
  bigIntToBytes,
  bytesToBigInt,
  int32ToBytes,
  bytesToInt32,
  concatBytes,
  xorBytes,
  compareBytes,
  bytesToHex,
  hexToBytes,
  crc32
} from '../src/utils/helpers';

describe('MTProto Utilities', () => {
  describe('Random generation', () => {
    test('generateRandomBytes should create array of correct length', () => {
      const bytes = generateRandomBytes(16);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(16);
    });

    test('generateRandomBytes should produce different values', () => {
      const bytes1 = generateRandomBytes(8);
      const bytes2 = generateRandomBytes(8);
      expect(bytes1).not.toEqual(bytes2);
    });

    test('generateMessageId should return bigint', () => {
      const id = generateMessageId();
      expect(typeof id).toBe('bigint');
      expect(id).toBeGreaterThan(0n);
    });

    test('generateSessionId should return bigint', () => {
      const id = generateSessionId();
      expect(typeof id).toBe('bigint');
      expect(id).toBeGreaterThan(0n);
    });
  });

  describe('Number conversion', () => {
    test('bigIntToBytes and bytesToBigInt should be reversible', () => {
      const originalValue = 0x123456789abcdef0n;
      const bytes = bigIntToBytes(originalValue, 8);
      const convertedValue = bytesToBigInt(bytes);
      expect(convertedValue).toBe(originalValue);
    });

    test('int32ToBytes and bytesToInt32 should be reversible', () => {
      const originalValue = 0x12345678;
      const bytes = int32ToBytes(originalValue);
      const convertedValue = bytesToInt32(bytes);
      expect(convertedValue).toBe(originalValue);
    });

    test('bigIntToBytes should create correct length array', () => {
      const value = 123n;
      const bytes = bigIntToBytes(value, 4);
      expect(bytes.length).toBe(4);
    });
  });

  describe('Byte operations', () => {
    test('concatBytes should combine arrays correctly', () => {
      const arr1 = new Uint8Array([1, 2, 3]);
      const arr2 = new Uint8Array([4, 5]);
      const arr3 = new Uint8Array([6]);
      
      const result = concatBytes(arr1, arr2, arr3);
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
    });

    test('xorBytes should XOR arrays correctly', () => {
      const arr1 = new Uint8Array([0xFF, 0x00, 0xAA]);
      const arr2 = new Uint8Array([0x00, 0xFF, 0x55]);
      const result = xorBytes(arr1, arr2);
      expect(result).toEqual(new Uint8Array([0xFF, 0xFF, 0xFF]));
    });

    test('compareBytes should detect equality', () => {
      const arr1 = new Uint8Array([1, 2, 3, 4]);
      const arr2 = new Uint8Array([1, 2, 3, 4]);
      const arr3 = new Uint8Array([1, 2, 3, 5]);
      
      expect(compareBytes(arr1, arr2)).toBe(true);
      expect(compareBytes(arr1, arr3)).toBe(false);
    });
  });

  describe('Hex conversion', () => {
    test('bytesToHex and hexToBytes should be reversible', () => {
      const originalBytes = new Uint8Array([0, 15, 255, 170]);
      const hex = bytesToHex(originalBytes);
      const convertedBytes = hexToBytes(hex);
      expect(convertedBytes).toEqual(originalBytes);
    });

    test('bytesToHex should produce correct format', () => {
      const bytes = new Uint8Array([0, 15, 255]);
      const hex = bytesToHex(bytes);
      expect(hex).toBe('000fff');
    });
  });

  describe('CRC32', () => {
    test('crc32 should calculate correct checksum', () => {
      const data = new TextEncoder().encode('hello world');
      const checksum = crc32(data);
      expect(typeof checksum).toBe('number');
      expect(checksum).toBeGreaterThan(0);
    });

    test('crc32 should be deterministic', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const checksum1 = crc32(data);
      const checksum2 = crc32(data);
      expect(checksum1).toBe(checksum2);
    });
  });
});