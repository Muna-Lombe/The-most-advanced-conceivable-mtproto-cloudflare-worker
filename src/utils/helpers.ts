/**
 * Utility functions for MTProto implementation
 */

/**
 * Generate a random byte array of specified length
 */
export function generateRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Generate a unique message ID based on current timestamp
 */
export function generateMessageId(): bigint {
  const now = Date.now();
  const timeSec = Math.floor(now / 1000);
  const timeNano = (now % 1000) * 1000000;
  return BigInt(timeSec) * BigInt(4294967296) + BigInt(timeNano);
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): bigint {
  const bytes = generateRandomBytes(8);
  let result = 0n;
  for (let i = 0; i < 8; i++) {
    result = result * 256n + BigInt(bytes[i] as number);
  }
  return result;
}

/**
 * Convert BigInt to little-endian byte array
 */
export function bigIntToBytes(value: bigint, length: number = 8): Uint8Array {
  const bytes = new Uint8Array(length);
  let temp = value;
  for (let i = 0; i < length; i++) {
    bytes[i] = Number(temp & 0xFFn);
    temp = temp >> 8n;
  }
  return bytes;
}

/**
 * Convert little-endian byte array to BigInt
 */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    result = result * 256n + BigInt(bytes[i] as number);
  }
  return result;
}

/**
 * Convert number to little-endian 4-byte array
 */
export function int32ToBytes(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[0] = value & 0xFF;
  bytes[1] = (value >> 8) & 0xFF;
  bytes[2] = (value >> 16) & 0xFF;
  bytes[3] = (value >> 24) & 0xFF;
  return bytes;
}

/**
 * Convert little-endian 4-byte array to number
 */
export function bytesToInt32(bytes: Uint8Array, offset: number = 0): number {
  return (
    (bytes[offset] as number) |
    ((bytes[offset + 1] as number) << 8) |
    ((bytes[offset + 2] as number) << 16) |
    ((bytes[offset + 3] as number) << 24)
  );
}

/**
 * Concatenate multiple Uint8Arrays
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

/**
 * XOR two byte arrays
 */
export function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const length = Math.min(a.length, b.length);
  const result = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = (a[i] as number) ^ (b[i] as number);
  }
  return result;
}

/**
 * Compare two byte arrays for equality
 */
export function compareBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Calculate CRC32 checksum
 */
export function crc32(data: Uint8Array): number {
  const table = generateCRC32Table();
  let crc = 0xFFFFFFFF;
  
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] as number;
    crc = (crc >>> 8) ^ table[((crc ^ byte) & 0xFF) as number] as number;
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Generate CRC32 lookup table
 */
function generateCRC32Table(): number[] {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[i] = crc;
  }
  return table;
}

/**
 * Validate MTProto message format
 */
export function validateMessageFormat(data: Uint8Array): boolean {
  // Basic validation - check minimum length and structure
  if (data.length < 20) return false;
  
  // Check for valid MTProto magic bytes or structure
  // This is a simplified validation
  return true;
}

/**
 * Create a delay promise
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      const delayMs = baseDelay * Math.pow(2, attempt);
      await delay(delayMs);
    }
  }
  
  throw lastError!;
}

export function toRequestBody(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}