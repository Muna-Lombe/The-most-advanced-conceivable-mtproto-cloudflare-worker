# The Most Advanced Conceivable MTProto Cloudflare Worker

A high-performance, edge-deployed MTProto gateway implementation running on Cloudflare Workers with advanced features for handling Telegram's MTProto protocol.

## 🚀 Features

### Core MTProto Implementation
- **Full MTProto 2.0 Protocol Support** - Complete implementation of Telegram's MTProto protocol
- **Multiple Transport Protocols** - HTTP, WebSocket, and TCP-like transport layers
- **Advanced Cryptography** - AES-IGE encryption, SHA-256 hashing, and secure key derivation
- **Message Authentication** - Complete message validation and authentication

### Advanced Cloudflare Features
- **Durable Objects** - Persistent session management across requests
- **KV Storage** - Intelligent caching for improved performance
- **Edge Computing** - Global distribution with minimal latency
- **Analytics Engine** - Real-time monitoring and metrics

### Security & Performance
- **Rate Limiting** - Advanced rate limiting with DDoS protection
- **Input Validation** - Comprehensive request validation and sanitization
- **Error Handling** - Robust error handling with detailed logging
- **Connection Pooling** - Efficient connection management
- **Auto-retry Logic** - Intelligent retry mechanisms with exponential backoff

### Developer Experience
- **TypeScript** - Full type safety and IntelliSense support
- **Comprehensive Testing** - Unit tests for all major components
- **Documentation** - Complete API documentation and examples
- **Monitoring** - Built-in health checks and metrics endpoints

## 📋 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Cloudflare account with Workers plan
- Wrangler CLI installed globally

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/mtproto-cloudflare-worker.git
cd mtproto-cloudflare-worker

# Install dependencies
npm install

# Configure environment
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml with your configuration
```

### Configuration

Update `wrangler.toml` with your settings:

```toml
name = "mtproto-worker"
compatibility_date = "2024-05-12"

[vars]
API_ID = "your-telegram-api-id"
API_HASH = "your-telegram-api-hash"
ENVIRONMENT = "production"

[[kv_namespaces]]
binding = "MTPROTO_CACHE"
id = "your-kv-namespace-id"
```

### Development

```bash
# Start development server
npm run dev

# Type checking
npm run type-check

# Run tests
npm test

# Linting
npm run lint
```

### Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

## 🔌 API Usage

### HTTP API

Send MTProto requests via HTTP POST:

```javascript
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
```

### WebSocket API

Connect via WebSocket for real-time communication:

```javascript
const ws = new WebSocket('wss://your-worker.your-subdomain.workers.dev/api');

ws.onopen = () => {
  ws.send(JSON.stringify({
    method: 'ping',
    params: { ping_id: '123' }
  }));
};

ws.onmessage = (event) => {
  const response = JSON.parse(event.data);
  console.log('Received:', response);
};
```

## 📖 Supported Methods

### Authentication
- `auth.sendCode` - Send verification code
- `auth.signIn` - Sign in with phone and code
- `auth.signUp` - Register new account
- `auth.logOut` - Log out from account

### Users
- `users.getFullUser` - Get complete user information
- `users.getUsers` - Get multiple users
- `contacts.getContacts` - Get contact list

### Messages
- `messages.getDialogs` - Get chat list
- `messages.getHistory` - Get message history
- `messages.sendMessage` - Send a message
- `messages.editMessage` - Edit a message

### Updates
- `updates.getState` - Get current update state
- `updates.getDifference` - Get updates difference

### Utilities
- `ping` - Ping the server
- `help.getConfig` - Get server configuration

## 🏗️ Architecture

### Components

```
├── src/
│   ├── index.ts                 # Main worker entry point
│   ├── types.ts                 # TypeScript type definitions
│   ├── crypto/                  # Cryptographic functions
│   │   └── mtproto-crypto.ts   # AES-IGE, SHA, key derivation
│   ├── protocol/               # MTProto protocol implementation
│   │   └── mtproto.ts          # Message creation/parsing
│   ├── transport/              # Transport layer abstractions
│   │   └── transport.ts        # HTTP, WebSocket, TCP protocols
│   ├── handlers/               # Request handlers
│   │   └── mtproto-handler.ts  # Main API request handler
│   ├── durable-objects/        # Cloudflare Durable Objects
│   │   └── session-manager.ts  # Session state management
│   └── utils/                  # Utility functions
│       └── helpers.ts          # Common helper functions
```

### Data Flow

1. **Request Reception** - Worker receives HTTP/WebSocket request
2. **Rate Limiting** - Check and enforce rate limits
3. **Authentication** - Validate session and auth keys
4. **Protocol Processing** - Parse/create MTProto messages
5. **Transport Handling** - Send via appropriate transport
6. **Response Processing** - Parse and format response
7. **Caching** - Cache appropriate responses
8. **Analytics** - Record metrics and logs

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_ID` | Telegram API ID | Required |
| `API_HASH` | Telegram API Hash | Required |
| `ENVIRONMENT` | Environment name | `development` |

### KV Namespaces

- `MTPROTO_CACHE` - Caching responses and session data

### Durable Objects

- `SESSION_MANAGER` - Managing persistent session state

## 📊 Monitoring

### Health Check

```bash
curl https://your-worker.your-subdomain.workers.dev/health
```

### Metrics

```bash
curl https://your-worker.your-subdomain.workers.dev/metrics
```

### Rate Limits

Rate limit headers are included in all responses:
- `X-RateLimit-Limit` - Request limit per window
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Reset timestamp

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test helpers.test.ts
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run tests and linting
6. Submit a pull request

## 📜 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- [MTProto Documentation](https://core.telegram.org/mtproto)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Telegram API Documentation](https://core.telegram.org/api)

## ⚠️ Disclaimer

This is an educational implementation. For production use with Telegram's services, ensure compliance with Telegram's Terms of Service and API usage guidelines.
