/**
 * MTProto protocol implementation
 */

import { 
  MTProtoMessage, 
  MTProtoSession, 
  MTProtoError,
  AuthKeyData 
} from '../types';
import { 
  generateMessageId, 
  generateSessionId, 
  bigIntToBytes, 
  bytesToBigInt,
  int32ToBytes,
  bytesToInt32,
  concatBytes 
} from '../utils/helpers';
import { 
  encryptMessage, 
  decryptMessage, 
  sha256,
  generateSecureRandom 
} from '../crypto/mtproto-crypto';

export class MTProtoProtocol {
  private session: MTProtoSession;
  private authKey: Uint8Array | null = null;

  constructor(dcId: number = 1, authKey?: Uint8Array) {
    this.session = {
      authKey: authKey || null,
      serverSalt: 0n,
      sessionId: generateSessionId(),
      seqno: 0,
      messageId: 0n,
      dcId
    };
    this.authKey = authKey || null;
  }

  /**
   * Create an unencrypted message (used for auth key generation)
   */
  createUnencryptedMessage(data: Uint8Array): Uint8Array {
    const messageId = generateMessageId();
    const messageLength = data.length;

    return concatBytes(
      new Uint8Array(8), // auth_key_id = 0 for unencrypted
      bigIntToBytes(messageId, 8),
      int32ToBytes(messageLength),
      data
    );
  }

  /**
   * Create an encrypted message
   */
  createEncryptedMessage(data: Uint8Array, contentRelated: boolean = true): Uint8Array {
    if (!this.authKey) {
      throw new Error('Auth key required for encrypted messages');
    }

    const messageId = generateMessageId();
    this.session.messageId = messageId;

    if (contentRelated) {
      this.session.seqno += 2;
    }

    // Create inner message
    const innerMessage = concatBytes(
      bigIntToBytes(this.session.serverSalt, 8),
      bigIntToBytes(this.session.sessionId, 8),
      bigIntToBytes(messageId, 8),
      int32ToBytes(this.session.seqno),
      int32ToBytes(data.length),
      data
    );

    // Add padding
    const paddingLength = (16 - (innerMessage.length % 16)) % 16;
    if (paddingLength > 0) {
      const padding = generateSecureRandom(paddingLength);
      const paddedMessage = concatBytes(innerMessage, padding);
      return this.encryptWithAuthKey(paddedMessage);
    }

    return this.encryptWithAuthKey(innerMessage);
  }

  /**
   * Decrypt received message
   */
  decryptMessage(encryptedData: Uint8Array): MTProtoMessage {
    if (!this.authKey) {
      throw new Error('Auth key required for decryption');
    }

    // Extract auth key ID and message key
    const authKeyId = encryptedData.slice(0, 8);
    const msgKey = encryptedData.slice(8, 24);
    const encrypted = encryptedData.slice(24);

    // Verify auth key ID
    const expectedKeyId = this.getAuthKeyId();
    if (!this.compareBytes(authKeyId, expectedKeyId)) {
      throw new Error('Invalid auth key ID');
    }

    // Decrypt message
    const decrypted = decryptMessage(encrypted, msgKey, this.authKey);

    // Parse inner message
    const serverSalt = bytesToBigInt(decrypted.slice(0, 8));
    const sessionId = bytesToBigInt(decrypted.slice(8, 16));
    const messageId = bytesToBigInt(decrypted.slice(16, 24));
    const seqno = bytesToInt32(decrypted, 24);
    const length = bytesToInt32(decrypted, 28);
    const body = decrypted.slice(32, 32 + length);

    // Verify session
    if (sessionId !== this.session.sessionId) {
      throw new Error('Invalid session ID');
    }

    return {
      messageId,
      seqno,
      body
    };
  }

  /**
   * Parse MTProto error from response
   */
  parseError(data: Uint8Array): MTProtoError {
    // Parse RPC error structure
    const constructor = bytesToInt32(data, 0);
    
    if (constructor === 0x2144ca19) { // rpc_error
      const errorCode = bytesToInt32(data, 4);
      const messageLength = bytesToInt32(data, 8);
      const messageBytes = data.slice(12, 12 + messageLength);
      const message = new TextDecoder().decode(messageBytes);
      
      return {
        code: errorCode,
        message,
        type: this.getErrorType(errorCode)
      };
    }

    throw new Error('Invalid error format');
  }

