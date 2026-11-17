import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AssetsLeasesService } from './assets-leases.service';
import {
  CreateAssetLeaseDto,
  CreateMasterTenantDto,
  CreatePortAssetDto,
  RecordLeasePaymentDto,
  RejectAssetLeaseDto,
  RequestAssetLeaseDto,
  UpdateMasterTenantDto,
  UpdatePortAssetDto,
  UploadTenantDocumentDto,
  VerifyTenantDto,
} from './dto/assets-leases.dto';

@ApiTags('Phase 2: Port Assets & Leases (Kios/Gudang/Lahan)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('assets-leases')
export class AssetsLeasesController {
  constructor(private readonly assetsLeasesService: AssetsLeasesService) {}

  @Get('tenants')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  listTenants() {
    return this.assetsLeasesService.listTenants();
  }

  @Post('tenants')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  createMasterTenant(@Body() dto: CreateMasterTenantDto) {
    return this.assetsLeasesService.createMasterTenant(dto);
  }

  @Patch('tenants/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  updateMasterTenant(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMasterTenantDto,
  ) {
    return this.assetsLeasesService.updateMasterTenant(id, dto);
  }

  @Get('tenants/me')
  @Roles(UserRole.TENANT)
  getMyTenantProfile(@CurrentUser() actor: AuthenticatedUser) {
    return this.assetsLeasesService.getMyTenantProfile(actor);
  }

  @Post('tenants/me/documents')
  @Roles(UserRole.TENANT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadMyTenantDocument(
    @Body() dto: UploadTenantDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.assetsLeasesService.uploadTenantDocument(dto, file, actor);
  }

  @Patch('tenants/:id/verify')
  @Roles(UserRole.ADMIN_PELABUHAN)
  verifyTenant(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyTenantDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.assetsLeasesService.verifyTenant(id, dto, actor);
  }

  @Get('assets')
  listAssets(@Req() req: { portScope: ScopeFilter }) {
    return this.assetsLeasesService.listAssets(req.portScope);
  }

  @Post('assets')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  createAsset(@Body() dto: CreatePortAssetDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.assetsLeasesService.createAsset(dto, actor);
  }

  @Patch('assets/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  updateAsset(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePortAssetDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.assetsLeasesService.updateAsset(id, dto, actor);
  }

  @Get('leases')
  @Roles(
    UserRole.ADMIN_PELABUHAN,
    UserRole.BENDAHARA,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.TENANT,
  )
  listLeases(@Req() req: { portScope: ScopeFilter }) {
    return this.assetsLeasesService.listLeases(req.portScope);
  }

  @Post('leases/request')
  @Roles(UserRole.TENANT)
  requestLease(
    @Body() dto: RequestAssetLeaseDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assetsLeasesService.requestLease(dto, actor, req.portScope);
  }

  @Post('leases')
  @Roles(UserRole.ADMIN_PELABUHAN)
  createLease(
    @Body() dto: CreateAssetLeaseDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assetsLeasesService.createAndActivateLease(dto, actor, req.portScope);
  }

  @Patch('leases/:id/approve')
  @Roles(UserRole.ADMIN_PELABUHAN)
  approveLease(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assetsLeasesService.approveLeaseRequest(id, actor, req.portScope);
  }

  @Patch('leases/:id/reject')
  @Roles(UserRole.ADMIN_PELABUHAN)
  rejectLease(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectAssetLeaseDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assetsLeasesService.rejectLeaseRequest(id, dto, actor, req.portScope);
  }

  @Post('leases/:id/payments')
  @Roles(UserRole.SUPERADMIN, UserRole.BENDAHARA)
  recordLeasePayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordLeasePaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assetsLeasesService.recordLeasePayment(id, dto, actor, req.portScope);
  }
}

