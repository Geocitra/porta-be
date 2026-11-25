import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ContractStatus,
  DocumentCategory,
  OperatorProfile,
  ShipType,
  ShippingCategory,
  VerificationStatus,
  VesselCategory,
  VesselRelationshipType,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateOperatorDto {
  @ApiProperty({ example: 'PT Pelayaran Mimika Sejahtera' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: '01.234.567.8-954.000' })
  @IsOptional()
  @IsString()
  npwp?: string;

  @ApiPropertyOptional({ example: '08123456789' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'ops@mimika-shipping.co.id' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ enum: OperatorProfile, default: OperatorProfile.REGULAR_SCHEDULED })
  @IsEnum(OperatorProfile)
  operatorProfile!: OperatorProfile;
}

export class CreateVesselDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  operatorId?: number;

  @ApiProperty({ example: 'REG-PMK-001' })
  @IsString()
  @IsNotEmpty()
  registrationNumber!: string;

  @ApiPropertyOptional({ example: 'IMO9123456' })
  @IsOptional()
  @IsString()
  imoNumber?: string;

  @ApiProperty({ example: 'KM Poumako Jaya' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ default: 'Indonesia' })
  @IsOptional()
  @IsString()
  flag?: string;

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(1)
  grossTonnage!: number;

  @ApiProperty({ enum: ShipType })
  @IsEnum(ShipType)
  shipType!: ShipType;

  @ApiPropertyOptional({ enum: VesselCategory, default: VesselCategory.CAMPURAN })
  @IsOptional()
  @IsEnum(VesselCategory)
  vesselCategory?: VesselCategory;

  @ApiProperty({ enum: ShippingCategory })
  @IsEnum(ShippingCategory)
  shippingCategory!: ShippingCategory;

  @ApiPropertyOptional({ example: 65 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  lengthMeters?: number;

  @ApiPropertyOptional({ example: 4.5 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  draftMeters?: number;

  @ApiPropertyOptional({
    enum: VesselRelationshipType,
    default: VesselRelationshipType.OWNER,
    description: 'Jenis relasi jika kapal langsung ditautkan ke suatu operator',
  })
  @IsOptional()
  @IsEnum(VesselRelationshipType)
  relationshipType?: VesselRelationshipType;

  @ApiPropertyOptional({
    example: false,
    description:
      'Set true jika pengguna sudah memeriksa peringatan kemiripan nama (fuzzy duplicate) dan memastikan ini kapal fisik yang berbeda.',
  })
  @IsOptional()
  @IsBoolean()
  confirmNotDuplicate?: boolean;
}

export class ClaimVesselDto {
  @ApiPropertyOptional({
    enum: VesselRelationshipType,
    default: VesselRelationshipType.AGENT,
    description: 'Status hubungan perusahaan terhadap kapal (OWNER / AGENT / CHARTERER)',
  })
  @IsOptional()
  @IsEnum(VesselRelationshipType)
  relationshipType?: VesselRelationshipType;

  @ApiPropertyOptional({ example: 'Surat Penunjukan Keagenan No. 12/SPK/2026' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class VerifyVesselClaimDto {
  @ApiProperty({ enum: [VerificationStatus.VERIFIED, VerificationStatus.REJECTED] })
  @IsEnum(VerificationStatus)
  status!: VerificationStatus;

  @ApiPropertyOptional({ example: 'Surat penunjukan keagenan valid dan sesuai.' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class UploadDocumentDto {
  @ApiProperty({ enum: DocumentCategory })
  @IsEnum(DocumentCategory)
  category!: DocumentCategory;

  @ApiPropertyOptional({ example: 'SU-123/PMK/2026' })
  @IsOptional()
  @IsString()
  documentNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class VerifyEntityDto {
  @ApiProperty({ enum: [VerificationStatus.VERIFIED, VerificationStatus.REJECTED] })
  @IsEnum(VerificationStatus)
  status!: VerificationStatus;

  @ApiPropertyOptional({ example: 'Angka GT sesuai dengan Surat Ukur resmi' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class UpdateOperatorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  npwp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ enum: OperatorProfile })
  @IsOptional()
  @IsEnum(OperatorProfile)
  operatorProfile?: OperatorProfile;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVesselDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  operatorId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  registrationNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imoNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  flag?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  grossTonnage?: number;

  @ApiPropertyOptional({ enum: ShipType })
  @IsOptional()
  @IsEnum(ShipType)
  shipType?: ShipType;

  @ApiPropertyOptional({ enum: VesselCategory })
  @IsOptional()
  @IsEnum(VesselCategory)
  vesselCategory?: VesselCategory;

  @ApiPropertyOptional({ enum: ShippingCategory })
  @IsOptional()
  @IsEnum(ShippingCategory)
  shippingCategory?: ShippingCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  lengthMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  draftMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateBerthingContractDto {
  @ApiProperty({ example: 'PKS Pelayanan Sandar & Tambat 2026' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-12-31' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  monthlyQuota?: number;

  @ApiPropertyOptional({ example: 'Dermaga Penumpang Poumako' })
  @IsOptional()
  @IsString()
  dockAllocation?: string;
}

export class ReviewBerthingContractDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'], example: 'APPROVE' })
  @IsString()
  @IsNotEmpty()
  decision!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ example: 'Dokumen legalitas SIUPAL, Surat Ukur & Kuota sesuai prasyarat.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class VerifyBerthingContractDto {
  @ApiProperty({ enum: [ContractStatus.ACTIVE, ContractStatus.REJECTED] })
  @IsEnum(ContractStatus)
  status!: ContractStatus;

  @ApiPropertyOptional({ example: 'Dokumen dan kuota sandar telah diverifikasi valid.' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Base64 tanda tangan elektronik Kepala Pelabuhan' })
  @IsOptional()
  @IsString()
  signatureData?: string;
}

