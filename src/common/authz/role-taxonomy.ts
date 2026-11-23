import {
  BerthServiceCategory,
  TaskType,
  UserRole,
} from '@prisma/client';

export type OperationalDomain =
  | 'SYSTEM_ADMIN'
  | 'EXECUTIVE_MONITORING'
  | 'DIVISION_MONITORING'
  | 'PORT_COMMAND'
  | 'PORT_ADMIN'
  | 'REGISTRATION_CONTRACT'
  | 'BERTH_CARGO'
  | 'BERTH_PASSENGER'
  | 'BERTH_GENERAL'
  | 'ASSET_ROOM'
  | 'BILLING_WARNING'
  | 'TREASURY'
  | 'EXTERNAL_OPERATOR'
  | 'EXTERNAL_TENANT';

export interface RoleTaxonomyDefinition {
  role: UserRole;
  roleLabel: string;
  operationalDomain: OperationalDomain;
  allowedBerthCategories: BerthServiceCategory[];
  handledTaskTypes: TaskType[];
  defaultPermissions: string[];
  uiCapabilities: string[];
}

/**
 * Single Source of Truth for PORTA Role Taxonomy, Domain Isolation,
 * Berth Category Jurisdiction, Task Routing, and Frontend UI Capabilities.
 */
export const ROLE_TAXONOMY_MAP: Record<UserRole, RoleTaxonomyDefinition> = {
  [UserRole.SUPERADMIN]: {
    role: UserRole.SUPERADMIN,
    roleLabel: 'Superadmin Sistem',
    operationalDomain: 'SYSTEM_ADMIN',
    allowedBerthCategories: [],
    handledTaskTypes: [],
    defaultPermissions: [
      'system:users:manage',
      'system:assignments:manage',
      'system:master_structure:manage',
      'system:config:manage',
      'system:audit:read',
    ],
    uiCapabilities: [
      'manage_users',
      'manage_assignments',
      'manage_master_structure',
      'manage_system_config',
      'view_audit_logs',
    ],
  },
  [UserRole.KEPALA_DINAS]: {
    role: UserRole.KEPALA_DINAS,
    roleLabel: 'Kepala Dinas Perhubungan',
    operationalDomain: 'EXECUTIVE_MONITORING',
    allowedBerthCategories: [
      BerthServiceCategory.DERMAGA_BARANG,
      BerthServiceCategory.DERMAGA_PENUMPANG,
      BerthServiceCategory.DERMAGA_CAMPURAN,
    ],
    handledTaskTypes: [],
    defaultPermissions: [
      'monitoring:agency:read',
      'monitoring:reports:read',
      'monitoring:revenue:read',
    ],
    uiCapabilities: [
      'view_executive_dashboard',
      'view_all_ports_monitoring',
      'view_revenue_analytics',
      'view_officer_performance',
      'view_daily_reports',
    ],
  },
  [UserRole.DISHUB_EKSEKUTIF]: {
    role: UserRole.DISHUB_EKSEKUTIF,
    roleLabel: 'Eksekutif Dishub (Kadis)',
    operationalDomain: 'EXECUTIVE_MONITORING',
    allowedBerthCategories: [
      BerthServiceCategory.DERMAGA_BARANG,
      BerthServiceCategory.DERMAGA_PENUMPANG,
      BerthServiceCategory.DERMAGA_CAMPURAN,
    ],
    handledTaskTypes: [],
    defaultPermissions: [
      'monitoring:agency:read',
      'monitoring:reports:read',
      'monitoring:revenue:read',
    ],
    uiCapabilities: [
      'view_executive_dashboard',
      'view_all_ports_monitoring',
      'view_revenue_analytics',
      'view_officer_performance',
      'view_daily_reports',
    ],
  },
  [UserRole.KEPALA_BIDANG]: {
    role: UserRole.KEPALA_BIDANG,
    roleLabel: 'Kepala Bidang Kepelabuhanan',
    operationalDomain: 'DIVISION_MONITORING',
    allowedBerthCategories: [
      BerthServiceCategory.DERMAGA_BARANG,
      BerthServiceCategory.DERMAGA_PENUMPANG,
      BerthServiceCategory.DERMAGA_CAMPURAN,
    ],
    handledTaskTypes: [],
    defaultPermissions: [
      'monitoring:division:read',
      'monitoring:reports:read',
      'monitoring:revenue:read',
    ],
    uiCapabilities: [
      'view_division_dashboard',
      'view_division_ports_monitoring',
      'view_revenue_analytics',
      'view_officer_performance',
      'view_daily_reports',
    ],
  },
  [UserRole.KEPALA_PELABUHAN]: {
    role: UserRole.KEPALA_PELABUHAN,
    roleLabel: 'Kepala Pelabuhan',
    operationalDomain: 'PORT_COMMAND',
    allowedBerthCategories: [
      BerthServiceCategory.DERMAGA_BARANG,
      BerthServiceCategory.DERMAGA_PENUMPANG,
      BerthServiceCategory.DERMAGA_CAMPURAN,
    ],
    handledTaskTypes: [
      TaskType.VESSEL_ARRIVAL_CHECK,
      TaskType.BERTHING_INSPECTION,
      TaskType.MANIFEST_CHECK,
      TaskType.PASSENGER_SERVICE,
      TaskType.CARGO_HANDLING_CHECK,
      TaskType.VESSEL_DEPARTURE_CLEARANCE,
      TaskType.DOCUMENT_VERIFICATION,
      TaskType.COMPANY_REGISTRATION_CHECK,
      TaskType.RETRIBUTION_COLLECTION,
      TaskType.ASSET_MANAGEMENT_CHECK,
      TaskType.FACILITY_INSPECTION,
      TaskType.MAINTENANCE_HANDLING,
      TaskType.SAFETY_INSPECTION,
      TaskType.GENERAL_OPERATION,
    ],
    defaultPermissions: [
      'port:command:approve',
      'port:contracts:verify',
      'port:leases:verify',
      'port:tasks:verify_head',
      'port:reports:verify_head',
      'port:assignments:manage',
      'port:billing:approve',
    ],
    uiCapabilities: [
      'view_port_command_dashboard',
      'approve_operator_registration',
      'approve_berthing_contracts',
      'approve_asset_leases',
      'approve_berth_mismatch_override',
      'approve_billing_adjustments',
      'verify_head_tasks',
      'verify_head_daily_reports',
      'manage_port_assignments',
    ],
  },
  [UserRole.ADMIN_PELABUHAN]: {
    role: UserRole.ADMIN_PELABUHAN,
    roleLabel: 'Admin Pelabuhan (Checker Administrasi)',
    operationalDomain: 'PORT_ADMIN',
    allowedBerthCategories: [
      BerthServiceCategory.DERMAGA_BARANG,
      BerthServiceCategory.DERMAGA_PENUMPANG,
      BerthServiceCategory.DERMAGA_CAMPURAN,
    ],
    handledTaskTypes: [
      TaskType.DOCUMENT_VERIFICATION,
      TaskType.COMPANY_REGISTRATION_CHECK,
      TaskType.GENERAL_OPERATION,
    ],
    defaultPermissions: [
      'port:admin:check',
      'port:tasks:check_admin',
      'port:reports:check_admin',
      'port:contracts:review',
      'port:onboarding:verify',
    ],
    uiCapabilities: [
      'view_port_admin_dashboard',
      'check_admin_tasks',
      'check_admin_daily_reports',
      'manage_operator_registration',
      'review_berthing_contracts',
      'manage_visits_admin',
      'manage_invoices_warnings',
    ],
  },
  [UserRole.PETUGAS_REGISTRASI_KONTRAK]: {
    role: UserRole.PETUGAS_REGISTRASI_KONTRAK,
    roleLabel: 'Petugas Registrasi Perusahaan & Kontrak Payung',
    operationalDomain: 'REGISTRATION_CONTRACT',
    allowedBerthCategories: [],
    handledTaskTypes: [
      TaskType.COMPANY_REGISTRATION_CHECK,
      TaskType.DOCUMENT_VERIFICATION,
    ],
    defaultPermissions: [
      'registration:operators:verify',
      'registration:tenants:verify',
      'registration:vessels:verify',
      'registration:documents:verify',
      'contracts:berthing:review',
      'tasks:execute',
    ],
    uiCapabilities: [
      'view_registration_officer_dashboard',
      'manage_operator_registration',
      'manage_tenant_registration',
      'manage_vessel_verification',
      'manage_legal_documents',
      'review_berthing_contracts',
      'execute_assigned_tasks',
    ],
  },
  [UserRole.PETUGAS_DERMAGA_BARANG]: {
    role: UserRole.PETUGAS_DERMAGA_BARANG,
    roleLabel: 'Petugas Dermaga Barang & Bongkar Muat',
    operationalDomain: 'BERTH_CARGO',
    allowedBerthCategories: [
      BerthServiceCategory.DERMAGA_BARANG,
      BerthServiceCategory.DERMAGA_CAMPURAN,
    ],
    handledTaskTypes: [
      TaskType.VESSEL_ARRIVAL_CHECK,
      TaskType.BERTHING_INSPECTION,
      TaskType.CARGO_HANDLING_CHECK,
      TaskType.MANIFEST_CHECK,
      TaskType.VESSEL_DEPARTURE_CLEARANCE,
      TaskType.SAFETY_INSPECTION,
    ],
    defaultPermissions: [
      'berth:cargo:operate',
      'visits:cargo:manage',
      'cargo:handling:record',
      'equipment:rental:record',
      'manifests:cargo:record',
      'tasks:execute',
    ],
    uiCapabilities: [
      'view_cargo_berth_dashboard',
      'manage_cargo_berth_visits',
      'manage_cargo_handling',
      'manage_equipment_rental',
      'manage_cargo_manifests',
      'submit_daily_port_report',
      'execute_assigned_tasks',
    ],
  },
  [UserRole.PETUGAS_DERMAGA_PENUMPANG]: {
    role: UserRole.PETUGAS_DERMAGA_PENUMPANG,
    roleLabel: 'Petugas Dermaga Penumpang, Manifes SOLAS & Gate',
    operationalDomain: 'BERTH_PASSENGER',
    allowedBerthCategories: [
      BerthServiceCategory.DERMAGA_PENUMPANG,
      BerthServiceCategory.DERMAGA_CAMPURAN,
    ],
    handledTaskTypes: [
      TaskType.VESSEL_ARRIVAL_CHECK,
      TaskType.BERTHING_INSPECTION,
      TaskType.PASSENGER_SERVICE,
      TaskType.MANIFEST_CHECK,
      TaskType.VESSEL_DEPARTURE_CLEARANCE,
      TaskType.SAFETY_INSPECTION,
    ],
    defaultPermissions: [
      'berth:passenger:operate',
      'visits:passenger:manage',
      'manifests:solas:record',
      'gate:ticketing:manage',
      'tasks:execute',
    ],
    uiCapabilities: [
      'view_passenger_berth_dashboard',
      'manage_passenger_berth_visits',
      'manage_manifests_solas',
      'manage_gate_ticketing',
      'submit_daily_port_report',
      'execute_assigned_tasks',
    ],
  },
  [UserRole.PETUGAS_RUANGAN]: {
    role: UserRole.PETUGAS_RUANGAN,
    roleLabel: 'Petugas Katalog Ruangan, Aset & Pemeliharaan',
    operationalDomain: 'ASSET_ROOM',
    allowedBerthCategories: [],
    handledTaskTypes: [
      TaskType.ASSET_MANAGEMENT_CHECK,
      TaskType.FACILITY_INSPECTION,
      TaskType.MAINTENANCE_HANDLING,
    ],
    defaultPermissions: [
      'assets:catalog:manage',
      'leases:room:verify',
      'utility:meters:record',
      'maintenance:tickets:manage',
      'tasks:execute',
    ],
    uiCapabilities: [
      'view_room_asset_dashboard',
      'manage_room_catalog',
      'verify_lease_room_feasibility',
      'manage_utility_meters',
      'manage_maintenance_tickets',
      'execute_assigned_tasks',
    ],
  },
  [UserRole.PETUGAS_TAGIHAN]: {
    role: UserRole.PETUGAS_TAGIHAN,
    roleLabel: 'Petugas Tagihan e-SKRD, Keberatan & Denda Teguran',
    operationalDomain: 'BILLING_WARNING',
    allowedBerthCategories: [],
    handledTaskTypes: [TaskType.RETRIBUTION_COLLECTION],
    defaultPermissions: [
      'billing:skrd:issue',
      'billing:adjustments:review',
      'warnings:teguran:manage',
      'tasks:execute',
    ],
    uiCapabilities: [
      'view_billing_officer_dashboard',
      'manage_invoices_skrd',
      'manage_billing_adjustments_perbup25',
      'manage_warnings_denda',
      'execute_assigned_tasks',
    ],
  },
  [UserRole.BENDAHARA]: {
    role: UserRole.BENDAHARA,
    roleLabel: 'Bendahara Penerimaan & Kas Pelabuhan (e-SSRD)',
    operationalDomain: 'TREASURY',
    allowedBerthCategories: [],
    handledTaskTypes: [TaskType.RETRIBUTION_COLLECTION],
    defaultPermissions: [
      'treasury:payments:verify',
      'treasury:essrd:issue',
      'treasury:gate_handover:settle',
      'billing:skrd:read',
    ],
    uiCapabilities: [
      'view_treasury_dashboard',
      'verify_payments_essrd',
      'verify_lease_payments',
      'settle_gate_handovers',
      'view_invoices_skrd',
    ],
  },
  [UserRole.PETUGAS_DERMAGA]: {
    role: UserRole.PETUGAS_DERMAGA,
    roleLabel: 'Petugas Dermaga (Umum)',
    operationalDomain: 'BERTH_GENERAL',
    allowedBerthCategories: [
      BerthServiceCategory.DERMAGA_BARANG,
      BerthServiceCategory.DERMAGA_PENUMPANG,
      BerthServiceCategory.DERMAGA_CAMPURAN,
    ],
    handledTaskTypes: [
      TaskType.VESSEL_ARRIVAL_CHECK,
      TaskType.BERTHING_INSPECTION,
      TaskType.MANIFEST_CHECK,
      TaskType.PASSENGER_SERVICE,
      TaskType.CARGO_HANDLING_CHECK,
      TaskType.VESSEL_DEPARTURE_CLEARANCE,
      TaskType.SAFETY_INSPECTION,
      TaskType.GENERAL_OPERATION,
    ],
    defaultPermissions: [
      'berth:cargo:operate',
      'berth:passenger:operate',
      'tasks:execute',
    ],
    uiCapabilities: [
      'view_cargo_berth_dashboard',
      'view_passenger_berth_dashboard',
      'manage_cargo_berth_visits',
      'manage_passenger_berth_visits',
      'manage_cargo_handling',
      'manage_equipment_rental',
      'manage_manifests_solas',
      'manage_gate_ticketing',
      'submit_daily_port_report',
      'execute_assigned_tasks',
    ],
  },
  [UserRole.PETUGAS_PELABUHAN]: {
    role: UserRole.PETUGAS_PELABUHAN,
    roleLabel: 'Petugas Operasional Pelabuhan (Umum)',
    operationalDomain: 'BERTH_GENERAL',
    allowedBerthCategories: [
      BerthServiceCategory.DERMAGA_BARANG,
      BerthServiceCategory.DERMAGA_PENUMPANG,
      BerthServiceCategory.DERMAGA_CAMPURAN,
    ],
    handledTaskTypes: [
      TaskType.VESSEL_ARRIVAL_CHECK,
      TaskType.BERTHING_INSPECTION,
      TaskType.MANIFEST_CHECK,
      TaskType.PASSENGER_SERVICE,
      TaskType.CARGO_HANDLING_CHECK,
      TaskType.VESSEL_DEPARTURE_CLEARANCE,
      TaskType.DOCUMENT_VERIFICATION,
      TaskType.COMPANY_REGISTRATION_CHECK,
      TaskType.RETRIBUTION_COLLECTION,
      TaskType.ASSET_MANAGEMENT_CHECK,
      TaskType.FACILITY_INSPECTION,
      TaskType.MAINTENANCE_HANDLING,
      TaskType.SAFETY_INSPECTION,
      TaskType.GENERAL_OPERATION,
    ],
    defaultPermissions: ['port:general:operate', 'tasks:execute'],
    uiCapabilities: [
      'view_general_officer_dashboard',
      'manage_operator_registration',
      'manage_cargo_berth_visits',
      'manage_passenger_berth_visits',
      'manage_cargo_handling',
      'manage_manifests_solas',
      'manage_room_catalog',
      'manage_maintenance_tickets',
      'submit_daily_port_report',
      'execute_assigned_tasks',
    ],
  },
  [UserRole.OPERATOR_KAPAL]: {
    role: UserRole.OPERATOR_KAPAL,
    roleLabel: 'Perusahaan Pelayaran / Operator Kapal',
    operationalDomain: 'EXTERNAL_OPERATOR',
    allowedBerthCategories: [],
    handledTaskTypes: [],
    defaultPermissions: ['external:operator:self_service'],
    uiCapabilities: [
      'view_operator_dashboard',
      'manage_own_company_profile',
      'manage_own_vessels',
      'request_berthing_contracts',
      'request_ship_visits',
      'request_asset_leases',
      'submit_vessel_manifests',
      'pay_own_invoices',
      'request_billing_adjustments',
    ],
  },
  [UserRole.TENANT]: {
    role: UserRole.TENANT,
    roleLabel: 'Penyewa Lahan / Kios / Gudang (Tenant)',
    operationalDomain: 'EXTERNAL_TENANT',
    allowedBerthCategories: [],
    handledTaskTypes: [],
    defaultPermissions: ['external:tenant:self_service'],
    uiCapabilities: [
      'view_tenant_dashboard',
      'manage_own_tenant_profile',
      'browse_room_catalog',
      'request_asset_leases',
      'pay_own_lease_invoices',
    ],
  },
};

