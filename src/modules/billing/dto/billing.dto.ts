import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AdjustmentApprovalStatus,
  BillingAdjustmentType,
  CollectionInstrument,
  PaymentMethod,
} from '@prisma/client';
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

export class GenerateBillingDto {
  @ApiPropertyOptional({ enum: CollectionInstrument, default: CollectionInstrument.KARCIS })
  @IsOptional()
  @IsEnum(CollectionInstrument)
  collectionInstrument?: CollectionInstrument;

  @ApiPropertyOptional({ example: 16000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  exchangeRateUsd?: number;
}

export class VoidInvoiceDto {
  @ApiProperty({ example: 'Koreksi jam lepas tali berdasarkan berita acara petugas' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class RecordPaymentDto {
  @ApiProperty({ example: 'PAY-PMK-20261116-0001' })
  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @ApiProperty({ example: 38000 })
  @IsNumber()
  @Min(1)
  amountIdr!: number;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiPropertyOptional({ example: 'TRF-BPD-889911' })
  @IsOptional()
  @IsString()
  referenceNo?: string;

  @ApiProperty({ example: '2026-11-17T14:00:00.000Z' })
  @IsDateString()
  paidAt!: string;
}

export class BankPaymentWebhookDto {
  @ApiProperty({ example: 'BPD-TX-20261116-9991' })
  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @ApiProperty({ example: 'SKRD-1-1700000000000' })
  @IsString()
  @IsNotEmpty()
  invoiceNumber!: string;

  @ApiProperty({ example: 19000 })
  @IsNumber()
  @Min(1)
  amountIdr!: number;

  @ApiProperty({ enum: [PaymentMethod.VA, PaymentMethod.QRIS, PaymentMethod.BANK_TRANSFER] })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiProperty({ example: 'VA-8800112233' })
  @IsString()
  @IsNotEmpty()
  referenceNo!: string;

  @ApiProperty({ example: '2026-11-17T15:00:00.000Z' })
  @IsDateString()
  paidAt!: string;
}

export class RequestBillingAdjustmentDto {
  @ApiProperty({ enum: BillingAdjustmentType })
  @IsEnum(BillingAdjustmentType)
  adjustmentType!: BillingAdjustmentType;

  @ApiProperty({ example: 50000 })
  @IsNumber()
  @Min(1)
  requestedAmountIdr!: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(2)
  installmentCount?: number;

  @ApiPropertyOptional({ example: '2026-12-15' })
  @IsOptional()
  @IsDateString()
  deferredUntil?: string;

  @ApiProperty({ example: 'Permohonan angsuran 3 kali sesuai Pasal 19 Perbup 25/2024' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class DecideBillingAdjustmentDto {
  @ApiProperty({ enum: [AdjustmentApprovalStatus.APPROVED, AdjustmentApprovalStatus.REJECTED] })
  @IsEnum(AdjustmentApprovalStatus)
  status!: AdjustmentApprovalStatus;
}

