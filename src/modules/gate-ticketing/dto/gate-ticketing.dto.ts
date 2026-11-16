import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TerminalClass } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateGateTicketBookDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiProperty({ example: 'KRC-PMK-MB-TRUCK-01' })
  @IsString()
  @IsNotEmpty()
  bookCode!: string;

  @ApiProperty({ example: 'MB_TRUCK_BUS_BESAR' })
  @IsString()
  @IsNotEmpty()
  ticketCategory!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  serialStart!: number;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(1)
  serialEnd!: number;

  @ApiProperty({ example: 35000 })
  @IsNumber()
  @Min(0)
  nominalPerTicket!: number;

  @ApiPropertyOptional({ example: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Hal. 83' })
  @IsOptional()
  @IsString()
  legalBasis?: string;
}

export class OpenGateHandoverDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  bookId!: number;

  @ApiProperty({ example: 'Juru Gerbang Shift Pagi' })
  @IsString()
  @IsNotEmpty()
  wardenName!: string;
}

export class CloseGateHandoverDto {
  @ApiProperty({
    example: 11,
    description: 'Smallest remaining ticket serial returned (or serialEnd + 1 if book exhausted)',
  })
  @IsInt()
  @Min(1)
  lastReturnedSerial!: number;

  @ApiProperty({ example: 350000 })
  @IsNumber()
  @Min(0)
  actualCashSettledIdr!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateFerryRouteDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiProperty({ example: 'Otakwa' })
  @IsString()
  @IsNotEmpty()
  destinationName!: string;

  @ApiProperty({ example: 57 })
  @IsInt()
  @Min(1)
  distanceMiles!: number;

  @ApiProperty({ example: 9600 })
  @IsNumber()
  @Min(0)
  adultFareIdr!: number;

  @ApiProperty({ example: 7200 })
  @IsNumber()
  @Min(0)
  childFareIdr!: number;

  @ApiProperty({ example: 960 })
  @IsNumber()
  @Min(0)
  infantFareIdr!: number;

  @ApiProperty({ example: 8600 })
  @IsNumber()
  @Min(0)
  cargoPerTonIdr!: number;

  @ApiProperty({ example: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Hal. 85' })
  @IsString()
  @IsNotEmpty()
  legalBasis!: string;
}

export class CreateVesselManifestDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  visitId!: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  ferryRouteId?: number;

  @ApiPropertyOptional({ enum: TerminalClass, default: TerminalClass.KELAS_B })
  @IsOptional()
  @IsEnum(TerminalClass)
  terminalClass?: TerminalClass;

  @ApiProperty({ example: 45 })
  @IsInt()
  @Min(0)
  adultCount!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  childCount?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  infantCount?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  greeterCount?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  vehicleCount?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cargoTons?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

