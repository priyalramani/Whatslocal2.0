import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { AdminGuard } from '../auth/guards';

// Admin-only WhatsApp routes. For now just a TEST sender — the admin enters the
// placeholders and shoots one real template message to a number they choose, so
// the WABA wiring can be proven before any auto-trigger is attached.
@Controller()
export class WhatsappController {
  constructor(private readonly wa: WhatsappService) {}

  // POST /admin/whatsapp/test
  // Body: { to, template?, language?, bodyParams?[], buttonUrl? }
  // Defaults to the first wired template (post_approved_hindi) but accepts any
  // approved template name so future templates can be tested from the same form.
  @Post('admin/whatsapp/test')
  @UseGuards(AdminGuard)
  async test(
    @Body()
    body: {
      to?: string;
      template?: string;
      language?: string;
      bodyParams?: string[];
      buttonUrl?: string;
    },
  ) {
    const r = await this.wa.sendTemplate({
      to: body?.to || '',
      template: body?.template || 'post_approved_hindi',
      languageCode: body?.language || 'en',
      bodyParams: Array.isArray(body?.bodyParams) ? body.bodyParams : [],
      buttonUrlParam: body?.buttonUrl,
    });
    return { success: true, ...r };
  }
}
