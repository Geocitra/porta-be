import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BerthServiceCategory, PortCategory, UserRole } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateBerthDto,
  CreateDivisionDto,
  CreatePortDto,
  CreatePortFacilityDto,
  CreatePortZoneDto,
  CreateTerminalDto,
  UpdateBerthDto,
  UpdatePortDto,
  UpdateTerminalDto,
} from './dto/ports.dto';
import { PortsService } from './ports.service';

@ApiTags('Ports, Terminals, Berths, Zones & Facilities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ports')
export class PortsController {
  constructor(private readonly portsService: PortsService) {}

  @Get()
  @UseGuards(PortScopeGuard)
  @ApiQuery({ name: 'portCategory', enum: PortCategory, required: false })
  findAllPorts(
    @Req() req: { portScope: ScopeFilter },
    @Query('portCategory', new ParseEnumPipe(PortCategory, { optional: true }))
    portCategory?: PortCategory,
  ) {
    return this.portsService.findAllPorts(portCategory, req.portScope);
  }

  @Post()
  @Roles(UserRole.SUPERADMIN)
  createPort(@Body() dto: CreatePortDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.portsService.createPort(dto, actor);
  }

  @Patch(':portId')
  @Roles(UserRole.SUPERADMIN)
  updatePort(
    @Param('portId', ParseIntPipe) portId: number,
    @Body() dto: UpdatePortDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.portsService.updatePort(portId, dto, actor);
  }

  @Get('divisions/all')
  findDivisions() {
    return this.portsService.findDivisions();
  }

  @Post('divisions')
  @Roles(UserRole.SUPERADMIN)
  createDivision(@Body() dto: CreateDivisionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.portsService.createDivision(dto, actor);
  }

  @Get(':portId/terminals')
  @UseGuards(PortScopeGuard)
  findTerminalsByPort(
    @Param('portId', ParseIntPipe) portId: number,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.portsService.findTerminals(portId, req.portScope);
  }

  @Get(':portId/berths')
  @UseGuards(PortScopeGuard)
  @ApiQuery({ name: 'berthServiceCategory', enum: BerthServiceCategory, required: false })
  findBerths(
    @Param('portId', ParseIntPipe) portId: number,
    @Req() req: { portScope: ScopeFilter },
    @Query('berthServiceCategory', new ParseEnumPipe(BerthServiceCategory, { optional: true }))
    berthServiceCategory?: BerthServiceCategory,
  ) {
    return this.portsService.findBerthsByPort(portId, berthServiceCategory, req.portScope);
  }

  @Post('berths')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  @UseGuards(PortScopeGuard)
  createBerth(
    @Body() dto: CreateBerthDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.portsService.createBerth(dto, actor, req.portScope);
  }

  @Patch('berths/:berthId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  @UseGuards(PortScopeGuard)
  updateBerth(
    @Param('berthId', ParseIntPipe) berthId: number,
    @Body() dto: UpdateBerthDto,
    @Req() req: { portScope: ScopeFilter },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.portsService.updateBerth(berthId, dto, req.portScope, actor);
  }

  @Get(':portId/zones')
  @UseGuards(PortScopeGuard)
  findZones(
    @Param('portId', ParseIntPipe) portId: number,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.portsService.findZonesByPort(portId, req.portScope);
  }

  @Post(':portId/zones')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  @UseGuards(PortScopeGuard)
  createZone(
    @Param('portId', ParseIntPipe) portId: number,
    @Body() dto: CreatePortZoneDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.portsService.createZone(portId, dto, actor, req.portScope);
  }

  @Get(':portId/facilities')
  @UseGuards(PortScopeGuard)
  findFacilities(
    @Param('portId', ParseIntPipe) portId: number,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.portsService.findFacilitiesByPort(portId, req.portScope);
  }

  @Post(':portId/facilities')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  @UseGuards(PortScopeGuard)
  createFacility(
    @Param('portId', ParseIntPipe) portId: number,
    @Body() dto: CreatePortFacilityDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.portsService.createFacility(portId, dto, actor, req.portScope);
  }
}

@ApiTags('Terminals & Berths Domain Endpoints')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller()
export class TerminalsAndBerthsController {
  constructor(private readonly portsService: PortsService) {}

  @Get('terminals')
  findTerminals(
    @Query('portId') portId: string | undefined,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.portsService.findTerminals(portId ? Number(portId) : undefined, req.portScope);
  }

  @Post('terminals')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  createTerminal(
    @Body() dto: CreateTerminalDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.portsService.createTerminal(dto, actor, req.portScope);
  }

  @Patch('terminals/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  updateTerminal(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTerminalDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.portsService.updateTerminal(id, dto, actor, req.portScope);
  }

  @Get('berths')
  @ApiQuery({ name: 'portId', required: false, type: Number })
  @ApiQuery({ name: 'berthServiceCategory', enum: BerthServiceCategory, required: false })
  findBerths(
    @Query('portId') portId: string | undefined,
    @Query('berthServiceCategory', new ParseEnumPipe(BerthServiceCategory, { optional: true }))
    berthServiceCategory: BerthServiceCategory | undefined,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.portsService.findBerthsByPort(
      portId ? Number(portId) : undefined,
      berthServiceCategory,
      req.portScope,
    );
  }

  @Post('berths')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  createBerth(
    @Body() dto: CreateBerthDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.portsService.createBerth(dto, actor, req.portScope);
  }

  @Patch('berths/:berthId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  updateBerth(
    @Param('berthId', ParseIntPipe) berthId: number,
    @Body() dto: UpdateBerthDto,
    @Req() req: { portScope: ScopeFilter },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.portsService.updateBerth(berthId, dto, req.portScope, actor);
  }
}
