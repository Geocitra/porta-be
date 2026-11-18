import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
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

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  terminalId?: number;

  @ApiProperty({ example: '2026-11-18' })
  @IsDateString()
  reportDate!: string;

  @ApiPropertyOptional({ example: 'Shift malam dermaga beton aman terkendali' })
  @IsOptional()
  @IsString()
  generalNotes?: string;

  @ApiPropertyOptional({ type: [DailyReportItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyReportItemDto)
  items?: DailyReportItemDto[];
}

export class ReviewDailyReportDto {
  @ApiProperty({ enum: ['APPROVE', 'RETURN'] })
  @IsIn(['APPROVE', 'RETURN'])
  decision!: 'APPROVE' | 'RETURN';

  @ApiPropertyOptional({ example: 'Rekap harian telah sesuai dengan seluruh task petugas.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
