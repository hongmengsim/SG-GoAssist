import http from "http";
import WebSocket from "ws";
import { createApp } from "../../app";
import {
  initializeWebSocketServer,
  setupStateChangeListener,
} from "../../services/websocket";
import { clearAllRequests } from "../../services/aviator";

export interface TestServer {
  baseUrl: string;
  wsUrl: string;
  close: () => Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  clearAllRequests();
  const server = http.createServer(createApp());
  initializeWebSocketServer(server, 0);
  setupStateChangeListener();

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine test server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    wsUrl: `ws://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export async function requestJson(
  baseUrl: string,
  path: string,
  options: RequestInit = {}
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

export function subscribeAndCollect(
  wsUrl: string,
  requestId: string,
  expected: string[],
  timeoutMs = 2000
): { socket: WebSocket; done: Promise<any[]>; waitForLabels: (labels: string[], timeoutMs?: number) => Promise<any[]> } {
  const socket = new WebSocket(wsUrl);
  const seen: any[] = [];

  const waitForLabels = (labelsToWaitFor: string[], waitTimeoutMs = timeoutMs) =>
    new Promise<any[]>((resolve, reject) => {
      const hasAllLabels = () => {
        const labels = seen.map((item) => `${item.type}:${item.status ?? item.announcement}`);
        return labelsToWaitFor.every((label) => labels.includes(label));
      };

      if (hasAllLabels()) {
        resolve(seen);
        return;
      }

      const timer = setTimeout(() => {
        reject(
          new Error(
            `Timed out waiting for ${labelsToWaitFor.join(", ")}. Saw ${JSON.stringify(seen)}`
          )
        );
      }, waitTimeoutMs);

      const onMessage = () => {
        if (hasAllLabels()) {
          clearTimeout(timer);
          socket.off("message", onMessage);
          resolve(seen);
        }
      };

      socket.on("message", onMessage);
      socket.once("error", (error) => {
        clearTimeout(timer);
        socket.off("message", onMessage);
        reject(error);
      });
    });

  const done = new Promise<any[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(
        new Error(`Timed out waiting for ${expected.join(", ")}. Saw ${JSON.stringify(seen)}`)
      );
    }, timeoutMs);

    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "SUBSCRIBE", requestId }));
    });

    socket.on("message", (data) => {
      const message = JSON.parse(String(data));
      seen.push(message);
      const labels = seen.map((item) => `${item.type}:${item.status ?? item.announcement}`);
      if (expected.every((label) => labels.includes(label))) {
        clearTimeout(timer);
        resolve(seen);
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  return { socket, done, waitForLabels };
}
