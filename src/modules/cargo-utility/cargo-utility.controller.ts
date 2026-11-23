import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ROLE_GROUPS } from '../../common/authz/role-taxonomy';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CargoUtilityService } from './cargo-utility.service';
import {
  CreateCargoRecordDto,
  CreateEquipmentRentalDto,
  CreateUtilityReadingDto,
  PayChargeDto,
} from './dto/cargo-utility.dto';

@ApiTags('Phase 2B: Cargo Handling, Equipment & Utilities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('cargo-utility')
export class CargoUtilityController {
  constructor(private readonly cargoUtilityService: CargoUtilityService) {}

  @Get('cargo')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    ...ROLE_GROUPS.CARGO_BERTH_OFFICERS,
    UserRole.PETUGAS_TAGIHAN,
    UserRole.BENDAHARA,
    UserRole.DISHUB_EKSEKUTIF,
  )
  listCargo(@Req() req: { portScope: ScopeFilter }) {
    return this.cargoUtilityService.listCargo(req.portScope);
  }

  @Post('cargo')
  @Roles(...ROLE_GROUPS.CARGO_BERTH_OFFICERS)
  createCargo(
    @Body() dto: CreateCargoRecordDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.cargoUtilityService.createCargoRecord(dto, actor, req.portScope);
  }

  @Post('cargo/:id/pay')
  @Roles(...ROLE_GROUPS.BILLING_WARNING_OFFICERS)
  payCargo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayChargeDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.cargoUtilityService.payCargoRecord(id, dto, actor, req.portScope);
  }

  @Get('equipment')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    ...ROLE_GROUPS.CARGO_BERTH_OFFICERS,
    UserRole.PETUGAS_TAGIHAN,
    UserRole.BENDAHARA,
    UserRole.DISHUB_EKSEKUTIF,
  )
  listEquipment(@Req() req: { portScope: ScopeFilter }) {
    return this.cargoUtilityService.listEquipment(req.portScope);
  }

  @Post('equipment')
  @Roles(...ROLE_GROUPS.CARGO_BERTH_OFFICERS)
  createEquipment(
    @Body() dto: CreateEquipmentRentalDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.cargoUtilityService.createEquipmentRental(dto, actor, req.portScope);
  }

  @Post('equipment/:id/pay')
  @Roles(...ROLE_GROUPS.BILLING_WARNING_OFFICERS)
  payEquipment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayChargeDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.cargoUtilityService.payEquipmentRental(id, dto, actor, req.portScope);
  }

  @Get('utilities')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    ...ROLE_GROUPS.ROOM_ASSET_OFFICERS,
    ...ROLE_GROUPS.BILLING_WARNING_OFFICERS,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.TENANT,
    UserRole.OPERATOR_KAPAL,
  )
  listUtilities(@Req() req: { portScope: ScopeFilter }) {
    return this.cargoUtilityService.listUtilities(req.portScope);
  }

  @Post('utilities')
  @Roles(...ROLE_GROUPS.ROOM_ASSET_OFFICERS)
  createUtility(
    @Body() dto: CreateUtilityReadingDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.cargoUtilityService.createUtilityReading(dto, actor, req.portScope);
  }

  @Post('utilities/:id/pay')
  @Roles(...ROLE_GROUPS.BILLING_WARNING_OFFICERS)
  payUtility(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayChargeDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.cargoUtilityService.payUtilityReading(id, dto, actor, req.portScope);
  }

  @Get('utilities/:id/receipt')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    ...ROLE_GROUPS.ROOM_ASSET_OFFICERS,
    ...ROLE_GROUPS.BILLING_WARNING_OFFICERS,
    UserRole.TENANT,
    UserRole.OPERATOR_KAPAL,
  )
  getUtilityReceipt(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.cargoUtilityService.getUtilityReceipt(id, req.portScope);
  }
}
