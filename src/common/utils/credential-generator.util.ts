import * as crypto from 'crypto';
import { UserRole } from '@prisma/client';

const UPPER_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER_CHARS = 'abcdefghijkmnopqrstuvwxyz';
const DIGIT_CHARS = '23456789';
const SYMBOL_CHARS = '!@#$%*?';
const ALPHANUMERIC_CHARS = UPPER_CHARS + LOWER_CHARS + DIGIT_CHARS;

const ROLE_USERNAME_PREFIX_MAP: Record<UserRole, string> = {
  [UserRole.SUPERADMIN]: 'superadmin',
  [UserRole.KEPALA_DINAS]: 'kadis',
  [UserRole.DISHUB_EKSEKUTIF]: 'kadis.eksekutif',
  [UserRole.KEPALA_BIDANG]: 'kabid',
  [UserRole.KEPALA_PELABUHAN]: 'kepala.pelabuhan',
  [UserRole.ADMIN_PELABUHAN]: 'admin.pelabuhan',
  [UserRole.PETUGAS_REGISTRASI_KONTRAK]: 'petugas.registrasi',
  [UserRole.PETUGAS_DERMAGA_BARANG]: 'petugas.barang',
  [UserRole.PETUGAS_DERMAGA_PENUMPANG]: 'petugas.penumpang',
  [UserRole.PETUGAS_RUANGAN]: 'petugas.ruangan',
  [UserRole.PETUGAS_TAGIHAN]: 'petugas.tagihan',
  [UserRole.BENDAHARA]: 'bendahara',
  [UserRole.PETUGAS_DERMAGA]: 'petugas.dermaga',
  [UserRole.PETUGAS_PELABUHAN]: 'petugas.pelabuhan',
  [UserRole.OPERATOR_KAPAL]: 'operator.kapal',
  [UserRole.TENANT]: 'tenant',
};

function pickRandomChar(alphabet: string): string {
  const index = crypto.randomInt(0, alphabet.length);
  return alphabet[index];
}

export class CredentialGeneratorUtil {
  /**
   * Generates a cryptographically strong, human-copyable temporary password
   * without visually ambiguous characters (0/O, 1/l/I).
   * Example format: "Prt-9Km4#Qx7" (12 characters)
   */
  static generateTemporaryPassword(): string {
    const part1 =
      pickRandomChar(UPPER_CHARS) +
      pickRandomChar(DIGIT_CHARS) +
      pickRandomChar(LOWER_CHARS) +
      pickRandomChar(DIGIT_CHARS);

    const symbol = pickRandomChar(SYMBOL_CHARS);

    const part2 =
      pickRandomChar(UPPER_CHARS) +
      pickRandomChar(LOWER_CHARS) +
      pickRandomChar(DIGIT_CHARS) +
      pickRandomChar(ALPHANUMERIC_CHARS);

    return `Prt-${part1}${symbol}${part2}`;
  }

  /**
   * Derives a clean, URL/login-safe base username that strictly matches USERNAME_REGEX (/^[a-zA-Z0-9._-]{4,50}$/).
   */
  static generateBaseUsername(params: {
    fullName: string;
    email: string;
    role: UserRole;
  }): string {
    const cleanFullName = (params.fullName || '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ') // strip parenthetical titles
      .replace(/[^a-z0-9\s]/g, ' ')
      .trim();

    const words = cleanFullName
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !['drs', 'ir', 'capt', 'st', 'se', 'sh', 'msi', 'mt', 'sap', 'sstp', 'mmar', 'pt', 'cv'].includes(w));

    let candidate = '';
    if (words.length >= 2) {
      candidate = `${words[0]}.${words[1]}`;
    } else if (words.length === 1) {
      const prefix = ROLE_USERNAME_PREFIX_MAP[params.role] || 'user';
      candidate = `${prefix}.${words[0]}`;
    } else {
      const emailPrefix = (params.email || '')
        .split('@')[0]
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '.')
        .replace(/\.+/g, '.')
        .replace(/^\.|\.$/g, '');
      candidate = emailPrefix || ROLE_USERNAME_PREFIX_MAP[params.role] || 'porta.user';
    }

    candidate = candidate
      .replace(/\.+/g, '.')
      .replace(/^\.|\.$/g, '')
      .slice(0, 42);

    if (candidate.length < 4) {
      candidate = `${ROLE_USERNAME_PREFIX_MAP[params.role] || 'user'}.${crypto.randomInt(100, 999)}`;
    }

    return candidate;
  }
}
