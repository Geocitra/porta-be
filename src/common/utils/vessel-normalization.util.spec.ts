import { VesselNormalizationUtil } from './vessel-normalization.util';

describe('VesselNormalizationUtil (3-Layer Anti-Typo & Anti-Duplicate Engine)', () => {
  it('normalizes registration numbers by stripping spaces, hyphens, dots, and slashes', () => {
    expect(VesselNormalizationUtil.normalizeRegistrationNumber('reg-pmk 001')).toBe('REGPMK001');
    expect(VesselNormalizationUtil.normalizeRegistrationNumber('REG.PMK/001')).toBe('REGPMK001');
    expect(VesselNormalizationUtil.normalizeRegistrationNumber('  REG_PMK-001  ')).toBe('REGPMK001');
  });

  it('normalizes IMO numbers consistently and returns null for empty input', () => {
    expect(VesselNormalizationUtil.normalizeImoNumber('imo 9123456')).toBe('IMO9123456');
    expect(VesselNormalizationUtil.normalizeImoNumber('IMO-9123456')).toBe('IMO9123456');
    expect(VesselNormalizationUtil.normalizeImoNumber('   ')).toBeNull();
    expect(VesselNormalizationUtil.normalizeImoNumber(null)).toBeNull();
  });

  it('normalizes vessel names ignoring case, punctuation, spacing, and maritime prefixes (KM, KMP, MV, TB)', () => {
    expect(VesselNormalizationUtil.normalizeVesselName('km.  tatamailau!')).toBe('TATAMAILAU');
    expect(VesselNormalizationUtil.normalizeVesselName('KM Tatamailau')).toBe('TATAMAILAU');
    expect(VesselNormalizationUtil.normalizeVesselName('KMP. Kokonao')).toBe('KOKONAO');
    expect(VesselNormalizationUtil.normalizeVesselName('MV Oriental-Ruby')).toBe('ORIENTAL RUBY');
  });

  it('detects typos via Levenshtein similarity (e.g., KM Tatamilau vs KM Tatamailau)', () => {
    expect(
      VesselNormalizationUtil.isPotentialTypoDuplicate('KM Tatamilau', 'KM Tatamailau'),
    ).toBe(true);
    expect(
      VesselNormalizationUtil.isPotentialTypoDuplicate('km. poumako jaya', 'KM Pomako Jaya'),
    ).toBe(true);
    expect(
      VesselNormalizationUtil.isPotentialTypoDuplicate('KM Tatamailau', 'KM Sirimau'),
    ).toBe(false);
  });
});
