import { Module } from '@nestjs/common';
import { CargoUtilityController } from './cargo-utility.controller';
import { CargoUtilityService } from './cargo-utility.service';

@Module({
  controllers: [CargoUtilityController],
  providers: [CargoUtilityService],
})
export class CargoUtilityModule {}

