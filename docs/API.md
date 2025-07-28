# API Reference

## Endpoints

### POST /api
Main MTProto API endpoint for JSON-based requests.

**Request Format:**
```json
{
  "method": "string",
  "params": {},
  "sessionId": "string (optional)",
  "dcId": "number (optional)"
}
```

**Response Format:**
```json
{
  "result": {},
  "sessionId": "string",
  "messageId": "string"
}
```

**Error Response:**
```json
{
  "error": {
    "code": "number",
    "message": "string",
    "type": "string"
  },
  "sessionId": "string",
  "messageId": "string"
}
```

### WebSocket /api
WebSocket endpoint for real-time MTProto communication.

**Connection:** Upgrade HTTP request with `Upgrade: websocket` header.

**Message Format:** Same as HTTP API, sent as JSON strings.

### GET /health
Health check endpoint for monitoring service status.

**Response:**
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "ISO 8601 string",
  "environment": "string",
  "version": "string",
  "services": {
    "kv": "healthy|unhealthy",
    "durableObjects": "healthy|unhealthy",
    "analytics": "healthy|disabled"
  }
}
```

### GET /metrics
Metrics endpoint for performance monitoring.

**Response:**
```json
{
  "timestamp": "ISO 8601 string",
  "environment": "string",
  "cache": {},
  "sessions": {}
}
```

## Supported Methods

### Authentication Methods

#### auth.sendCode
Send verification code to phone number.

**Parameters:**
- `phone_number` (string): Phone number in international format

**Response:**
```json
{
  "_": "auth.sentCode",
  "phone_code_hash": "string",
  "type": {
    "_": "auth.sentCodeTypeSms",
    "length": 5
  }
}
```

#### auth.signIn
Sign in with phone number and verification code.

**Parameters:**
- `phone_number` (string): Phone number
- `phone_code` (string): Verification code
- `phone_code_hash` (string): Hash from sendCode response

**Response:**
```json
{
  "_": "auth.authorization",
  "user": {
    "_": "user",
    "id": "number",
    "is_self": true,
    "phone": "string",
    "first_name": "string",
    "last_name": "string"
  }
}
```

### User Methods

#### users.getFullUser
Get complete user information.

**Parameters:**
- `id` (number): User ID

**Response:**
```json
{
  "_": "users.userFull",
  "full_user": {
    "_": "userFull",
    "id": "number",
    "about": "string",
    "common_chats_count": "number"
  },
  "users": [
    {
      "_": "user",
      "id": "number",
      "first_name": "string",
      "last_name": "string"
    }
  ]
}
```

### Message Methods

#### messages.getDialogs
Get chat list.

**Parameters:** None

**Response:**
```json
{
  "_": "messages.dialogs",
  "dialogs": [],
  "messages": [],
  "chats": [],
  "users": []
}
```

#### messages.getHistory
Get message history for a chat.

**Parameters:**
- `peer` (object): Chat peer object
- `limit` (number): Number of messages to retrieve

**Response:**
```json
{
  "_": "messages.messages",
  "messages": [],
  "chats": [],
  "users": []
}
```

#### messages.sendMessage
Send a message to a chat.

**Parameters:**
- `peer` (object): Chat peer object
- `message` (string): Message text

**Response:**
```json
{
  "_": "updates",
  "updates": [
    {
      "_": "updateNewMessage",
      "message": {
        "_": "message",
        "id": "number",
        "message": "string",
        "date": "number"
      }
    }
  ],
  "users": [],
  "chats": [],
  "date": "number",
  "seq": "number"
}
```

### Update Methods

#### updates.getState
Get current update state.

**Parameters:** None

**Response:**
```json
{
  "_": "updates.state",
  "pts": "number",
  "qts": "number",
  "date": "number",
  "seq": "number",
  "unread_count": "number"
}
```

### Utility Methods

#### ping
Ping the server.

**Parameters:**
- `ping_id` (string): Ping identifier

**Response:**
```json
{
  "_": "pong",
  "ping_id": "string",
  "msg_id": "string"
}
```

## Rate Limiting

The API enforces rate limits to prevent abuse:

- **Default Limit:** 100 requests per minute per IP address
- **Rate Limit Headers:** Included in all responses
  - `X-RateLimit-Limit`: Request limit per window
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset timestamp
- **Rate Limit Exceeded:** Returns HTTP 429 with error details

## Error Codes

### HTTP Status Codes
- `200`: Success
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `429`: Rate Limit Exceeded
- `500`: Internal Server Error
- `503`: Service Unavailable

### MTProto Error Types
- `CLIENT_ERROR`: Client-side error (400-499)
- `SERVER_ERROR`: Server-side error (500-599)
- `FLOOD_WAIT`: Rate limiting error (420)
- `UNAUTHORIZED`: Authentication required (401)
- `FORBIDDEN`: Access denied (403)
- `RATE_LIMIT_EXCEEDED`: Rate limit exceeded (429)
- `INVALID_SESSION`: Session expired or invalid
- `METHOD_ERROR`: Invalid method or parameters
- `INTERNAL_ERROR`: Internal server error
- `WORKER_ERROR`: Worker-specific error

## Transport Protocols

### HTTP Transport
- **Endpoint:** `/api`
- **Method:** POST
- **Content-Type:** `application/json`
- **Features:** Request/response with caching

### WebSocket Transport
- **Endpoint:** `/api` (with Upgrade header)
- **Protocol:** WebSocket
- **Features:** Real-time bidirectional communication

### TCP-like Transport
- **Endpoint:** `/api`
- **Headers:** `X-Transport-Type: tcp-intermediate`
- **Features:** TCP intermediate format over HTTP

## Session Management

Sessions are managed using Cloudflare Durable Objects:

- **Session Creation:** Automatic on first request or explicit via parameters
- **Session Persistence:** Maintained across requests
- **Session Expiry:** Configurable timeout
- **Session Storage:** Encrypted in Durable Object storage

## Caching

Intelligent caching using Cloudflare KV:

- **Cacheable Methods:** `users.getFullUser`, `messages.getDialogs`, `updates.getState`
- **Cache TTL:** Method-specific time-to-live
- **Cache Keys:** Method + parameters hash
- **Cache Invalidation:** Automatic expiry and versioning