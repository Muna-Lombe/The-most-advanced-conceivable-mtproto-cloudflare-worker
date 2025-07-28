/**
 * Transport layer for MTProto connections
 * Supports HTTP, WebSocket, and TCP-like protocols
 */

import { TransportConfig, TransportType } from '../types';
import { crc32, validateMessageFormat, retryWithBackoff } from '../utils/helpers';

export abstract class Transport {
  protected config: TransportConfig;
  protected connected: boolean = false;
  protected connectionId: string;

  constructor(config: TransportConfig) {
    this.config = config;
    this.connectionId = crypto.randomUUID();
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(data: Uint8Array): Promise<Uint8Array>;
  abstract isConnected(): boolean;

  getConnectionId(): string {
    return this.connectionId;
  }

  getConfig(): TransportConfig {
    return { ...this.config };
  }
}

/**
 * HTTP Transport for MTProto
 */
export class HTTPTransport extends Transport {
  private abortController: AbortController | null = null;

  constructor(config: TransportConfig) {
    super(config);
    if (config.type !== 'http') {
      throw new Error('Invalid transport type for HTTPTransport');
    }
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.abortController = new AbortController();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async send(data: Uint8Array): Promise<Uint8Array> {
    if (!this.connected) {
      throw new Error('Transport not connected');
    }

    if (!validateMessageFormat(data)) {
      throw new Error('Invalid message format');
    }

    const headers = {
      'Content-Type': 'application/octet-stream',
      'Content-Length': data.length.toString(),
      ...this.config.headers
    };

    const response = await retryWithBackoff(async () => {
      const result = await fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        body: data,
        signal: this.abortController?.signal
      });

      if (!result.ok) {
        throw new Error(`HTTP ${result.status}: ${result.statusText}`);
      }

      return result;
    }, 3, 1000);

    const responseData = await response.arrayBuffer();
    return new Uint8Array(responseData);
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * WebSocket Transport for MTProto
 */
export class WebSocketTransport extends Transport {
  private websocket: WebSocket | null = null;
  private messageQueue: Array<{ resolve: (data: Uint8Array) => void; reject: (error: Error) => void }> = [];
  private pingInterval: number | null = null;

  constructor(config: TransportConfig) {
    super(config);
    if (config.type !== 'websocket') {
      throw new Error('Invalid transport type for WebSocketTransport');
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.websocket = new WebSocket(this.config.endpoint);
        this.websocket.binaryType = 'arraybuffer';

        this.websocket.onopen = () => {
          this.connected = true;
          this.startPing();
          resolve();
        };

        this.websocket.onerror = (error) => {
          this.connected = false;
          reject(new Error(`WebSocket connection failed: ${error}`));
        };

        this.websocket.onclose = () => {
          this.connected = false;
          this.stopPing();
        };

        this.websocket.onmessage = (event) => {
          const data = new Uint8Array(event.data as ArrayBuffer);
          this.handleMessage(data);
        };

        // Connection timeout
        setTimeout(() => {
          if (!this.connected) {
            reject(new Error('WebSocket connection timeout'));
          }
        }, this.config.timeout || 10000);
      } catch (error) {
        reject(error as Error);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.stopPing();
    
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }

    // Reject any pending messages
    this.messageQueue.forEach(({ reject }) => {
      reject(new Error('Connection closed'));
    });
    this.messageQueue = [];
  }

  async send(data: Uint8Array): Promise<Uint8Array> {
    if (!this.connected || !this.websocket) {
      throw new Error('WebSocket not connected');
    }

    if (!validateMessageFormat(data)) {
      throw new Error('Invalid message format');
    }

    return new Promise((resolve, reject) => {
      this.messageQueue.push({ resolve, reject });
      
      try {
        this.websocket!.send(data);
      } catch (error) {
        this.messageQueue.pop(); // Remove the added promise
        reject(error as Error);
      }

      // Timeout for response
      setTimeout(() => {
        const index = this.messageQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.messageQueue.splice(index, 1);
          reject(new Error('Message timeout'));
        }
      }, this.config.timeout || 30000);
    });
  }

  isConnected(): boolean {
    return this.connected && this.websocket?.readyState === WebSocket.OPEN;
  }

  private handleMessage(data: Uint8Array): void {
    const pending = this.messageQueue.shift();
    if (pending) {
      pending.resolve(data);
    }
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.websocket && this.connected) {
        // Send ping frame
        this.websocket.send(new Uint8Array([0x89, 0x00])); // WebSocket ping
      }
    }, 30000) as unknown as number; // Every 30 seconds
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

/**
 * TCP-like Transport (HTTP with intermediate format)
 */
export class TCPTransport extends Transport {
  private sequenceNumber: number = 0;

