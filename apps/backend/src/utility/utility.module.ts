import {
  Controller, Get, Param, NotFoundException, Module, BadRequestException, ServiceUnavailableException,
} from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Throttle } from '@nestjs/throttler';
import type { PinLookupResult } from '@whatslocal/types';
import { Pincode, PincodeSchema } from './pincode.schema';
import { PincodeService } from './pincode.service';

@Controller('utility')
export class UtilityController {
  constructor(private readonly pins: PincodeService) {}

  // GET /api/v1/utility/pin-lookup/:pin — served from the cache; India Post is
  // only hit the first time we ever see a pin.
  @Get('pin-lookup/:pin')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async pinLookup(@Param('pin') pin: string): Promise<PinLookupResult> {
    if (!/^[0-9]{6}$/.test(pin)) throw new BadRequestException('PIN must be exactly 6 digits.');
    const r = await this.pins.resolve(pin);
    if (!r) throw new NotFoundException(`PIN ${pin} not found in India Post directory.`);
    if (!r.district && !r.state) {
      throw new ServiceUnavailableException('Could not resolve PIN. Enter city / state manually.');
    }
    return r;
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Pincode.name, schema: PincodeSchema }])],
  controllers: [UtilityController],
  providers: [PincodeService],
  exports: [PincodeService], // ListingsModule reuses the cache when resolving a post's pin
})
export class UtilityModule {}
