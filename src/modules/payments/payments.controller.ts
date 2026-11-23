import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CheckoutPaymentDto,
  MidtransWebhookDto,
  UpdatePaymentConfigDto,
} from './dto/payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payment Gateway & Feature Flags (Midtrans / Bank Papua)')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('config')
  getPaymentConfig() {
    return this.paymentsService.getPaymentConfig();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Patch('config')
  updatePaymentConfig(
    @Body() dto: UpdatePaymentConfigDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.paymentsService.updatePaymentConfig(dto, actor);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Roles(
    UserRole.OPERATOR_KAPAL,
    UserRole.TENANT,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_TAGIHAN,
    UserRole.BENDAHARA,
  )
  @Post('checkout')
  checkout(
    @Body() dto: CheckoutPaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.paymentsService.checkout(dto, actor, req.portScope);
  }

  @Post('webhooks/midtrans')
  handleMidtransWebhook(@Body() dto: MidtransWebhookDto) {
    return this.paymentsService.handleMidtransWebhook(dto);
  }
}
