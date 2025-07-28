/**
 * Request handlers for the MTProto Cloudflare Worker
 */

import { 
  MTProtoEnvironment, 
  MTProtoRequest, 
  MTProtoResponse, 
  TransportType,
  CacheEntry
} from '../types';
import { MTProtoProtocol } from '../protocol/mtproto';
import { TransportFactory } from '../transport/transport';
import { SessionManagerClient } from '../durable-objects/session-manager';
import { hexToBytes, bytesToHex, delay } from '../utils/helpers';

export class MTProtoHandler {
  private env: MTProtoEnvironment;
  private sessionManager: SessionManagerClient;
  private cache: KVNamespace;

  constructor(env: MTProtoEnvironment) {
    this.env = env;
    this.sessionManager = new SessionManagerClient(env.SESSION_MANAGER);
    this.cache = env.MTPROTO_CACHE;
  }

  /**
   * Handle MTProto API requests
   */
  async handleRequest(request: Request): Promise<Response> {
    try {
      const startTime = Date.now();
      
      // Extract client information for rate limiting
      const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
      const userAgent = request.headers.get('User-Agent') || 'unknown';
      
      // Check rate limits
      const rateLimitCheck = await this.sessionManager.checkRateLimit(
        clientIP, 
        'api_request', 
        100, // 100 requests per minute
        60000
      );

      if (!rateLimitCheck.allowed) {
        return new Response(JSON.stringify({
          error: {
            code: 429,
            message: 'Rate limit exceeded',
            type: 'RATE_LIMIT_EXCEEDED'
          }
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': rateLimitCheck.rateLimitInfo.limit.toString(),
            'X-RateLimit-Remaining': (rateLimitCheck.rateLimitInfo.limit - rateLimitCheck.rateLimitInfo.requests).toString(),
            'X-RateLimit-Reset': rateLimitCheck.rateLimitInfo.resetTime.toString()
          }
        });
      }

      // Update rate limit counter
      await this.sessionManager.updateRateLimit(clientIP, 'api_request');

      // Parse request
      const mtprotoRequest = await this.parseRequest(request);
      
      // Process the request
      const response = await this.processRequest(mtprotoRequest, clientIP);
      
      // Add analytics
      this.recordAnalytics(request, response, Date.now() - startTime);
      
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'X-Response-Time': `${Date.now() - startTime}ms`
        }
      });

    } catch (error) {
      console.error('Request handling error:', error);
      
      return new Response(JSON.stringify({
        error: {
          code: 500,
          message: 'Internal server error',
          type: 'INTERNAL_ERROR'
        }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Handle WebSocket connections
   */
  async handleWebSocket(request: Request): Promise<Response> {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair) as [WebSocket, WebSocket];

    // Accept the WebSocket connection
    server.accept();

    // Handle WebSocket messages
    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string) as MTProtoRequest;
        const response = await this.processRequest(data, 'websocket');
        server.send(JSON.stringify(response));
      } catch (error) {
        console.error('WebSocket message error:', error);
        server.send(JSON.stringify({
          error: {
            code: 400,
            message: 'Invalid message format',
            type: 'INVALID_MESSAGE'
          }
        }));
      }
    });

    server.addEventListener('close', () => {
      console.log('WebSocket connection closed');
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  /**
   * Process MTProto request
   */
  private async processRequest(mtprotoRequest: MTProtoRequest, clientIdentifier: string): Promise<MTProtoResponse> {
    const { method, params, sessionId, dcId } = mtprotoRequest;

    // Get or create session
    let session;
    if (sessionId) {
      try {
        session = await this.sessionManager.getSession(sessionId);
      } catch (error) {
        throw new Error('Invalid session ID');
      }
    } else {
      const newSession = await this.sessionManager.createSession(dcId || 1);
      session = newSession.session;
    }

    // Check method-specific cache
    const cacheKey = this.getCacheKey(method, params);
    if (this.isCacheable(method)) {
      const cached = await this.getFromCache<MTProtoResponse>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      // Initialize protocol handler
      const protocol = new MTProtoProtocol(session.dcId);
      if (session.authKey) {
        protocol.setAuthKey(hexToBytes(session.authKey), BigInt(session.serverSalt));
      }

      // Route method to appropriate handler
      const result = await this.routeMethod(method, params, protocol, session);

      // Update session if changed
      const updatedSession = protocol.getSession();
      if (this.sessionChanged(session, updatedSession)) {
        await this.sessionManager.updateSession(session.sessionId, {
          authKey: updatedSession.authKey ? bytesToHex(updatedSession.authKey) : null,
          serverSalt: updatedSession.serverSalt.toString(),
          seqno: updatedSession.seqno,
          lastMessageId: updatedSession.messageId.toString()
        });
      }

      const response: MTProtoResponse = {
        result,
        sessionId: session.sessionId,
        messageId: updatedSession.messageId.toString()
      };

      // Cache if appropriate
      if (this.isCacheable(method)) {
        await this.setCache(cacheKey, response, this.getCacheTTL(method));
      }

      return response;

    } catch (error) {
      console.error(`Method ${method} error:`, error);
      
      return {
        error: {
          code: 400,
          message: (error as Error).message,
          type: 'METHOD_ERROR'
        },
        sessionId: session.sessionId,
        messageId: '0'
      };
    }
  }

  /**
   * Route method calls to appropriate handlers
   */
  private async routeMethod(
    method: string, 
    params: Record<string, unknown>, 
    protocol: MTProtoProtocol,
    session: any
  ): Promise<unknown> {
    switch (method) {
      case 'auth.sendCode':
        return this.handleSendCode(params, protocol);
      
      case 'auth.signIn':
        return this.handleSignIn(params, protocol);
      
      case 'users.getFullUser':
        return this.handleGetFullUser(params, protocol);
      
      case 'messages.getDialogs':
        return this.handleGetDialogs(params, protocol);
      
      case 'messages.getHistory':
        return this.handleGetHistory(params, protocol);
      
      case 'messages.sendMessage':
        return this.handleSendMessage(params, protocol);
      
      case 'updates.getState':
        return this.handleGetState(params, protocol);
      
      case 'ping':
        return this.handlePing(params, protocol);
      
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  // Method handlers (simplified implementations)
  private async handleSendCode(params: Record<string, unknown>, protocol: MTProtoProtocol): Promise<unknown> {
    const phoneNumber = params.phone_number as string;
    
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    // Simulate sending code
    await delay(100); // Simulate network delay
    
    return {
      _: 'auth.sentCode',
      phone_code_hash: crypto.randomUUID(),
      type: {
        _: 'auth.sentCodeTypeSms',
        length: 5
      }
    };
  }

  private async handleSignIn(params: Record<string, unknown>, protocol: MTProtoProtocol): Promise<unknown> {
    const phoneNumber = params.phone_number as string;
    const phoneCode = params.phone_code as string;
    const phoneCodeHash = params.phone_code_hash as string;

    if (!phoneNumber || !phoneCode || !phoneCodeHash) {
      throw new Error('Missing required parameters');
    }

    // Simulate authentication
    await delay(150);
    
    return {
      _: 'auth.authorization',
      user: {
        _: 'user',
        id: 123456,
        is_self: true,
        phone: phoneNumber,
        first_name: 'Test',
        last_name: 'User'
      }
    };
  }

  private async handleGetFullUser(params: Record<string, unknown>, protocol: MTProtoProtocol): Promise<unknown> {
    const userId = params.id as number;
    
    if (!userId) {
      throw new Error('User ID is required');
    }

    await delay(50);
    
    return {
      _: 'users.userFull',
      full_user: {
        _: 'userFull',
        id: userId,
        about: 'Test user profile',
        common_chats_count: 0
      },
      users: [{
        _: 'user',
        id: userId,
        first_name: 'Test',
        last_name: 'User'
      }]
    };
  }

  private async handleGetDialogs(params: Record<string, unknown>, protocol: MTProtoProtocol): Promise<unknown> {
    await delay(100);
    
    return {
      _: 'messages.dialogs',
      dialogs: [],
      messages: [],
      chats: [],
      users: []
    };
  }

  private async handleGetHistory(params: Record<string, unknown>, protocol: MTProtoProtocol): Promise<unknown> {
    await delay(75);
    
    return {
      _: 'messages.messages',
      messages: [],
      chats: [],
      users: []
    };
  }

  private async handleSendMessage(params: Record<string, unknown>, protocol: MTProtoProtocol): Promise<unknown> {
    const peer = params.peer;
    const message = params.message as string;
    
    if (!peer || !message) {
      throw new Error('Peer and message are required');
    }

    await delay(200);
    
    return {
      _: 'updates',
      updates: [{
        _: 'updateNewMessage',
        message: {
          _: 'message',
          id: Math.floor(Math.random() * 1000000),
          message: message,
          date: Math.floor(Date.now() / 1000)
        }
      }],
      users: [],
      chats: [],
      date: Math.floor(Date.now() / 1000),
      seq: 1
    };
  }

  private async handleGetState(params: Record<string, unknown>, protocol: MTProtoProtocol): Promise<unknown> {
    await delay(25);
    
    return {
      _: 'updates.state',
      pts: 1,
      qts: 0,
      date: Math.floor(Date.now() / 1000),
      seq: 0,
      unread_count: 0
    };
  }

  private async handlePing(params: Record<string, unknown>, protocol: MTProtoProtocol): Promise<unknown> {
    const pingId = params.ping_id as string;
    
    return {
      _: 'pong',
      ping_id: pingId,
      msg_id: protocol.getSession().messageId.toString()
    };
  }

  // Utility methods
  private async parseRequest(request: Request): Promise<MTProtoRequest> {
    const contentType = request.headers.get('Content-Type') || '';
    
    if (contentType.includes('application/json')) {
      return request.json() as Promise<MTProtoRequest>;
    } else if (contentType.includes('application/octet-stream')) {
      // Handle binary MTProto format
      const buffer = await request.arrayBuffer();
      // This would need actual MTProto deserialization
      throw new Error('Binary MTProto not implemented yet');
    } else {
      throw new Error('Unsupported content type');
    }
  }

  private getCacheKey(method: string, params: Record<string, unknown>): string {
    const paramStr = JSON.stringify(params, Object.keys(params).sort());
    return `mtproto:${method}:${btoa(paramStr)}`;
  }

  private isCacheable(method: string): boolean {
    const cacheableMethods = [
      'users.getFullUser',
      'messages.getDialogs',
      'updates.getState'
    ];
    return cacheableMethods.includes(method);
  }

  private getCacheTTL(method: string): number {
    const ttls: Record<string, number> = {
      'users.getFullUser': 300,    // 5 minutes
      'messages.getDialogs': 60,   // 1 minute
      'updates.getState': 30       // 30 seconds
    };
    return ttls[method] || 60;
  }

  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.cache.get(key, { type: 'json' }) as CacheEntry<T> | null;
      if (cached && cached.expiry > Date.now()) {
        return cached.data;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async setCache<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      expiry: Date.now() + (ttlSeconds * 1000),
      version: '1.0'
    };
    
    await this.cache.put(key, JSON.stringify(entry), {
      expirationTtl: ttlSeconds
    });
  }

  private sessionChanged(oldSession: any, newSession: any): boolean {
    return (
      oldSession.seqno !== newSession.seqno ||
      oldSession.lastMessageId !== newSession.messageId.toString() ||
      oldSession.serverSalt !== newSession.serverSalt.toString()
    );
  }

  private recordAnalytics(request: Request, response: MTProtoResponse, responseTime: number): void {
    if (this.env.ANALYTICS) {
      this.env.ANALYTICS.writeDataPoint({
        blobs: [
          request.headers.get('CF-Connecting-IP') || 'unknown',
          request.headers.get('User-Agent') || 'unknown',
          response.error ? 'error' : 'success'
        ],
        doubles: [responseTime],
        indexes: [response.error ? response.error.code.toString() : '200']
      });
    }
  }
}