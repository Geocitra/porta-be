import { PrismaClient } from '@prisma/client';
import { seedMasters } from './seeds/01-masters';
import { seedTariffsAndRoutes } from './seeds/02-tariffs-routes';
import { seedAssetsAndMaintenance } from './seeds/03-assets-maintenance';
import { seedGateTicketing } from './seeds/04-gate-ticketing';
import { seedVessels } from './seeds/05-vessels';
import { seedOperationsVisits } from './seeds/06-operations-visits';
import { seedCargoEquipmentUtilities } from './seeds/07-cargo-equipment-utilities';
import { seedAdjustmentsReportsComplaints } from './seeds/08-adjustments-reports-complaints';

const prisma = new PrismaClient();

async function main() {
  console.log('================================================================');
  console.log('  PORTA - Pelabuhan Poumako Enterprise Database Seeder');
  console.log('  Perda Kab. Mimika No. 4/2023 & Perbup Mimika No. 25/2024');
  console.log('================================================================');

  // Step 1: Master Data (Ports, Berths, Shipping Operators, RBAC Users, Legal Documents)
  const { pomako, operatorMap, userMap } = await seedMasters(prisma);
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

  console.log('================================================================');
  console.log('  PORTA Database Seeder Finished Successfully!');
  console.log('  All 16 Modules Populated with Deep, Authentic, Real-World Data.');
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
