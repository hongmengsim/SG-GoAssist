import type { StatusUpdateMessage } from "@buspass/shared";
import { WS_BASE_URL } from "../config";

export function subscribeToRequestStatus(
  requestId: string,
  onUpdate: (message: StatusUpdateMessage) => void,
  onError: () => void
) {
  const socket = new WebSocket(WS_BASE_URL);

  socket.onopen = () => {
    socket.send(
      JSON.stringify({
        type: "SUBSCRIBE",
        requestId,
      })
    );
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.status) {
      onUpdate(message as StatusUpdateMessage);
    }
  };

  socket.onerror = onError;

  return () => socket.close();
}
