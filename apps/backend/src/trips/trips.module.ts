import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { Trip, TripSchema } from './trip.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Trip.name, schema: TripSchema }]),
    AuthModule,
  ],
  controllers: [TripsController],
  providers: [TripsService],
})
export class TripsModule {}
