import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BerthCategory, VisitActivityMode, VisitOrigin } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateVisitDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  vesselId!: number;

  @ApiProperty({ enum: VisitOrigin, default: VisitOrigin.OPERATOR_REQUEST })
  @IsEnum(VisitOrigin)
  visitOrigin!: VisitOrigin;

  @ApiProperty({ enum: VisitActivityMode, default: VisitActivityMode.NORMAL })
  @IsEnum(VisitActivityMode)
  activityMode!: VisitActivityMode;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isTransitOnly?: boolean;

  @ApiPropertyOptional({ example: 'Pelabuhan Timika' })
  @IsOptional()
  @IsString()
  originPort?: string;

  @ApiPropertyOptional({ example: 'Pelabuhan Agats' })
  @IsOptional()
  @IsString()
  destinationPort?: string;

  @ApiProperty({ example: '2026-11-16T08:00:00.000Z' })
  @IsDateString()
  eta!: string;

  @ApiProperty({ example: '2026-11-18T08:00:00.000Z' })
  @IsDateString()
  etd!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordArrivalDto {
  @ApiProperty({ example: '2026-11-16T08:30:00.000Z' })
  @IsDateString()
  ataAnchorage!: string;
}

export class StartBerthingDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  berthId!: number;

  @ApiProperty({ enum: BerthCategory, default: BerthCategory.UMUM })
  @IsEnum(BerthCategory)
  berthCategory!: BerthCategory;

  @ApiProperty({ example: '2026-11-16T09:00:00.000Z' })
  @IsDateString()
  actualStartAt!: string;

  @ApiPropertyOptional({
    example: 'Dermaga barang sedang penuh, kondisi muatan darurat sembako',
  })
  @IsOptional()
  @IsString()
  overrideReason?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  safetyChecklistVerified?: boolean;
}

export class ApproveBerthingOverrideDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ example: 'Disetujui untuk sandar sementara maksimal 6 jam' })
  @IsOptional()
  @IsString()
  approvalNotes?: string;
}

export class EndBerthingDto {
  @ApiProperty({ example: '2026-11-17T11:00:00.000Z' })
  @IsDateString()
  actualEndAt!: string;
}

export class RecordDepartureDto {
  @ApiProperty({ example: '2026-11-17T12:00:00.000Z' })
  @IsDateString()
  atdPort!: string;
}

