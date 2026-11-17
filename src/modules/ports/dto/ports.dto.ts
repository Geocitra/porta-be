import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AuthorityType,
  BerthOperationalStatus,
  BerthServiceCategory,
  BerthType,
  BillingEligibility,
  PortCategory,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePortDto {
  @ApiProperty({ example: 'PMK' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code!: string;

  @ApiProperty({ example: 'Pelabuhan Poumako' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: 'Kabupaten Mimika, Papua Tengah' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ enum: PortCategory, default: PortCategory.CAMPURAN })
  @IsOptional()
  @IsEnum(PortCategory)
  portCategory?: PortCategory;
}

export class CreateBerthDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiProperty({ example: 'DRM-BETON-01' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code!: string;

  @ApiProperty({ example: 'Dermaga Beton Utama Pemda' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ enum: BerthType })
  @IsEnum(BerthType)
  berthType!: BerthType;

  @ApiPropertyOptional({
    enum: BerthServiceCategory,
    default: BerthServiceCategory.DERMAGA_CAMPURAN,
  })
  @IsOptional()
  @IsEnum(BerthServiceCategory)
  berthServiceCategory?: BerthServiceCategory;

  @ApiPropertyOptional({
    enum: BerthOperationalStatus,
    default: BerthOperationalStatus.OPEN,
  })
  @IsOptional()
  @IsEnum(BerthOperationalStatus)
  operationalStatus?: BerthOperationalStatus;

  @ApiProperty({ enum: AuthorityType })
  @IsEnum(AuthorityType)
  authorityType!: AuthorityType;

  @ApiPropertyOptional({
    enum: BillingEligibility,
    default: BillingEligibility.PENDING_VERIFICATION,
  })
  @IsOptional()
  @IsEnum(BillingEligibility)
  billingEligibility?: BillingEligibility;

  @ApiPropertyOptional({ example: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI' })
  @IsOptional()
  @IsString()
  legalBasis?: string;

  @ApiPropertyOptional({ example: 'SK Pengelolaan UPTD Pelabuhan Rakyat Paumako' })
  @IsOptional()
  @IsString()
  managementEvidence?: string;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxLengthMeters?: number;

  @ApiPropertyOptional({ example: 8.5 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  maxDraftMeters?: number;
}

export class UpdatePortDto {
  @ApiPropertyOptional({ example: 'Pelabuhan Poumako' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ example: 'Kabupaten Mimika, Papua Tengah' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ enum: PortCategory })
  @IsOptional()
  @IsEnum(PortCategory)
  portCategory?: PortCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBerthDto {
  @ApiPropertyOptional({ example: 'Dermaga Beton Utama Pemda' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ enum: BerthServiceCategory })
  @IsOptional()
  @IsEnum(BerthServiceCategory)
  berthServiceCategory?: BerthServiceCategory;

  @ApiPropertyOptional({ enum: BerthOperationalStatus })
  @IsOptional()
  @IsEnum(BerthOperationalStatus)
  operationalStatus?: BerthOperationalStatus;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxLengthMeters?: number;

  @ApiPropertyOptional({ example: 8.5 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  maxDraftMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

