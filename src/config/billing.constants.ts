export const BILLING_CONSTANTS = {
  HOURS_PER_ETMAL: 24,
  DAYS_PER_LABUH_PERIOD: 15,
  DAYS_PER_MONTH_PERIOD: 30,
  MS_PER_HOUR: 1000 * 60 * 60,
  MS_PER_DAY: 1000 * 60 * 60 * 24,
} as const;

export type EtmalRoundingMode = 'ROUND_UP' | 'HALF_DAY_GRACE';

