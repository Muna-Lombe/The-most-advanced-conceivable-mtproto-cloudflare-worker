/**
 * Jest setup for crypto globals
 */

// Mock crypto.getRandomValues for Node.js environment
import { webcrypto } from 'crypto';

// @ts-ignore
global.crypto = webcrypto;

// Mock WebSocketPair for testing
// @ts-ignore
global.WebSocketPair = class WebSocketPair {
  constructor() {
    return [new MockWebSocket(), new MockWebSocket()];
  }
};

class MockWebSocket {
  readyState = 1; // OPEN
  
  accept() {}
  send(data: string) {}
  close() {}
  addEventListener(type: string, listener: () => void) {}
}

export {};