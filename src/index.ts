/**
 * The Most Advanced Conceivable MTProto Cloudflare Worker
 * 
 * This worker implements a complete MTProto proxy/gateway with:
 * - Full MTProto 2.0 protocol support
 * - Multiple transport protocols (HTTP, WebSocket, TCP-like)
 * - Advanced session management using Durable Objects
 * - Comprehensive rate limiting and DDoS protection
 * - Intelligent caching with KV storage
 * - Real-time analytics and monitoring
 * - Security features and validation
 * - High-performance edge computing optimizations
 */

import { MTProtoEnvironment } from './types';
import { MTProtoHandler } from './handlers/mtproto-handler';
import { SessionManager } from './durable-objects/session-manager';

// Export Durable Object
export { SessionManager };

/**
 * Main worker fetch handler
 */
export default {
  async fetch(request: Request, env: MTProtoEnvironment, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // CORS preflight handling
      if (request.method === 'OPTIONS') {
        return handleCORS();
      }

      // Health check endpoint
      if (path === '/health') {
        return handleHealthCheck(env);
      }

      // Metrics endpoint
      if (path === '/metrics') {
        return handleMetrics(env);
      }

      // API documentation endpoint
      if (path === '/docs' || path === '/') {
        return handleDocs();
      }

      // WebSocket upgrade handling
      if (request.headers.get('Upgrade') === 'websocket') {
        const handler = new MTProtoHandler(env);
        return handler.handleWebSocket(request);
      }

      // Main MTProto API endpoint
      if (path.startsWith('/api/') || path === '/api') {
        const handler = new MTProtoHandler(env);
        return handler.handleRequest(request);
      }

      // File serving for documentation assets
      if (path.startsWith('/static/')) {
        return handleStaticFiles(path);
      }

      // 404 for unknown paths
      return new Response('Not Found', { 
        status: 404,
        headers: { 'Content-Type': 'text/plain' }
      });

    } catch (error) {
      console.error('Worker error:', error);
      
      return new Response(JSON.stringify({
        error: {
          code: 500,
          message: 'Internal Server Error',
          type: 'WORKER_ERROR'
        }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /**
   * Scheduled event handler for maintenance tasks
   */
  async scheduled(event: ScheduledEvent, env: MTProtoEnvironment, ctx: ExecutionContext): Promise<void> {
    console.log('Running scheduled maintenance...');
    
    // Cleanup expired cache entries
    await cleanupCache(env.MTPROTO_CACHE);
    
    // Update analytics
    await updateAnalytics(env.ANALYTICS);
    
    console.log('Scheduled maintenance completed');
  }
};

/**
 * Handle CORS preflight requests
 */
function handleCORS(): Response {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    }
  });
}

/**
 * Health check endpoint
 */
async function handleHealthCheck(env: MTProtoEnvironment): Promise<Response> {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT,
    version: '1.0.0',
    services: {
      kv: 'healthy',
      durableObjects: 'healthy',
      analytics: env.ANALYTICS ? 'healthy' : 'disabled'
    }
  };
  

  try {
    // Test KV storage
    await env.MTPROTO_CACHE.put('health-check', 'ok', { expirationTtl: 60 });
    const kvTest = await env.MTPROTO_CACHE.get('health-check');
    if (kvTest !== 'ok') {
      health.services.kv = 'unhealthy';
      health.status = 'degraded';
    }

    // Test Durable Objects
    const testId = env.SESSION_MANAGER.newUniqueId();
    const stub = env.SESSION_MANAGER.get(testId);

    const doUrl = 'https://session-manager/health';
    const doResponse = await stub.fetch(doUrl);

    if (!doResponse.ok) {
      health.services.durableObjects = 'unhealthy';
      health.status = 'degraded';
    }
  } catch (error) {
    console.error('Health check error:', error);
    health.status = 'unhealthy';
  }

  return new Response(JSON.stringify(health, null, 2), {
    status: health.status === 'healthy' ? 200 : 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Metrics endpoint
 */
async function handleMetrics(env: MTProtoEnvironment): Promise<Response> {
  const metrics = {
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT,
    // Add more metrics as needed
    cache: {
      // You could add KV storage metrics here
    },
    sessions: {
      // You could query session manager for stats
    }
  };

  return new Response(JSON.stringify(metrics, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * API documentation endpoint
 */
function handleDocs(): Response {
  const docs = `
<!DOCTYPE html>
<html>
<head>
    <title>MTProto Cloudflare Worker API</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        h1 { color: #333; }
        h2 { color: #666; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
        code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; }
        pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
        .endpoint { margin: 20px 0; }
        .method { font-weight: bold; color: #007cba; }
    </style>
</head>
<body>
    <h1>The Most Advanced Conceivable MTProto Cloudflare Worker</h1>
    
    <p>A high-performance, edge-deployed MTProto gateway with advanced features including:</p>
    <ul>
        <li>Full MTProto 2.0 protocol support</li>
        <li>Multiple transport protocols (HTTP, WebSocket, TCP-like)</li>
        <li>Advanced session management</li>
        <li>Rate limiting and DDoS protection</li>
        <li>Intelligent caching</li>
        <li>Real-time analytics</li>
    </ul>

    <h2>API Endpoints</h2>

    <div class="endpoint">
        <h3><span class="method">POST</span> /api</h3>
        <p>Main MTProto API endpoint for JSON-based requests.</p>
        <pre><code>{
  "method": "auth.sendCode",
  "params": {
    "phone_number": "+1234567890"
  },
  "sessionId": "optional-session-id",
  "dcId": 1
}</code></pre>
    </div>

    <div class="endpoint">
        <h3><span class="method">WebSocket</span> /api (with Upgrade header)</h3>
        <p>WebSocket endpoint for real-time MTProto communication.</p>
    </div>

    <div class="endpoint">
        <h3><span class="method">GET</span> /health</h3>
        <p>Health check endpoint for monitoring service status.</p>
    </div>

    <div class="endpoint">
        <h3><span class="method">GET</span> /metrics</h3>
        <p>Metrics endpoint for performance monitoring.</p>
    </div>

    <h2>Supported MTProto Methods</h2>
    <ul>
        <li><code>auth.sendCode</code> - Send verification code</li>
        <li><code>auth.signIn</code> - Sign in with phone and code</li>
        <li><code>users.getFullUser</code> - Get user information</li>
        <li><code>messages.getDialogs</code> - Get chat list</li>
        <li><code>messages.getHistory</code> - Get message history</li>
        <li><code>messages.sendMessage</code> - Send a message</li>
        <li><code>updates.getState</code> - Get updates state</li>
        <li><code>ping</code> - Ping the server</li>
    </ul>

    <h2>Rate Limits</h2>
    <p>The API enforces rate limits to prevent abuse:</p>
    <ul>
        <li>100 requests per minute per IP address</li>
        <li>Rate limit headers are included in responses</li>
        <li>Exceeded limits return HTTP 429</li>
    </ul>

    <h2>Error Handling</h2>
    <p>All errors are returned in a consistent format:</p>
    <pre><code>{
  "error": {
    "code": 400,
    "message": "Error description",
    "type": "ERROR_TYPE"
  }
}</code></pre>
</body>
</html>`;

  return new Response(docs, {
    headers: { 'Content-Type': 'text/html' }
  });
}

/**
 * Handle static file requests
 */
function handleStaticFiles(path: string): Response {
  // In a real implementation, you'd serve actual static files
  // For now, return a simple 404
  return new Response('Static file not found', { status: 404 });
}

/**
 * Cleanup expired cache entries
 */
async function cleanupCache(cache: KVNamespace): Promise<void> {
  // In a real implementation, you'd have a way to iterate through keys
  // and clean up expired entries. KV doesn't provide direct iteration,
  // so you'd need to maintain an index of keys with expiration times.
  console.log('Cache cleanup would run here');
}

/**
 * Update analytics
 */
async function updateAnalytics(analytics?: AnalyticsEngineDataset): Promise<void> {
  if (analytics) {
    analytics.writeDataPoint({
      blobs: ['maintenance', 'scheduled'],
      doubles: [Date.now()],
      indexes: ['maintenance']
    });
  }
}

/**
 * Error boundary for unhandled errors
 */
addEventListener('error', (event: ErrorEvent) => {
  console.error('Unhandled error:', event.error);
});

addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  console.error('Unhandled promise rejection:', event.reason);
  event.preventDefault();
});