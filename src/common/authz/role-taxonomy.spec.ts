import {
  BerthServiceCategory,
  ContractStatus,
  TaskType,
  UserRole,
  VerificationStatus,
  VesselCategory,
} from '@prisma/client';
import {
  getRoleTaxonomy,
  isSpecializedOrGeneralPetugasRole,
  ROLE_GROUPS,
  ROLE_TAXONOMY_MAP,
} from '../authz/role-taxonomy';
import {
  enrichUserWithRoleTaxonomy,
  expandEquivalentRoles,
  isPetugasRole,
} from '../decorators/current-user.decorator';

describe('Specialized Officer Role Taxonomy & Domain Isolation', () => {
  it('defines complete taxonomy metadata for all 16 UserRole enum values', () => {
    const allRoles = Object.values(UserRole);
    for (const role of allRoles) {
      const def = getRoleTaxonomy(role);
      expect(def).toBeDefined();
      expect(def.role).toBe(role);
      expect(def.roleLabel.length).toBeGreaterThan(3);
      expect(Array.isArray(def.uiCapabilities)).toBe(true);
      expect(Array.isArray(def.defaultPermissions)).toBe(true);
      expect(Array.isArray(def.handledTaskTypes)).toBe(true);
    }
  });

  it('strictly separates berth categories between PETUGAS_DERMAGA_BARANG and PETUGAS_DERMAGA_PENUMPANG', () => {
    const cargoOfficer = ROLE_TAXONOMY_MAP[UserRole.PETUGAS_DERMAGA_BARANG];
    const passengerOfficer = ROLE_TAXONOMY_MAP[UserRole.PETUGAS_DERMAGA_PENUMPANG];

    expect(cargoOfficer.allowedBerthCategories).toContain(BerthServiceCategory.DERMAGA_BARANG);
    expect(cargoOfficer.allowedBerthCategories).toContain(BerthServiceCategory.DERMAGA_CAMPURAN);
    expect(cargoOfficer.allowedBerthCategories).not.toContain(
      BerthServiceCategory.DERMAGA_PENUMPANG,
    );

    expect(passengerOfficer.allowedBerthCategories).toContain(
      BerthServiceCategory.DERMAGA_PENUMPANG,
    );
    expect(passengerOfficer.allowedBerthCategories).toContain(
      BerthServiceCategory.DERMAGA_CAMPURAN,
    );
    expect(passengerOfficer.allowedBerthCategories).not.toContain(
      BerthServiceCategory.DERMAGA_BARANG,
    );
  });

  it('maps each specialized officer role to its dedicated TaskTypes', () => {
    expect(
      ROLE_TAXONOMY_MAP[UserRole.PETUGAS_REGISTRASI_KONTRAK].handledTaskTypes,
    ).toEqual([TaskType.COMPANY_REGISTRATION_CHECK, TaskType.DOCUMENT_VERIFICATION]);

    expect(
      ROLE_TAXONOMY_MAP[UserRole.PETUGAS_DERMAGA_BARANG].handledTaskTypes,
    ).toContain(TaskType.CARGO_HANDLING_CHECK);
    expect(
      ROLE_TAXONOMY_MAP[UserRole.PETUGAS_DERMAGA_BARANG].handledTaskTypes,
    ).not.toContain(TaskType.PASSENGER_SERVICE);

    expect(
      ROLE_TAXONOMY_MAP[UserRole.PETUGAS_DERMAGA_PENUMPANG].handledTaskTypes,
    ).toContain(TaskType.PASSENGER_SERVICE);
    expect(
      ROLE_TAXONOMY_MAP[UserRole.PETUGAS_DERMAGA_PENUMPANG].handledTaskTypes,
    ).not.toContain(TaskType.CARGO_HANDLING_CHECK);

    expect(ROLE_TAXONOMY_MAP[UserRole.PETUGAS_RUANGAN].handledTaskTypes).toEqual([
      TaskType.ASSET_MANAGEMENT_CHECK,
      TaskType.FACILITY_INSPECTION,
      TaskType.MAINTENANCE_HANDLING,
    ]);

    expect(ROLE_TAXONOMY_MAP[UserRole.PETUGAS_TAGIHAN].handledTaskTypes).toEqual([
      TaskType.RETRIBUTION_COLLECTION,
    ]);
  });

  it('does not leak specialized officer roles into unrelated modules via expandEquivalentRoles', () => {
    const cargoRoles = expandEquivalentRoles(ROLE_GROUPS.CARGO_BERTH_OFFICERS);
    expect(cargoRoles).toContain(UserRole.PETUGAS_DERMAGA_BARANG);
    expect(cargoRoles).not.toContain(UserRole.PETUGAS_DERMAGA_PENUMPANG);
    expect(cargoRoles).not.toContain(UserRole.PETUGAS_RUANGAN);
    expect(cargoRoles).not.toContain(UserRole.PETUGAS_TAGIHAN);
    expect(cargoRoles).not.toContain(UserRole.PETUGAS_REGISTRASI_KONTRAK);

    const roomRoles = expandEquivalentRoles(ROLE_GROUPS.ROOM_ASSET_OFFICERS);
    expect(roomRoles).toContain(UserRole.PETUGAS_RUANGAN);
    expect(roomRoles).not.toContain(UserRole.PETUGAS_DERMAGA_BARANG);
    expect(roomRoles).not.toContain(UserRole.PETUGAS_TAGIHAN);
  });

  it('enriches authenticated user payload with roleLabel, operationalDomain, and uiCapabilities', () => {
    const rawUser = {
      id: 99,
      email: 'petugas.registrasi@porta.mimikakab.go.id',
      role: UserRole.PETUGAS_REGISTRASI_KONTRAK,
    };
    const enriched = enrichUserWithRoleTaxonomy(rawUser);

    expect(enriched.roleLabel).toBe('Petugas Registrasi Perusahaan & Kontrak Payung');
    expect(enriched.operationalDomain).toBe('REGISTRATION_CONTRACT');
    expect(enriched.uiCapabilities).toContain('review_berthing_contracts');
    expect(enriched.uiCapabilities).toContain('manage_vessel_verification');
    expect(isPetugasRole(rawUser.role)).toBe(true);
    expect(isSpecializedOrGeneralPetugasRole(UserRole.SUPERADMIN)).toBe(false);
  });

  it('keeps SUPERADMIN out of all operational ROLE_GROUPS', () => {
    for (const group of Object.values(ROLE_GROUPS)) {
      expect(group).not.toContain(UserRole.SUPERADMIN);
    }
  });
});
