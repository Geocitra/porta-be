import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ROLE_GROUPS } from '../../common/authz/role-taxonomy';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CloseGateHandoverDto,
  CreateFerryRouteDto,
  CreateGateTicketBookDto,
  CreateVesselManifestDto,
  OpenGateHandoverDto,
} from './dto/gate-ticketing.dto';
import { GateTicketingService } from './gate-ticketing.service';

@ApiTags('Phase 2: Gate Ticketing (Pas Masuk / MB) & Ferry Routes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('gate-ticketing')
export class GateTicketingController {
  constructor(private readonly gateTicketingService: GateTicketingService) {}

  @Get('books')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    ...ROLE_GROUPS.PASSENGER_BERTH_OFFICERS,
    UserRole.BENDAHARA,
    UserRole.DISHUB_EKSEKUTIF,
  )
  listBooks(@Req() req: { portScope: ScopeFilter }) {
    return this.gateTicketingService.listTicketBooks(req.portScope);
  }

  @Post('books')
  @Roles(
    UserRole.BENDAHARA,
    UserRole.PETUGAS_DERMAGA_PENUMPANG,
    UserRole.PETUGAS_DERMAGA,
    UserRole.PETUGAS_PELABUHAN,
  )
  createBook(
    @Body() dto: CreateGateTicketBookDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.gateTicketingService.createTicketBook(dto, actor, req.portScope);
  }

  @Get('handovers')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    ...ROLE_GROUPS.PASSENGER_BERTH_OFFICERS,
    UserRole.BENDAHARA,
    UserRole.DISHUB_EKSEKUTIF,
  )
  listHandovers(@Req() req: { portScope: ScopeFilter }) {
    return this.gateTicketingService.listHandovers(req.portScope);
  }

  @Post('handovers/open')
  @Roles(...ROLE_GROUPS.PASSENGER_BERTH_OFFICERS, UserRole.BENDAHARA)
  openHandover(
    @Body() dto: OpenGateHandoverDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.gateTicketingService.openHandover(dto, actor, req.portScope);
  }

  @Post('handovers/:id/close')
  @Roles(UserRole.BENDAHARA, UserRole.PETUGAS_DERMAGA_PENUMPANG)
  closeHandover(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseGateHandoverDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.gateTicketingService.closeHandover(id, dto, actor, req.portScope);
  }

  @Get('ferry-routes')
  listFerryRoutes(@Query('portId') portId?: string) {
    return this.gateTicketingService.listFerryRoutes(portId ? Number(portId) : undefined);
  }

  @Post('ferry-routes')
  @Roles(UserRole.SUPERADMIN)
  createFerryRoute(
    @Body() dto: CreateFerryRouteDto,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.gateTicketingService.createFerryRoute(dto, req.portScope);
  }

  @Get('manifests')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    ...ROLE_GROUPS.ALL_BERTH_OFFICERS,
    UserRole.BENDAHARA,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.OPERATOR_KAPAL,
  )
  listManifests(@Req() req: { portScope: ScopeFilter }) {
    return this.gateTicketingService.listManifests(req.portScope);
  }

  @Post('manifests')
  @Roles(...ROLE_GROUPS.ALL_BERTH_OFFICERS, UserRole.OPERATOR_KAPAL)
  createManifest(
    @Body() dto: CreateVesselManifestDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.gateTicketingService.createManifest(dto, actor, req.portScope);
  }
}
