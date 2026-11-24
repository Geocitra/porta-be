/**
 * 3-Layer Anti-Typo & Anti-Duplicate Vessel Normalization Utility
 * Pure, stateless, zero-dependency helper for canonical vessel keys and Levenshtein fuzzy matching.
 */

const MARITIME_PREFIX_REGEX =
  /^(KM|KMP|MV|MT|TB|BG|SPOB|LCT|KLM|KN|KRI|MS|SV|AHTS|FSO|FPSO)\.?\s+/i;

export class VesselNormalizationUtil {
  /**
   * Normalizes vessel registration number (Tanda Pendaftaran / Call Sign)
   * by stripping all whitespace and punctuation and uppercasing.
   * Example: "reg-pmk 001" -> "REGPMK001", "REG.PMK/001" -> "REGPMK001"
   */
  static normalizeRegistrationNumber(raw: string): string {
    return (raw || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

  /**
   * Normalizes IMO number by stripping spaces/hyphens and uppercasing.
   * Example: "imo 9123456" -> "IMO9123456"
   */
  static normalizeImoNumber(raw?: string | null): string | null {
    if (!raw || !raw.trim()) return null;
    const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return cleaned.length > 0 ? cleaned : null;
  }

  /**
   * Normalizes vessel name by removing common maritime prefixes (KM, KMP, MV, TB, etc.),
   * stripping punctuation, collapsing whitespace, and uppercasing.
   * Example: "km.  tatamailau!" -> "TATAMAILAU"
   */
  static normalizeVesselName(raw: string): string {
    let cleaned = (raw || '')
      .trim()
      .replace(/[.,/_'"()\-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .toUpperCase();

    // Strip leading maritime prefix iteratively (e.g., "KM. KMP. Nusantara")
    while (MARITIME_PREFIX_REGEX.test(cleaned)) {
      cleaned = cleaned.replace(MARITIME_PREFIX_REGEX, '').trim();
    }

    return cleaned.replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Computes classic Levenshtein edit distance between two strings.
   */
  static computeLevenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
      new Array<number>(b.length + 1).fill(0),
    );

    for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }

    return matrix[a.length][b.length];
  }

  /**
   * Computes normalized similarity score in [0, 1] between two vessel names
   * after canonical normalization.
   */
  static computeNameSimilarity(nameA: string, nameB: string): number {
    const normA = this.normalizeVesselName(nameA);
    const normB = this.normalizeVesselName(nameB);
    if (!normA || !normB) return 0;
    if (normA === normB) return 1;

    const maxLen = Math.max(normA.length, normB.length);
    const distance = this.computeLevenshteinDistance(normA, normB);
    return Number(Math.max(0, 1 - distance / maxLen).toFixed(4));
  }

  /**
   * Returns true if two vessel names are likely a typo / duplicate of each other
   * (exact canonical match, similarity >= 0.80, or edit distance <= 2 on names >= 6 chars).
   */
  static isPotentialTypoDuplicate(nameA: string, nameB: string): boolean {
    const normA = this.normalizeVesselName(nameA);
    const normB = this.normalizeVesselName(nameB);
    if (!normA || !normB) return false;
    if (normA === normB) return true;

    const similarity = this.computeNameSimilarity(normA, normB);
    if (similarity >= 0.8) return true;

    const minLen = Math.min(normA.length, normB.length);
    if (minLen >= 6 && this.computeLevenshteinDistance(normA, normB) <= 2) {
      return true;
    }

    return false;
  }
}
