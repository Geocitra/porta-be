import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
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
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PortScopeGuard, ScopeFilter } from '../../common/guards/port-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateOperatorDto,
  CreateVesselDto,
  UploadDocumentDto,
  VerifyEntityDto,
} from './dto/vessels.dto';
import { VesselsService } from './vessels.service';

@ApiTags('Vessels, Operators & Document Verification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PortScopeGuard)
@Controller('vessels')
export class VesselsController {
  constructor(private readonly vesselsService: VesselsService) {}

  @Get('operators')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.BENDAHARA,
    UserRole.DISHUB_EKSEKUTIF,
    UserRole.OPERATOR_KAPAL,
  )
  findOperators(@Req() req: { portScope: ScopeFilter }) {
    return this.vesselsService.findOperators(req.portScope);
  }

  @Post('operators')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN, UserRole.PETUGAS_DERMAGA)
  createOperator(@Body() dto: CreateOperatorDto) {
    return this.vesselsService.createOperator(dto);
  }

  @Post('operators/:id/verify')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  verifyOperator(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyEntityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vesselsService.verifyOperator(id, dto, actor);
  }

  @Post('operators/:id/documents')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.OPERATOR_KAPAL,
  )
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

  @Get()
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.BENDAHARA,
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
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.OPERATOR_KAPAL,
  )
  createVessel(@Body() dto: CreateVesselDto, @Req() req: { portScope: ScopeFilter }) {
    return this.vesselsService.createVessel(dto, req.portScope);
  }

  @Post(':id/verify')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN_PELABUHAN)
  verifyVessel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyEntityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.vesselsService.verifyVessel(id, dto, actor);
  }

  @Post(':id/documents')
  @Roles(
    UserRole.SUPERADMIN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.PETUGAS_DERMAGA,
    UserRole.OPERATOR_KAPAL,
  )
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
