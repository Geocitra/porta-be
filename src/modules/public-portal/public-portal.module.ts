import { Module } from '@nestjs/common';
import { TariffsModule } from '../tariffs/tariffs.module';
import { PublicPortalController } from './public-portal.controller';
import { PublicPortalService } from './public-portal.service';

@Module({
  imports: [TariffsModule],
  controllers: [PublicPortalController],
  providers: [PublicPortalService],
})
export class PublicPortalModule {}
