import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappMessage, WhatsappMessageSchema } from './whatsapp-message.schema';
import { AuthModule } from '../auth/auth.module';

// AuthModule is imported so AdminGuard can resolve AuthService (same pattern as
// ProfileModule). WhatsappService is exported so other modules (Listings +
// Analytics) can inject it for sending + the report.
@Module({
  imports: [
    MongooseModule.forFeature([{ name: WhatsappMessage.name, schema: WhatsappMessageSchema }]),
    AuthModule,
  ],
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
