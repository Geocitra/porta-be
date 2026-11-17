import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export const USERNAME_REGEX = /^[a-zA-Z0-9._-]{4,50}$/;

export class UpdateMyProfileDto {
  @ApiPropertyOptional({ example: 'Budi Santoso' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @ApiPropertyOptional({ example: 'budi.santoso@porta.mimikakab.go.id' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: 'budi.santoso',
    description: 'Username unik (4-50 karakter, huruf/angka/titik/garis bawah/strip, tanpa @)',
  })
  @IsOptional()
  @IsString()
  @Matches(USERNAME_REGEX, {
    message:
      'Username harus 4-50 karakter dan hanya boleh berisi huruf, angka, titik (.), garis bawah (_), atau strip (-).',
  })
  username?: string | null;

  @ApiPropertyOptional({
    description: 'Wajib diisi jika mengubah email atau username',
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;
}

export class ChangeMyPasswordDto {
  @ApiProperty({ example: 'Porta123!' })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ example: 'SandiBaru2026!' })
  @IsString()
  @MinLength(6, { message: 'Kata sandi baru minimal 6 karakter.' })
  newPassword!: string;
}
