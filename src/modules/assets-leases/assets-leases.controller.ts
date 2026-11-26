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
import { ROLE_GROUPS } from '../../common/authz/role-taxonomy';
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
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    ...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS,
    ...ROLE_GROUPS.ROOM_ASSET_OFFICERS,
    UserRole.PETUGAS_TAGIHAN,
    UserRole.BENDAHARA,
    UserRole.DISHUB_EKSEKUTIF,
  )
  listTenants() {
    return this.assetsLeasesService.listTenants();
  }

  @Post('tenants')
  @Roles(
    ...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS,
    ...ROLE_GROUPS.ROOM_ASSET_OFFICERS,
  )
  createMasterTenant(@Body() dto: CreateMasterTenantDto) {
    return this.assetsLeasesService.createMasterTenant(dto);
  }

  @Patch('tenants/:id')
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS, ...ROLE_GROUPS.ROOM_ASSET_OFFICERS)
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
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS)
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
  @Roles(UserRole.SUPERADMIN, ...ROLE_GROUPS.ROOM_ASSET_OFFICERS)
  createAsset(
    @Body() dto: CreatePortAssetDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assetsLeasesService.createAsset(dto, actor, req.portScope);
  }

  @Patch('assets/:id')
  @Roles(UserRole.SUPERADMIN, ...ROLE_GROUPS.ROOM_ASSET_OFFICERS)
  updateAsset(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePortAssetDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assetsLeasesService.updateAsset(id, dto, actor, req.portScope);
  }

  @Get('leases')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    ...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS,
    ...ROLE_GROUPS.ROOM_ASSET_OFFICERS,
    ...ROLE_GROUPS.BILLING_WARNING_OFFICERS,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.TENANT,
    UserRole.OPERATOR_KAPAL,
  )
  listLeases(@Req() req: { portScope: ScopeFilter }) {
    return this.assetsLeasesService.listLeases(req.portScope);
  }

  @Post('leases/request')
  @Roles(UserRole.TENANT, UserRole.OPERATOR_KAPAL)
  requestLease(
    @Body() dto: RequestAssetLeaseDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assetsLeasesService.requestLease(dto, actor, req.portScope);
  }

  @Post('leases')
  @Roles(
    ...ROLE_GROUPS.ROOM_ASSET_OFFICERS,
    ...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS,
  )
  createLease(
    @Body() dto: CreateAssetLeaseDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assetsLeasesService.createAndActivateLease(dto, actor, req.portScope);
  }

  @Patch('leases/:id/verify-room')
  @Roles(
    ...ROLE_GROUPS.ROOM_ASSET_OFFICERS,
    ...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS,
  )
  verifyRoom(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assetsLeasesService.verifyRoomOfficer(id, actor, req.portScope);
  }

  @Patch('leases/:id/approve')
  @Roles(UserRole.KEPALA_PELABUHAN)
  approveLease(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assetsLeasesService.approveLeaseRequest(id, actor, req.portScope);
  }

  @Patch('leases/:id/reject')
  @Roles(
    ...ROLE_GROUPS.ROOM_ASSET_OFFICERS,
    ...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS,
  )
  rejectLease(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectAssetLeaseDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assetsLeasesService.rejectLeaseRequest(id, dto, actor, req.portScope);
  }

  @Post('leases/:id/payments')
  @Roles(...ROLE_GROUPS.BILLING_WARNING_OFFICERS)
  recordLeasePayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordLeasePaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assetsLeasesService.recordLeasePayment(id, dto, actor, req.portScope);
  }

  @Get('payments/:paymentId/receipt')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    UserRole.KEPALA_PELABUHAN,
    ...ROLE_GROUPS.ROOM_ASSET_OFFICERS,
    ...ROLE_GROUPS.BILLING_WARNING_OFFICERS,
    UserRole.TENANT,
    UserRole.OPERATOR_KAPAL,
  )
  getLeasePaymentReceipt(
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.assetsLeasesService.getLeasePaymentReceipt(paymentId, req.portScope);
  }
}
