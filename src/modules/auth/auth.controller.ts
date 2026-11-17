import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { ChangeMyPasswordDto, UpdateMyProfileDto } from './dto/account.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterOperatorDto, RegisterTenantDto } from './dto/register.dto';

@ApiTags('Auth & Operator Onboarding')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  registerOperator(@Body() dto: RegisterOperatorDto) {
    return this.authService.registerOperator(dto);
  }

  @Post('register-tenant')
  registerTenant(@Body() dto: RegisterTenantDto) {
    return this.authService.registerTenant(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('me/profile')
  updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMyProfileDto,
  ) {
    return this.authService.updateMyProfile(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  changeMyPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeMyPasswordDto,
  ) {
    return this.authService.changeMyPassword(user, dto);
  }
}
