/// <reference types="jest" />
import {
  BerthCompatibilityStatus,
  BerthOperationalStatus,
  BerthServiceCategory,
  BerthValidationResult,
  PortCategory,
  VesselCategory,
} from '@prisma/client';
import { evaluateBerthCompatibility } from '../../src/modules/visits/berth-compatibility.evaluator';

describe('Berth Compatibility Hybrid Validator', () => {
  const baseInput = {
    portCategory: PortCategory.CAMPURAN,
    berthOperationalStatus: BerthOperationalStatus.OPEN,
    berthServiceCategory: BerthServiceCategory.DERMAGA_BARANG,
    berthMaxLengthMeters: 120,
    berthMaxDraftMeters: 8,
    vesselCategory: VesselCategory.BARANG,
    vesselLengthMeters: 80,
    vesselDraftMeters: 5,
  };

  it('returns ALLOW + MATCH when vessel category matches berth service category', () => {
    expect(evaluateBerthCompatibility(baseInput)).toEqual({
      validationResult: BerthValidationResult.ALLOW,
      compatibilityStatus: BerthCompatibilityStatus.MATCH,
      reasons: [],
    });

    expect(
      evaluateBerthCompatibility({
        ...baseInput,
        berthServiceCategory: BerthServiceCategory.DERMAGA_PENUMPANG,
        vesselCategory: VesselCategory.PENUMPANG,
      }),
    ).toEqual({
      validationResult: BerthValidationResult.ALLOW,
      compatibilityStatus: BerthCompatibilityStatus.MATCH,
      reasons: [],
    });

    expect(
      evaluateBerthCompatibility({
        ...baseInput,
        berthServiceCategory: BerthServiceCategory.DERMAGA_CAMPURAN,
        vesselCategory: VesselCategory.CAMPURAN,
      }),
    ).toEqual({
      validationResult: BerthValidationResult.ALLOW,
      compatibilityStatus: BerthCompatibilityStatus.MATCH,
      reasons: [],
    });
  });

  it('returns WARNING + MISMATCH when category differs (e.g. BARANG -> DERMAGA_PENUMPANG or CAMPURAN -> DERMAGA_BARANG)', () => {
    const cargoAtPassenger = evaluateBerthCompatibility({
      ...baseInput,
      berthServiceCategory: BerthServiceCategory.DERMAGA_PENUMPANG,
      vesselCategory: VesselCategory.BARANG,
    });
    expect(cargoAtPassenger.validationResult).toBe(BerthValidationResult.WARNING);
    expect(cargoAtPassenger.compatibilityStatus).toBe(BerthCompatibilityStatus.MISMATCH);
    expect(cargoAtPassenger.reasons.length).toBeGreaterThan(0);

    const mixedAtCargo = evaluateBerthCompatibility({
      ...baseInput,
      berthServiceCategory: BerthServiceCategory.DERMAGA_BARANG,
      vesselCategory: VesselCategory.CAMPURAN,
    });
    expect(mixedAtCargo.validationResult).toBe(BerthValidationResult.WARNING);
    expect(mixedAtCargo.compatibilityStatus).toBe(BerthCompatibilityStatus.MISMATCH);
  });

  it('returns WARNING + MISMATCH when portCategory is specialized and differs from vesselCategory', () => {
    const result = evaluateBerthCompatibility({
      ...baseInput,
      portCategory: PortCategory.PENUMPANG,
      berthServiceCategory: BerthServiceCategory.DERMAGA_BARANG,
      vesselCategory: VesselCategory.BARANG,
    });
    expect(result.validationResult).toBe(BerthValidationResult.WARNING);
    expect(result.compatibilityStatus).toBe(BerthCompatibilityStatus.MISMATCH);
  });

  it('returns BLOCK (Hard Block) when berth is CLOSED or MAINTENANCE', () => {
    const closed = evaluateBerthCompatibility({
      ...baseInput,
      berthOperationalStatus: BerthOperationalStatus.CLOSED,
    });
    expect(closed.validationResult).toBe(BerthValidationResult.BLOCK);

    const maint = evaluateBerthCompatibility({
      ...baseInput,
      berthOperationalStatus: BerthOperationalStatus.MAINTENANCE,
    });
    expect(maint.validationResult).toBe(BerthValidationResult.BLOCK);
  });

  it('returns BLOCK (Hard Block) when vessel length or draft exceeds berth limits', () => {
    const tooLong = evaluateBerthCompatibility({
      ...baseInput,
      vesselLengthMeters: 150,
    });
    expect(tooLong.validationResult).toBe(BerthValidationResult.BLOCK);

    const tooDeep = evaluateBerthCompatibility({
      ...baseInput,
      vesselDraftMeters: 9.5,
    });
    expect(tooDeep.validationResult).toBe(BerthValidationResult.BLOCK);
  });
});
