import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuthorityType, BerthType, BillingEligibility } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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
}

