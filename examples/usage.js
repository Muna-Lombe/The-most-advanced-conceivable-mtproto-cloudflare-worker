/**
 * Example usage of the MTProto Cloudflare Worker
 */

// Example 1: Basic HTTP API usage
async function sendCodeExample() {
  const response = await fetch('https://your-worker.your-subdomain.workers.dev/api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      method: 'auth.sendCode',
      params: {
        phone_number: '+1234567890'
      }
    })
  });

  const result = await response.json();
  console.log('Send code result:', result);
  
  return result;
}

// Example 2: WebSocket real-time communication
function websocketExample() {
  const ws = new WebSocket('wss://your-worker.your-subdomain.workers.dev/api');

  ws.onopen = () => {
    console.log('WebSocket connected');
    
    // Send ping
    ws.send(JSON.stringify({
      method: 'ping',
      params: { ping_id: Date.now().toString() }
    }));
  };

  ws.onmessage = (event) => {
    const response = JSON.parse(event.data);
    console.log('WebSocket response:', response);
    
    // Handle different message types
    if (response.result && response.result._ === 'pong') {
      console.log('Received pong:', response.result.ping_id);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
  };

  return ws;
}

// Example 3: Authentication flow
async function authenticationFlow() {
  const phoneNumber = '+1234567890';
  
  try {
    // Step 1: Send verification code
    const codeResponse = await fetch('https://your-worker.your-subdomain.workers.dev/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'auth.sendCode',
        params: { phone_number: phoneNumber }
      })
    });
    
    const codeResult = await codeResponse.json();
    console.log('Code sent:', codeResult);
    
    if (codeResult.error) {
      throw new Error(codeResult.error.message);
    }
    
    const phoneCodeHash = codeResult.result.phone_code_hash;
    
    // Step 2: Sign in with code (you would get this from user input)
    const verificationCode = '12345'; // Replace with actual code
    
    const signInResponse = await fetch('https://your-worker.your-subdomain.workers.dev/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'auth.signIn',
        params: {
          phone_number: phoneNumber,
          phone_code: verificationCode,
          phone_code_hash: phoneCodeHash
        },
        sessionId: codeResult.sessionId
      })
    });
    
    const signInResult = await signInResponse.json();
    console.log('Sign in result:', signInResult);
    
    return signInResult;
    
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
}

// Example 4: Rate limit handling
async function rateLimitExample() {
  const requests = [];
  
  // Send multiple requests to test rate limiting
  for (let i = 0; i < 10; i++) {
    requests.push(
      fetch('https://your-worker.your-subdomain.workers.dev/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'ping',
          params: { ping_id: i.toString() }
        })
      })
    );
  }
  
  const responses = await Promise.all(requests);
  
  for (const response of responses) {
    console.log('Status:', response.status);
    console.log('Rate limit headers:', {
      limit: response.headers.get('X-RateLimit-Limit'),
      remaining: response.headers.get('X-RateLimit-Remaining'),
      reset: response.headers.get('X-RateLimit-Reset')
    });
    
    if (response.status === 429) {
      console.log('Rate limited!');
      const result = await response.json();
      console.log('Rate limit error:', result.error);
    }
  }
}

// Example 5: Health check monitoring
async function healthCheckExample() {
  const response = await fetch('https://your-worker.your-subdomain.workers.dev/health');
  const health = await response.json();
  
  console.log('Health status:', health);
  
  if (health.status !== 'healthy') {
    console.warn('Service is not healthy:', health);
  }
  
  return health;
}

// Example 6: Error handling
async function errorHandlingExample() {
  try {
    const response = await fetch('https://your-worker.your-subdomain.workers.dev/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'invalid.method',
        params: {}
      })
    });
    
    const result = await response.json();
    
    if (result.error) {
      console.error('API Error:', {
        code: result.error.code,
        message: result.error.message,
        type: result.error.type
      });
      
      // Handle specific error types
      switch (result.error.type) {
        case 'RATE_LIMIT_EXCEEDED':
          console.log('Rate limited, retrying later...');
          break;
        case 'INVALID_SESSION':
          console.log('Session expired, need to re-authenticate');
          break;
        case 'METHOD_ERROR':
          console.log('Invalid method or parameters');
          break;
        default:
          console.log('Unknown error type');
      }
    }
    
  } catch (error) {
    console.error('Network error:', error);
  }
}

// Example 7: Session management
class MTProtoClient {
  constructor(workerUrl) {
    this.workerUrl = workerUrl;
    this.sessionId = null;
  }
  
  async createSession(dcId = 1) {
    const response = await this.request('auth.sendCode', {
      phone_number: '+0000000000' // Dummy number for session creation
    }, null, dcId);
    
    if (response.sessionId) {
      this.sessionId = response.sessionId;
    }
    
    return response;
  }
  
  async request(method, params, sessionId = null, dcId = null) {
    const body = {
      method,
      params,
      sessionId: sessionId || this.sessionId,
      dcId
    };
    
    const response = await fetch(`${this.workerUrl}/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    return response.json();
  }
  
  async ping() {
    return this.request('ping', { ping_id: Date.now().toString() });
  }
  
  async getDialogs() {
    return this.request('messages.getDialogs', {});
  }
  
  async sendMessage(peer, message) {
    return this.request('messages.sendMessage', { peer, message });
  }
}

// Usage of the client
async function clientExample() {
  const client = new MTProtoClient('https://your-worker.your-subdomain.workers.dev');
  
  // Create session
  await client.createSession();
  
  // Ping
  const pingResult = await client.ping();
  console.log('Ping result:', pingResult);
  
  // Get dialogs
  const dialogs = await client.getDialogs();
  console.log('Dialogs:', dialogs);
}

// Export examples for use
export {
  sendCodeExample,
  websocketExample,
  authenticationFlow,
  rateLimitExample,
  healthCheckExample,
  errorHandlingExample,
  MTProtoClient,
  clientExample
};