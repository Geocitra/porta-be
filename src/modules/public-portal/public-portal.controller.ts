import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ExchangeRateService } from '../tariffs/exchange-rate.service';
import { CreateComplaintDto, ResolveComplaintDto } from './dto/public-portal.dto';
import { PublicPortalService } from './public-portal.service';

@ApiTags('Public Portal & Pengaduan')
@Controller()
export class PublicPortalController {
  constructor(
    private readonly publicPortalService: PublicPortalService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  @Get('public/ports')
  getPublicPorts() {
    return this.publicPortalService.getPublicPorts();
  }

  @Get('public/exchange-rate')
  getPublicExchangeRate() {
    return this.exchangeRateService.getExchangeRateDetails();
  }

  @Get('public/tariffs')
  getPublicTariffs() {
    return this.publicPortalService.getPublicTariffs();
  }

  @Get('public/schedules')
  getPublicSchedules(@Query('portId') portId?: string) {
    return this.publicPortalService.getPublicSchedules(portId ? Number(portId) : undefined);
  }

  @Get('public/invoices/check')
  checkInvoice(@Query('invoiceNumber') invoiceNumber: string) {
    return this.publicPortalService.checkInvoicePublic(invoiceNumber);
  }

  @Post('public/complaints')
  submitComplaint(@Body() dto: CreateComplaintDto) {
    return this.publicPortalService.submitComplaint(dto);
  }

  @Get('public/complaints/track')
  trackComplaint(@Query('ticketNumber') ticketNumber: string) {
    return this.publicPortalService.trackComplaint(ticketNumber);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.TENANT,
    UserRole.OPERATOR_KAPAL,
    UserRole.SUPERADMIN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.PETUGAS_RUANGAN,
  )
  @Get('complaints/my')
  findMyComplaints(@CurrentUser() user: AuthenticatedUser) {
    return this.publicPortalService.findUserComplaints(user.email, user.fullName);
  }

  // ==========================================================================
  // STAFF COMPLAINT MANAGEMENT (Auth + PortScope Protected)
  // ==========================================================================

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.PETUGAS_RUANGAN,
    UserRole.DISHUB_EKSEKUTIF,
  )
  @Get('complaints')
  findStaffComplaints(@Req() req: { portScope: ScopeFilter }) {
    return this.publicPortalService.findStaffComplaints(req.portScope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
  @Roles(
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.PETUGAS_RUANGAN,
  )
  @Patch('complaints/:id/resolve')
  resolveComplaint(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveComplaintDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.publicPortalService.resolveComplaint(id, dto, actor, req.portScope);
  }
}
