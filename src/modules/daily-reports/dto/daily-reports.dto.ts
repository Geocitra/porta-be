import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class DailyReportItemDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  visitId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  berthId?: number;

  @ApiProperty({ example: 'KM Poumako Jaya' })
  @IsString()
  @IsNotEmpty()
  vesselNameSnapshot!: string;

  @ApiProperty({ example: 'REG-PMK-001' })
  @IsString()
  @IsNotEmpty()
  registrationNumberSnapshot!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isAdhoc?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateDailyPortReportDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiProperty({ example: '2026-11-16' })
  @IsDateString()
  reportDate!: string;

  @ApiPropertyOptional({ example: 'Shift malam dermaga beton aman terkendali' })
  @IsOptional()
  @IsString()
  generalNotes?: string;

  @ApiProperty({ type: [DailyReportItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyReportItemDto)
  items!: DailyReportItemDto[];
}

