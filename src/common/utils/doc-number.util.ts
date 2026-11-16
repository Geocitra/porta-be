import * as crypto from 'crypto';

export class DocNumberUtil {
  /**
   * Generates collision-resistant document numbers even under same-millisecond concurrency.
   */
  static generate(prefix: string, scope: string | number): string {
    const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `${prefix}-${scope}-${Date.now()}-${rand}`;
  }
}

