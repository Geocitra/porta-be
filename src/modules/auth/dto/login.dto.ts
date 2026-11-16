import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin.pomako@porta.mimikakab.go.id' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Porta123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;
}

