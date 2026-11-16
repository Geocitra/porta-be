import { Currency, TariffUnitType } from '@prisma/client';
import { BILLING_CONSTANTS, EtmalRoundingMode } from '../../config/billing.constants';
import { DecimalUtil } from '../../common/utils/decimal.util';

export interface CalculateTariffInput {
  grossTonnage: number;
  startAt: Date;
  endAt: Date;
  unitType: TariffUnitType;
  tariffAmount: number;
  currency: Currency;
  exchangeRateUsd?: number;
  roundingMode?: EtmalRoundingMode;
}

export interface CalculateTariffResult {
  durationHours: number;
  unitsCharged: number;
  subtotalOriginal: number;
  subtotalIdr: number;
  formulaNote: string;
}

export class TariffCalculator {
  static calculate(input: CalculateTariffInput): CalculateTariffResult {
    const {
      grossTonnage,
      startAt,
      endAt,
      unitType,
      tariffAmount,
      currency,
      exchangeRateUsd = 16000,
      roundingMode = 'ROUND_UP',
    } = input;

    if (grossTonnage <= 0) {
      throw new Error('Gross Tonnage (GT) must be greater than 0');
    }

    const diffMs = endAt.getTime() - startAt.getTime();
    if (diffMs <= 0) {
      throw new Error('endAt must be strictly after startAt');
    }

    if (tariffAmount < 0) {
      throw new Error('Tariff amount cannot be negative');
    }

    const durationHours = DecimalUtil.round2(diffMs / BILLING_CONSTANTS.MS_PER_HOUR);
    const durationDays = diffMs / BILLING_CONSTANTS.MS_PER_DAY;

    let unitsCharged: number;
    let unitLabel: string;

    switch (unitType) {
      case TariffUnitType.GT_PER_ETMAL: {
        unitsCharged = this.calculateEtmal(durationHours, roundingMode);
        unitLabel = 'etmal';
        break;
      }
      case TariffUnitType.GT_PER_15_DAYS: {
        unitsCharged = Math.max(1, Math.ceil(durationDays / BILLING_CONSTANTS.DAYS_PER_LABUH_PERIOD));
        unitLabel = 'periode (15 hari)';
        break;
      }
      case TariffUnitType.GT_PER_MONTH: {
        unitsCharged = Math.max(1, Math.ceil(durationDays / BILLING_CONSTANTS.DAYS_PER_MONTH_PERIOD));
        unitLabel = 'bulan';
        break;
      }
      default:
        throw new Error(`Unsupported TariffUnitType: ${String(unitType)}`);
    }

    // Note: tariffAmount === 0 is valid (e.g., Pelayaran Rakyat in Bressing/Talud = Rp 0)
    const rawSubtotal = grossTonnage * unitsCharged * tariffAmount;
    const subtotalOriginal = Number(rawSubtotal.toFixed(4));

    const subtotalIdr =
      currency === Currency.USD
        ? DecimalUtil.roundIdr(subtotalOriginal * exchangeRateUsd)
        : DecimalUtil.roundIdr(subtotalOriginal);

    const rateNote = currency === Currency.USD ? ` x Kurs Rp ${exchangeRateUsd}` : '';
    const formulaNote = `${grossTonnage} GT x ${unitsCharged} ${unitLabel} x ${currency} ${tariffAmount}${rateNote}`;

    return {
      durationHours,
      unitsCharged,
      subtotalOriginal,
      subtotalIdr,
      formulaNote,
    };
  }

  private static calculateEtmal(durationHours: number, mode: EtmalRoundingMode): number {
    const rawEtmal = durationHours / BILLING_CONSTANTS.HOURS_PER_ETMAL;
    if (mode === 'HALF_DAY_GRACE') {
      const fullDays = Math.floor(rawEtmal);
      const remainderHours = durationHours - fullDays * BILLING_CONSTANTS.HOURS_PER_ETMAL;
      if (remainderHours === 0) return Math.max(1, fullDays);
      if (remainderHours <= 12) return fullDays + 0.5;
      return fullDays + 1;
    }
    return Math.max(1, Math.ceil(rawEtmal));
  }
}

