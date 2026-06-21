const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const SHARED_API_KEY = process.env.SHARED_API_KEY;
const CLIENT_AUTH_TOKEN = process.env.CLIENT_AUTH_TOKEN;

if (!SHARED_API_KEY) {
  console.warn('WARNING: SHARED_API_KEY is not set. /emit endpoint is vulnerable.');
}
if (!CLIENT_AUTH_TOKEN) {
  console.warn('WARNING: CLIENT_AUTH_TOKEN is not set. WebSocket connections are unauthenticated.');
}

const app = express();
app.use(express.json());

// Custom middleware to measure response times
app.use((req, res, next) => {
  const start = process.hrtime();
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const timeInMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(3);
    console.log(`[${req.method}] ${req.originalUrl} - ${res.statusCode} - ${timeInMs}ms`);
  });
  next();
});

// Enable CORS for API routes
app.use(cors({
  origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(','),
  methods: ['GET', 'POST']
}));

const server = http.createServer(app);

// Configure Socket.io with pingTimeout & pingInterval to keep connections alive
// and prevent Render from shutting down/terminating active WebSocket connections.
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(','),
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,   // 60 seconds
  pingInterval: 25000,  // 25 seconds
  transports: ['websocket', 'polling']
});

// Middleware for WebSocket Client Authentication
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  
  if (CLIENT_AUTH_TOKEN && token !== CLIENT_AUTH_TOKEN) {
    return next(new Error('Authentication error: Invalid client token'));
  }
  next();
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Join a specific channel/room for targeted broadcasting if requested
  const channel = socket.handshake.query?.channel || 'default';
  socket.join(channel);
  console.log(`Socket ${socket.id} joined channel: ${channel}`);

  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id} (Reason: ${reason})`);
  });
});

// Health check endpoint (can be pinged externally to prevent cold starts)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// HTTP POST /emit endpoint for Next.js backend
app.post('/emit', (req, res) => {
  const authHeader = req.headers.authorization;
  
  // Verify API Key
  if (SHARED_API_KEY) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing bearer token' });
    }
    const token = authHeader.split(' ')[1];
    if (token !== SHARED_API_KEY) {
      return res.status(403).json({ error: 'Forbidden: Invalid API key' });
    }
  }

  const { channel = 'default', event = 'message', payload } = req.body;

  if (!payload) {
    return res.status(400).json({ error: 'Bad Request: Missing payload' });
  }

  // Broadcast to all clients in the specified room/channel
  io.to(channel).emit(event, payload);
  
  console.log(`Broadcasted event "${event}" to channel "${channel}"`);
  return res.status(200).json({ success: true, message: 'Event broadcasted' });
});

server.listen(PORT, () => {
  console.log(`Relay server running on port ${PORT}`);
});
