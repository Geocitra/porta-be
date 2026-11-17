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
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateBerthDto, CreatePortDto, UpdateBerthDto, UpdatePortDto } from './dto/ports.dto';
import { PortsService } from './ports.service';

@ApiTags('Ports & Berths')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ports')
export class PortsController {
  constructor(private readonly portsService: PortsService) {}

  @Get()
  @ApiQuery({ name: 'portCategory', enum: PortCategory, required: false })
  findAllPorts(
    @Query('portCategory', new ParseEnumPipe(PortCategory, { optional: true }))
    portCategory?: PortCategory,
  ) {
    return this.portsService.findAllPorts(portCategory);
  }

  @Post()
  @Roles(UserRole.SUPERADMIN)
  createPort(@Body() dto: CreatePortDto) {
    return this.portsService.createPort(dto);
  }

  @Get(':portId/berths')
  @UseGuards(PortScopeGuard)
  @ApiQuery({ name: 'berthServiceCategory', enum: BerthServiceCategory, required: false })
  findBerths(
    @Param('portId', ParseIntPipe) portId: number,
    @Query('berthServiceCategory', new ParseEnumPipe(BerthServiceCategory, { optional: true }))
    berthServiceCategory?: BerthServiceCategory,
  ) {
    return this.portsService.findBerthsByPort(portId, berthServiceCategory);
  }

  @Post('berths')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  @UseGuards(PortScopeGuard)
  createBerth(@Body() dto: CreateBerthDto) {
    return this.portsService.createBerth(dto);
  }

  @Patch(':portId')
  @Roles(UserRole.SUPERADMIN)
  updatePort(
    @Param('portId', ParseIntPipe) portId: number,
    @Body() dto: UpdatePortDto,
  ) {
    return this.portsService.updatePort(portId, dto);
  }

  @Patch('berths/:berthId')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  @UseGuards(PortScopeGuard)
  updateBerth(
    @Param('berthId', ParseIntPipe) berthId: number,
    @Body() dto: UpdateBerthDto,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.portsService.updateBerth(berthId, dto, req.portScope);
  }
}

