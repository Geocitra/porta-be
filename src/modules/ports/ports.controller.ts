import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateBerthDto, CreatePortDto } from './dto/ports.dto';
import { PortsService } from './ports.service';

@ApiTags('Ports & Berths')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ports')
export class PortsController {
  constructor(private readonly portsService: PortsService) {}

  @Get()
  findAllPorts() {
    return this.portsService.findAllPorts();
  }

  @Post()
  @Roles(UserRole.SUPERADMIN)
  createPort(@Body() dto: CreatePortDto) {
    return this.portsService.createPort(dto);
  }

  @Get(':portId/berths')
  @UseGuards(PortScopeGuard)
  findBerths(@Param('portId', ParseIntPipe) portId: number) {
    return this.portsService.findBerthsByPort(portId);
  }

  @Post('berths')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  @UseGuards(PortScopeGuard)
  createBerth(@Body() dto: CreateBerthDto) {
    return this.portsService.createBerth(dto);
  }
}