  constructor(config: TransportConfig) {
    super(config);
    if (config.type !== 'tcp') {
      throw new Error('Invalid transport type for TCPTransport');
    }
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.sequenceNumber = 0;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async send(data: Uint8Array): Promise<Uint8Array> {
    if (!this.connected) {
      throw new Error('TCP transport not connected');
    }

    if (!validateMessageFormat(data)) {
      throw new Error('Invalid message format');
    }

    // Add TCP intermediate format
    const packet = this.createTCPPacket(data);
    
    const headers = {
      'Content-Type': 'application/octet-stream',
      'X-Transport-Type': 'tcp-intermediate',
      'X-Sequence': this.sequenceNumber.toString(),
      ...this.config.headers
    };

    const response = await retryWithBackoff(async () => {
      const result = await fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        body: packet
      });

      if (!result.ok) {
        throw new Error(`TCP HTTP ${result.status}: ${result.statusText}`);
      }

      return result;
    }, 3, 1000);

    this.sequenceNumber++;
    
    const responseData = await response.arrayBuffer();
    const responsePacket = new Uint8Array(responseData);
    
    return this.parseTCPPacket(responsePacket);
  }

  isConnected(): boolean {
    return this.connected;
  }

  private createTCPPacket(data: Uint8Array): Uint8Array {
    // TCP intermediate format: length (4 bytes) + data + crc32 (4 bytes)
    const length = data.length;
    const lengthBytes = new Uint8Array(4);
    lengthBytes[0] = length & 0xFF;
    lengthBytes[1] = (length >> 8) & 0xFF;
    lengthBytes[2] = (length >> 16) & 0xFF;
    lengthBytes[3] = (length >> 24) & 0xFF;

    const packet = new Uint8Array(length + 8);
    packet.set(lengthBytes, 0);
    packet.set(data, 4);

    // Calculate CRC32
    const dataWithLength = packet.slice(0, length + 4);
    const crc = crc32(dataWithLength);
    
    packet[length + 4] = crc & 0xFF;
    packet[length + 5] = (crc >> 8) & 0xFF;
    packet[length + 6] = (crc >> 16) & 0xFF;
    packet[length + 7] = (crc >> 24) & 0xFF;

    return packet;
  }

  private parseTCPPacket(packet: Uint8Array): Uint8Array {
    if (packet.length < 8) {
      throw new Error('Invalid TCP packet: too short');
    }

    const length = (packet[0] ?? 0) | ((packet[1] ?? 0) << 8) | ((packet[2] ?? 0) << 16) | ((packet[3] ?? 0) << 24);
    
    if (packet.length !== length + 8) {
      throw new Error('Invalid TCP packet: length mismatch');
    }

    const data = packet.slice(4, 4 + length);
    const receivedCrc = (packet[length + 4] ?? 0) | ((packet[length + 5] ?? 0) << 8) | 
                       ((packet[length + 6] ?? 0) << 16) | ((packet[length + 7] ?? 0) << 24);

    // Verify CRC32
    const calculatedCrc = crc32(packet.slice(0, length + 4));
    if (receivedCrc !== calculatedCrc) {
      throw new Error('Invalid TCP packet: CRC mismatch');
    }

    return data;
  }
}

/**
 * Transport factory
 */
export class TransportFactory {
  static create(config: TransportConfig): Transport {
    switch (config.type) {
      case 'http':
        return new HTTPTransport(config);
      case 'websocket':
        return new WebSocketTransport(config);
      case 'tcp':
        return new TCPTransport(config);
      default:
        throw new Error(`Unsupported transport type: ${config.type}`);
    }
  }

  static getDefaultConfig(type: TransportType, dcId: number = 1): TransportConfig {
    const baseUrl = this.getDCEndpoint(dcId);
    
    switch (type) {
      case 'http':
        return {
          type: 'http',
          endpoint: `${baseUrl}/api`,
          headers: {
            'User-Agent': 'MTProto-CloudflareWorker/1.0'
          },
          timeout: 30000
        };
      case 'websocket':
        return {
          type: 'websocket',
          endpoint: `${baseUrl.replace('https:', 'wss:').replace('http:', 'ws:')}/ws`,
          timeout: 10000
        };
      case 'tcp':
        return {
          type: 'tcp',
          endpoint: `${baseUrl}/tcp`,
          headers: {
            'User-Agent': 'MTProto-CloudflareWorker/1.0'
          },
          timeout: 30000
        };
      default:
        throw new Error(`Unsupported transport type: ${type}`);
    }
  }

  private static getDCEndpoint(dcId: number): string {
    // Telegram data center endpoints (production)
    const datacenters: Record<number, string> = {
      1: 'https://149.154.175.50',
      2: 'https://149.154.167.51',
      3: 'https://149.154.175.100',
      4: 'https://149.154.167.91',
      5: 'https://91.108.56.130'
    };

    return datacenters[dcId] || datacenters[1]!;
  }
}