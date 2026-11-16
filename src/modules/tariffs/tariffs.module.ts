import { Module } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';
import { TariffResolverService } from './tariff-resolver.service';
import { TariffsController } from './tariffs.controller';
import { TariffsService } from './tariffs.service';

@Module({
  controllers: [TariffsController],
  providers: [TariffsService, TariffResolverService, ExchangeRateService],
  exports: [TariffsService, TariffResolverService, ExchangeRateService],
})
export class TariffsModule {}
