/**
 * Durable Object for managing MTProto sessions
 * Provides persistent session state across requests
 */

import { SessionState, RateLimitInfo, MTProtoEnvironment } from '../types';
import { generateSessionId, bytesToHex, hexToBytes } from '../utils/helpers';

export class SessionManager implements DurableObject {
  private state: DurableObjectState;
  private env: MTProtoEnvironment;
  private sessions: Map<string, SessionState> = new Map();
  private rateLimitWindows: Map<string, Map<string, number[]>> = new Map();

  constructor(state: DurableObjectState, env: MTProtoEnvironment) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      // Route requests
      switch (path) {
        case '/session/create':
          return this.handleCreateSession(request);
        case '/session/get':
          return this.handleGetSession(request);
        case '/session/update':
          return this.handleUpdateSession(request);
        case '/session/delete':
          return this.handleDeleteSession(request);
        case '/ratelimit/check':
          return this.handleRateLimitCheck(request);
        case '/ratelimit/update':
          return this.handleRateLimitUpdate(request);
        case '/health':
          return this.handleHealth();
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('SessionManager error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  private async handleCreateSession(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const data = await request.json() as {
      dcId: number;
      userId?: number;
    };

    const sessionId = generateSessionId().toString();
    const session: SessionState = {
      authKey: null,
      serverSalt: '0',
      sessionId,
      seqno: 0,
      lastMessageId: '0',
      dcId: data.dcId,
      userId: data.userId || null,
      rateLimits: {}
    };

    this.sessions.set(sessionId, session);
    await this.state.storage.put(`session:${sessionId}`, session);

    return new Response(JSON.stringify({ sessionId, session }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleGetSession(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      return new Response('Missing sessionId parameter', { status: 400 });
    }

    let session = this.sessions.get(sessionId);
    if (!session) {
      session = await this.state.storage.get(`session:${sessionId}`) as SessionState;
      if (session) {
        this.sessions.set(sessionId, session);
      }
    }

    if (!session) {
      return new Response('Session not found', { status: 404 });
    }

    return new Response(JSON.stringify(session), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleUpdateSession(request: Request): Promise<Response> {
    if (request.method !== 'PUT') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const data = await request.json() as {
      sessionId: string;
      updates: Partial<SessionState>;
    };

    let session = this.sessions.get(data.sessionId);
    if (!session) {
      session = await this.state.storage.get(`session:${data.sessionId}`) as SessionState;
    }

    if (!session) {
      return new Response('Session not found', { status: 404 });
    }

    // Update session with provided fields
    const updatedSession = { ...session, ...data.updates };
    this.sessions.set(data.sessionId, updatedSession);
    await this.state.storage.put(`session:${data.sessionId}`, updatedSession);

    return new Response(JSON.stringify(updatedSession), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleDeleteSession(request: Request): Promise<Response> {
    if (request.method !== 'DELETE') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      return new Response('Missing sessionId parameter', { status: 400 });
    }

    this.sessions.delete(sessionId);
    await this.state.storage.delete(`session:${sessionId}`);

    return new Response('Session deleted', { status: 200 });
  }

  private async handleRateLimitCheck(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const data = await request.json() as {
      identifier: string; // IP, user ID, etc.
      action: string;     // Type of action being rate limited
      limit: number;      // Requests per window
      windowMs: number;   // Window size in milliseconds
    };

    const now = Date.now();
    const windowStart = Math.floor(now / data.windowMs) * data.windowMs;
    
    // Get or create rate limit window for this identifier
    if (!this.rateLimitWindows.has(data.identifier)) {
      this.rateLimitWindows.set(data.identifier, new Map());
    }
    
    const userWindows = this.rateLimitWindows.get(data.identifier)!;
    const actionKey = `${data.action}:${windowStart}`;
    
    if (!userWindows.has(actionKey)) {
      userWindows.set(actionKey, []);
    }
    
    const requests = userWindows.get(actionKey)!;
    
    // Clean old requests (outside current window)
    const validRequests = requests.filter(timestamp => timestamp >= windowStart);
    userWindows.set(actionKey, validRequests);
    
    const rateLimitInfo: RateLimitInfo = {
      requests: validRequests.length,
      resetTime: windowStart + data.windowMs,
      limit: data.limit
    };

    const allowed = validRequests.length < data.limit;

    return new Response(JSON.stringify({ allowed, rateLimitInfo }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleRateLimitUpdate(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const data = await request.json() as {
      identifier: string;
      action: string;
      windowMs: number;
    };

    const now = Date.now();
    const windowStart = Math.floor(now / data.windowMs) * data.windowMs;
    
    // Add request to rate limit tracking
    if (!this.rateLimitWindows.has(data.identifier)) {
      this.rateLimitWindows.set(data.identifier, new Map());
    }
    
    const userWindows = this.rateLimitWindows.get(data.identifier)!;
    const actionKey = `${data.action}:${windowStart}`;
    
    if (!userWindows.has(actionKey)) {
      userWindows.set(actionKey, []);
    }
    
    const requests = userWindows.get(actionKey)!;
    requests.push(now);

    return new Response('Rate limit updated', { status: 200 });
  }

  private async handleHealth(): Promise<Response> {
    const stats = {
      activeSessions: this.sessions.size,
      rateLimitEntries: this.rateLimitWindows.size,
      timestamp: Date.now(),
      environment: this.env.ENVIRONMENT
    };

    return new Response(JSON.stringify(stats), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Cleanup old sessions and rate limit data
  async alarm(): Promise<void> {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    // Clean up expired sessions
    for (const [sessionId, session] of this.sessions.entries()) {
      // Check if session has been inactive (you'd need to track last activity)
      // For now, just clean based on creation time if you stored it
      // This is a simplified cleanup
    }

    // Clean up old rate limit windows
    for (const [identifier, windows] of this.rateLimitWindows.entries()) {
      const activeWindows = new Map<string, number[]>();
      
      for (const [actionKey, requests] of windows.entries()) {
        const activeRequests = requests.filter(timestamp => now - timestamp < maxAge);
        if (activeRequests.length > 0) {
          activeWindows.set(actionKey, activeRequests);
        }
      }
      
      if (activeWindows.size > 0) {
        this.rateLimitWindows.set(identifier, activeWindows);
      } else {
        this.rateLimitWindows.delete(identifier);
      }
    }

    // Schedule next cleanup
    await this.state.storage.setAlarm(now + 60 * 60 * 1000); // Every hour
  }
}

/**
 * Helper class for interacting with SessionManager from the main worker
 */
export class SessionManagerClient {
  private sessionManager: DurableObjectNamespace;
  private stubCache: Map<string, DurableObjectStub> = new Map();

  constructor(sessionManager: DurableObjectNamespace) {
    this.sessionManager = sessionManager;
  }

  private getStub(sessionId?: string): DurableObjectStub {
    const id = sessionId ? 
      this.sessionManager.idFromString(sessionId) : 
      this.sessionManager.newUniqueId();
    
    const key = id.toString();
    
    if (!this.stubCache.has(key)) {
      this.stubCache.set(key, this.sessionManager.get(id));
    }
    
    return this.stubCache.get(key)!;
  }

  async createSession(dcId: number, userId?: number): Promise<{ sessionId: string; session: SessionState }> {
    const stub = this.getStub();
    const response = await stub.fetch('/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dcId, userId })
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

    return response.json() as Promise<{ sessionId: string; session: SessionState }>;
  }

  async getSession(sessionId: string): Promise<SessionState> {
    const stub = this.getStub(sessionId);
    const response = await stub.fetch(`/session/get?sessionId=${sessionId}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Session not found');
      }
      throw new Error(`Failed to get session: ${response.statusText}`);
    }

    return response.json() as Promise<SessionState>;
  }

  async updateSession(sessionId: string, updates: Partial<SessionState>): Promise<SessionState> {
    const stub = this.getStub(sessionId);
    const response = await stub.fetch('/session/update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, updates })
    });

    if (!response.ok) {
      throw new Error(`Failed to update session: ${response.statusText}`);
    }

    return response.json() as Promise<SessionState>;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const stub = this.getStub(sessionId);
    const response = await stub.fetch(`/session/delete?sessionId=${sessionId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Failed to delete session: ${response.statusText}`);
    }
  }

  async checkRateLimit(
    identifier: string,
    action: string,
    limit: number,
    windowMs: number = 60000
  ): Promise<{ allowed: boolean; rateLimitInfo: RateLimitInfo }> {
    const stub = this.getStub();
    const response = await stub.fetch('/ratelimit/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, action, limit, windowMs })
    });

    if (!response.ok) {
      throw new Error(`Failed to check rate limit: ${response.statusText}`);
    }

    return response.json() as Promise<{ allowed: boolean; rateLimitInfo: RateLimitInfo }>;
  }

  async updateRateLimit(identifier: string, action: string, windowMs: number = 60000): Promise<void> {
    const stub = this.getStub();
    const response = await stub.fetch('/ratelimit/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, action, windowMs })
    });

    if (!response.ok) {
      throw new Error(`Failed to update rate limit: ${response.statusText}`);
    }
  }
}