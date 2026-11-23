import {
  CargoCategory,
  ChargePaymentStatus,
  PortEquipmentType,
  PrismaClient,
  StorageLocationType,
  UtilityType,
} from '@prisma/client';

export async function seedCargoEquipmentUtilities(
  prisma: PrismaClient,
  portId: number,
  adminUserId: number,
  petugasUserId: number,
) {
  console.log('Seeding Cargo Handling, Equipment Rentals & Utility Meter Readings...');

  // 1. Cargo Handling Records
  const cargoData = [
    {
      recordNumber: 'CRG-PMK-2024-001',
      cargoCategory: CargoCategory.BARANG_BULOG_PUPUK,
      description: 'Bongkar Beras Bulog Penugasan Bansos Mimika',
      quantity: 450.0,
      unitLabel: 'Ton',
      storageLocation: StorageLocationType.GUDANG_TERTUTUP,
      durationDays: 1,
      ratePerUnitIdr: 400,
      totalAmountIdr: 180000,
      paymentStatus: ChargePaymentStatus.PAID,
      paidAt: new Date('2024-02-10T11:00:00Z'),
      idempotencyKey: 'PAY-CRG-001',
    },
    {
      recordNumber: 'CRG-PMK-2024-002',
      cargoCategory: CargoCategory.BARANG_ANTAR_PULAU,
      description: 'Bongkar Semen Tonasa & Bahan Bangunan dari Surabaya',
      quantity: 800.0,
      unitLabel: 'Ton',
      storageLocation: StorageLocationType.LAPANGAN_TERBUKA,
      durationDays: 2,
      ratePerUnitIdr: 600,
      totalAmountIdr: 480000,
      paymentStatus: ChargePaymentStatus.PAID,
      paidAt: new Date('2024-02-15T15:30:00Z'),
      idempotencyKey: 'PAY-CRG-002',
    },
    {
      recordNumber: 'CRG-PMK-2024-003',
      cargoCategory: CargoCategory.PETI_KEMAS_20FT,
      description: 'Penumpukan Peti Kemas 20 Kaki Isi (Sembako & General Cargo)',
      quantity: 25.0,
      unitLabel: 'Unit',
      storageLocation: StorageLocationType.LAPANGAN_TERBUKA,
      durationDays: 3,
      ratePerUnitIdr: 6000,
      totalAmountIdr: 450000, // 25 unit * 3 hari * 6000
      paymentStatus: ChargePaymentStatus.PAID,
      paidAt: new Date('2024-03-01T10:00:00Z'),
      idempotencyKey: 'PAY-CRG-003',
    },
    {
      recordNumber: 'CRG-PMK-2024-004',
      cargoCategory: CargoCategory.PETI_KEMAS_40FT,
      description: 'Penumpukan Peti Kemas 40 Kaki Isi (Peralatan Industri)',
      quantity: 15.0,
      unitLabel: 'Unit',
      storageLocation: StorageLocationType.LAPANGAN_TERBUKA,
      durationDays: 2,
      ratePerUnitIdr: 12000,
      totalAmountIdr: 360000, // 15 unit * 2 hari * 12000
      paymentStatus: ChargePaymentStatus.PAID,
      paidAt: new Date('2024-03-05T14:00:00Z'),
      idempotencyKey: 'PAY-CRG-004',
    },
    {
      recordNumber: 'CRG-PMK-2024-005',
      cargoCategory: CargoCategory.HEWAN_TERNAK,
      description: 'Bongkar Sapi Potong Peternakan Merauke',
      quantity: 35.0,
      unitLabel: 'Ekor',
      storageLocation: null,
      durationDays: 1,
      ratePerUnitIdr: 800,
      totalAmountIdr: 28000,
      paymentStatus: ChargePaymentStatus.PAID,
      paidAt: new Date('2024-03-12T09:00:00Z'),
      idempotencyKey: 'PAY-CRG-005',
    },
    {
      recordNumber: 'CRG-PMK-2024-006',
      cargoCategory: CargoCategory.SHIP_TO_SHIP,
      description: 'Alih Muat Muatan Tongkang ke Kapal Curah (Ship-to-Ship) di Muara',
      quantity: 1500.0,
      unitLabel: 'Ton',
      storageLocation: null,
      durationDays: 1,
      ratePerUnitIdr: 30,
      totalAmountIdr: 45000,
      paymentStatus: ChargePaymentStatus.PAID,
      paidAt: new Date('2024-03-20T16:00:00Z'),
      idempotencyKey: 'PAY-CRG-006',
    },
    {
      recordNumber: 'CRG-PMK-2024-007',
      cargoCategory: CargoCategory.BARANG_IMPOR_EKSPOR,
      description: 'Muat Ekspor Kayu Olahan Plywood Asmat ke Kapal Luar Negeri',
      quantity: 400.0,
      unitLabel: 'm3',
      storageLocation: StorageLocationType.LAPANGAN_TERBUKA,
      durationDays: 1,
      ratePerUnitIdr: 1000,
      totalAmountIdr: 400000,
      paymentStatus: ChargePaymentStatus.UNPAID,
      paidAt: null,
      idempotencyKey: null,
    },
  ];

  for (const c of cargoData) {
    await prisma.cargoHandlingRecord.upsert({
      where: { recordNumber: c.recordNumber },
      update: {
        description: c.description,
        quantity: c.quantity,
        unitLabel: c.unitLabel,
        storageLocation: c.storageLocation,
        durationDays: c.durationDays,
        ratePerUnitIdr: c.ratePerUnitIdr,
        totalAmountIdr: c.totalAmountIdr,
        paymentStatus: c.paymentStatus,
        paidAt: c.paidAt,
        idempotencyKey: c.idempotencyKey,
      },
      create: {
        portId,
        ...c,
        recordedById: petugasUserId,
      },
    });
  }

  // 2. Equipment Rentals
  const equipmentData = [
    {
      rentalNumber: 'EQP-PMK-2024-001',
      equipmentType: PortEquipmentType.FORKLIFT,
      capacityLabel: 'Forklift 3-6 Ton',
      unitCount: 1,
      durationHours: 8.0,
      ratePerHourIdr: 20000,
      totalAmountIdr: 160000,
      paymentStatus: ChargePaymentStatus.PAID,
      paidAt: new Date('2024-02-12T17:00:00Z'),
      idempotencyKey: 'PAY-EQP-001',
    },
    {
      rentalNumber: 'EQP-PMK-2024-002',
      equipmentType: PortEquipmentType.CRANE_DEREK,
      capacityLabel: 'Mobile Crane Derek 7-15 Ton',
      unitCount: 1,
      durationHours: 12.0,
      ratePerHourIdr: 100000,
      totalAmountIdr: 1200000,
      paymentStatus: ChargePaymentStatus.PAID,
      paidAt: new Date('2024-02-18T18:00:00Z'),
      idempotencyKey: 'PAY-EQP-002',
    },
    {
      rentalNumber: 'EQP-PMK-2024-003',
      equipmentType: PortEquipmentType.MOTOR_LONG_BOAT,
      capacityLabel: 'Motor Long Boat 40 PK Pandu Muara',
      unitCount: 1,
      durationHours: 5.0,
      ratePerHourIdr: 35000,
      totalAmountIdr: 175000,
      paymentStatus: ChargePaymentStatus.PAID,
      paidAt: new Date('2024-03-02T12:00:00Z'),
      idempotencyKey: 'PAY-EQP-003',
    },
    {
      rentalNumber: 'EQP-PMK-2024-004',
      equipmentType: PortEquipmentType.GEROBAK_DORONG,
      capacityLabel: 'Gerobak Dorong Manual TKBM',
      unitCount: 20,
      durationHours: 6.0,
      ratePerHourIdr: 1000,
      totalAmountIdr: 120000, // 20 unit * 6 jam * 1000
      paymentStatus: ChargePaymentStatus.PAID,
      paidAt: new Date('2024-03-10T14:00:00Z'),
      idempotencyKey: 'PAY-EQP-004',
    },
    {
      rentalNumber: 'EQP-PMK-2024-005',
      equipmentType: PortEquipmentType.FORKLIFT,
      capacityLabel: 'Forklift 7-10 Ton Heavy Duty',
      unitCount: 1,
      durationHours: 4.0,
      ratePerHourIdr: 40000,
      totalAmountIdr: 160000,
      paymentStatus: ChargePaymentStatus.UNPAID,
      paidAt: null,
      idempotencyKey: null,
    },
  ];

  for (const eq of equipmentData) {
    await prisma.equipmentRentalRecord.upsert({
      where: { rentalNumber: eq.rentalNumber },
      update: {
        capacityLabel: eq.capacityLabel,
        unitCount: eq.unitCount,
        durationHours: eq.durationHours,
        ratePerHourIdr: eq.ratePerHourIdr,
        totalAmountIdr: eq.totalAmountIdr,
        paymentStatus: eq.paymentStatus,
        paidAt: eq.paidAt,
        idempotencyKey: eq.idempotencyKey,
      },
      create: {
        portId,
        ...eq,
        recordedById: petugasUserId,
      },
    });
  }

  // 3. Utility Meter Readings (Air Bersih)
  const kiosAsset = await prisma.portAsset.findFirst({
    where: { assetCode: 'AST-PMK-KIOS-01' },
  });

  const utilityData = [
    {
      readingNumber: 'UTL-PMK-2024-001',
      utilityType: UtilityType.AIR_BERSIH,
      meterStart: 12500.0,
      meterEnd: 52500.0,
      volumeConsumed: 40000.0, // 40.000 liter bunkering KM Tatamailau
      unitLabel: 'Liter',
      ratePerUnitIdr: 500,
      totalAmountIdr: 20000000,
      paymentStatus: ChargePaymentStatus.PAID,
      paidAt: new Date('2024-02-10T14:00:00Z'),
      idempotencyKey: 'PAY-UTL-001',
    },
    {
      readingNumber: 'UTL-PMK-2024-002',
      utilityType: UtilityType.AIR_BERSIH,
      meterStart: 52500.0,
      meterEnd: 67500.0,
      volumeConsumed: 15000.0, // 15.000 liter bunkering KMP Kokonao
      unitLabel: 'Liter',
      ratePerUnitIdr: 500,
      totalAmountIdr: 7500000,
      paymentStatus: ChargePaymentStatus.PAID,
      paidAt: new Date('2024-02-15T16:00:00Z'),
      idempotencyKey: 'PAY-UTL-002',
    },
    {
      readingNumber: 'UTL-PMK-2024-003',
      utilityType: UtilityType.AIR_BERSIH,
      meterStart: 67500.0,
      meterEnd: 97500.0,
      volumeConsumed: 30000.0, // 30.000 liter bunkering KM Meratus
      unitLabel: 'Liter',
      ratePerUnitIdr: 500,
      totalAmountIdr: 15000000,
      paymentStatus: ChargePaymentStatus.PAID,
      paidAt: new Date('2024-03-01T12:00:00Z'),
      idempotencyKey: 'PAY-UTL-003',
    },
    {
      readingNumber: 'UTL-PMK-2024-004',
      assetId: kiosAsset?.id,
      utilityType: UtilityType.AIR_BERSIH,
      meterStart: 97500.0,
      meterEnd: 102500.0,
      volumeConsumed: 5000.0, // Pemakaian Kios Mama Papua & Toilet Terminal
      unitLabel: 'Liter',
      ratePerUnitIdr: 500,
      totalAmountIdr: 2500000,
      paymentStatus: ChargePaymentStatus.PAID,
      paidAt: new Date('2024-03-10T10:00:00Z'),
      idempotencyKey: 'PAY-UTL-004',
    },
    {
      readingNumber: 'UTL-PMK-2024-005',
      utilityType: UtilityType.AIR_BERSIH,
      meterStart: 102500.0,
      meterEnd: 122500.0,
      volumeConsumed: 20000.0, // Bunkering KM Temas Pride
      unitLabel: 'Liter',
      ratePerUnitIdr: 500,
      totalAmountIdr: 10000000,
      paymentStatus: ChargePaymentStatus.UNPAID,
      paidAt: null,
      idempotencyKey: null,
    },
  ];

  for (const u of utilityData) {
    await prisma.utilityMeterReading.upsert({
      where: { readingNumber: u.readingNumber },
      update: {
        assetId: u.assetId,
        meterStart: u.meterStart,
        meterEnd: u.meterEnd,
        volumeConsumed: u.volumeConsumed,
        unitLabel: u.unitLabel,
        ratePerUnitIdr: u.ratePerUnitIdr,
        totalAmountIdr: u.totalAmountIdr,
        paymentStatus: u.paymentStatus,
        paidAt: u.paidAt,
        idempotencyKey: u.idempotencyKey,
      },
      create: {
        portId,
        ...u,
        recordedById: petugasUserId,
      },
    });
  }

  console.log('Cargo, Equipment & Utilities seeded successfully.');
}

