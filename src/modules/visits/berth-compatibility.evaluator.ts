import {
  BerthCompatibilityStatus,
  BerthOperationalStatus,
  BerthServiceCategory,
  BerthValidationResult,
  PortCategory,
  ShipType,
  VesselCategory,
} from '@prisma/client';

export interface BerthCompatibilityInput {
  portCategory: PortCategory;
  berthOperationalStatus: BerthOperationalStatus;
  berthServiceCategory: BerthServiceCategory;
  berthMaxLengthMeters?: number | null;
  berthMaxDraftMeters?: number | null;
  berthMaxGrossTonnage?: number | null;
  allowedVesselCategories?: VesselCategory[];
  allowedShipTypes?: ShipType[];
  vesselCategory: VesselCategory;
  vesselShipType?: ShipType | null;
  vesselLengthMeters?: number | null;
  vesselDraftMeters?: number | null;
  vesselGrossTonnage?: number | null;
}

export interface BerthCompatibilityEvaluation {
  validationResult: BerthValidationResult;
  compatibilityStatus: BerthCompatibilityStatus;
  reasons: string[];
}

const MATCH_MAP: Record<VesselCategory, BerthServiceCategory> = {
  [VesselCategory.BARANG]: BerthServiceCategory.DERMAGA_BARANG,
  [VesselCategory.PENUMPANG]: BerthServiceCategory.DERMAGA_PENUMPANG,
  [VesselCategory.CAMPURAN]: BerthServiceCategory.DERMAGA_CAMPURAN,
};

/**
 * Pure domain evaluator for 3-level Hybrid Validation (ALLOW / WARNING / BLOCK)
 * when placing a vessel onto a berth based on technical specs and operational rules.
 */
export function evaluateBerthCompatibility(
  input: BerthCompatibilityInput,
): BerthCompatibilityEvaluation {
  const blockReasons: string[] = [];

  if (input.berthOperationalStatus !== BerthOperationalStatus.OPEN) {
    blockReasons.push(
      `Dermaga berstatus ${input.berthOperationalStatus} dan tidak layak menerima kapal`,
    );
  }

  if (
    input.berthMaxLengthMeters != null &&
    input.vesselLengthMeters != null &&
    input.vesselLengthMeters > input.berthMaxLengthMeters
  ) {
    blockReasons.push(
      `Panjang kapal (${input.vesselLengthMeters} m) melebihi kapasitas maksimal dermaga (${input.berthMaxLengthMeters} m)`,
    );
  }

  if (
    input.berthMaxDraftMeters != null &&
    input.vesselDraftMeters != null &&
    input.vesselDraftMeters > input.berthMaxDraftMeters
  ) {
    blockReasons.push(
      `Draft kapal (${input.vesselDraftMeters} m) melebihi batas kedalaman dermaga (${input.berthMaxDraftMeters} m)`,
    );
  }

  if (
    input.berthMaxGrossTonnage != null &&
    input.vesselGrossTonnage != null &&
    input.vesselGrossTonnage > input.berthMaxGrossTonnage
  ) {
    blockReasons.push(
      `Gross Tonnage kapal (${input.vesselGrossTonnage} GT) melebihi daya dukung maksimal dermaga (${input.berthMaxGrossTonnage} GT)`,
    );
  }

  if (blockReasons.length > 0) {
    return {
      validationResult: BerthValidationResult.BLOCK,
      compatibilityStatus: BerthCompatibilityStatus.MISMATCH,
      reasons: blockReasons,
    };
  }

  const warningReasons: string[] = [];

  if (
    input.portCategory !== PortCategory.CAMPURAN &&
    input.portCategory !== (input.vesselCategory as string)
  ) {
    warningReasons.push(
      `Kategori pelabuhan (${input.portCategory}) tidak sesuai dengan kategori kapal (${input.vesselCategory})`,
    );
  }

  if (input.allowedVesselCategories && input.allowedVesselCategories.length > 0) {
    if (!input.allowedVesselCategories.includes(input.vesselCategory)) {
      warningReasons.push(
        `Kategori kapal (${input.vesselCategory}) tidak termasuk dalam daftar kategori kapal yang diizinkan pada dermaga ini ([${input.allowedVesselCategories.join(', ')}])`,
      );
    }
  } else {
    const expectedBerthCategory = MATCH_MAP[input.vesselCategory];
    if (input.berthServiceCategory !== expectedBerthCategory) {
      warningReasons.push(
        `Kategori kapal (${input.vesselCategory}) tidak sesuai dengan peruntukan dermaga (${input.berthServiceCategory})`,
      );
    }
  }

  if (
    input.allowedShipTypes &&
    input.allowedShipTypes.length > 0 &&
    input.vesselShipType &&
    !input.allowedShipTypes.includes(input.vesselShipType)
  ) {
    warningReasons.push(
      `Jenis pelayaran kapal (${input.vesselShipType}) tidak sesuai dengan ketentuan operasional dermaga ([${input.allowedShipTypes.join(', ')}])`,
    );
  }

  if (warningReasons.length > 0) {
    return {
      validationResult: BerthValidationResult.WARNING,
      compatibilityStatus: BerthCompatibilityStatus.MISMATCH,
      reasons: warningReasons,
    };
  }

  return {
    validationResult: BerthValidationResult.ALLOW,
    compatibilityStatus: BerthCompatibilityStatus.MATCH,
    reasons: [],
  };
}
