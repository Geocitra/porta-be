import { Module } from '@nestjs/common';
import { TariffsController } from './tariffs.controller';
import { TariffsService } from './tariffs.service';
import { TariffResolverService } from './tariff-resolver.service';

@Module({
  controllers: [TariffsController],
  providers: [TariffsService, TariffResolverService],
  exports: [TariffsService, TariffResolverService],
})
export class TariffsModule {}

