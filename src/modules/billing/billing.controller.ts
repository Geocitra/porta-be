import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { BillingStage, UserRole } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BillingService } from './billing.service';
import {
  BankPaymentWebhookDto,
  DecideBillingAdjustmentDto,
  GenerateBillingDto,
  RecordPaymentDto,
  RequestBillingAdjustmentDto,
  VoidInvoiceDto,
} from './dto/billing.dto';

@ApiTags('Billing, e-SKRD & Payments')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('webhooks/bank-payment')
  handleBankWebhook(
    @Body() dto: BankPaymentWebhookDto,
    @Headers('x-porta-signature') signature?: string,
  ) {
    return this.billingService.handleBankWebhook(dto, signature);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Get('invoices')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.BENDAHARA,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.OPERATOR_KAPAL,
  )
  findInvoices(@Req() req: { portScope: ScopeFilter }) {
    return this.billingService.findInvoices(req.portScope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Get('invoices/:id/print-payload')
  getPrintPayload(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.billingService.getPrintPayload(id, req.portScope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Post('visits/:visitId/estimate')
  generateEstimate(
    @Param('visitId', ParseIntPipe) visitId: number,
    @Body() dto: GenerateBillingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.billingService.generateForVisit(
      visitId,
      BillingStage.ESTIMATE,
      dto,
      user,
      req.portScope,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Post('visits/:visitId/advance-skrd')
  @Roles(
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.BENDAHARA,
  )
  generateAdvanceSkrd(
    @Param('visitId', ParseIntPipe) visitId: number,
    @Body() dto: GenerateBillingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.billingService.generateForVisit(
      visitId,
      BillingStage.ADVANCE_SKRD,
      dto,
      user,
      req.portScope,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Post('visits/:visitId/final-skrd')
  @Roles(
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.BENDAHARA,
  )
  generateFinalSkrd(
    @Param('visitId', ParseIntPipe) visitId: number,
    @Body() dto: GenerateBillingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.billingService.generateForVisit(
      visitId,
      BillingStage.FINAL_SKRD,
      dto,
      user,
      req.portScope,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Post('invoices/:id/issue')
  @Roles(
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.BENDAHARA,
  )
  issueInvoice(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.billingService.issueInvoice(id, user, req.portScope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Post('invoices/:id/void')
  @Roles(UserRole.KEPALA_PELABUHAN, UserRole.BENDAHARA)
  voidInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VoidInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.billingService.voidInvoice(id, dto, user, req.portScope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Post('invoices/:id/payments')
  @Roles(UserRole.ADMIN_PELABUHAN, UserRole.BENDAHARA)
  recordPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.billingService.recordPayment(id, dto, user, req.portScope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Post('invoices/:id/submit-payment')
  @Roles(UserRole.OPERATOR_KAPAL, UserRole.BENDAHARA)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  submitPaymentProof(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPaymentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.billingService.submitPaymentProof(id, dto, file, user, req.portScope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Post('payments/:paymentId/verify')
  @Roles(UserRole.KEPALA_PELABUHAN, UserRole.BENDAHARA)
  verifyPayment(
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.billingService.verifyPayment(paymentId, user, req.portScope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Get('adjustments')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.BENDAHARA,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.OPERATOR_KAPAL,
  )
  findAdjustments(@Req() req: { portScope: ScopeFilter }) {
    return this.billingService.findAdjustments(req.portScope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Post('invoices/:id/adjustments')
  @Roles(
    UserRole.ADMIN_PELABUHAN,
    UserRole.BENDAHARA,
    UserRole.OPERATOR_KAPAL,
  )
  requestAdjustment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestBillingAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.billingService.requestAdjustment(id, dto, user, req.portScope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Post('adjustments/:adjustmentId/decide')
  @Roles(UserRole.KEPALA_PELABUHAN, UserRole.ADMIN_PELABUHAN, UserRole.BENDAHARA)
  decideAdjustment(
    @Param('adjustmentId', ParseIntPipe) adjustmentId: number,
    @Body() dto: DecideBillingAdjustmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.billingService.decideAdjustment(adjustmentId, dto, actor, req.portScope);
  }
}