  /**
   * Generate auth key (simplified DH exchange)
   */
  async generateAuthKey(): Promise<AuthKeyData> {
    // This is a simplified version - in practice, this would involve
    // a full Diffie-Hellman key exchange with the server
    
    const authKey = generateSecureRandom(256); // 2048-bit key
    const keyId = this.calculateAuthKeyId(authKey);
    const serverSalt = bytesToBigInt(generateSecureRandom(8));

    this.authKey = authKey;
    this.session.authKey = authKey;
    this.session.serverSalt = serverSalt;

    return {
      key: authKey,
      keyId,
      serverSalt
    };
  }

  /**
   * Set auth key
   */
  setAuthKey(authKey: Uint8Array, serverSalt: bigint): void {
    this.authKey = authKey;
    this.session.authKey = authKey;
    this.session.serverSalt = serverSalt;
  }

  /**
   * Get current session state
   */
  getSession(): MTProtoSession {
    return { ...this.session };
  }

  /**
   * Update session parameters
   */
  updateSession(updates: Partial<MTProtoSession>): void {
    this.session = { ...this.session, ...updates };
  }

  private encryptWithAuthKey(data: Uint8Array): Uint8Array {
    if (!this.authKey) {
      throw new Error('Auth key not available');
    }

    const { encrypted, msgKey } = encryptMessage(data, this.authKey);
    const authKeyId = this.getAuthKeyId();

    return concatBytes(authKeyId, msgKey, encrypted);
  }

  private getAuthKeyId(): Uint8Array {
    if (!this.authKey) {
      throw new Error('Auth key not available');
    }
    const keyId = this.calculateAuthKeyId(this.authKey);
    return bigIntToBytes(keyId, 8);
  }

  private calculateAuthKeyId(authKey: Uint8Array): bigint {
    const hash = sha256(authKey);
    return bytesToBigInt(hash.slice(-8));
  }

  private compareBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private getErrorType(code: number): string {
    if (code >= 400 && code < 500) return 'CLIENT_ERROR';
    if (code >= 500 && code < 600) return 'SERVER_ERROR';
    if (code === 420) return 'FLOOD_WAIT';
    if (code === 401) return 'UNAUTHORIZED';
    if (code === 403) return 'FORBIDDEN';
    return 'UNKNOWN_ERROR';
  }
}

/**
 * Message factory for common MTProto methods
 */
export class MTProtoMessageFactory {
  /**
   * Create req_pq message for auth key generation
   */
  static createReqPq(nonce: Uint8Array): Uint8Array {
    return concatBytes(
      int32ToBytes(0x60469778), // req_pq constructor
      nonce // 16 bytes
    );
  }

  /**
   * Create req_DH_params message
   */
  static createReqDHParams(
    nonce: Uint8Array,
    serverNonce: Uint8Array,
    p: Uint8Array,
    q: Uint8Array,
    publicKeyFingerprint: bigint,
    encryptedData: Uint8Array
  ): Uint8Array {
    return concatBytes(
      int32ToBytes(0xd712e4be), // req_DH_params constructor
      nonce,
      serverNonce,
      p,
      q,
      bigIntToBytes(publicKeyFingerprint, 8),
      int32ToBytes(encryptedData.length),
      encryptedData
    );
  }

  /**
   * Create set_client_DH_params message
   */
  static createSetClientDHParams(
    nonce: Uint8Array,
    serverNonce: Uint8Array,
    encryptedData: Uint8Array
  ): Uint8Array {
    return concatBytes(
      int32ToBytes(0xf5045f1f), // set_client_DH_params constructor
      nonce,
      serverNonce,
      int32ToBytes(encryptedData.length),
      encryptedData
    );
  }

  /**
   * Create ping message
   */
  static createPing(pingId: bigint): Uint8Array {
    return concatBytes(
      int32ToBytes(0x7abe77ec), // ping constructor
      bigIntToBytes(pingId, 8)
    );
  }

  /**
   * Create msg_ack message
   */
  static createMsgAck(messageIds: bigint[]): Uint8Array {
    const count = messageIds.length;
    const idsData = messageIds.flatMap(id => Array.from(bigIntToBytes(id, 8)));
    
    return concatBytes(
      int32ToBytes(0x62d6b459), // msgs_ack constructor
      int32ToBytes(count),
      new Uint8Array(idsData)
    );
  }

  /**
   * Create get_future_salts message
   */
  static createGetFutureSalts(num: number): Uint8Array {
    return concatBytes(
      int32ToBytes(0xb921bd04), // get_future_salts constructor
      int32ToBytes(num)
    );
  }
}