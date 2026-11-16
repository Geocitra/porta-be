import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateTariffDto } from './dto/tariffs.dto';
import { ExchangeRateService } from './exchange-rate.service';
import { TariffsService } from './tariffs.service';

@ApiTags('Tariffs (Perda Mimika 4/2023)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tariffs')
export class TariffsController {
  constructor(
    private readonly tariffsService: TariffsService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  @Get()
  findAllActive() {
    return this.tariffsService.findAllActive();
  }

  @Get('exchange-rate/usd')
  @ApiOperation({ summary: 'Get current dynamic live USD to IDR rate from internet API' })
  @ApiQuery({ name: 'refresh', required: false, type: Boolean })
  getLiveUsdRate(@Query('refresh') refresh?: string) {
    const forceRefresh = refresh === 'true' || refresh === '1';
    return this.exchangeRateService.getExchangeRateDetails(forceRefresh);
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
