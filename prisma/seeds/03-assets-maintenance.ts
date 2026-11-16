import {
  BillingEligibility,
  LeaseStatus,
  MaintenanceSeverity,
  MaintenanceStatus,
  PortAssetStatus,
  PortAssetType,
  PrismaClient,
} from '@prisma/client';

export async function seedAssetsAndMaintenance(
  prisma: PrismaClient,
  portId: number,
  adminUserId: number,
  bendaharaUserId: number,
) {
  console.log('Seeding Port Assets, Leases & Maintenance Tickets...');

  // 1. Port Assets
  const assetsData = [
    {
      assetCode: 'AST-PMK-KIOS-01',
      name: 'Kios Kuliner Nusantara Mama Papua',
      assetType: PortAssetType.KIOS,
      areaSqm: 15.0,
      annualRatePerSqmIdr: 150000,
      billingEligibility: BillingEligibility.BILLABLE,
      status: PortAssetStatus.LEASED,
      gisCoordinates: '-4.862214, 136.852119',
      legalBasis: 'Perda Mimika 4/2023 Lampiran XI Bagian D.1.a',
    },
    {
      assetCode: 'AST-PMK-KIOS-02',
      name: 'Kios Perlengkapan Kapal & Sembako ABK',
      assetType: PortAssetType.KIOS,
      areaSqm: 20.0,
      annualRatePerSqmIdr: 150000,
      billingEligibility: BillingEligibility.BILLABLE,
      status: PortAssetStatus.AVAILABLE,
      gisCoordinates: '-4.862250, 136.852150',
      legalBasis: 'Perda Mimika 4/2023 Lampiran XI Bagian D.1.a',
    },
    {
      assetCode: 'AST-PMK-KIOS-03',
      name: 'Loket Tiket Ekspedisi & Agen Pelayaran Swasta',
      assetType: PortAssetType.KIOS,
      areaSqm: 12.0,
      annualRatePerSqmIdr: 150000,
      billingEligibility: BillingEligibility.BILLABLE,
      status: PortAssetStatus.LEASED,
      gisCoordinates: '-4.862280, 136.852180',
      legalBasis: 'Perda Mimika 4/2023 Lampiran XI Bagian D.1.a',
    },
    {
      assetCode: 'AST-PMK-GUDANG-01',
      name: 'Gudang Penumpukan Tertutup Lini I',
      assetType: PortAssetType.GUDANG,
      areaSqm: 500.0,
      annualRatePerSqmIdr: 120000,
      billingEligibility: BillingEligibility.BILLABLE,
      status: PortAssetStatus.LEASED,
      gisCoordinates: '-4.861950, 136.853020',
      legalBasis: 'Perda Mimika 4/2023 Lampiran XI Bagian D.1.b',
    },
    {
      assetCode: 'AST-PMK-LAPANGAN-01',
      name: 'Lapangan Penumpukan Kontainer & Kargo Terbuka Blok B',
      assetType: PortAssetType.GUDANG,
      areaSqm: 2500.0,
      annualRatePerSqmIdr: 80000,
      billingEligibility: BillingEligibility.BILLABLE,
      status: PortAssetStatus.LEASED,
      gisCoordinates: '-4.861500, 136.853500',
      legalBasis: 'Perda Mimika 4/2023 Lampiran XI Bagian D.1.b',
    },
    {
      assetCode: 'AST-PMK-GALANGAN-01',
      name: 'Lahan Galangan & Docking Kapal Rakyat Pomako',
      assetType: PortAssetType.LAHAN_GALANGAN,
      areaSqm: 1200.0,
      annualRatePerSqmIdr: 60000,
      billingEligibility: BillingEligibility.BILLABLE,
      status: PortAssetStatus.LEASED,
      gisCoordinates: '-4.863100, 136.851200',
      legalBasis: 'Perda Mimika 4/2023 Lampiran XI Bagian D.1.c',
    },
    {
      assetCode: 'AST-PMK-PERAIRAN-01',
      name: 'Pemanfaatan Perairan Tambatan Ponton BBM Nelayan',
      assetType: PortAssetType.PERAIRAN_ATAS_AIR,
      areaSqm: 600.0,
      annualRatePerSqmIdr: 50000,
      billingEligibility: BillingEligibility.BILLABLE,
      status: PortAssetStatus.AVAILABLE,
      gisCoordinates: '-4.863500, 136.850500',
      legalBasis: 'Perda Mimika 4/2023 Lampiran XI Bagian D.1.d',
    },
    {
      assetCode: 'AST-PMK-IKLAN-01',
      name: 'Billboard Reklame Gerbang Utama Pelabuhan',
      assetType: PortAssetType.RUANG_IKLAN,
      areaSqm: 24.0,
      annualRatePerSqmIdr: 300000,
      billingEligibility: BillingEligibility.BILLABLE,
      status: PortAssetStatus.LEASED,
      gisCoordinates: '-4.860100, 136.854200',
      legalBasis: 'Perda Mimika 4/2023 Lampiran XI Bagian D.1.e',
    },
  ];

  const assetMap = new Map<string, number>();

  for (const ast of assetsData) {
    const res = await prisma.portAsset.upsert({
      where: { assetCode: ast.assetCode },
      update: {
        name: ast.name,
        assetType: ast.assetType,
        areaSqm: ast.areaSqm,
        annualRatePerSqmIdr: ast.annualRatePerSqmIdr,
        billingEligibility: ast.billingEligibility,
        status: ast.status,
        gisCoordinates: ast.gisCoordinates,
        legalBasis: ast.legalBasis,
        isActive: true,
      },
      create: {
        portId,
        ...ast,
      },
    });
    assetMap.set(ast.assetCode, res.id);
  }

  // 2. Asset Leases (PKS)
  const leasesData = [
    {
      contractNumber: 'PKS/DISHUB-MMK/AST-01/2024',
      assetId: assetMap.get('AST-PMK-KIOS-01')!,
      tenantName: 'Mama Yosepha Karafir (Kantin Pelabuhan)',
      tenantNpwp: '78.123.456.7-954.000',
      tenantPhone: '081344556677',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2025-12-31'),
      totalAnnualAmountIdr: 2250000, // 15 sqm * 150.000
      status: LeaseStatus.ACTIVE,
    },
    {
      contractNumber: 'PKS/DISHUB-MMK/AST-03/2024',
      assetId: assetMap.get('AST-PMK-KIOS-03')!,
      tenantName: 'PT Pelangi Timika Express',
      tenantNpwp: '01.998.877.6-954.000',
      tenantPhone: '081248001122',
      startDate: new Date('2024-03-01'),
      endDate: new Date('2026-02-28'),
      totalAnnualAmountIdr: 1800000, // 12 sqm * 150.000
      status: LeaseStatus.ACTIVE,
    },
    {
      contractNumber: 'PKS/DISHUB-MMK/AST-GUDANG/2023',
      assetId: assetMap.get('AST-PMK-GUDANG-01')!,
      tenantName: 'Koperasi Tenaga Kerja Bongkar Muat (TKBM) Paumako',
      tenantNpwp: '02.444.555.6-954.000',
      tenantPhone: '0901-322990',
      startDate: new Date('2023-01-01'),
      endDate: new Date('2025-12-31'),
      totalAnnualAmountIdr: 60000000, // 500 sqm * 120.000
      status: LeaseStatus.ACTIVE,
    },
    {
      contractNumber: 'PKS/DISHUB-MMK/AST-LAPANGAN/2024',
      assetId: assetMap.get('AST-PMK-LAPANGAN-01')!,
      tenantName: 'CV Timika Logistik Express',
      tenantNpwp: '03.777.666.5-954.000',
      tenantPhone: '0811498877',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2025-12-31'),
      totalAnnualAmountIdr: 200000000, // 2500 sqm * 80.000
      status: LeaseStatus.ACTIVE,
    },
    {
      contractNumber: 'PKS/DISHUB-MMK/AST-GALANGAN/2023',
      assetId: assetMap.get('AST-PMK-GALANGAN-01')!,
      tenantName: 'PT Indo Papua Marine Services',
      tenantNpwp: '01.555.666.7-954.000',
      tenantPhone: '081299887766',
      startDate: new Date('2023-06-01'),
      endDate: new Date('2026-05-31'),
      totalAnnualAmountIdr: 72000000, // 1200 sqm * 60.000
      status: LeaseStatus.ACTIVE,
    },
    {
      contractNumber: 'PKS/DISHUB-MMK/AST-IKLAN/2024',
      assetId: assetMap.get('AST-PMK-IKLAN-01')!,
      tenantName: 'PT Telekomunikasi Selular (Telkomsel) Branch Timika',
      tenantNpwp: '01.321.654.9-092.000',
      tenantPhone: '0901-310100',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      totalAnnualAmountIdr: 7200000, // 24 sqm * 300.000
      status: LeaseStatus.ACTIVE,
    },
  ];

  for (const l of leasesData) {
    const lease = await prisma.assetLease.upsert({
      where: { contractNumber: l.contractNumber },
      update: {
        tenantName: l.tenantName,
        tenantNpwp: l.tenantNpwp,
        tenantPhone: l.tenantPhone,
        startDate: l.startDate,
        endDate: l.endDate,
        totalAnnualAmountIdr: l.totalAnnualAmountIdr,
        status: l.status,
      },
      create: {
        portId,
        ...l,
        createdById: adminUserId,
      },
    });

    // Seed Verified Lease Payments
    const existingPayment = await prisma.assetLeasePayment.findFirst({
      where: { leaseId: lease.id, periodYear: 2024 },
    });

    if (!existingPayment) {
      await prisma.assetLeasePayment.create({
        data: {
          leaseId: lease.id,
          idempotencyKey: `PAY-LEASE-${lease.id}-2024`,
          periodYear: 2024,
          amountIdr: l.totalAnnualAmountIdr,
          paidAt: new Date(l.startDate.getTime() + 10 * 86400000), // Paid 10 days after start
          verifiedById: bendaharaUserId,
        },
      });
    }
  }

  // 3. Maintenance Tickets
  const pemdaBerth = await prisma.berth.findUnique({
    where: { portId_code: { portId, code: 'DRM-PEMDA-01' } },
  });
  const mbBerth = await prisma.berth.findUnique({
    where: { portId_code: { portId, code: 'DOL-PEMDA-01' } },
  });

  const maintenanceData = [
    {
      ticketNumber: 'MT-PMK-2024-001',
      berthId: pemdaBerth?.id ?? null,
      assetId: null,
      severity: MaintenanceSeverity.HIGH,
      title: 'Karet Fender Dermaga Beton Lepas Tersenggol Tongkang',
      description: 'Dua unit rubber fender pada bollard 4 terlepas akibat benturan tongkang saat pasang tinggi.',
      evidencePhoto: '/uploads/maintenance/fender_bollard4.jpg',
      status: MaintenanceStatus.VERIFIED_FIXED,
      reportedById: adminUserId,
      assignedTechnician: 'Dominggus Rumansara (Teknisi Sarpras Dishub)',
      resolutionNote: 'Rubber fender telah dipasang kembali menggunakan angkur baja m24 baru dan diinspeksi aman.',
      resolvedAt: new Date('2024-02-15T14:30:00Z'),
    },
    {
      ticketNumber: 'MT-PMK-2024-002',
      berthId: mbBerth?.id ?? null,
      assetId: null,
      severity: MaintenanceSeverity.CRITICAL,
      title: 'Sistem Hidrolik Movable Bridge (MB) Dermaga Ferry Macet',
      description: 'Pompa hidrolik pengatur ketinggian jembatan MB macet karena oli hidrolik terkontaminasi air asin.',
      evidencePhoto: '/uploads/maintenance/hidrolik_mb.jpg',
      status: MaintenanceStatus.VERIFIED_FIXED,
      reportedById: adminUserId,
      assignedTechnician: 'PT Cipta Hidrolik Mandiri Timika',
      resolutionNote: 'Penggantian seal hidrolik silinder, kuras oli, dan flushing filter. Uji coba operasional sukses.',
      resolvedAt: new Date('2024-04-10T16:00:00Z'),
    },
    {
      ticketNumber: 'MT-PMK-2024-003',
      berthId: null,
      assetId: assetMap.get('AST-PMK-GUDANG-01') ?? null,
      severity: MaintenanceSeverity.MEDIUM,
      title: 'Talang Air & Seng Atap Gudang Lini I Bocor',
      description: 'Seng atap sisi timur berlubang diterpa angin kencang menyebabkan tempias air pada tumpukan semen.',
      evidencePhoto: '/uploads/maintenance/atap_gudang.jpg',
      status: MaintenanceStatus.IN_PROGRESS,
      reportedById: adminUserId,
      assignedTechnician: 'Tim Pemeliharaan Fasilitas UPTD',
      resolutionNote: 'Sebagian lembar seng sudah diganti, menunggu pengelasan rangka talang air tambahan.',
      resolvedAt: null,
    },
    {
      ticketNumber: 'MT-PMK-2024-004',
      berthId: pemdaBerth?.id ?? null,
      assetId: null,
      severity: MaintenanceSeverity.LOW,
      title: 'Lampu Sorot LED Dermaga 3 Mati',
      description: 'Lampu penerangan malam dermaga pada tiang P-03 putus akibat sambaran petir.',
      evidencePhoto: '/uploads/maintenance/lampu_tiang3.jpg',
      status: MaintenanceStatus.REPORTED,
      reportedById: adminUserId,
      assignedTechnician: 'Markus Karafir',
      resolutionNote: null,
      resolvedAt: null,
    },
  ];

  for (const m of maintenanceData) {
    await prisma.maintenanceTicket.upsert({
      where: { ticketNumber: m.ticketNumber },
      update: {
        severity: m.severity,
        title: m.title,
        description: m.description,
        evidencePhoto: m.evidencePhoto,
        status: m.status,
        assignedTechnician: m.assignedTechnician,
        resolutionNote: m.resolutionNote,
        resolvedAt: m.resolvedAt,
      },
      create: {
        portId,
        ...m,
      },
    });
  }

  console.log('Port Assets, Leases & Maintenance Tickets seeded successfully.');
  return { assetMap };
}

