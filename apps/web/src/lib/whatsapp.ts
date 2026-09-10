import { api } from './api';

// Admin WhatsApp test send. Fires one real WABA template message so the wiring
// can be proven before any auto-trigger is attached. Defaults to the first
// template (post_approved_hindi); `bodyParams` fill {{1}},{{2}},… in order and
// `buttonUrl` fills the dynamic URL button.
export interface WaTestInput {
  to: string;
  template?: string;
  language?: string;
  bodyParams?: string[];
  buttonUrl?: string;
}

export const adminTestWhatsapp = (input: WaTestInput) =>
  api<{ success: boolean; to: string; providerMessageId?: string }>('/admin/whatsapp/test', {
    method: 'POST',
    body: JSON.stringify(input),
  });

// ---- WhatsApp message report ----
export interface WaMessage {
  _id: string;
  direction: 'out' | 'in';
  number: string;
  name: string;
  event: string; // post_approved | contact_alert | reply
  body: string;
  buttons: string[];
  reply_choice?: string;
  listing_id?: string | null;
  status: string; // sent | delivered | read | failed
  delivered_at?: string | null;
  read_at?: string | null;
  failed_at?: string | null;
  error?: string;
  createdAt: string;
}
export interface WaConversation {
  _id: string; // the number
  name: string;
  last_body: string;
  last_dir: 'out' | 'in';
  last_status: string;
  last_event: string;
  last_at: string;
  count: number;
}
export interface WaReport {
  stats: { sent: number; delivered: number; read: number; failed: number; replies: number };
  conversations: WaConversation[];
}

export const whatsappReport = (q = '', type = '') => {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (type) p.set('type', type);
  return api<WaReport>(`/admin/whatsapp/report${p.toString() ? `?${p}` : ''}`);
};
export const whatsappThread = (number: string) =>
  api<{ results: WaMessage[] }>(`/admin/whatsapp/thread?number=${encodeURIComponent(number)}`);
