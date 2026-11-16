import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ComplaintStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateComplaintDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  portId!: number;

  @ApiProperty({ example: 'Yohanes K.' })
  @IsString()
  @IsNotEmpty()
  reporterName!: string;

  @ApiPropertyOptional({ example: '081234567890' })
  @IsOptional()
  @IsString()
  reporterPhone?: string;

  @ApiPropertyOptional({ example: 'yohanes@example.com' })
  @IsOptional()
  @IsEmail()
  reporterEmail?: string;

  @ApiProperty({ example: 'FASILITAS_DERMAGA' })
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiProperty({ example: 'Lampu dermaga beton padam' })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiProperty({ example: 'Lampu penerangan di sisi timur Dermaga Beton mati sejak pukul 19.00.' })
  @IsString()
  @IsNotEmpty()
  description!: string;
}

export class ResolveComplaintDto {
  @ApiProperty({ enum: [ComplaintStatus.IN_PROGRESS, ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED] })
  @IsEnum(ComplaintStatus)
  status!: ComplaintStatus;

  @ApiProperty({ example: 'Tim teknisi sudah mengganti lampu dermaga pada pukul 09.00 WIT.' })
  @IsString()
  @IsNotEmpty()
  resolutionNote!: string;
}

