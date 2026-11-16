import {
  ActivityMode,
  AuthorityType,
  BerthType,
  BillingEligibility,
  Currency,
  OperatorProfile,
  PrismaClient,
  ServiceCode,
  ShipType,
  ShippingCategory,
  TariffUnitType,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const effectiveFrom = new Date('2023-01-01T00:00:00.000Z');
  const legalBasis = 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Hal. 80-81';

  // 1. Seed Port Poumako
  const pomako = await prisma.port.upsert({
    where: { code: 'PMK' },
    update: {},
    create: {
      code: 'PMK',
      name: 'Pelabuhan Poumako',
      location: 'Kabupaten Mimika, Papua Tengah',
    },
  });

  // 2. Seed Berths (Pemda vs UPP Kemenhub for Pasal 79 enforcement)
  await prisma.berth.upsert({
    where: { portId_code: { portId: pomako.id, code: 'DRM-PEMDA-01' } },
    update: {},
    create: {
      portId: pomako.id,
      code: 'DRM-PEMDA-01',
      name: 'Dermaga Beton Pemda Poumako',
      berthType: BerthType.DERMAGA_BESI_BETON_KAYU,
      authorityType: AuthorityType.PEMDA_DISHUB,
      billingEligibility: BillingEligibility.BILLABLE,
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI',
      maxLengthMeters: 120,
    },
  });

  await prisma.berth.upsert({
    where: { portId_code: { portId: pomako.id, code: 'TLD-PEMDA-01' } },
    update: {},
    create: {
      portId: pomako.id,
      code: 'TLD-PEMDA-01',
      name: 'Tambatan Talud Pemda',
      berthType: BerthType.PINGGIRAN_TALUD,
      authorityType: AuthorityType.PEMDA_DISHUB,
      billingEligibility: BillingEligibility.BILLABLE,
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI',
      maxLengthMeters: 60,
    },
  });

  await prisma.berth.upsert({
    where: { portId_code: { portId: pomako.id, code: 'DRM-UPP-01' } },
    update: {},
    create: {
      portId: pomako.id,
      code: 'DRM-UPP-01',
      name: 'Dermaga UPP Kemenhub (Non-Retribusi Pemda)',
      berthType: BerthType.DERMAGA_BESI_BETON_KAYU,
      authorityType: AuthorityType.UPP_KEMENHUB,
      billingEligibility: BillingEligibility.NOT_BILLABLE,
      maxLengthMeters: 150,
    },
  });

  // 3. Seed Sample Operator & Vessel
  const operator = await prisma.shipOperator.create({
    data: {
      name: 'PT Pelayaran Mimika Sejahtera',
      npwp: '01.234.567.8-954.000',
      phone: '081234567890',
      email: 'ops@mimika-shipping.co.id',
      operatorProfile: OperatorProfile.REGULAR_SCHEDULED,
      verificationStatus: VerificationStatus.VERIFIED,
      verifiedAt: new Date(),
    },
  });

  await prisma.vessel.upsert({
    where: { registrationNumber: 'REG-PMK-001' },
    update: {},
    create: {
      operatorId: operator.id,
      registrationNumber: 'REG-PMK-001',
      name: 'KM Poumako Jaya',
      flag: 'Indonesia',
      grossTonnage: 500,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
      verificationStatus: VerificationStatus.VERIFIED,
      verifiedAt: new Date(),
    },
  });

  // 4. Seed Users for all RBAC roles
  const passwordHash = await bcrypt.hash('Porta123!', 10);
  const usersData = [
    {
      email: 'superadmin@porta.mimikakab.go.id',
      fullName: 'Superadmin PORTA',
      role: UserRole.SUPERADMIN,
      portId: null,
      operatorId: null,
    },
    {
      email: 'admin.pomako@porta.mimikakab.go.id',
      fullName: 'Admin Pelabuhan Poumako',
      role: UserRole.ADMIN_PELABUHAN,
      portId: pomako.id,
      operatorId: null,
    },
    {
      email: 'petugas.pomako@porta.mimikakab.go.id',
      fullName: 'Petugas Dermaga Poumako',
      role: UserRole.PETUGAS_DERMAGA,
      portId: pomako.id,
      operatorId: null,
    },
    {
      email: 'bendahara.pomako@porta.mimikakab.go.id',
      fullName: 'Bendahara Penerimaan Poumako',
      role: UserRole.BENDAHARA,
      portId: pomako.id,
      operatorId: null,
    },
    {
      email: 'dishub@porta.mimikakab.go.id',
      fullName: 'Kepala Dinas Perhubungan Mimika',
      role: UserRole.DISHUB_EKSEKUTIF,
      portId: null,
      operatorId: null,
    },
    {
      email: 'operator@mimika-shipping.co.id',
      fullName: 'Agen PT Pelayaran Mimika Sejahtera',
      role: UserRole.OPERATOR_KAPAL,
      portId: null,
      operatorId: operator.id,
    },
  ];

  for (const u of usersData) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash },
    });
  }

  // 5. Seed Perda Mimika No. 4 Tahun 2023 Lampiran XI (Bagian A: Jasa Pelayanan Kapal)
  const tariffs = [
    // 1.a Jasa Labuh - Kapal Niaga
    {
      tariffCode: 'LABUH_NIAGA_LN',
      serviceCode: ServiceCode.JASA_LABUH,
      shippingCategory: ShippingCategory.LUAR_NEGERI,
      shipType: ShipType.NIAGA,
      activityMode: ActivityMode.NORMAL,
      unitType: TariffUnitType.GT_PER_15_DAYS,
      currency: Currency.IDR,
      amount: 594,
    },
    {
      tariffCode: 'LABUH_NIAGA_DN',
      serviceCode: ServiceCode.JASA_LABUH,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
      shipType: ShipType.NIAGA,
      activityMode: ActivityMode.NORMAL,
      unitType: TariffUnitType.GT_PER_15_DAYS,
      currency: Currency.IDR,
      amount: 50,
    },
    {
      tariffCode: 'LABUH_NIAGA_PELRA',
      serviceCode: ServiceCode.JASA_LABUH,
      shippingCategory: ShippingCategory.PELRA_PERINTIS,
      shipType: ShipType.NIAGA,
      activityMode: ActivityMode.NORMAL,
      unitType: TariffUnitType.GT_PER_15_DAYS,
      currency: Currency.IDR,
      amount: 25,
    },
    {
      tariffCode: 'LABUH_TETAP_DN',
      serviceCode: ServiceCode.JASA_LABUH,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
      shipType: ShipType.NIAGA,
      activityMode: ActivityMode.FIXED_ACTIVITY,
      unitType: TariffUnitType.GT_PER_MONTH,
      currency: Currency.IDR,
      amount: 400,
    },
    {
      tariffCode: 'LABUH_TETAP_PELRA',
      serviceCode: ServiceCode.JASA_LABUH,
      shippingCategory: ShippingCategory.PELRA_PERINTIS,
      shipType: ShipType.NIAGA,
      activityMode: ActivityMode.FIXED_ACTIVITY,
      unitType: TariffUnitType.GT_PER_MONTH,
      currency: Currency.IDR,
      amount: 50,
    },
    // 1.b Jasa Labuh - Kapal Non Niaga
    {
      tariffCode: 'LABUH_NON_NIAGA_LN',
      serviceCode: ServiceCode.JASA_LABUH,
      shippingCategory: ShippingCategory.LUAR_NEGERI,
      shipType: ShipType.NON_NIAGA,
      activityMode: ActivityMode.NORMAL,
      unitType: TariffUnitType.GT_PER_15_DAYS,
      currency: Currency.IDR,
      amount: 304,
    },
    {
      tariffCode: 'LABUH_NON_NIAGA_DN',
      serviceCode: ServiceCode.JASA_LABUH,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
      shipType: ShipType.NON_NIAGA,
      activityMode: ActivityMode.NORMAL,
      unitType: TariffUnitType.GT_PER_15_DAYS,
      currency: Currency.IDR,
      amount: 25,
    },
    {
      tariffCode: 'LABUH_NON_NIAGA_PELRA',
      serviceCode: ServiceCode.JASA_LABUH,
      shippingCategory: ShippingCategory.PELRA_PERINTIS,
      shipType: ShipType.NON_NIAGA,
      activityMode: ActivityMode.NORMAL,
      unitType: TariffUnitType.GT_PER_15_DAYS,
      currency: Currency.IDR,
      amount: 15,
    },
    // 2. Kegiatan di TUKS & Terminal Khusus
    {
      tariffCode: 'TUKS_LN',
      serviceCode: ServiceCode.KEGIATAN_TUKS_TERSUS,
      shippingCategory: ShippingCategory.LUAR_NEGERI,
      unitType: TariffUnitType.GT_PER_15_DAYS,
      currency: Currency.IDR,
      amount: 594,
    },
    {
      tariffCode: 'TUKS_DN',
      serviceCode: ServiceCode.KEGIATAN_TUKS_TERSUS,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
      unitType: TariffUnitType.GT_PER_15_DAYS,
      currency: Currency.IDR,
      amount: 50,
    },
    // 3. Jasa Tambat (Khusus & Kepentingan Sendiri)
    {
      tariffCode: 'TAMBAT_KHUSUS_DERMAGA_LN',
      serviceCode: ServiceCode.JASA_TAMBAT_KHUSUS,
      shippingCategory: ShippingCategory.LUAR_NEGERI,
      berthType: BerthType.DERMAGA_BESI_BETON_KAYU,
      unitType: TariffUnitType.GT_PER_ETMAL,
      currency: Currency.IDR,
      amount: 594,
    },
    {
      tariffCode: 'TAMBAT_KHUSUS_DERMAGA_DN',
      serviceCode: ServiceCode.JASA_TAMBAT_KHUSUS,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
      berthType: BerthType.DERMAGA_BESI_BETON_KAYU,
      unitType: TariffUnitType.GT_PER_ETMAL,
      currency: Currency.IDR,
      amount: 38,
    },
    {
      tariffCode: 'TAMBAT_KHUSUS_DERMAGA_PELRA',
      serviceCode: ServiceCode.JASA_TAMBAT_KHUSUS,
      shippingCategory: ShippingCategory.PELRA_PERINTIS,
      berthType: BerthType.DERMAGA_BESI_BETON_KAYU,
      unitType: TariffUnitType.GT_PER_ETMAL,
      currency: Currency.IDR,
      amount: 10,
    },
    {
      tariffCode: 'TAMBAT_KHUSUS_DOLPHIN_LN',
      serviceCode: ServiceCode.JASA_TAMBAT_KHUSUS,
      shippingCategory: ShippingCategory.LUAR_NEGERI,
      berthType: BerthType.BRESSING_DOLPHIN_PELAMPUNG,
      unitType: TariffUnitType.GT_PER_ETMAL,
      currency: Currency.IDR,
      amount: 330,
    },
    {
      tariffCode: 'TAMBAT_KHUSUS_DOLPHIN_DN',
      serviceCode: ServiceCode.JASA_TAMBAT_KHUSUS,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
      berthType: BerthType.BRESSING_DOLPHIN_PELAMPUNG,
      unitType: TariffUnitType.GT_PER_ETMAL,
      currency: Currency.IDR,
      amount: 6,
    },
    {
      tariffCode: 'TAMBAT_KHUSUS_DOLPHIN_PELRA',
      serviceCode: ServiceCode.JASA_TAMBAT_KHUSUS,
      shippingCategory: ShippingCategory.PELRA_PERINTIS,
      berthType: BerthType.BRESSING_DOLPHIN_PELAMPUNG,
      unitType: TariffUnitType.GT_PER_ETMAL,
      currency: Currency.IDR,
      amount: 0,
    },
    // 4. Jasa Tambat (Umum)
    {
      tariffCode: 'TAMBAT_UMUM_DERMAGA_LN',
      serviceCode: ServiceCode.JASA_TAMBAT_UMUM,
      shippingCategory: ShippingCategory.LUAR_NEGERI,
      berthType: BerthType.DERMAGA_BESI_BETON_KAYU,
      unitType: TariffUnitType.GT_PER_ETMAL,
      currency: Currency.IDR,
      amount: 594,
    },
    {
      tariffCode: 'TAMBAT_UMUM_DERMAGA_DN',
      serviceCode: ServiceCode.JASA_TAMBAT_UMUM,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
      berthType: BerthType.DERMAGA_BESI_BETON_KAYU,
      unitType: TariffUnitType.GT_PER_ETMAL,
      currency: Currency.IDR,
      amount: 38,
    },
    {
      tariffCode: 'TAMBAT_UMUM_DERMAGA_PELRA',
      serviceCode: ServiceCode.JASA_TAMBAT_UMUM,
      shippingCategory: ShippingCategory.PELRA_PERINTIS,
      berthType: BerthType.DERMAGA_BESI_BETON_KAYU,
      unitType: TariffUnitType.GT_PER_ETMAL,
      currency: Currency.IDR,
      amount: 19,
    },
    {
      tariffCode: 'TAMBAT_UMUM_DOLPHIN_LN',
      serviceCode: ServiceCode.JASA_TAMBAT_UMUM,
      shippingCategory: ShippingCategory.LUAR_NEGERI,
      berthType: BerthType.BRESSING_DOLPHIN_PELAMPUNG,
      unitType: TariffUnitType.GT_PER_ETMAL,
      currency: Currency.IDR,
      amount: 304,
    },
    {
      tariffCode: 'TAMBAT_UMUM_DOLPHIN_DN',
      serviceCode: ServiceCode.JASA_TAMBAT_UMUM,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
      berthType: BerthType.BRESSING_DOLPHIN_PELAMPUNG,
      unitType: TariffUnitType.GT_PER_ETMAL,
      currency: Currency.IDR,
      amount: 25,
    },
    {
      tariffCode: 'TAMBAT_UMUM_DOLPHIN_PELRA',
      serviceCode: ServiceCode.JASA_TAMBAT_UMUM,
      shippingCategory: ShippingCategory.PELRA_PERINTIS,
      berthType: BerthType.BRESSING_DOLPHIN_PELAMPUNG,
      unitType: TariffUnitType.GT_PER_ETMAL,
      currency: Currency.IDR,
      amount: 15,
    },
    {
      tariffCode: 'TAMBAT_UMUM_TALUD_LN',
      serviceCode: ServiceCode.JASA_TAMBAT_UMUM,
      shippingCategory: ShippingCategory.LUAR_NEGERI,
      berthType: BerthType.PINGGIRAN_TALUD,
      unitType: TariffUnitType.GT_PER_ETMAL,
      currency: Currency.USD,
      amount: 0.063,
    },
    {
      tariffCode: 'TAMBAT_UMUM_TALUD_DN',
      serviceCode: ServiceCode.JASA_TAMBAT_UMUM,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
      berthType: BerthType.PINGGIRAN_TALUD,
      unitType: TariffUnitType.GT_PER_ETMAL,
      currency: Currency.IDR,
      amount: 13,
    },
    {
      tariffCode: 'TAMBAT_UMUM_TALUD_PELRA',
      serviceCode: ServiceCode.JASA_TAMBAT_UMUM,
      shippingCategory: ShippingCategory.PELRA_PERINTIS,
      berthType: BerthType.PINGGIRAN_TALUD,
      unitType: TariffUnitType.GT_PER_ETMAL,
      currency: Currency.IDR,
      amount: 0,
    },
  ];

  for (const t of tariffs) {
    await prisma.portTariff.upsert({
      where: { tariffCode: t.tariffCode },
      update: {},
      create: {
        ...t,
        legalBasis,
        effectiveFrom,
      },
    });
  }

  // 6. Seed Phase 2: Gate Ticket Book (Pas Masuk / Movable Bridge) & Ferry Routes (Lampiran XI Hal. 85)
  await prisma.gateTicketBook.upsert({
    where: { bookCode: 'KRC-PMK-ORANG-01' },
    update: {},
    create: {
      portId: pomako.id,
      bookCode: 'KRC-PMK-ORANG-01',
      ticketCategory: 'TANDA_MASUK_HARIAN_ORANG',
      serialStart: 1,
      serialEnd: 100,
      nominalPerTicket: 2000,
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Hal. 83',
    },
  });

  const ferryRoutes = [
    { destinationName: 'Muara Pantai', distanceMiles: 12, adultFareIdr: 5100, childFareIdr: 3800, infantFareIdr: 510, cargoPerTonIdr: 4600 },
    { destinationName: 'Otakwa', distanceMiles: 57, adultFareIdr: 9600, childFareIdr: 7200, infantFareIdr: 960, cargoPerTonIdr: 8600 },
    { destinationName: 'Atura', distanceMiles: 30, adultFareIdr: 6200, childFareIdr: 4700, infantFareIdr: 620, cargoPerTonIdr: 5600 },
    { destinationName: 'Jita', distanceMiles: 79, adultFareIdr: 12200, childFareIdr: 9200, infantFareIdr: 1220, cargoPerTonIdr: 11000 },
    { destinationName: 'Agimuga', distanceMiles: 83, adultFareIdr: 12700, childFareIdr: 9500, infantFareIdr: 1270, cargoPerTonIdr: 11400 },
    { destinationName: 'Kapiraya', distanceMiles: 78, adultFareIdr: 12200, childFareIdr: 9200, infantFareIdr: 1220, cargoPerTonIdr: 11000 },
    { destinationName: 'Potowai Buru', distanceMiles: 132, adultFareIdr: 18200, childFareIdr: 13700, infantFareIdr: 1820, cargoPerTonIdr: 16400 },
    { destinationName: 'Arar', distanceMiles: 70, adultFareIdr: 11200, childFareIdr: 8400, infantFareIdr: 1120, cargoPerTonIdr: 10100 },
    { destinationName: 'Kokonau', distanceMiles: 32, adultFareIdr: 7000, childFareIdr: 5300, infantFareIdr: 700, cargoPerTonIdr: 6300 },
  ];

  for (const r of ferryRoutes) {
    await prisma.ferryRoute.upsert({
      where: { portId_destinationName: { portId: pomako.id, destinationName: r.destinationName } },
      update: {},
      create: {
        portId: pomako.id,
        ...r,
        legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Hal. 85',
      },
    });
  }

  console.log('PORTA seed completed: Port Poumako, berths, RBAC users, Perda 4/2023 tariffs & ferry routes.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

