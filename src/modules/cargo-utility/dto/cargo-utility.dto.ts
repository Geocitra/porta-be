import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CargoCategory,
  PortEquipmentType,
  StorageLocationType,
  UtilityType,
} from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCargoRecordDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  visitId?: number;

  @ApiProperty({ enum: CargoCategory })
  @IsEnum(CargoCategory)
  cargoCategory!: CargoCategory;

  @ApiProperty({ example: 'Bongkar muat beras Bulog 100 ton' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @ApiProperty({ example: 'ton' })
  @IsString()
  @IsNotEmpty()
  unitLabel!: string;

  @ApiPropertyOptional({ enum: StorageLocationType })
  @IsOptional()
  @IsEnum(StorageLocationType)
  storageLocation?: StorageLocationType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional({ example: 'CRG_BULOG_PUPUK' })
  @IsOptional()
  @IsString()
  tariffCode?: string;

  @ApiPropertyOptional({ example: 400 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  ratePerUnitIdr?: number;
}

export class CreateEquipmentRentalDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  visitId?: number;

  @ApiProperty({ enum: PortEquipmentType })
  @IsEnum(PortEquipmentType)
  equipmentType!: PortEquipmentType;

  @ApiProperty({ example: 'Forklift 5 Ton' })
  @IsString()
  @IsNotEmpty()
  capacityLabel!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  unitCount?: number;

  @ApiProperty({ example: 4 })
  @IsNumber()
  @Min(0.5)
  durationHours!: number;

  @ApiPropertyOptional({ example: 'EQP_FORKLIFT_3_6T' })
  @IsOptional()
  @IsString()
  tariffCode?: string;

  @ApiPropertyOptional({ example: 20000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  ratePerHourIdr?: number;
}

export class CreateUtilityReadingDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  visitId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  assetId?: number;

  @ApiProperty({ enum: UtilityType })
  @IsEnum(UtilityType)
  utilityType!: UtilityType;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @Min(0)
  meterStart!: number;

  @ApiProperty({ example: 1500 })
  @IsNumber()
  @Min(0)
  meterEnd!: number;

  @ApiProperty({ example: 'liter' })
  @IsString()
  @IsNotEmpty()
  unitLabel!: string;

  @ApiPropertyOptional({ example: 'UTL_AIR_BERSIH' })
  @IsOptional()
  @IsString()
  tariffCode?: string;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  ratePerUnitIdr?: number;
}

export class PayChargeDto {
  @ApiProperty({ example: 'CHG-PAY-2026-001' })
  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}