/**
 * Modular Role Groups for Controller `@Roles(...)` Decorators
 * Eliminates hardcoded role arrays across controllers while enforcing strict functional boundaries.
 */
export const ROLE_GROUPS = {
  /**
   * 1. Registration & Umbrella Berthing Contract Officers
   * Handles ShipOperator/Tenant onboarding, legal documents, Vessel verification, and initial PKS Sandar review.
   */
  REGISTRATION_CONTRACT_OFFICERS: [
    UserRole.PETUGAS_REGISTRASI_KONTRAK,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.KEPALA_PELABUHAN,
  ] as UserRole[],

  /**
   * 2. Cargo Berth Officers
   * Handles cargo vessel berthing, CargoHandlingRecord (bongkar muat), and EquipmentRentalRecord (alat berat).
   */
  CARGO_BERTH_OFFICERS: [
    UserRole.PETUGAS_DERMAGA_BARANG,
    UserRole.PETUGAS_DERMAGA,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.KEPALA_PELABUHAN,
  ] as UserRole[],

  /**
   * 3. Passenger Berth Officers
   * Handles passenger/ferry vessel berthing, SOLAS passenger/vehicle manifests, and Gate Ticketing.
   */
  PASSENGER_BERTH_OFFICERS: [
    UserRole.PETUGAS_DERMAGA_PENUMPANG,
    UserRole.PETUGAS_DERMAGA,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.KEPALA_PELABUHAN,
  ] as UserRole[],

  /**
   * 4. All Berth & Visit Operations Officers (Cargo + Passenger + General)
   */
  ALL_BERTH_OFFICERS: [
    UserRole.PETUGAS_DERMAGA_BARANG,
    UserRole.PETUGAS_DERMAGA_PENUMPANG,
    UserRole.PETUGAS_DERMAGA,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.KEPALA_PELABUHAN,
  ] as UserRole[],

  /**
   * 5. Landside Room Catalog, Utility Meter & Maintenance Officers
   */
  ROOM_ASSET_OFFICERS: [
    UserRole.PETUGAS_RUANGAN,
    UserRole.PETUGAS_PELABUHAN,
    UserRole.ADMIN_PELABUHAN,
    UserRole.KEPALA_PELABUHAN,
  ] as UserRole[],

  /**
   * 6. Billing (e-SKRD), Perbup 25/2024 Objections/Adjustments & Warnings (Surat Teguran 1-3) Officers
   */
  BILLING_WARNING_OFFICERS: [
    UserRole.PETUGAS_TAGIHAN,
    UserRole.BENDAHARA,
    UserRole.ADMIN_PELABUHAN,
    UserRole.KEPALA_PELABUHAN,
  ] as UserRole[],

  /**
   * 7. Treasury & Cash Settlement (e-SSRD & Gate Handover Settlement)
   */
  TREASURY_OFFICERS: [
    UserRole.BENDAHARA,
    UserRole.KEPALA_PELABUHAN,
  ] as UserRole[],

  /**
   * 8. All Field Officers (All 6 specialized officer roles + general fallback officers)
   */
  ALL_FIELD_OFFICERS: [
    UserRole.PETUGAS_REGISTRASI_KONTRAK,
    UserRole.PETUGAS_DERMAGA_BARANG,
    UserRole.PETUGAS_DERMAGA_PENUMPANG,
    UserRole.PETUGAS_RUANGAN,
    UserRole.PETUGAS_TAGIHAN,
    UserRole.BENDAHARA,
    UserRole.PETUGAS_DERMAGA,
    UserRole.PETUGAS_PELABUHAN,
  ] as UserRole[],
};

export function getRoleTaxonomy(role: UserRole): RoleTaxonomyDefinition {
  return ROLE_TAXONOMY_MAP[role];
}

export function isSpecializedOrGeneralPetugasRole(role: UserRole): boolean {
  return (
    role === UserRole.PETUGAS_PELABUHAN ||
    role === UserRole.PETUGAS_DERMAGA ||
    role === UserRole.PETUGAS_REGISTRASI_KONTRAK ||
    role === UserRole.PETUGAS_DERMAGA_BARANG ||
    role === UserRole.PETUGAS_DERMAGA_PENUMPANG ||
    role === UserRole.PETUGAS_RUANGAN ||
    role === UserRole.PETUGAS_TAGIHAN
  );
}
