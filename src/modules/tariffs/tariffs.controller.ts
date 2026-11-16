import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateTariffDto } from './dto/tariffs.dto';
import { TariffsService } from './tariffs.service';

@ApiTags('Tariffs (Perda Mimika 4/2023)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tariffs')
export class TariffsController {
  constructor(private readonly tariffsService: TariffsService) {}

  @Get()
  findAllActive() {
    return this.tariffsService.findAllActive();
  }

  @Post()
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  create(@Body() dto: CreateTariffDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.tariffsService.create(dto, actor);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthenticatedUser) {
    return this.tariffsService.deactivate(id, actor);
  }
}
