import { Module } from '@nestjs/common';
import { AisController } from './ais.controller';
import { AisService } from './ais.service';

@Module({
  controllers: [AisController],
  providers: [AisService],
  exports: [AisService],
})
export class AisModule {}
