import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OperatorProfile } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterOperatorDto {
  @ApiProperty({ example: 'budi@pelayaran-baru.co.id' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Rahasia123!' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: 'Budi Santoso' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({ example: 'PT Pelayaran Baru Mimika' })
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @ApiPropertyOptional({ example: '01.999.888.7-954.000' })
  @IsOptional()
  @IsString()
  npwp?: string;

  @ApiPropertyOptional({ example: '081299887766' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Jl. Pelabuhan Poumako No. 10, Mimika' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ enum: OperatorProfile, default: OperatorProfile.REGULAR_SCHEDULED })
  @IsOptional()
  @IsEnum(OperatorProfile)
  operatorProfile?: OperatorProfile;
}

