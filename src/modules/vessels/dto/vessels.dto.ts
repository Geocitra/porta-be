import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DocumentCategory,
  OperatorProfile,
  ShipType,
  ShippingCategory,
  VerificationStatus,
  VesselCategory,
} from '@prisma/client';
import {
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
  @ApiProperty({ example: 1 })
  @IsInt()
  operatorId!: number;

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
