import { Injectable, BadRequestException } from '@nestjs/common';

// WABA (WhatsApp Cloud API via the Fortius reseller proxy) send service for
// WhatsLocal. Mirrors the proven BT / RG ERP design: a thin REST wrapper that
// POSTs a Meta *pre-approved template* to
//   {WABA_BASE_URL}/{WABA_PHONE_NUMBER_ID}/messages
// with a Bearer token. Config is read straight from process.env — empty means
// DISABLED, so a send throws a clean "not configured" instead of crashing the
// app. WhatsLocal has its OWN Fortius WABA account (separate from Bharat Traders).
//
//   WABA_BASE_URL         https://waba.fortius.in.net/V23.0
//   WABA_PHONE_NUMBER_ID  numeric phone-number id of the WhatsLocal number
//   WABA_AUTH_TOKEN       Bearer token
//
// First wired template — `post_approved_hindi`: a BODY with 2 vars
// ({{1}} = post title, {{2}} = where it's published) + a dynamic URL BUTTON
// ({{url}} = the View-Post link). The sender below is generic (any number of
// body params + an optional URL-button param), so more approved templates can
// reuse it with no new code — only the caller changes.

export interface TemplateSendInput {
  to: string; // recipient mobile — 10-digit Indian or already country-coded
  template: string; // approved WABA template name
  languageCode?: string; // default 'en' (our Hindi bodies register under 'en', as in BT)
  bodyParams?: string[]; // {{1}}, {{2}}, … in template order
  buttonUrlParam?: string; // dynamic URL-button variable, when the template has one
  quickReplyPayloads?: string[]; // quick-reply buttons, in index order (payload = what returns on tap)
  callbackData?: string; // biz_opaque_callback_data — echoed on delivery statuses
}

export interface WabaSendResult {
  to: string;
  providerMessageId?: string;
  raw?: unknown;
}

@Injectable()
export class WhatsappService {
  // Normalise an Indian mobile to the country-code-prefixed digits WABA expects
  // (e.g. 919876543210). Numbers are stored/typed 10-digit, so we add the 91.
  //   9876543210      → 919876543210
  //   09876543210     → 919876543210
  //   +91 98765 43210 → 919876543210
  // Returns '' when it can't produce a plausible number (caller decides).
  static normalizeMobile(value: string): string {
    const d = String(value ?? '').replace(/[^\d]/g, '');
    if (d.length === 10) return `91${d}`;
    if (d.length === 11 && d.startsWith('0')) return `91${d.slice(1)}`;
    if (d.length === 12 && d.startsWith('91')) return d;
    if (d.length >= 11) return d; // already carries some country code — trust it
    return '';
  }

