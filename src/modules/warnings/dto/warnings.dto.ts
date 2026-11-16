import { ApiProperty } from '@nestjs/swagger';
import { WarningLevel } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsString } from 'class-validator';

export class IssueWarningDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  invoiceId!: number;

  @ApiProperty({ enum: WarningLevel })
  @IsEnum(WarningLevel)
  warningLevel!: WarningLevel;

  @ApiProperty({ example: 'Tagihan SKRD telah melewati jatuh tempo. Harap segera dilunasi.' })
  @IsString()
  @IsNotEmpty()
  message!: string;
}

