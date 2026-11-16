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
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CloseGateHandoverDto,
  CreateFerryRouteDto,
  CreateGateTicketBookDto,
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
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.BENDAHARA,
  )
  listBooks(@Req() req: { portScope: ScopeFilter }) {
    return this.gateTicketingService.listTicketBooks(req.portScope);
  }

  @Post('books')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  createBook(
    @Body() dto: CreateGateTicketBookDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.gateTicketingService.createTicketBook(dto, actor);
  }

  @Post('handovers/open')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN, UserRole.PETUGAS_DERMAGA)
  openHandover(
    @Body() dto: OpenGateHandoverDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.gateTicketingService.openHandover(dto, actor, req.portScope);
  }

  @Post('handovers/:id/close')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN, UserRole.BENDAHARA)
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
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  createFerryRoute(@Body() dto: CreateFerryRouteDto) {
    return this.gateTicketingService.createFerryRoute(dto);
  }
}

