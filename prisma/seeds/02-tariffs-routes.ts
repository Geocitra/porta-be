import {
  ActivityMode,
  BerthType,
  Currency,
  GeneralTariffDomain,
  PrismaClient,
  ServiceCode,
  ShipType,
  ShippingCategory,
  TariffUnitType,
} from '@prisma/client';

export async function seedTariffsAndRoutes(prisma: PrismaClient, portId: number) {
  console.log('Seeding Tariffs and Ferry Routes (Perda Mimika 4/2023)...');

  const effectiveFrom = new Date('2023-01-01T00:00:00.000Z');
  const legalBasis = 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Hal. 80-86';

  // 1. Port Tariffs (Jasa Kapal: Labuh & Tambat)
  const portTariffs = [
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
    // 2. Kegiatan di TUKS & Tersus
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
    // 3. Jasa Tambat Khusus / Kepentingan Sendiri
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
    // 4. Jasa Tambat Umum
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

  for (const t of portTariffs) {
    await prisma.portTariff.upsert({
      where: { tariffCode: t.tariffCode },
      update: {
        serviceCode: t.serviceCode,
        shippingCategory: t.shippingCategory,
        shipType: t.shipType,
        activityMode: t.activityMode,
        berthType: t.berthType,
        unitType: t.unitType,
        currency: t.currency,
        amount: t.amount,
        legalBasis,
        effectiveFrom,
        isActive: true,
      },
      create: {
        ...t,
        legalBasis,
        effectiveFrom,
      },
    });
  }

  // 2. General Tariffs (Terminal Penumpang, Barang, Alat & Air Bersih)
  const generalTariffs = [
    // Terminal Penumpang (Lampiran XI D.2)
    { tariffCode: 'TERM_KELAS_A_DEPART', domain: GeneralTariffDomain.TERMINAL_PASSENGER, itemKey: 'KELAS_A_DEPARTURE', unitLabel: 'Orang', amountIdr: 4000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI D.2' },
    { tariffCode: 'TERM_KELAS_A_GREETER', domain: GeneralTariffDomain.TERMINAL_PASSENGER, itemKey: 'KELAS_A_GREETER', unitLabel: 'Orang/Sekali Masuk', amountIdr: 3000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI D.2' },
    { tariffCode: 'TERM_KELAS_B_DEPART', domain: GeneralTariffDomain.TERMINAL_PASSENGER, itemKey: 'KELAS_B_DEPARTURE', unitLabel: 'Orang', amountIdr: 3000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI D.2' },
    { tariffCode: 'TERM_KELAS_B_GREETER', domain: GeneralTariffDomain.TERMINAL_PASSENGER, itemKey: 'KELAS_B_GREETER', unitLabel: 'Orang/Sekali Masuk', amountIdr: 3000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI D.2' },
    { tariffCode: 'TERM_KELAS_C_DEPART', domain: GeneralTariffDomain.TERMINAL_PASSENGER, itemKey: 'KELAS_C_DEPARTURE', unitLabel: 'Orang', amountIdr: 2000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI D.2' },
    { tariffCode: 'TERM_KELAS_C_GREETER', domain: GeneralTariffDomain.TERMINAL_PASSENGER, itemKey: 'KELAS_C_GREETER', unitLabel: 'Orang/Sekali Masuk', amountIdr: 2000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI D.2' },
    
    // Barang & Penumpukan (Lampiran XI B)
    { tariffCode: 'CRG_IMPOR_EKSPOR', domain: GeneralTariffDomain.CARGO, itemKey: 'BARANG_IMPOR_EKSPOR', unitLabel: 'Ton/m3', amountIdr: 1000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI B' },
    { tariffCode: 'CRG_BULOG_PUPUK', domain: GeneralTariffDomain.CARGO, itemKey: 'BARANG_BULOG_PUPUK', unitLabel: 'Ton/m3', amountIdr: 400, legalBasis: 'Perda Mimika 4/2023 Lampiran XI B' },
    { tariffCode: 'CRG_ANTAR_PULAU', domain: GeneralTariffDomain.CARGO, itemKey: 'BARANG_ANTAR_PULAU', unitLabel: 'Ton/m3', amountIdr: 600, legalBasis: 'Perda Mimika 4/2023 Lampiran XI B' },
    { tariffCode: 'CRG_HEWAN_BESAR', domain: GeneralTariffDomain.CARGO, itemKey: 'HEWAN_SAPI_KERBAU', unitLabel: 'Ekor/Hari', amountIdr: 800, legalBasis: 'Perda Mimika 4/2023 Lampiran XI B' },
    { tariffCode: 'CRG_HEWAN_KECIL', domain: GeneralTariffDomain.CARGO, itemKey: 'HEWAN_KAMBING_BABI', unitLabel: 'Ekor/Hari', amountIdr: 600, legalBasis: 'Perda Mimika 4/2023 Lampiran XI B' },
    { tariffCode: 'CRG_PENUMPUKAN_GUDANG', domain: GeneralTariffDomain.CARGO, itemKey: 'PENUMPUKAN_GUDANG_TERTUTUP', unitLabel: 'Ton/m3/Hari', amountIdr: 300, legalBasis: 'Perda Mimika 4/2023 Lampiran XI B' },
    { tariffCode: 'CRG_PENUMPUKAN_LAPANGAN', domain: GeneralTariffDomain.CARGO, itemKey: 'PENUMPUKAN_LAPANGAN_TERBUKA', unitLabel: 'Ton/m3/Hari', amountIdr: 200, legalBasis: 'Perda Mimika 4/2023 Lampiran XI B' },
    { tariffCode: 'CRG_PETI_20FT_KOSONG', domain: GeneralTariffDomain.CARGO, itemKey: 'PETI_KEMAS_20FT_KOSONG', unitLabel: 'Unit/Hari', amountIdr: 3300, legalBasis: 'Perda Mimika 4/2023 Lampiran XI B' },
    { tariffCode: 'CRG_PETI_20FT_ISI', domain: GeneralTariffDomain.CARGO, itemKey: 'PETI_KEMAS_20FT_ISI', unitLabel: 'Unit/Hari', amountIdr: 6000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI B' },
    { tariffCode: 'CRG_PETI_40FT_KOSONG', domain: GeneralTariffDomain.CARGO, itemKey: 'PETI_KEMAS_40FT_KOSONG', unitLabel: 'Unit/Hari', amountIdr: 6000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI B' },
    { tariffCode: 'CRG_PETI_40FT_ISI', domain: GeneralTariffDomain.CARGO, itemKey: 'PETI_KEMAS_40FT_ISI', unitLabel: 'Unit/Hari', amountIdr: 12000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI B' },
    { tariffCode: 'CRG_PETI_OVER_40FT_ISI', domain: GeneralTariffDomain.CARGO, itemKey: 'PETI_KEMAS_OVER_40FT_ISI', unitLabel: 'Unit/Hari', amountIdr: 15000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI B' },
    { tariffCode: 'CRG_SHIP_TO_SHIP', domain: GeneralTariffDomain.CARGO, itemKey: 'SHIP_TO_SHIP', unitLabel: 'Ton/m3', amountIdr: 30, legalBasis: 'Perda Mimika 4/2023 Lampiran XI B' },
    
    // Alat Pelabuhan (Lampiran XI C)
    { tariffCode: 'EQP_FORKLIFT_1_2T', domain: GeneralTariffDomain.EQUIPMENT, itemKey: 'FORKLIFT_1_2_TON', unitLabel: 'Unit/Jam', amountIdr: 10000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI C' },
    { tariffCode: 'EQP_FORKLIFT_2_3T', domain: GeneralTariffDomain.EQUIPMENT, itemKey: 'FORKLIFT_2_3_TON', unitLabel: 'Unit/Jam', amountIdr: 15000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI C' },
    { tariffCode: 'EQP_FORKLIFT_3_6T', domain: GeneralTariffDomain.EQUIPMENT, itemKey: 'FORKLIFT_3_6_TON', unitLabel: 'Unit/Jam', amountIdr: 20000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI C' },
    { tariffCode: 'EQP_FORKLIFT_7_10T', domain: GeneralTariffDomain.EQUIPMENT, itemKey: 'FORKLIFT_7_10_TON', unitLabel: 'Unit/Jam', amountIdr: 40000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI C' },
    { tariffCode: 'EQP_FORKLIFT_OVER_10T', domain: GeneralTariffDomain.EQUIPMENT, itemKey: 'FORKLIFT_OVER_10_TON', unitLabel: 'Unit/Jam', amountIdr: 50000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI C' },
    { tariffCode: 'EQP_CRANE_1_3T', domain: GeneralTariffDomain.EQUIPMENT, itemKey: 'CRANE_1_3_TON', unitLabel: 'Unit/Jam', amountIdr: 15000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI C' },
    { tariffCode: 'EQP_CRANE_7_15T', domain: GeneralTariffDomain.EQUIPMENT, itemKey: 'CRANE_7_15_TON', unitLabel: 'Unit/Jam', amountIdr: 100000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI C' },
    { tariffCode: 'EQP_CRANE_15_25T', domain: GeneralTariffDomain.EQUIPMENT, itemKey: 'CRANE_15_25_TON', unitLabel: 'Unit/Jam', amountIdr: 150000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI C' },
    { tariffCode: 'EQP_LONGBOAT_1_60PK', domain: GeneralTariffDomain.EQUIPMENT, itemKey: 'LONGBOAT_1_60_PK', unitLabel: 'Unit/Jam', amountIdr: 35000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI C' },
    { tariffCode: 'EQP_LONGBOAT_OVER_61PK', domain: GeneralTariffDomain.EQUIPMENT, itemKey: 'LONGBOAT_OVER_61_PK', unitLabel: 'Unit/Jam', amountIdr: 50000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI C' },
    { tariffCode: 'EQP_GEROBAK_DORONG', domain: GeneralTariffDomain.EQUIPMENT, itemKey: 'GEROBAK_DORONG', unitLabel: 'Unit/Jam', amountIdr: 1000, legalBasis: 'Perda Mimika 4/2023 Lampiran XI C' },
    
    // Utilitas Air Bersih (Lampiran XI D.1.d)
    { tariffCode: 'UTL_AIR_BERSIH', domain: GeneralTariffDomain.UTILITY, itemKey: 'AIR_BERSIH', unitLabel: 'Liter', amountIdr: 500, legalBasis: 'Perda Mimika 4/2023 Lampiran XI D.1.d' },
    { tariffCode: 'UTL_LISTRIK_KAPAL', domain: GeneralTariffDomain.UTILITY, itemKey: 'LISTRIK_KAPAL', unitLabel: 'kWh', amountIdr: 2500, legalBasis: 'Perda Mimika 4/2023 Lampiran XI D.1' },
  ];

  for (const gt of generalTariffs) {
    await prisma.generalTariff.upsert({
      where: { tariffCode: gt.tariffCode },
      update: {
        domain: gt.domain,
        itemKey: gt.itemKey,
        unitLabel: gt.unitLabel,
        amountIdr: gt.amountIdr,
        legalBasis: gt.legalBasis,
        effectiveFrom,
        isActive: true,
      },
      create: { ...gt, effectiveFrom },
    });
  }

  // 3. Ferry Routes (Lampiran XI Hal. 85)
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
      where: { portId_destinationName: { portId, destinationName: r.destinationName } },
      update: {
        distanceMiles: r.distanceMiles,
        adultFareIdr: r.adultFareIdr,
        childFareIdr: r.childFareIdr,
        infantFareIdr: r.infantFareIdr,
        cargoPerTonIdr: r.cargoPerTonIdr,
        legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Hal. 85',
        isActive: true,
      },
      create: {
        portId,
        ...r,
        legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Hal. 85',
      },
    });
  }

  console.log('Tariffs and Ferry Routes seeded successfully.');
}

