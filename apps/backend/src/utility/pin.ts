import * as https from 'node:https';
import type { PinLookupResult } from '@whatslocal/types';

// Shared pincode → city/district/state resolver. India Post's API has no CORS
// and has served an expired TLS cert, so we proxy server-to-server with relaxed
// TLS (deliberate, scoped trade-off for public data — see DECISIONS/PRIVACY).
const MAX_RESPONSE_BYTES = 1024 * 1024;

export function fetchInsecureJson(url: string, timeoutMs = 8000): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    const req = https.request(
      url,
      { rejectUnauthorized: false, timeout: timeoutMs, headers: { Accept: 'application/json' } },
      (res) => {
        let raw = '';
        let over = false;
        res.setEncoding('utf8');
        res.on('data', (c: string) => {
          if (over) return;
          raw += c;
          if (raw.length > MAX_RESPONSE_BYTES) { over = true; res.destroy(); settle(() => reject(new Error('Response too large'))); }
        });
        res.on('end', () => {
          if (over) return;
          const status = res.statusCode || 0;
          if (status < 200 || status >= 300 || !raw) return settle(() => resolve({ status, body: null }));
          try { settle(() => resolve({ status, body: JSON.parse(raw) })); }
          catch (e: any) { settle(() => reject(new Error(`Bad JSON: ${e?.message || e}`))); }
        });
        res.on('error', (err) => settle(() => reject(err)));
      },
    );
    req.on('error', (err) => settle(() => reject(err)));
    req.on('timeout', () => req.destroy(new Error(`Timed out after ${timeoutMs}ms`)));
    req.end();
  });
}

// Returns null if not resolvable (caller decides how to handle).
export async function resolvePin(pin: string): Promise<PinLookupResult | null> {
  if (!/^[0-9]{6}$/.test(pin)) return null;
  let raw: any;
  try {
    const { status, body } = await fetchInsecureJson(`https://api.postalpincode.in/pincode/${pin}`);
    if (status < 200 || status >= 300) return null;
    raw = body;
  } catch { return null; }
  if (!Array.isArray(raw) || raw[0]?.Status !== 'Success') return null;
  const offices: any[] = raw[0]?.PostOffice || [];
  if (!offices.length) return null;
  const head = offices.find((p) => /head/i.test(String(p?.BranchType || '')));
  const candidates = head ? [head, ...offices.filter((p) => p !== head)] : offices;
  let district = '';
  for (const p of candidates) { const d = String(p?.District || '').trim(); if (d) { district = d; break; } }
  const state = String(candidates[0]?.State || '').trim();
  const localities = Array.from(new Set(offices.map((p) => String(p?.Name || '').trim()).filter(Boolean)));
  return { pin, city: district, district, state, localities };
}
