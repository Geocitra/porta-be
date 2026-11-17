import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({
    example: 'admin.pomako@porta.mimikakab.go.id',
    description: 'Email atau username pengguna',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  identifier?: string;

  @ApiPropertyOptional({
    example: 'admin.pomako@porta.mimikakab.go.id',
    description: 'Alias backward-compatible untuk identifier',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  email?: string;

  @ApiProperty({ example: 'Porta123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;
}
