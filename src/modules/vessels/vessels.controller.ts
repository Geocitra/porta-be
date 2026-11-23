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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole, VesselCategory } from '@prisma/client';
import { ROLE_GROUPS } from '../../common/authz/role-taxonomy';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateBerthingContractDto,
  CreateOperatorDto,
  CreateVesselDto,
  ReviewBerthingContractDto,
  UpdateOperatorDto,
  UpdateVesselDto,
  UploadDocumentDto,
  VerifyBerthingContractDto,
  VerifyEntityDto,
} from './dto/vessels.dto';
import { VesselsService } from './vessels.service';

@ApiTags('Registered Shipping Companies (Operators) & Their Vessel Fleets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('operators')
export class OperatorsController {
  constructor(private readonly vesselsService: VesselsService) {}

  @Get()
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    ...ROLE_GROUPS.ALL_FIELD_OFFICERS,
    UserRole.ADMIN_PELABUHAN,
    UserRole.KEPALA_PELABUHAN,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.OPERATOR_KAPAL,
  )
  findOperators(@Req() req: { portScope: ScopeFilter }) {
    return this.vesselsService.findOperators(req.portScope);
  }

  @Get('contracts/pending')
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS)
  listPendingContracts(@Req() req: { portScope: ScopeFilter }) {
    return this.vesselsService.listPendingContracts(req.portScope);
  }

  @Patch('contracts/:contractId/review')
  @Roles(
    UserRole.PETUGAS_REGISTRASI_KONTRAK,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
  )
  reviewContract(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Body() dto: ReviewBerthingContractDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.vesselsService.reviewContractByOfficer(contractId, dto, actor, req.portScope);
  }

  @Patch('contracts/:contractId/verify')
  @Roles(UserRole.KEPALA_PELABUHAN)
  verifyContract(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Body() dto: VerifyBerthingContractDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.vesselsService.verifyContract(contractId, dto, actor, req.portScope);
  }

  @Get(':id/contracts')
  @Roles(
    ...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS,
    ...ROLE_GROUPS.ALL_BERTH_OFFICERS,
    UserRole.OPERATOR_KAPAL,
  )
  getOperatorContracts(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.vesselsService.getOperatorContracts(id, req.portScope);
  }

  @Post(':id/contracts')
  @Roles(
    UserRole.PETUGAS_REGISTRASI_KONTRAK,
    UserRole.ADMIN_PELABUHAN,
    UserRole.OPERATOR_KAPAL,
  )
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  createOperatorContract(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateBerthingContractDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.vesselsService.createOperatorContract(id, dto, file, actor, req.portScope);
  }

  @Get(':id')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    ...ROLE_GROUPS.ALL_FIELD_OFFICERS,
    UserRole.ADMIN_PELABUHAN,
    UserRole.KEPALA_PELABUHAN,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.OPERATOR_KAPAL,
  )
  findOperatorById(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.vesselsService.findOperatorById(id, req.portScope);
  }

  @Get(':id/vessels')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    ...ROLE_GROUPS.ALL_FIELD_OFFICERS,
    UserRole.ADMIN_PELABUHAN,
    UserRole.KEPALA_PELABUHAN,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.OPERATOR_KAPAL,
  )
  @ApiQuery({ name: 'vesselCategory', enum: VesselCategory, required: false })
  findVesselsByOperator(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { portScope: ScopeFilter },
    @Query('vesselCategory', new ParseEnumPipe(VesselCategory, { optional: true }))
    vesselCategory?: VesselCategory,
  ) {
    return this.vesselsService.findVesselsByOperator(id, req.portScope, vesselCategory);
  }

  @Post()
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS)
  createOperator(@Body() dto: CreateOperatorDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.vesselsService.createOperator(dto, actor);
  }

  @Patch(':id')
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS, UserRole.OPERATOR_KAPAL)
  updateOperator(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOperatorDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.vesselsService.updateOperator(id, dto, actor, req.portScope);
  }

  @Post(':id/verify')
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS)
  verifyOperator(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyEntityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vesselsService.verifyOperator(id, dto, actor);
  }

  @Post(':id/vessels')
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS, UserRole.OPERATOR_KAPAL)
  createVesselForOperator(
    @Param('id', ParseIntPipe) operatorId: number,
    @Body() dto: CreateVesselDto,
    @Req() req: { portScope: ScopeFilter },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vesselsService.createVessel({ ...dto, operatorId }, req.portScope, actor);
  }

  @Post(':id/documents')
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS, UserRole.OPERATOR_KAPAL)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadOperatorDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.vesselsService.uploadOperatorDocument(id, dto, file, actor, req.portScope);
  }
}

