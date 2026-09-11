// Minimal ambient types for `web-push` (the package ships no .d.ts). Only the
// bits we use — keeps us from adding @types/web-push as another dep to ship.
declare module 'web-push' {
  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  export function generateVAPIDKeys(): { publicKey: string; privateKey: string };
  export function sendNotification(
    subscription: { endpoint: string; keys: { p256dh?: string; auth?: string } },
    payload?: string | Buffer | null,
    options?: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: string; headers: Record<string, string> }>;
}
