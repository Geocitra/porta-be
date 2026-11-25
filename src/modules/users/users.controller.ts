import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateUserDto,
  ResetUserPasswordDto,
  UpdateRolePermissionsDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('Users Management & RBAC Role-Permission Matrix')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Roles(
  UserRole.SUPERADMIN,
  UserRole.KEPALA_PELABUHAN,
  UserRole.ADMIN_PELABUHAN,
)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Req() req: { portScope: ScopeFilter }) {
    return this.usersService.findAll(req.portScope);
  }

  @Get('rbac/roles')
  @ApiOperation({
    summary:
      'Get full RBAC Role Taxonomy, operational domains, UI capabilities, effective permissions, and active user counts',
  })
  getRbacRolesCatalog(@Req() req: { portScope: ScopeFilter }) {
    return this.usersService.getRbacRolesCatalog(req.portScope);
  }

  @Put('rbac/roles/:role/permissions')
  @Roles(UserRole.SUPERADMIN)
  @ApiOperation({
    summary:
      'Update database-backed RolePermission matrix for a specific UserRole (SUPERADMIN only)',
  })
  updateRolePermissions(
    @Param('role', new ParseEnumPipe(UserRole)) role: UserRole,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.updateRolePermissions(role, dto, actor);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a new user account with optional auto-generated unique username & one-time copyable temporary password',
  })
  createUser(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.createUser(dto, actor);
  }

  @Patch(':id')
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.usersService.updateUser(id, dto, actor, req.portScope);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.usersService.updateStatus(id, dto, actor, req.portScope);
  }

  @Patch(':id/reset-password')
  @ApiOperation({
    summary:
      'Reset user password (auto-generates a one-time copyable temporary password if newPassword is omitted and forces mustChangePassword=true)',
  })
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.usersService.resetPassword(id, dto, actor, req.portScope);
  }
}
