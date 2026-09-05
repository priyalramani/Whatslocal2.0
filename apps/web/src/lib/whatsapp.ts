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
