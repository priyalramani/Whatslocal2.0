import type { DeviceInfo } from '@whatslocal/types';

// Tiny dependency-free user-agent classifier. Good enough for product
// analytics (device type + rough OS/browser). Swap for ua-parser-js later
// if we need exact versions.
export function parseUserAgent(ua: string): DeviceInfo {
  const s = ua || '';
  let type: DeviceInfo['type'] = 'desktop';
  if (/\b(iPad|Tablet)\b/i.test(s) || (/Android/i.test(s) && !/Mobile/i.test(s))) {
    type = 'tablet';
  } else if (/\b(Mobi|iPhone|Android|iPod|Windows Phone)\b/i.test(s)) {
    type = 'mobile';
  }
  if (!s) type = 'unknown';

  let os: string | undefined;
  if (/Windows/i.test(s)) os = 'Windows';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad|iPod|iOS/i.test(s)) os = 'iOS';
  else if (/Mac OS X/i.test(s)) os = 'macOS';
  else if (/Linux/i.test(s)) os = 'Linux';

  let browser: string | undefined;
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(s)) browser = 'Opera';
  else if (/Chrome\//i.test(s)) browser = 'Chrome';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Safari\//i.test(s)) browser = 'Safari';

  // Best-effort handset brand — a rough affluence signal (Apple ≫ others in India;
  // exact iPhone model is NOT in the UA, so Apple = "iPhone", not the model).
  let brand: string | undefined;
  if (/iPhone|iPad|iPod/i.test(s)) brand = 'Apple';
  else if (/Android/i.test(s)) {
    if (/Pixel/i.test(s)) brand = 'Google Pixel';
    else if (/OnePlus/i.test(s)) brand = 'OnePlus';
    else if (/Nothing|A06[0-9]/i.test(s)) brand = 'Nothing';
    else if (/iQOO/i.test(s)) brand = 'iQOO';
    else if (/SM-|Samsung|Galaxy/i.test(s)) brand = 'Samsung';
    else if (/Redmi|POCO|Xiaomi|\bMi\b|\b(2[23]\d{5}|M2\d{3})\b/i.test(s)) brand = 'Xiaomi';
    else if (/Realme|RMX\d{3,4}/i.test(s)) brand = 'Realme';
    else if (/\bvivo\b|\bV2\d{3}\b/i.test(s)) brand = 'Vivo';
    else if (/\bOPPO\b|CPH\d{4}/i.test(s)) brand = 'Oppo';
    else if (/\bmoto|Motorola/i.test(s)) brand = 'Motorola';
    else if (/Infinix/i.test(s)) brand = 'Infinix';
    else if (/Tecno/i.test(s)) brand = 'Tecno';
    else if (/Nokia/i.test(s)) brand = 'Nokia';
    else brand = 'Android';
  }

  return { type, os, brand, browser, ua: s.slice(0, 400) };
}
