import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MidtransProvider } from './providers/midtrans.provider';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, MidtransProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
