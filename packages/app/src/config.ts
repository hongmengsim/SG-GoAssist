export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");
