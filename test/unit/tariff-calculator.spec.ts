/// <reference types="jest" />
import { Currency, TariffUnitType } from '@prisma/client';
import { TariffCalculator } from '../../src/modules/tariffs/tariff.calculator';

describe('TariffCalculator (Perda Mimika 4/2023)', () => {
  it('calculates Jasa Tambat Umum Dermaga Beton (500 GT x 2 Etmal x Rp 38 = Rp 38.000)', () => {
    const startAt = new Date('2026-11-16T08:00:00.000Z');
    const endAt = new Date('2026-11-18T08:00:00.000Z'); // 48 hours = 2 etmal

    const result = TariffCalculator.calculate({
      grossTonnage: 500,
      startAt,
      endAt,
      unitType: TariffUnitType.GT_PER_ETMAL,
      tariffAmount: 38,
      currency: Currency.IDR,
      roundingMode: 'ROUND_UP',
    });

    expect(result.durationHours).toBe(48);
    expect(result.unitsCharged).toBe(2);
    expect(result.subtotalIdr).toBe(38000);
  });

  it('rounds up partial etmal in ROUND_UP mode (26 hours = 2 etmal)', () => {
    const startAt = new Date('2026-11-16T08:00:00.000Z');
    const endAt = new Date('2026-11-17T10:00:00.000Z'); // 26 hours

    const result = TariffCalculator.calculate({
      grossTonnage: 500,
      startAt,
      endAt,
      unitType: TariffUnitType.GT_PER_ETMAL,
      tariffAmount: 38,
      currency: Currency.IDR,
      roundingMode: 'ROUND_UP',
    });

    expect(result.unitsCharged).toBe(2);
    expect(result.subtotalIdr).toBe(38000);
  });

  it('applies 0.5 etmal grace when remainder <= 12h in HALF_DAY_GRACE mode', () => {
    const startAt = new Date('2026-11-16T08:00:00.000Z');
    const endAt = new Date('2026-11-17T10:00:00.000Z'); // 26 hours = 1.5 etmal

    const result = TariffCalculator.calculate({
      grossTonnage: 500,
      startAt,
      endAt,
      unitType: TariffUnitType.GT_PER_ETMAL,
      tariffAmount: 38,
      currency: Currency.IDR,
      roundingMode: 'HALF_DAY_GRACE',
    });

    expect(result.unitsCharged).toBe(1.5);
    expect(result.subtotalIdr).toBe(28500);
  });

  it('calculates Jasa Labuh per 15-day period (16 days = 2 periods)', () => {
    const startAt = new Date('2026-11-01T00:00:00.000Z');
    const endAt = new Date('2026-11-17T00:00:00.000Z'); // 16 days

    const result = TariffCalculator.calculate({
      grossTonnage: 500,
      startAt,
      endAt,
      unitType: TariffUnitType.GT_PER_15_DAYS,
      tariffAmount: 50,
      currency: Currency.IDR,
    });

    expect(result.unitsCharged).toBe(2);
    expect(result.subtotalIdr).toBe(50000);
  });

  it('converts USD tariff (Talud Luar Negeri US$ 0.063) to rounded IDR', () => {
    const startAt = new Date('2026-11-16T00:00:00.000Z');
    const endAt = new Date('2026-11-17T00:00:00.000Z'); // 1 etmal

    const result = TariffCalculator.calculate({
      grossTonnage: 1000,
      startAt,
      endAt,
      unitType: TariffUnitType.GT_PER_ETMAL,
      tariffAmount: 0.063,
      currency: Currency.USD,
      exchangeRateUsd: 16000,
    });

    expect(result.subtotalOriginal).toBe(63);
    expect(result.subtotalIdr).toBe(1008000);
  });

  it('supports Rp 0 tariff for Pelayaran Rakyat without throwing', () => {
    const startAt = new Date('2026-11-16T00:00:00.000Z');
    const endAt = new Date('2026-11-17T00:00:00.000Z');

    const result = TariffCalculator.calculate({
      grossTonnage: 100,
      startAt,
      endAt,
      unitType: TariffUnitType.GT_PER_ETMAL,
      tariffAmount: 0,
      currency: Currency.IDR,
    });

    expect(result.subtotalIdr).toBe(0);
  });

  it('rejects invalid time range (endAt <= startAt)', () => {
    const time = new Date('2026-11-16T00:00:00.000Z');
    expect(() =>
      TariffCalculator.calculate({
        grossTonnage: 500,
        startAt: time,
        endAt: time,
        unitType: TariffUnitType.GT_PER_ETMAL,
        tariffAmount: 38,
        currency: Currency.IDR,
      }),
    ).toThrow('endAt must be strictly after startAt');
  });
});

