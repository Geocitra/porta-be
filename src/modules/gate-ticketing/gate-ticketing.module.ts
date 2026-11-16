import { Module } from '@nestjs/common';
import { GateTicketingController } from './gate-ticketing.controller';
import { GateTicketingService } from './gate-ticketing.service';

@Module({
  controllers: [GateTicketingController],
  providers: [GateTicketingService],
})
export class GateTicketingModule {}

