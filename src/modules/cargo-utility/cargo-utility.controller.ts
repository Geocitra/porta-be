import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
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
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.BENDAHARA,
    UserRole.DISHUB_EKSEKUTIF,
  )
  listCargo(@Req() req: { portScope: ScopeFilter }) {
    return this.cargoUtilityService.listCargoRecords(req.portScope);
  }

  @Post('cargo')
  @Roles(
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
  )
  createCargo(
    @Body() dto: CreateCargoRecordDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.cargoUtilityService.createCargoRecord(dto, actor, req.portScope);
  }

  @Post('cargo/:id/pay')
  @Roles(UserRole.ADMIN_PELABUHAN, UserRole.BENDAHARA)
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
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.BENDAHARA,
    UserRole.DISHUB_EKSEKUTIF,
  )
  listEquipment(@Req() req: { portScope: ScopeFilter }) {
    return this.cargoUtilityService.listEquipmentRentals(req.portScope);
  }

  @Post('equipment')
  @Roles(
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
  )
  createEquipment(
    @Body() dto: CreateEquipmentRentalDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.cargoUtilityService.createEquipmentRental(dto, actor, req.portScope);
  }

  @Post('equipment/:id/pay')
  @Roles(UserRole.ADMIN_PELABUHAN, UserRole.BENDAHARA)
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
    UserRole.KEPALA_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.BENDAHARA,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.TENANT,
  )
  listUtilities(@Req() req: { portScope: ScopeFilter }) {
    return this.cargoUtilityService.listUtilities(req.portScope);
  }

  @Post('utilities')
  @Roles(
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
  )
  createUtility(
    @Body() dto: CreateUtilityReadingDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.cargoUtilityService.createUtilityReading(dto, actor, req.portScope);
  }

  @Post('utilities/:id/pay')
  @Roles(UserRole.ADMIN_PELABUHAN, UserRole.BENDAHARA)
  payUtility(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayChargeDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.cargoUtilityService.payUtilityReading(id, dto, actor, req.portScope);
  }
}
