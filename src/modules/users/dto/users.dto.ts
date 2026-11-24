import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  IsArray,
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

  @ApiPropertyOptional({
    example: 'petugas.poumako',
    description:
      'Opsional. Jika dikosongkan, sistem otomatis men-generate username unik dari nama/role.',
  })
  @IsOptional()
  @IsString()
  @Matches(USERNAME_REGEX, {
    message:
      'Username harus 4-50 karakter dan hanya boleh berisi huruf, angka, titik (.), garis bawah (_), atau strip (-).',
  })
  username?: string;

  @ApiPropertyOptional({
    example: 'Porta123!',
    description:
      'Opsional. Jika dikosongkan, sistem otomatis men-generate kata sandi sementara acak (12 karakter) untuk disalin oleh Admin.',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

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

  @ApiPropertyOptional({
    example: true,
    description:
      'Jika true (default), otomatis membuatkan UserAssignment aktif sesuai tupoksi role pada pelabuhan terkait.',
  })
  @IsOptional()
  @IsBoolean()
  autoCreateAssignment?: boolean;
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
  @ApiPropertyOptional({
    example: 'PortaBaru123!',
    description:
      'Opsional. Jika dikosongkan, sistem otomatis men-generate kata sandi sementara acak untuk disalin dan diberikan kepada pengguna yang lupa kata sandi.',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  newPassword?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

export class UpdateRolePermissionsDto {
  @ApiProperty({
    example: ['registration:operators:verify', 'registration:vessels:verify', 'tasks:execute'],
    description: 'Daftar kode permission yang diizinkan untuk role tersebut.',
  })
  @IsArray()
  @IsString({ each: true })
  permissionCodes!: string[];
}
