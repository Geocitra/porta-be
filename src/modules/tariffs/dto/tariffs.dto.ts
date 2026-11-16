import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ActivityMode,
  BerthType,
  Currency,
  ServiceCode,
  ShipType,
  ShippingCategory,
  TariffUnitType,
} from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateTariffDto {
  @ApiProperty({ example: 'TAMBAT_UMUM_DERMAGA_DN_2027' })
  @IsString()
  @IsNotEmpty()
  tariffCode!: string;

  @ApiProperty({ enum: ServiceCode })
  @IsEnum(ServiceCode)
  serviceCode!: ServiceCode;

  @ApiProperty({ enum: ShippingCategory })
  @IsEnum(ShippingCategory)
  shippingCategory!: ShippingCategory;

  @ApiPropertyOptional({ enum: ShipType })
  @IsOptional()
  @IsEnum(ShipType)
  shipType?: ShipType;

  @ApiPropertyOptional({ enum: ActivityMode })
  @IsOptional()
  @IsEnum(ActivityMode)
  activityMode?: ActivityMode;

  @ApiPropertyOptional({ enum: BerthType })
  @IsOptional()
  @IsEnum(BerthType)
  berthType?: BerthType;

  @ApiProperty({ enum: TariffUnitType })
  @IsEnum(TariffUnitType)
  unitType!: TariffUnitType;

  @ApiProperty({ enum: Currency, default: Currency.IDR })
  @IsEnum(Currency)
  currency!: Currency;

  @ApiProperty({ example: 38 })
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ example: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI' })
  @IsString()
  @IsNotEmpty()
  legalBasis!: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  @IsDateString()
  effectiveFrom!: string;
}

