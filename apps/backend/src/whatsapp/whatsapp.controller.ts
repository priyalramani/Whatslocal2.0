import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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

  // ---- WhatsApp message report (admin) ----
  // Overview = stat tiles + the conversation list (latest message per number),
  // with optional number/name search (`q`) and event-type filter (`type`).
  @Get('admin/whatsapp/report')
  @UseGuards(AdminGuard)
  async report(@Query('q') q?: string, @Query('type') type?: string) {
    const [stats, conversations] = await Promise.all([
      this.wa.reportStats(),
      this.wa.conversations(q || '', type || ''),
    ]);
    return { stats, conversations };
  }

  // Full chat chronology for one number (oldest first).
  @Get('admin/whatsapp/thread')
  @UseGuards(AdminGuard)
  async thread(@Query('number') number?: string) {
    return { results: await this.wa.thread(number || '') };
  }
}