  // Sanitise + cap a template PARAMETER. WABA rejects newlines / tabs / 4+
  // consecutive spaces inside a body param, and long values (a full business
  // title) blow past what the bubble should carry — so strip line breaks,
  // collapse whitespace, trim, and cut to `maxLen` (append … when cut).
  static clampParam(value: string, maxLen = 200): string {
    const clean = String(value ?? '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen).replace(/[ ,]+$/, '') + '…';
  }

  private config(): { baseUrl: string; phoneNumberId: string; token: string } {
    const baseUrl = (process.env.WABA_BASE_URL || '').replace(/\/$/, '');
    const phoneNumberId = process.env.WABA_PHONE_NUMBER_ID || '';
    const token = process.env.WABA_AUTH_TOKEN || '';
    if (!baseUrl || !phoneNumberId || !token) {
      throw new BadRequestException(
        'WhatsApp is not configured. Set WABA_BASE_URL, WABA_PHONE_NUMBER_ID and WABA_AUTH_TOKEN in the API .env and restart.',
      );
    }
    return { baseUrl, phoneNumberId, token };
  }

  // Build the Meta template payload (body + optional URL button) and POST it.
  // Returns the provider message id so the caller can log / correlate it.
  async sendTemplate(input: TemplateSendInput): Promise<WabaSendResult> {
    const { baseUrl, phoneNumberId, token } = this.config();

    const to = WhatsappService.normalizeMobile(input.to);
    if (!to) {
      throw new BadRequestException(
        `Invalid mobile "${input.to}". Enter a 10-digit Indian mobile (or country-code-prefixed digits).`,
      );
    }
    if (!input.template || !input.template.trim()) {
      throw new BadRequestException('Template name is required.');
    }

    const components: Array<Record<string, unknown>> = [];
    const bodyParams = (input.bodyParams || []).map((p) => WhatsappService.clampParam(String(p ?? '')));
    if (bodyParams.length) {
      components.push({
        type: 'body',
        parameters: bodyParams.map((text) => ({ type: 'text', text })),
      });
    }
    // Dynamic URL button — matches the pasted template shape
    // ({ type:'button', sub_type:'url', index:'0', parameters:[{type:'text'}] }).
    if (input.buttonUrlParam != null && String(input.buttonUrlParam).trim() !== '') {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: String(input.buttonUrlParam) }],
      });
    }
    // Quick-reply buttons — one component each, by index; the payload is echoed
    // back to the webhook when the recipient taps it.
    (input.quickReplyPayloads || []).forEach((payload, i) => {
      components.push({
        type: 'button',
        sub_type: 'quick_reply',
        index: String(i),
        parameters: [{ type: 'payload', payload: String(payload) }],
      });
    });

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: input.template,
        language: { code: input.languageCode || 'en' },
        components,
      },
      biz_opaque_callback_data: input.callbackData || `${input.template}:${to}`,
    };

    const url = `${baseUrl}/${phoneNumberId}/messages`;
    let res: globalThis.Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new BadRequestException(
        `Could not reach WhatsApp provider: ${(err as Error)?.message || String(err)}`,
      );
    }

    const rawText = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      /* provider returned non-JSON — keep the text for the error message */
    }
    if (!res.ok) {
      const msg = parsed?.error?.message || parsed?.message || rawText.slice(0, 300);
      throw new BadRequestException(`WhatsApp provider error (HTTP ${res.status}): ${msg}`);
    }

    const providerMessageId = parsed?.messages?.[0]?.id || parsed?.message_id || undefined;
    // eslint-disable-next-line no-console
    console.log(`[whatsapp] sent ${input.template} → ${to} (id=${providerMessageId || 'n/a'})`);
    return { to, providerMessageId, raw: parsed };
  }

  // "Your post is approved & published" — sent on admin approval. Picks the
  // template by the POSTER's UI language (Hindi vs English); both register under
  // WABA language code 'en'. postTitle → {{1}} (hard-capped — WhatsApp params are
  // short), publishedIn → {{2}}, viewUrl → the URL button.
  async sendPostApproved(
    to: string,
    postTitle: string,
    publishedIn: string,
    viewUrl: string,
    lang: 'en' | 'hi' = 'en',
  ): Promise<WabaSendResult> {
    const template = lang === 'hi' ? 'post_approved_hindi' : 'post_approved_english';
    return this.sendTemplate({
      to,
      template,
      languageCode: 'en',
      bodyParams: [
        WhatsappService.clampParam(postTitle, 40), // title — kept short
        WhatsappService.clampParam(publishedIn, 40),
      ],
      buttonUrlParam: viewUrl,
      callbackData: `post_approved:${WhatsappService.normalizeMobile(to)}`,
    });
  }

  // "Enough Contact Notification" — sent when a post reaches its category's
  // distinct-contact threshold. TEMPLATE PENDING: the owner will share the
  // approved WABA template JSON. Until the template name is filled in below, this
  // LOGS the milestone and no-ops (so the detection mechanism can be tested now
  // without any failing provider calls). To finalize: set the hi/en template
  // names and confirm the body/button param order against the approved template.
  async sendContactMilestone(
    to: string,
    postTitle: string,
    count: number,
    viewUrl: string,
    lang: 'en' | 'hi' = 'en',
    listingId?: string,
  ): Promise<WabaSendResult | void> {
    // Approved templates: `enough_contact_hindi` / `enough_contact_english`
    // (both WABA lang code 'en'). Body: {{1}} = count, {{2}} = post title. Two
    // quick-reply buttons — the payloads MUST match the template exactly, since
    // that string is what returns to our webhook on tap. viewUrl is unused (this
    // template has no URL button).
    const template = lang === 'hi' ? 'enough_contact_hindi' : 'enough_contact_english';
    const payloads =
      lang === 'hi' ? ['हाँ, जारी रखें', 'नहीं, हटाएँ'] : ['Yes, keep active', 'No, hide it'];
    return this.sendTemplate({
      to,
      template,
      languageCode: 'en',
      bodyParams: [String(count), WhatsappService.clampParam(postTitle, 40)], // {{1}}=count, {{2}}=title
      quickReplyPayloads: payloads,
      callbackData: `contact_alert:${listingId || ''}:${WhatsappService.normalizeMobile(to)}`,
    });
  }
}
