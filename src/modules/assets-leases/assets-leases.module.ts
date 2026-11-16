import { Module } from '@nestjs/common';
import { AssetsLeasesController } from './assets-leases.controller';
import { AssetsLeasesService } from './assets-leases.service';

@Module({
  controllers: [AssetsLeasesController],
  providers: [AssetsLeasesService],
})
export class AssetsLeasesModule {}

