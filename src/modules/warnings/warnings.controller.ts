import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ROLE_GROUPS } from '../../common/authz/role-taxonomy';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { IssueWarningDto } from './dto/warnings.dto';
import { WarningsService } from './warnings.service';

@ApiTags('Warnings & Teguran Piutang')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('warnings')
export class WarningsController {
  constructor(private readonly warningsService: WarningsService) {}

  @Get()
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    ...ROLE_GROUPS.BILLING_WARNING_OFFICERS,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.OPERATOR_KAPAL,
    UserRole.TENANT,
  )
  findAll(@Req() req: { portScope: ScopeFilter }) {
    return this.warningsService.findAll(req.portScope);
  }

  @Post()
  @Roles(...ROLE_GROUPS.BILLING_WARNING_OFFICERS)
  issue(
    @Body() dto: IssueWarningDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.warningsService.issue(dto, actor, req.portScope);
  }
}
