import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingEligibility, DocumentCategory, PortAssetType, VerificationStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePortAssetDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiProperty({ example: 'KIOS-PMK-01' })
  @IsString()
  @IsNotEmpty()
  assetCode!: string;

  @ApiProperty({ example: 'Kios Terminal Penumpang No. 1' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ enum: PortAssetType })
  @IsEnum(PortAssetType)
  assetType!: PortAssetType;

  @ApiProperty({ example: 20 })
  @IsNumber()
  @Min(1)
  areaSqm!: number;

  @ApiProperty({ example: 5000 })
  @IsNumber()
  @Min(0)
  annualRatePerSqmIdr!: number;

  @ApiPropertyOptional({
    enum: BillingEligibility,
    default: BillingEligibility.PENDING_VERIFICATION,
  })
  @IsOptional()
  @IsEnum(BillingEligibility)
  billingEligibility?: BillingEligibility;

  @ApiPropertyOptional({ example: '-4.8192,136.8245' })
  @IsOptional()
  @IsString()
  gisCoordinates?: string;

  @ApiPropertyOptional({ example: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Hal. 82' })
  @IsOptional()
  @IsString()
  legalBasis?: string;
}

export class CreateAssetLeaseDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  assetId!: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  tenantId?: number;

  @ApiProperty({ example: 'CV Mimika Niaga' })
  @IsString()
  @IsNotEmpty()
  tenantName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantNpwp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantPhone?: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-12-31' })
  @IsDateString()
  endDate!: string;
}

export class RequestAssetLeaseDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  assetId!: number;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-12-31' })
  @IsDateString()
  endDate!: string;
}

export class VerifyTenantDto {
  @ApiProperty({ enum: [VerificationStatus.VERIFIED, VerificationStatus.REJECTED] })
  @IsEnum(VerificationStatus)
  verificationStatus!: VerificationStatus;

  @ApiPropertyOptional({ example: 'Dokumen NIB/NPWP sesuai dan valid.' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class RejectAssetLeaseDto {
  @ApiProperty({ example: 'Aset sedang dalam agenda pemeliharaan berkala.' })
  @IsString()
  @IsNotEmpty()
  rejectionReason!: string;
}

export class UploadTenantDocumentDto {
  @ApiProperty({ enum: DocumentCategory })
  @IsEnum(DocumentCategory)
  category!: DocumentCategory;

  @ApiPropertyOptional({ example: 'NIB-912010293847' })
  @IsOptional()
  @IsString()
  documentNumber?: string;

  @ApiPropertyOptional({ example: 'Dokumen legalitas NIB usaha' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordLeasePaymentDto {
  @ApiProperty({ example: 'LEASE-PAY-2026-001' })
  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2023)
  periodYear!: number;

  @ApiProperty({ example: 100000 })
  @IsNumber()
  @Min(1)
  amountIdr!: number;

  @ApiProperty({ example: '2026-11-16T10:00:00.000Z' })
  @IsDateString()
  paidAt!: string;
}