@ApiTags('Vessels, Operators & Document Verification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('vessels')
export class VesselsController {
  constructor(private readonly vesselsService: VesselsService) {}

  @Get('operators')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    ...ROLE_GROUPS.ALL_FIELD_OFFICERS,
    UserRole.ADMIN_PELABUHAN,
    UserRole.KEPALA_PELABUHAN,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.OPERATOR_KAPAL,
  )
  findOperators(@Req() req: { portScope: ScopeFilter }) {
    return this.vesselsService.findOperators(req.portScope);
  }

  @Post('operators')
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS)
  createOperator(@Body() dto: CreateOperatorDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.vesselsService.createOperator(dto, actor);
  }

  @Patch('operators/:id')
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS, UserRole.OPERATOR_KAPAL)
  updateOperator(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOperatorDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.vesselsService.updateOperator(id, dto, actor, req.portScope);
  }

  @Post('operators/:id/verify')
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS)
  verifyOperator(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyEntityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vesselsService.verifyOperator(id, dto, actor);
  }

  @Post('operators/:id/documents')
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS, UserRole.OPERATOR_KAPAL)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadOperatorDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.vesselsService.uploadOperatorDocument(id, dto, file, actor, req.portScope);
  }

  @Get('operators/:id/contracts')
  @Roles(
    ...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS,
    ...ROLE_GROUPS.ALL_BERTH_OFFICERS,
    UserRole.OPERATOR_KAPAL,
  )
  getOperatorContractsAlias(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.vesselsService.getOperatorContracts(id, req.portScope);
  }

  @Post('operators/:id/contracts')
  @Roles(
    UserRole.PETUGAS_REGISTRASI_KONTRAK,
    UserRole.ADMIN_PELABUHAN,
    UserRole.OPERATOR_KAPAL,
  )
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  createOperatorContractAlias(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateBerthingContractDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.vesselsService.createOperatorContract(id, dto, file, actor, req.portScope);
  }

  @Get('contracts/pending')
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS)
  listPendingContractsAlias(@Req() req: { portScope: ScopeFilter }) {
    return this.vesselsService.listPendingContracts(req.portScope);
  }

  @Patch('contracts/:contractId/review')
  @Roles(
    UserRole.PETUGAS_REGISTRASI_KONTRAK,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
  )
  reviewContractAlias(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Body() dto: ReviewBerthingContractDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.vesselsService.reviewContractByOfficer(contractId, dto, actor, req.portScope);
  }

  @Patch('contracts/:contractId/verify')
  @Roles(UserRole.KEPALA_PELABUHAN)
  verifyContractAlias(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Body() dto: VerifyBerthingContractDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.vesselsService.verifyContract(contractId, dto, actor, req.portScope);
  }

  @Get()
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.KEPALA_DINAS,
    UserRole.KEPALA_BIDANG,
    ...ROLE_GROUPS.ALL_FIELD_OFFICERS,
    UserRole.ADMIN_PELABUHAN,
    UserRole.KEPALA_PELABUHAN,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.OPERATOR_KAPAL,
  )
  @ApiQuery({ name: 'vesselCategory', enum: VesselCategory, required: false })
  findVessels(
    @Req() req: { portScope: ScopeFilter },
    @Query('vesselCategory', new ParseEnumPipe(VesselCategory, { optional: true }))
    vesselCategory?: VesselCategory,
  ) {
    return this.vesselsService.findVessels(req.portScope, vesselCategory);
  }

  @Post()
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS, UserRole.OPERATOR_KAPAL)
  createVessel(
    @Body() dto: CreateVesselDto,
    @Req() req: { portScope: ScopeFilter },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vesselsService.createVessel(dto, req.portScope, actor);
  }

  @Patch(':id')
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS, UserRole.OPERATOR_KAPAL)
  updateVessel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVesselDto,
    @Req() req: { portScope: ScopeFilter },
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vesselsService.updateVessel(id, dto, actor, req.portScope);
  }

  @Post(':id/verify')
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS)
  verifyVessel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyEntityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vesselsService.verifyVessel(id, dto, actor);
  }

  @Post(':id/documents')
  @Roles(...ROLE_GROUPS.REGISTRATION_CONTRACT_OFFICERS, UserRole.OPERATOR_KAPAL)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadVesselDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { portScope: ScopeFilter },
  ) {
    return this.vesselsService.uploadVesselDocument(id, dto, file, actor, req.portScope);
  }
}
