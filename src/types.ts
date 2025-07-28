// Type definitions for MTProto protocol
export interface MTProtoEnvironment {
  MTPROTO_CACHE: KVNamespace;
  SESSION_MANAGER: DurableObjectNamespace;
  ANALYTICS: AnalyticsEngineDataset;
  API_ID: string;
  API_HASH: string;
  ENVIRONMENT: string;
}

export interface MTProtoMessage {
  messageId: bigint;
  seqno: number;
  body: Uint8Array;
}

export interface MTProtoSession {
  authKey: Uint8Array | null;
  serverSalt: bigint;
  sessionId: bigint;
  seqno: number;
  messageId: bigint;
  dcId: number;
}

export interface DataCenter {
  id: number;
  ip: string;
  port: number;
  mediaOnly: boolean;
  ipv6: string;
  secret: string;
}

export interface AuthKeyData {
  key: Uint8Array;
  keyId: bigint;
  serverSalt: bigint;
}

export interface MTProtoError {
  code: number;
  message: string;
  type: string;
}

export interface RateLimitInfo {
  requests: number;
  resetTime: number;
  limit: number;
}

export interface CacheEntry<T = unknown> {
  data: T;
  expiry: number;
  version: string;
}

export interface SessionState {
  authKey: string | null;
  serverSalt: string;
  sessionId: string;
  seqno: number;
  lastMessageId: string;
  dcId: number;
  userId: number | null;
  rateLimits: Record<string, RateLimitInfo>;
}

export type TransportType = 'http' | 'websocket' | 'tcp';

export interface TransportConfig {
  type: TransportType;
  endpoint: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface MTProtoConfig {
  apiId: string;
  apiHash: string;
  dcId: number;
  transport: TransportConfig;
  useTestServers?: boolean;
  connectionRetries?: number;
  floodWaitThreshold?: number;
}

// Request/Response interfaces
export interface MTProtoRequest {
  method: string;
  params: Record<string, unknown>;
  sessionId?: string;
  dcId?: number;
}

export interface MTProtoResponse {
  result?: unknown;
  error?: MTProtoError;
  sessionId: string;
  messageId: string;
}