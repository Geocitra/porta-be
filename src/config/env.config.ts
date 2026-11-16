export interface AppConfig {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  etmalRoundingMode: 'ROUND_UP' | 'HALF_DAY_GRACE';
  defaultUsdToIdrRate: number;
}

export const loadAppConfig = (): AppConfig => {
  const mode = process.env.ETMAL_ROUNDING_MODE;
  return {
    port: Number(process.env.PORT || 4000),
    nodeEnv: process.env.NODE_ENV || 'development',
    jwtSecret: process.env.JWT_SECRET || 'dev-only-porta-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    etmalRoundingMode: mode === 'HALF_DAY_GRACE' ? 'HALF_DAY_GRACE' : 'ROUND_UP',
    defaultUsdToIdrRate: Number(process.env.DEFAULT_USD_TO_IDR_RATE || 16000),
  };
};

