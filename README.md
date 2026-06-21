# Stateless WebSocket Relay Server (Render & Next.js)

A private, database-free Socket.io relay server built to handle real-time event broadcasting. Optimized for deployment on Render's free tier and integration with a Next.js chat application.

## 🚀 Features
- **Stateless & Database-free**: Minimal memory usage, instantly forwards payloads.
- **Next.js Integration Endpoint**: Secure `POST /emit` route to broadcast server-side events.
- **Security handshakes**: Shared secret key validation for publishing and token validation for connected WebSocket clients.
- **Render Free-Tier Optimization**: Custom `pingInterval` and `pingTimeout` configurations to match Render's proxy limits.

---

## 🛠️ Deploying to Render

1. Create a Web Service on Render.
2. Select your repository.
3. Use the following Environment Variables:

| Environment Variable | Description |
|---|---|
| `PORT` | Auto-configured by Render (Defaults to 10000) |
| `CORS_ORIGIN` | Comma-separated domains allowed to connect (e.g. `https://your-nextjs.com,http://localhost:3000`) |
| `SHARED_API_KEY` | Key for Next.js APIs to authorize `POST /emit` requests |
| `CLIENT_AUTH_TOKEN` | Key that client browsers must send during the socket handshake to authenticate |

---

## ❄️ Keeping Server Warm (Preventing Cold Starts)

Since Render's free tier spins down services after 15 minutes of inactivity, you can use a scheduled **GitHub Action** to ping the server every 10 minutes for free.

### GitHub Action Setup
Create a file at `.github/workflows/keep-alive.yml` in your repository:

```yaml
name: Keep WebSocket Relay Warm

on:
  schedule:
    # Runs every 10 minutes
    - cron: '*/10 * * * *'
  workflow_dispatch: # Allows manual trigger

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Health Endpoint
        run: |
          curl -f -s -I "https://your-relay-server.onrender.com/health" || echo "Ping failed or server is sleeping"
```

Replace `https://your-relay-server.onrender.com` with your actual Render URL.

---

## 💻 Code Snippets for Next.js

### 1. Next.js Route Webhook API (`/api/webhooks/route.ts`)
```typescript
interface BroadcastPayload {
  channel: string;
  event: string;
  payload: any;
}

export async function broadcastEvent({ channel, event, payload }: BroadcastPayload) {
  const serverUrl = process.env.NEXT_PUBLIC_WS_SERVER_URL;
  const apiKey = process.env.WS_SHARED_API_KEY;

  if (!serverUrl || !apiKey) {
    console.error("Missing WS configurations.");
    return;
  }

  try {
    const response = await fetch(`${serverUrl}/emit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({ channel, event, payload })
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      throw new Error(`Failed to emit: ${errorMsg}`);
    }

    return await response.json();
  } catch (error) {
    console.error("WebSocket broadcast failed:", error);
  }
}
```

### 2. Next.js React Client (`InboxLayout.tsx`)
```typescript
"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export default function InboxLayout({ roomId }: { roomId: string }) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const serverUrl = process.env.NEXT_PUBLIC_WS_SERVER_URL || "http://localhost:3001";
    const clientToken = process.env.NEXT_PUBLIC_WS_CLIENT_TOKEN || "";

    const socketInstance: Socket = io(serverUrl, {
      transports: ["websocket"],
      auth: { token: clientToken },
      query: { channel: roomId },
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity
    });

    socketInstance.on("connect", () => setIsConnected(true));
    socketInstance.on("disconnect", () => setIsConnected(false));

    return () => {
      socketInstance.disconnect();
    };
  }, [roomId]);

  return (
    <div>
      Status: {isConnected ? "Connected" : "Disconnected"}
    </div>
  );
}
```
