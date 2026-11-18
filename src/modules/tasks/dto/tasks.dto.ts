import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TaskPriority,
  TaskSourceType,
  TaskType,
  VesselCategory,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateTaskTemplateItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  itemOrder!: number;

  @ApiProperty({ example: 'VESSEL_DATA_AVAILABLE' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: 'Data kapal tersedia dan sesuai Surat Ukur' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresAttachment?: boolean;

  @ApiPropertyOptional({ enum: VesselCategory, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(VesselCategory, { each: true })
  applicableVesselCategories?: VesselCategory[];
}

export class CreateTaskTemplateDto {
  @ApiProperty({ example: 'TPL-MANIFEST-CHECK' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ enum: TaskType })
  @IsEnum(TaskType)
  taskType!: TaskType;

  @ApiProperty({ example: 'Pemeriksaan Manifest Kapal {{vesselName}}' })
  @IsString()
  @IsNotEmpty()
  titleTemplate!: string;

  @ApiProperty({ example: 'Verifikasi kelengkapan data manifest muatan dan penumpang kapal' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.HIGH })
  @IsOptional()
  @IsEnum(TaskPriority)
  defaultPriority?: TaskPriority;

  @ApiPropertyOptional({ example: 240 })
  @IsOptional()
  @IsInt()
  @Min(15)
  slaMinutes?: number;

  @ApiPropertyOptional({ example: 'SOP-DISHUB-MMK-04/2024' })
  @IsOptional()
  @IsString()
  sopReference?: string;

  @ApiProperty({ type: [CreateTaskTemplateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTaskTemplateItemDto)
  checklistItems!: CreateTaskTemplateItemDto[];
}

export class CreateTaskDto {
  @ApiProperty({ enum: TaskType })
  @IsEnum(TaskType)
  taskType!: TaskType;

  @ApiProperty({ example: 'Pemeriksaan Manifest KM Sabuk Nusantara 96' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'Lakukan pemeriksaan manifest kedatangan dan muatan di Dermaga A' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({ enum: TaskSourceType, default: TaskSourceType.MANUAL_ASSIGNMENT })
  @IsOptional()
  @IsEnum(TaskSourceType)
  sourceType?: TaskSourceType;

  @ApiPropertyOptional({ example: '12' })
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  terminalId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  berthId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  zoneId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  visitId?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  assigneeId?: number;

  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.MEDIUM })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ example: '2026-11-18' })
  @IsOptional()
  @IsDateString()
  obligationDate?: string;

  @ApiProperty({ example: '2026-11-18T17:00:00.000Z' })
  @IsDateString()
  dueDate!: string;
}

export class OfficerChecklistUpdateItemDto {
  @ApiProperty({ example: 'VESSEL_DATA_AVAILABLE' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  checkedByOfficer!: boolean;

  @ApiPropertyOptional({ example: 'Data sesuai Surat Ukur No. SU-2023/99' })
  @IsOptional()
  @IsString()
  officerNotes?: string;

  @ApiPropertyOptional({ example: '/uploads/tasks/manifest_photo.jpg' })
  @IsOptional()
  @IsString()
  attachmentPath?: string;
}

export class UpdateOfficerTaskChecklistDto {
  @ApiProperty({ type: [OfficerChecklistUpdateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfficerChecklistUpdateItemDto)
  items!: OfficerChecklistUpdateItemDto[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  hasIssue?: boolean;

  @ApiPropertyOptional({ example: 'Cuaca hujan deras menunda pembacaan draft kapal' })
  @IsOptional()
  @IsString()
  issueNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SubmitTaskDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  taskId?: number;

  @ApiPropertyOptional({ example: 'Seluruh pemeriksaan lapangan dan dokumen manifest telah lengkap.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [OfficerChecklistUpdateItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfficerChecklistUpdateItemDto)
  checklistItems?: OfficerChecklistUpdateItemDto[];
}

export class AdminChecklistVerifyItemDto {
  @ApiProperty({ example: 'VESSEL_DATA_AVAILABLE' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  checkedByAdmin!: boolean;

  @ApiPropertyOptional({ example: 'Dokumen lengkap dan terbaca jelas' })
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class UpdateAdminTaskChecklistDto {
  @ApiProperty({ type: [AdminChecklistVerifyItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminChecklistVerifyItemDto)
  items!: AdminChecklistVerifyItemDto[];
}

export class AdminApproveTaskDto {
  @ApiPropertyOptional({ example: 'Kelengkapan administratif dan checklist telah sesuai SOP.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [AdminChecklistVerifyItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminChecklistVerifyItemDto)
  checklistItems?: AdminChecklistVerifyItemDto[];
}

export class ReturnOrRejectTaskDto {
  @ApiProperty({ example: 'Lampiran foto bukti sandar dan dokumen manifest belum dilampirkan.' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ example: 'Mohon lengkapi lampiran wajib sebelum mengirim ulang.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class HeadVerifyTaskDto {
  @ApiPropertyOptional({ example: 'Hasil pekerjaan telah diverifikasi secara substantif dan disetujui.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
