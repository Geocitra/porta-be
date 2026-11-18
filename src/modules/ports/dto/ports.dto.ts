import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AuthorityType,
  BerthOperationalStatus,
  BerthServiceCategory,
  BerthType,
  BillingEligibility,
  FacilityConditionStatus,
  PortCategory,
  ShipType,
  TerminalClass,
  TerminalType,
  VesselCategory,
  ZoneType,
} from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
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

  @ApiPropertyOptional({ example: 'PENGUMPUL' })
  @IsOptional()
  @IsString()
  portClassification?: string;
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

  @ApiPropertyOptional({ example: 'PENGUMPUL' })
  @IsOptional()
  @IsString()
  portClassification?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateTerminalDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiProperty({ example: 'TRM-BRG-01' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code!: string;

  @ApiProperty({ example: 'Terminal Barang & Kontainer Poumako' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ enum: TerminalType, default: TerminalType.MULTIPURPOSE })
  @IsOptional()
  @IsEnum(TerminalType)
  terminalType?: TerminalType;

  @ApiPropertyOptional({ enum: TerminalClass, default: TerminalClass.KELAS_B })
  @IsOptional()
  @IsEnum(TerminalClass)
  terminalClass?: TerminalClass;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateTerminalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ enum: TerminalType })
  @IsOptional()
  @IsEnum(TerminalType)
  terminalType?: TerminalType;

  @ApiPropertyOptional({ enum: TerminalClass })
  @IsOptional()
  @IsEnum(TerminalClass)
  terminalClass?: TerminalClass;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateBerthDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  terminalId?: number;

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

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxGrossTonnage?: number;

  @ApiPropertyOptional({ enum: VesselCategory, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(VesselCategory, { each: true })
  allowedVesselCategories?: VesselCategory[];

  @ApiPropertyOptional({ enum: ShipType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ShipType, { each: true })
  allowedShipTypes?: ShipType[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  technicalSpecs?: Record<string, unknown>;
}

export class UpdateBerthDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  terminalId?: number | null;

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

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxGrossTonnage?: number;

  @ApiPropertyOptional({ enum: VesselCategory, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(VesselCategory, { each: true })
  allowedVesselCategories?: VesselCategory[];

  @ApiPropertyOptional({ enum: ShipType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ShipType, { each: true })
  allowedShipTypes?: ShipType[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  technicalSpecs?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePortZoneDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  terminalId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  berthId?: number;

  @ApiProperty({ example: 'ZN-CY-01' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code!: string;

  @ApiProperty({ example: 'Container Yard Blok A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ enum: ZoneType, default: ZoneType.LAPANGAN_PENUMPUKAN })
  @IsOptional()
  @IsEnum(ZoneType)
  zoneType?: ZoneType;

  @ApiPropertyOptional({ example: 2500 })
  @IsOptional()
  @IsNumber()
  areaSqm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreatePortFacilityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  terminalId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  berthId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  zoneId?: number;

  @ApiProperty({ example: 'FAC-FND-01' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code!: string;

  @ApiProperty({ example: 'Rubber Fender Dermaga Nusantara Unit 1-8' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: 'FENDER_BOLLARD' })
  @IsString()
  @IsNotEmpty()
  facilityType!: string;

  @ApiPropertyOptional({ enum: FacilityConditionStatus, default: FacilityConditionStatus.GOOD })
  @IsOptional()
  @IsEnum(FacilityConditionStatus)
  conditionStatus?: FacilityConditionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  specifications?: Record<string, unknown>;
}

export class CreateDivisionDto {
  @ApiProperty({ example: 'BID-LAUT' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code!: string;

  @ApiProperty({ example: 'Bidang Perhubungan Laut & Kepelabuhanan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [Number], example: [1, 2] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  portIds?: number[];
}
