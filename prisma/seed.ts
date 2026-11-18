import {
  BillingEligibility,
  LeaseStatus,
  PortAssetStatus,
  PortAssetType,
  PrismaClient,
  ShipType,
  ShippingCategory,
  VerificationStatus,
  VesselCategory,
  VisitStatus,
} from '@prisma/client';
import { seedMasters } from './seeds/01-masters';
import { seedTariffsAndRoutes } from './seeds/02-tariffs-routes';
import { seedAssetsAndMaintenance } from './seeds/03-assets-maintenance';
import { seedGateTicketing } from './seeds/04-gate-ticketing';
import { seedVessels } from './seeds/05-vessels';
import { seedOperationsVisits } from './seeds/06-operations-visits';
import { seedCargoEquipmentUtilities } from './seeds/07-cargo-equipment-utilities';
import { seedAdjustmentsReportsComplaints } from './seeds/08-adjustments-reports-complaints';
import { seedHierarchyAssignmentsAndTasks } from './seeds/09-hierarchy-assignments-tasks';

const prisma = new PrismaClient();

async function main() {
  console.log('================================================================');
  console.log('  PORTA - Pelabuhan Poumako Enterprise Database Seeder');
  console.log('  Perda Kab. Mimika No. 4/2023 & Perbup Mimika No. 25/2024');
  console.log('================================================================');

  // Step 1: Master Data (Ports, Berths, Shipping Operators, RBAC Users, Legal Documents)
  const { pomako, pomakoBarang, pomakoPenumpang, operatorMap, userMap } = await seedMasters(prisma);
  const portId = pomako.id;

  const adminUserId = userMap.get('admin.pomako@porta.mimikakab.go.id')!;
  const petugasUserId = userMap.get('petugas.pomako@porta.mimikakab.go.id')!;
  const bendaharaUserId = userMap.get('bendahara.pomako@porta.mimikakab.go.id')!;
  const kadishubUserId = userMap.get('dishub@porta.mimikakab.go.id')!;

  // Step 2: Tariffs Matrix & Perda Ferry Routes
  await seedTariffsAndRoutes(prisma, portId);

  // Step 3: Port Assets (PKS Leases, Multi-Year Rental, Maintenance Tickets)
  await seedAssetsAndMaintenance(prisma, portId, adminUserId, bendaharaUserId);

  // Step 4: Gate Ticketing (Porporasi, Ticket Books & Zero Discrepancy Shift Handovers)
  await seedGateTicketing(prisma, portId);

  // Step 5: Realistic Maritime Fleet (Vessels with IMO, GT, Certificates)
  const { vesselMap } = await seedVessels(prisma, operatorMap, adminUserId);

  // Step 6: Port Operations & Financial Realization (Visits, Berthings, SKRD/Karcis, SSRD, Warnings, Manifests)
  await seedOperationsVisits(
    prisma,
    portId,
    vesselMap,
    adminUserId,
    petugasUserId,
    bendaharaUserId,
  );

  // Step 7: Cargo Handling, Port Equipment Rentals & Clean Water Meter Utilities
  await seedCargoEquipmentUtilities(prisma, portId, adminUserId, petugasUserId);

  // Step 8: Billing Adjustments (Perbup 25/2024), Daily Shift Reports, Public Complaints, Notifications & Audit Logs
  await seedAdjustmentsReportsComplaints(
    prisma,
    portId,
    adminUserId,
    petugasUserId,
    kadishubUserId,
    bendaharaUserId,
  );

  // Step 9: Multi-Port Assets (Barang & Penumpang) + Pending Queues for End-to-End Business Flow
  const firstOpId = Array.from(operatorMap.values())[0];
  const firstVessel = await prisma.vessel.findFirst({ where: { verificationStatus: VerificationStatus.VERIFIED } });

  // 9a. 1 PENDING Vessel for Admin Pelabuhan Verification Flow
  await prisma.vessel.upsert({
    where: { registrationNumber: 'REG-PMK-PENDING-01' },
    update: {},
    create: {
      operatorId: firstOpId,
      registrationNumber: 'REG-PMK-PENDING-01',
      imoNumber: 'IMO9876543',
      name: 'KM Arafura Ekspres (Menunggu Verifikasi)',
      flag: 'Indonesia',
      grossTonnage: 420,
      shipType: ShipType.NIAGA,
      vesselCategory: VesselCategory.PENUMPANG,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
      lengthMeters: 52,
      draftMeters: 3.8,
      verificationStatus: VerificationStatus.PENDING,
    },
  });

  // 9b. Assets for Pelabuhan Barang & Pelabuhan Penumpang
  await prisma.portAsset.upsert({
    where: { assetCode: 'AST-BRG-GUDANG-01' },
    update: {},
    create: {
      portId: pomakoBarang.id,
      assetCode: 'AST-BRG-GUDANG-01',
      name: 'Gudang Kargo & Kontainer Lini I (Pelabuhan Barang)',
      assetType: PortAssetType.GUDANG,
      areaSqm: 600,
      annualRatePerSqmIdr: 125000,
      billingEligibility: BillingEligibility.BILLABLE,
      status: PortAssetStatus.AVAILABLE,
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI',
    },
  });

  await prisma.portAsset.upsert({
    where: { assetCode: 'AST-PNP-KIOS-01' },
    update: {},
    create: {
      portId: pomakoPenumpang.id,
      assetCode: 'AST-PNP-KIOS-01',
      name: 'Kios Terminal Penumpang & Ruang Tunggu No. 1',
      assetType: PortAssetType.KIOS,
      areaSqm: 18,
      annualRatePerSqmIdr: 150000,
      billingEligibility: BillingEligibility.BILLABLE,
      status: PortAssetStatus.AVAILABLE,
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI',
    },
  });

  // 9c. 1 REQUESTED Asset Lease at Poumako for Admin Pelabuhan Approval Flow
  const availAsset = await prisma.portAsset.findFirst({
    where: { portId: pomako.id, status: PortAssetStatus.AVAILABLE },
  });
  const verifiedTenant = await prisma.tenant.findFirst({
    where: { verificationStatus: VerificationStatus.VERIFIED },
  });
  if (availAsset && verifiedTenant) {
    await prisma.assetLease.upsert({
      where: { contractNumber: 'PKS-PMK-REQ-2026-01' },
      update: {},
      create: {
        portId: pomako.id,
        assetId: availAsset.id,
        tenantId: verifiedTenant.id,
        contractNumber: 'PKS-PMK-REQ-2026-01',
        tenantName: verifiedTenant.name,
        tenantNpwp: verifiedTenant.npwp,
        tenantPhone: verifiedTenant.phone,
        startDate: new Date('2026-12-01'),
        endDate: new Date('2027-11-30'),
        totalAnnualAmountIdr: Number(availAsset.areaSqm) * Number(availAsset.annualRatePerSqmIdr),
        status: LeaseStatus.REQUESTED,
        createdById: adminUserId,
      },
    });
  }

  // 9d. Sample Ship Visits for Pelabuhan Barang & Pelabuhan Penumpang
  if (firstVessel) {
    await prisma.shipVisit.upsert({
      where: { visitNumber: 'VST-BRG-2026-001' },
      update: {},
      create: {
        portId: pomakoBarang.id,
        vesselId: firstVessel.id,
        operatorId: firstVessel.operatorId,
        visitNumber: 'VST-BRG-2026-001',
        eta: new Date(Date.now() + 86400000),
        etd: new Date(Date.now() + 3 * 86400000),
        originPort: 'Surabaya (Tanjung Perak)',
        destinationPort: 'Poumako (Terminal Barang)',
        status: VisitStatus.REQUESTED,
      },
    });

    await prisma.shipVisit.upsert({
      where: { visitNumber: 'VST-PNP-2026-001' },
      update: {},
      create: {
        portId: pomakoPenumpang.id,
        vesselId: firstVessel.id,
        operatorId: firstVessel.operatorId,
        visitNumber: 'VST-PNP-2026-001',
        eta: new Date(Date.now() + 43200000),
        etd: new Date(Date.now() + 2 * 86400000),
        originPort: 'Agats (Asmat)',
        destinationPort: 'Poumako (Terminal Penumpang)',
        status: VisitStatus.REQUESTED,
      },
    });
  }

  // Step 10: Organizational Hierarchy, Ecosystem Master, Assignments & Task Workflow
  await seedHierarchyAssignmentsAndTasks(prisma, {
    pomakoId: pomako.id,
    pomakoBarangId: pomakoBarang.id,
    pomakoPenumpangId: pomakoPenumpang.id,
  });

  console.log('================================================================');
  console.log('  PORTA Database Seeder Finished Successfully!');
  console.log('  All Modules Populated with Deep, Authentic, Real-World Data.');
  console.log('================================================================');
}

main()
  .catch((e) => {
    console.error('Error during PORTA seed execution:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
