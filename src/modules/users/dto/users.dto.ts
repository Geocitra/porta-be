import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { USERNAME_REGEX } from '../../auth/dto/account.dto';

export class CreateUserDto {
  @ApiProperty({ example: 'petugas2.pomako@porta.mimikakab.go.id' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: 'petugas.poumako' })
  @IsOptional()
  @IsString()
  @Matches(USERNAME_REGEX, {
    message:
      'Username harus 4-50 karakter dan hanya boleh berisi huruf, angka, titik (.), garis bawah (_), atau strip (-).',
  })
  username?: string;

  @ApiProperty({ example: 'Porta123!' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: 'Andi Petugas Pelabuhan' })
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
  divisionId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  operatorId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  tenantId?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Andi Petugas Pelabuhan' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @ApiPropertyOptional({ example: 'petugas2.pomako@porta.mimikakab.go.id' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'petugas.poumako' })
  @IsOptional()
  @IsString()
  @Matches(USERNAME_REGEX, {
    message:
      'Username harus 4-50 karakter dan hanya boleh berisi huruf, angka, titik (.), garis bawah (_), atau strip (-).',
  })
  username?: string | null;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  portId?: number | null;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  divisionId?: number | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateUserStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isActive!: boolean;
}

export class ResetUserPasswordDto {
  @ApiProperty({ example: 'PortaBaru123!' })
  @IsString()
  @MinLength(6)
  newPassword!: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}
