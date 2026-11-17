import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export type PaymentTargetType = 'INVOICE' | 'ASSET_LEASE' | 'UTILITY_READING';
export type PaymentProviderType = 'MIDTRANS' | 'BANK_PAPUA' | 'MANUAL';

export class UpdatePaymentConfigDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  gatewayEnabled!: boolean;

  @ApiProperty({ enum: ['MIDTRANS', 'BANK_PAPUA', 'MANUAL'] })
  @IsIn(['MIDTRANS', 'BANK_PAPUA', 'MANUAL'])
  provider!: PaymentProviderType;
}

export class CheckoutPaymentDto {
  @ApiProperty({ enum: ['INVOICE', 'ASSET_LEASE', 'UTILITY_READING'] })
  @IsIn(['INVOICE', 'ASSET_LEASE', 'UTILITY_READING'])
  targetType!: PaymentTargetType;

  @ApiProperty({ example: 1 })
  @IsInt()
  targetId!: number;
}

export class MidtransWebhookDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  order_id!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  status_code!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  gross_amount!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  signature_key!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  transaction_status!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fraud_status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  payment_type?: string;
}
