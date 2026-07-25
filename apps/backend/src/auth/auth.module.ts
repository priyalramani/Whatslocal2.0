import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, AdminGuard } from './guards';
import { User, UserSchema } from '../users/user.schema';

// Global so guards (JwtAuthGuard / AdminGuard) can be used by any module.
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '30d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AdminGuard],
  exports: [AuthService, JwtAuthGuard, AdminGuard],
})
export class AuthModule {}
