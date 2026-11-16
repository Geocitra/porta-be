import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaintenanceSeverity, MaintenanceStatus } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMaintenanceTicketDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  berthId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  assetId?: number;

  @ApiProperty({ enum: MaintenanceSeverity })
  @IsEnum(MaintenanceSeverity)
  severity!: MaintenanceSeverity;

  @ApiProperty({ example: 'Bolder tambat ujung timur longgar' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'Baut pengikat bolder dermaga beton berkarat dan goyang.' })
  @IsString()
  @IsNotEmpty()
  description!: string;
}

export class UpdateMaintenanceStatusDto {
  @ApiProperty({ enum: MaintenanceStatus })
  @IsEnum(MaintenanceStatus)
  status!: MaintenanceStatus;

  @ApiPropertyOptional({ example: 'Tim Sipil Dishub' })
  @IsOptional()
  @IsString()
  assignedTechnician?: string;

  @ApiPropertyOptional({ example: 'Bolder sudah dilas ulang dan diuji tarik.' })
  @IsOptional()
  @IsString()
  resolutionNote?: string;
}

