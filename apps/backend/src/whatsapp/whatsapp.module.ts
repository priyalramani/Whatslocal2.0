import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { AuthModule } from '../auth/auth.module';

// AuthModule is imported so AdminGuard can resolve AuthService (same pattern as
// ProfileModule). WhatsappService is exported so other modules (e.g. Listings,
// once an auto-trigger is wired on approve) can inject it.
@Module({
  imports: [AuthModule],
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
