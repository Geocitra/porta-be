import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentStatus, TaskType, UserRole } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAssignmentDto {
  @ApiProperty({ example: 3 })
  @IsInt()
  userId!: number;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.PETUGAS_PELABUHAN })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

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

  @ApiProperty({ enum: TaskType, isArray: true })
  @IsArray()
  @IsEnum(TaskType, { each: true })
  taskTypes!: TaskType[];

  @ApiProperty({
    type: [String],
    example: ['manifest.create', 'manifest.update', 'manifest.submit', 'task.execute', 'task.submit'],
  })
  @IsArray()
  @IsString({ each: true })
  permissionCodes!: string[];

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 'Penugasan Petugas Manifest & Kedatangan di Dermaga A' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAssignmentDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  terminalId?: number | null;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  berthId?: number | null;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  zoneId?: number | null;

  @ApiPropertyOptional({ enum: TaskType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(TaskType, { each: true })
  taskTypes?: TaskType[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionCodes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional({ enum: AssignmentStatus })
  @IsOptional()
  @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RevokeAssignmentDto {
  @ApiProperty({ example: 'Rotasi petugas ke dermaga lain' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
