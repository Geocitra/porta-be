import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'petugas2.pomako@porta.mimikakab.go.id' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Porta123!' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: 'Andi Petugas Dermaga' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  portId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  operatorId?: number;
}

export class UpdateUserStatusDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isActive!: boolean;
}

