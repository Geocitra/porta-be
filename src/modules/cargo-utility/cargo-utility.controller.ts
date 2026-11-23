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
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.BENDAHARA,
  )
  listCargo(@Req() req: { portScope: ScopeFilter }) {
    return this.cargoUtilityService.listCargo(req.portScope);
  }

  @Post('cargo')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN, UserRole.PETUGAS_DERMAGA)
  createCargo(@Body() dto: CreateCargoRecordDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.cargoUtilityService.createCargoRecord(dto, actor);
  }

  @Post('cargo/:id/pay')
  @Roles(UserRole.SUPERADMIN, UserRole.BENDAHARA)
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
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.BENDAHARA,
  )
  listEquipment(@Req() req: { portScope: ScopeFilter }) {
    return this.cargoUtilityService.listEquipment(req.portScope);
  }

  @Post('equipment')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN, UserRole.PETUGAS_DERMAGA)
  createEquipment(
    @Body() dto: CreateEquipmentRentalDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.cargoUtilityService.createEquipmentRental(dto, actor);
  }

  @Post('equipment/:id/pay')
  @Roles(UserRole.SUPERADMIN, UserRole.BENDAHARA)
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
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.BENDAHARA,
    UserRole.TENANT,
  )
  listUtilities(@Req() req: { portScope: ScopeFilter }) {
    return this.cargoUtilityService.listUtilities(req.portScope);
  }

  @Post('utilities')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN, UserRole.PETUGAS_DERMAGA)
  createUtility(
    @Body() dto: CreateUtilityReadingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.cargoUtilityService.createUtilityReading(dto, actor);
  }

  @Post('utilities/:id/pay')
  @Roles(UserRole.SUPERADMIN, UserRole.BENDAHARA)
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
    UserRole.ADMIN_PELABUHAN,
    UserRole.BENDAHARA,
    UserRole.TENANT,
  )
  getUtilityReceipt(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.cargoUtilityService.getUtilityReceipt(id, req.portScope);
  }
}

