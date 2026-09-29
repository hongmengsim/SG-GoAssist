import WebSocket from "ws";

export interface Connection {
  socket: WebSocket;
  messages: Array<Record<string, unknown>>;
  waitFor: (
    predicate: (message: Record<string, unknown>) => boolean,
    timeoutMs?: number,
  ) => Promise<Record<string, unknown>>;
}

export async function connect(wsUrl: string): Promise<Connection> {
  const socket = new WebSocket(wsUrl);
  const messages: Array<Record<string, unknown>> = [];
  socket.on("message", (data) => messages.push(JSON.parse(String(data))));
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  const waitFor: Connection["waitFor"] = (predicate, timeoutMs = 2000) =>
    new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        const found = messages.find(predicate);
        if (found) return resolve(found);
        if (Date.now() - started > timeoutMs) {
          return reject(
            new Error(`Timed out. Saw ${JSON.stringify(messages)}`),
          );
        }
        setTimeout(check, 10);
      };
      check();
    });
  return { socket, messages, waitFor };
}
