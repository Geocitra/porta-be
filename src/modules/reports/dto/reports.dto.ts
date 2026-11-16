import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class SimulateRevenueDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  portId?: number;

  @ApiProperty({ example: 30, description: 'Projected vessel calls per month' })
  @IsInt()
  @Min(0)
  estimatedMonthlyVisits!: number;

  @ApiProperty({ example: 500, description: 'Average vessel Gross Tonnage (GT)' })
  @IsNumber()
  @Min(1)
  averageGt!: number;

  @ApiProperty({ example: 2, description: 'Average berthing duration in Etmal' })
  @IsNumber()
  @Min(0.5)
  averageEtmal!: number;

  @ApiProperty({ example: 38, description: 'Base Tambat tariff per GT/Etmal (IDR)' })
  @IsNumber()
  @Min(0)
  tariffPerGtEtmalIdr!: number;

  @ApiProperty({ example: 50, description: 'Base Labuh tariff per GT/15 days (IDR)' })
  @IsNumber()
  @Min(0)
  labuhTariffPerGtIdr!: number;

  @ApiPropertyOptional({ example: 10, description: 'Proposed tariff adjustment percentage (-50 to +200)' })
  @IsOptional()
  @IsNumber()
  @Min(-50)
  @Max(200)
  tariffAdjustmentPercent?: number;
}

