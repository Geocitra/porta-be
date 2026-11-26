import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  PaymentProviderAdapter,
  SnapSessionRequest,
  SnapSessionResult,
} from './payment-provider.interface';

@Injectable()
export class MidtransProvider implements PaymentProviderAdapter {
  constructor(private readonly configService: ConfigService) {}

  private getServerKey(): string {
    const key = this.configService.get<string>('MIDTRANS_SERVER_KEY');
    if (!key) {
      if (process.env.NODE_ENV !== 'production') {
        return 'mock-sandbox-server-key';
      }
      throw new ServiceUnavailableException('MIDTRANS_SERVER_KEY is not configured');
    }
    return key;
  }

  private getBaseUrl(): string {
    const isProd = this.configService.get<string>('MIDTRANS_IS_PRODUCTION') === 'true';
    return isProd
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
  }

  async createSnapSession(req: SnapSessionRequest): Promise<SnapSessionResult> {
    const serverKey = this.configService.get<string>('MIDTRANS_SERVER_KEY');
    if (!serverKey || serverKey === 'mock' || serverKey === 'sandbox' || serverKey === 'mock-sandbox-server-key') {
      const mockToken = `SNAP-MOCK-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      return {
        snapToken: mockToken,
        redirectUrl: `https://app.sandbox.midtrans.com/snap/v2/vtweb/${mockToken}`,
      };
    }

    const authHeader = Buffer.from(`${serverKey}:`).toString('base64');

    const response = await fetch(this.getBaseUrl(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: req.orderId,
          gross_amount: Math.round(req.amountIdr),
        },
        item_details: [
          {
            id: req.orderId,
            price: Math.round(req.amountIdr),
            quantity: 1,
            name: req.itemName.slice(0, 50),
          },
        ],
        customer_details: {
          first_name: req.customerName,
          email: req.customerEmail,
        },
      }),
    });

    const data = (await response.json()) as {
      token?: string;
      redirect_url?: string;
      error_messages?: string[];
    };

    if (!response.ok || !data.token || !data.redirect_url) {
      throw new ServiceUnavailableException(
        data.error_messages?.join(', ') || 'Failed to create Midtrans Snap session',
      );
    }

    return {
      snapToken: data.token,
      redirectUrl: data.redirect_url,
    };
  }

  private getApiBaseUrl(): string {
    const isProd = this.configService.get<string>('MIDTRANS_IS_PRODUCTION') === 'true';
    return isProd ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
  }

  async getTransactionStatus(orderId: string): Promise<{
    status_code?: string;
    transaction_status?: string;
    fraud_status?: string;
    payment_type?: string;
    gross_amount?: string;
  }> {
    const serverKey = this.configService.get<string>('MIDTRANS_SERVER_KEY');
    if (!serverKey || serverKey === 'mock' || serverKey === 'sandbox' || serverKey === 'mock-sandbox-server-key') {
      return { status_code: '200', transaction_status: 'pending' };
    }

    const authHeader = Buffer.from(`${serverKey}:`).toString('base64');
    const response = await fetch(
      `${this.getApiBaseUrl()}/v2/${encodeURIComponent(orderId)}/status`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${authHeader}`,
        },
      },
    );

    const data = (await response.json()) as {
      status_code?: string;
      status_message?: string;
      transaction_status?: string;
      fraud_status?: string;
      payment_type?: string;
      gross_amount?: string;
    };

    if (!response.ok && data.status_code !== '404') {
      throw new ServiceUnavailableException(
        data.status_message || 'Failed to query Midtrans transaction status',
      );
    }

    return data;
  }

  verifyWebhookSignature(
    orderId: string,
    statusCode: string,
    grossAmount: string,
    incomingSignature: string,
  ): boolean {
    const candidateKeys = [
      this.getServerKey(),
      this.configService.get<string>('MIDTRANS_SIGNATURE_KEY')?.trim(),
    ].filter((key): key is string => Boolean(key));

    return candidateKeys.some((key) => {
      const expected = crypto
        .createHash('sha512')
        .update(`${orderId}${statusCode}${grossAmount}${key}`)
        .digest('hex');

      if (incomingSignature.length !== expected.length) return false;
      return crypto.timingSafeEqual(Buffer.from(incomingSignature), Buffer.from(expected));
    });
  }
}
