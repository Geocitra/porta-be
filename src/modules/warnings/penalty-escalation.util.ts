import { WarningLevel } from '@prisma/client';
import { DecimalUtil } from '../../common/utils/decimal.util';

/**
 * Tarif sanksi administratif keterlambatan pembayaran retribusi daerah:
 * 1% per bulan (maksimal 24 bulan) sesuai Perbup Mimika No. 25 Tahun 2024.
 */
export const MONTHLY_PENALTY_RATE = 0.01;
export const MAX_PENALTY_MONTHS = 24;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface OverdueMetrics {
  daysOverdue: number;
  monthsOverdue: number;
  remainingPrincipalIdr: number;
  penaltyIdr: number;
  totalDueWithPenaltyIdr: number;
}

export interface WarningEscalationRule {
  level: WarningLevel;
  minDaysOverdue: number;
  label: string;
}

export const STRD_ESCALATION_RULES: readonly WarningEscalationRule[] = [
  { level: WarningLevel.TEGURAN_1, minDaysOverdue: 1, label: 'STRD / Teguran I' },
  { level: WarningLevel.TEGURAN_2, minDaysOverdue: 15, label: 'STRD / Teguran II' },
  { level: WarningLevel.TEGURAN_3, minDaysOverdue: 30, label: 'STRD / Teguran III' },
];

/**
 * Menghitung hari keterlambatan, jumlah bulan denda (pembulatan ke atas per 30 hari, maks 24 bulan),
 * pokok tersisa, nominal denda 1%/bulan, dan total kewajiban beserta denda.
 */
export function calculateOverdueMetrics(
  dueDate: Date,
  now: Date,
  totalAmountIdr: number,
  verifiedPaidIdr: number,
): OverdueMetrics {
  const remainingPrincipalIdr = DecimalUtil.roundIdr(
    Math.max(0, totalAmountIdr - verifiedPaidIdr),
  );

  if (remainingPrincipalIdr <= 0 || dueDate.getTime() >= now.getTime()) {
    return {
      daysOverdue: 0,
      monthsOverdue: 0,
      remainingPrincipalIdr,
      penaltyIdr: 0,
      totalDueWithPenaltyIdr: remainingPrincipalIdr,
    };
  }

  const daysOverdue = Math.max(
    1,
    Math.floor((now.getTime() - dueDate.getTime()) / MS_PER_DAY),
  );
  const monthsOverdue = Math.min(
    MAX_PENALTY_MONTHS,
    Math.max(1, Math.ceil(daysOverdue / 30)),
  );
  const penaltyIdr = DecimalUtil.roundIdr(
    remainingPrincipalIdr * MONTHLY_PENALTY_RATE * monthsOverdue,
  );

  return {
    daysOverdue,
    monthsOverdue,
    remainingPrincipalIdr,
    penaltyIdr,
    totalDueWithPenaltyIdr: DecimalUtil.roundIdr(remainingPrincipalIdr + penaltyIdr),
  };
}

/**
 * Mengembalikan daftar level STRD yang seharusnya sudah terbit berdasarkan hari keterlambatan.
 */
export function getRequiredWarningLevels(daysOverdue: number): WarningLevel[] {
  return STRD_ESCALATION_RULES
    .filter((rule) => daysOverdue >= rule.minDaysOverdue)
    .map((rule) => rule.level);
}

/**
 * Menentukan level STRD berikutnya yang perlu diterbitkan (belum pernah terbit pada invoice).
 */
export function getMissingWarningLevels(
  daysOverdue: number,
  existingLevels: ReadonlySet<WarningLevel>,
): WarningLevel[] {
  return getRequiredWarningLevels(daysOverdue).filter(
    (level) => !existingLevels.has(level),
  );
}

/**
 * Menyusun redaksi resmi surat teguran/STRD otomatis sesuai Perbup Mimika No. 25/2024 (denda 1%/bulan).
 */
export function buildAutoStrdMessage(params: {
  level: WarningLevel;
  invoiceNumber: string;
  metrics: OverdueMetrics;
}): string {
  const rule = STRD_ESCALATION_RULES.find((r) => r.level === params.level);
  const stageLabel = rule?.label ?? params.level;
  const formatIdr = (val: number) =>
    `Rp ${Math.round(val).toLocaleString('id-ID')}`;

  return (
    `[Eskalasi Otomatis ${stageLabel}] Tagihan e-SKRD ${params.invoiceNumber} telah melewati jatuh tempo ` +
    `selama ${params.metrics.daysOverdue} hari (${params.metrics.monthsOverdue} bulan keterlambatan). ` +
    `Pokok tersisa: ${formatIdr(params.metrics.remainingPrincipalIdr)}, ` +
    `sanksi denda administratif 1%/bulan: ${formatIdr(params.metrics.penaltyIdr)}, ` +
    `total kewajiban: ${formatIdr(params.metrics.totalDueWithPenaltyIdr)} (Perbup Mimika No. 25 Tahun 2024).`
  );
}
