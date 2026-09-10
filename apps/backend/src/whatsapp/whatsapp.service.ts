import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WhatsappMessage, WhatsappMessageDocument } from './whatsapp-message.schema';

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
  // Metadata for the message-history log (the admin WhatsApp report). When set, a
  // successful send writes an outbound `whatsapp_messages` row with the RESOLVED
  // body text so the report shows the real message, not just the template name.
  logMeta?: { event: string; body: string; buttons?: string[]; listingId?: string; name?: string };
}

export interface WabaSendResult {
  to: string;
  providerMessageId?: string;
  raw?: unknown;
}

@Injectable()
export class WhatsappService {
  constructor(
    @InjectModel(WhatsappMessage.name) private readonly messages: Model<WhatsappMessageDocument>,
  ) {}

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
    // History row for the admin report (best-effort — never break a send).
    if (input.logMeta) {
      try {
        await this.messages.create({
          direction: 'out',
          number: to,
          name: input.logMeta.name || '',
          event: input.logMeta.event,
          template: input.template,
          lang: input.languageCode || 'en',
          body: input.logMeta.body,
          buttons: input.logMeta.buttons || [],
          wa_id: providerMessageId || '',
          listing_id: input.logMeta.listingId || null,
          status: 'sent',
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[whatsapp] history write failed:', (e as Error)?.message || e);
      }
    }
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
    listingId?: string,
  ): Promise<WabaSendResult> {
    const template = lang === 'hi' ? 'post_approved_hindi' : 'post_approved_english';
    const t = WhatsappService.clampParam(postTitle, 40); // title — kept short
    const p = WhatsappService.clampParam(publishedIn, 40);
    const body =
      lang === 'hi'
        ? `आपकी पोस्ट "${t}" अप्रूव हो गई है और अब ${p} में पब्लिश हो गई है। देखने के लिए View Post पर टैप करें।`
        : `Your post "${t}" has been approved and is now published in ${p}. Tap View Post to view it.`;
    return this.sendTemplate({
      to,
      template,
      languageCode: 'en',
      bodyParams: [t, p],
      buttonUrlParam: viewUrl,
      callbackData: `post_approved:${WhatsappService.normalizeMobile(to)}`,
      logMeta: { event: 'post_approved', body, buttons: ['View post'], listingId, name: postTitle },
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
    const t = WhatsappService.clampParam(postTitle, 40);
    const body =
      lang === 'hi'
        ? `नमस्ते, ${count} लोगों ने आपकी पोस्ट "${t}" पर संपर्क किया है। क्या आप इस पोस्ट को आगे जारी रखना चाहते हैं?`
        : `Hello, ${count} people have contacted your post "${t}". Do you want to keep it active?`;
    return this.sendTemplate({
      to,
      template,
      languageCode: 'en',
      bodyParams: [String(count), t], // {{1}}=count, {{2}}=title
      quickReplyPayloads: payloads,
      callbackData: `contact_alert:${listingId || ''}:${WhatsappService.normalizeMobile(to)}`,
      logMeta: { event: 'contact_alert', body, buttons: payloads, listingId, name: postTitle },
    });
  }

  // ===== message-history recording (fed by the inbound webhook) ================

  // Advance an outbound row's delivery lifecycle from a status callback. Never
  // regresses (read stays read); matches on the provider message id.
  async recordStatus(waId: string, state: string, whenMs: number, error = ''): Promise<void> {
    const id = String(waId || '').trim();
    if (!id) return;
    const s = String(state || '').toLowerCase();
    const when = whenMs ? new Date(whenMs) : new Date();
    const set: Record<string, unknown> = {};
    if (s === 'delivered') { set.delivered_at = when; set.status = 'delivered'; }
    else if (s === 'read') { set.read_at = when; set.status = 'read'; }
    else if (s === 'failed') { set.failed_at = when; set.status = 'failed'; if (error) set.error = error; }
    else if (s === 'sent') { /* already 'sent' on create */ return; }
    else return;
    try {
      // Don't downgrade read→delivered: only apply if the new state ranks higher.
      const rank: Record<string, number> = { sent: 0, delivered: 1, read: 2, failed: 1 };
      const row = await this.messages.findOne({ wa_id: id, direction: 'out' }, { status: 1 }).lean();
      if (!row) return;
      if ((rank[s] ?? 0) < (rank[String(row.status)] ?? 0) && s !== 'failed') {
        // still stamp the timestamp without changing the headline status
        delete set.status;
      }
      await this.messages.updateOne({ wa_id: id, direction: 'out' }, { $set: set });
    } catch { /* best-effort */ }
  }

  // Store an inbound reply as its own row, linked to the outbound it answered.
  async recordInboundReply(opts: {
    from: string; contextId?: string; text: string; choice?: string;
  }): Promise<void> {
    const number = WhatsappService.normalizeMobile(opts.from) || String(opts.from || '');
    if (!number) return;
    try {
      // Inherit name/listing from the message they replied to, when we can find it.
      let name = '';
      let listingId: string | null = null;
      if (opts.contextId) {
        const parent = await this.messages
          .findOne({ wa_id: opts.contextId }, { name: 1, listing_id: 1 })
          .lean();
        if (parent) { name = String(parent.name || ''); listingId = (parent.listing_id as any) ?? null; }
      }
      await this.messages.create({
        direction: 'in',
        number,
        name,
        event: 'reply',
        body: opts.text || '',
        context_id: opts.contextId || '',
        reply_choice: opts.choice || '',
        listing_id: listingId,
        status: 'read',
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[whatsapp] inbound history write failed:', (e as Error)?.message || e);
    }
  }

  // ===== admin report queries ==================================================

  async reportStats(): Promise<Record<string, number>> {
    const [sent, delivered, read, failed, replies] = await Promise.all([
      this.messages.countDocuments({ direction: 'out' }),
      this.messages.countDocuments({ direction: 'out', status: { $in: ['delivered', 'read'] } }),
      this.messages.countDocuments({ direction: 'out', status: 'read' }),
      this.messages.countDocuments({ direction: 'out', status: 'failed' }),
      this.messages.countDocuments({ direction: 'in' }),
    ]);
    return { sent, delivered, read, failed, replies };
  }

  // Latest message per number → the conversation list. Optional text filter on
  // number or name; optional event-type filter.
  async conversations(q = '', type = '', limit = 200): Promise<any[]> {
    const match: any = {};
    if (type) match.event = type;
    if (q.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      match.$or = [{ number: rx }, { name: rx }];
    }
    return this.messages.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$number',
          name: { $first: '$name' },
          last_body: { $first: '$body' },
          last_dir: { $first: '$direction' },
          last_status: { $first: '$status' },
          last_event: { $first: '$event' },
          last_at: { $first: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { last_at: -1 } },
      { $limit: limit },
    ]);
  }

  // Every message to/from one number, oldest first — the chat chronology.
  async thread(number: string): Promise<any[]> {
    const n = WhatsappService.normalizeMobile(number) || String(number || '');
    if (!n) return [];
    return this.messages.find({ number: n }).sort({ createdAt: 1 }).lean();
  }
}
