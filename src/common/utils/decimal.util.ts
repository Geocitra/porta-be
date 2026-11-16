import { Prisma } from '@prisma/client';

export class DecimalUtil {
  static toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  static roundIdr(amount: number): number {
    return Math.round(amount);
  }

  static round2(amount: number): number {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }
}

