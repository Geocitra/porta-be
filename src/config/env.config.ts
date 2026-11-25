export interface AppConfig {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  bankWebhookSecret: string;
  etmalRoundingMode: 'ROUND_UP' | 'HALF_DAY_GRACE';
  defaultUsdToIdrRate: number;
  exchangeRateCacheTtlMs: number;
  aisStreamApiKey: string;
}

export const loadAppConfig = (): AppConfig => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const jwtSecret = process.env.JWT_SECRET;
  const bankWebhookSecret = process.env.BANK_WEBHOOK_SECRET;

  if (nodeEnv === 'production') {
    if (!jwtSecret || jwtSecret.length < 16) {
      throw new Error('FATAL: Strong JWT_SECRET (>= 16 chars) is required in production');
    }
    if (!bankWebhookSecret || bankWebhookSecret.length < 16) {
      throw new Error('FATAL: Strong BANK_WEBHOOK_SECRET (>= 16 chars) is required in production');
    }
  }

  const mode = process.env.ETMAL_ROUNDING_MODE;
  return {
    port: Number(process.env.PORT || 4000),
    nodeEnv,
    jwtSecret: jwtSecret || 'dev-only-porta-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    bankWebhookSecret: bankWebhookSecret || 'porta-bank-webhook-secret-2026',
    etmalRoundingMode: mode === 'HALF_DAY_GRACE' ? 'HALF_DAY_GRACE' : 'ROUND_UP',
    defaultUsdToIdrRate: Number(process.env.DEFAULT_USD_TO_IDR_RATE || 16000),
    exchangeRateCacheTtlMs: Number(process.env.EXCHANGE_RATE_CACHE_TTL_MS || 3600000),
    aisStreamApiKey: process.env.AISSTREAM_API_KEY || '',
  };
};
