import {
  DocumentCategory,
  PrismaClient,
  ShipType,
  ShippingCategory,
  VerificationStatus,
} from '@prisma/client';

export async function seedVessels(
  prisma: PrismaClient,
  operatorMap: Map<string, number>,
  adminUserId: number,
) {
  console.log('Seeding Realistic Vessels & Maritime Certificates...');

  const mimikaOpId = operatorMap.get('ops@mimika-shipping.co.id')!;
  const pelniOpId = operatorMap.get('ops@pelni-timika.co.id')!;
  const asdpOpId = operatorMap.get('operasional@asdp-poumako.co.id')!;
  const temasOpId = operatorMap.get('timika.agency@temasline.com')!;
  const meratusOpId = operatorMap.get('mimika@meratusline.com')!;
  const perintisOpId = operatorMap.get('ops@sabuknusantara-papua.co.id')!;
  const pelraOpId = operatorMap.get('koperasi.pelra@gmail.com')!;
  const marineOpId = operatorMap.get('charter@indopapuamarine.co.id')!;
  const dragonOpId = operatorMap.get('agent.timika@easterndragon.com')!;

  const vesselsData = [
    // 1. Kapal Niaga Dalam Negeri (Mimika Local)
    {
      operatorId: mimikaOpId,
      registrationNumber: 'REG-PMK-001',
      imoNumber: null,
      name: 'KM Poumako Jaya',
      flag: 'Indonesia',
      grossTonnage: 500,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
    },
    // 2. Kapal Penumpang PELNI
    {
      operatorId: pelniOpId,
      registrationNumber: 'REG-PELNI-001',
      imoNumber: '8915641',
      name: 'KM Tatamailau',
      flag: 'Indonesia',
      grossTonnage: 6022,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
    },
    {
      operatorId: pelniOpId,
      registrationNumber: 'REG-PELNI-002',
      imoNumber: '9000455',
      name: 'KM Sirimau',
      flag: 'Indonesia',
      grossTonnage: 6022,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
    },
    {
      operatorId: pelniOpId,
      registrationNumber: 'REG-PELNI-003',
      imoNumber: '9032147',
      name: 'KM Leuser',
      flag: 'Indonesia',
      grossTonnage: 6022,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
    },
    // 3. Kapal Ferry Penyeberangan ASDP (Movable Bridge)
    {
      operatorId: asdpOpId,
      registrationNumber: 'REG-ASDP-001',
      imoNumber: '8876123',
      name: 'KMP Kokonao',
      flag: 'Indonesia',
      grossTonnage: 750,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
    },
    {
      operatorId: asdpOpId,
      registrationNumber: 'REG-ASDP-002',
      imoNumber: '8901234',
      name: 'KMP Terubuk I',
      flag: 'Indonesia',
      grossTonnage: 500,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
    },
    // 4. Kapal Perintis Tol Laut (Perda Tarif Pelra/Perintis)
    {
      operatorId: perintisOpId,
      registrationNumber: 'REG-PRN-001',
      imoNumber: '9812345',
      name: 'KM Sabuk Nusantara 75',
      flag: 'Indonesia',
      grossTonnage: 1200,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.PELRA_PERINTIS,
    },
    {
      operatorId: perintisOpId,
      registrationNumber: 'REG-PRN-002',
      imoNumber: '9812346',
      name: 'KM Sabuk Nusantara 105',
      flag: 'Indonesia',
      grossTonnage: 1200,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.PELRA_PERINTIS,
    },
    // 5. Kapal Kontainer Niaga Besar
    {
      operatorId: temasOpId,
      registrationNumber: 'REG-TMS-001',
      imoNumber: '9345678',
      name: 'KM Temas Pride',
      flag: 'Indonesia',
      grossTonnage: 5200,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
    },
    {
      operatorId: meratusOpId,
      registrationNumber: 'REG-MRT-001',
      imoNumber: '9287654',
      name: 'KM Meratus Kampar',
      flag: 'Indonesia',
      grossTonnage: 4500,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
    },
    {
      operatorId: temasOpId,
      registrationNumber: 'REG-SPL-001',
      imoNumber: '9412389',
      name: 'KM SPIL Hening',
      flag: 'Indonesia',
      grossTonnage: 4800,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
    },
    // 6. Kapal Pelayaran Rakyat (Pelra Kayu Tradisional)
    {
      operatorId: pelraOpId,
      registrationNumber: 'REG-PLR-001',
      imoNumber: null,
      name: 'KLM Bintang Paumako 08',
      flag: 'Indonesia',
      grossTonnage: 180,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.PELRA_PERINTIS,
    },
    {
      operatorId: pelraOpId,
      registrationNumber: 'REG-PLR-002',
      imoNumber: null,
      name: 'KLM Asmat Permai',
      flag: 'Indonesia',
      grossTonnage: 145,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.PELRA_PERINTIS,
    },
    {
      operatorId: pelraOpId,
      registrationNumber: 'REG-PLR-003',
      imoNumber: null,
      name: 'KLM Putri Kamoro',
      flag: 'Indonesia',
      grossTonnage: 160,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.PELRA_PERINTIS,
    },
    // 7. Tugboat & Tongkang (Kegiatan Tetap & Curah)
    {
      operatorId: marineOpId,
      registrationNumber: 'REG-TB-001',
      imoNumber: '9678123',
      name: 'TB Mimika Star 01',
      flag: 'Indonesia',
      grossTonnage: 240,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
    },
    {
      operatorId: marineOpId,
      registrationNumber: 'REG-TB-002',
      imoNumber: '9678124',
      name: 'TB Cenderawasih Bay',
      flag: 'Indonesia',
      grossTonnage: 210,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
    },
    {
      operatorId: marineOpId,
      registrationNumber: 'REG-TK-001',
      imoNumber: null,
      name: 'TK Papua Gas Nusantara',
      flag: 'Indonesia',
      grossTonnage: 1800,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
    },
    {
      operatorId: marineOpId,
      registrationNumber: 'REG-TK-002',
      imoNumber: null,
      name: 'TK Timika Perkasa',
      flag: 'Indonesia',
      grossTonnage: 2200,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
    },
    // 8. Kapal Niaga Luar Negeri (Bulk Ekspor)
    {
      operatorId: dragonOpId,
      registrationNumber: 'REG-BULK-001',
      imoNumber: '9456123',
      name: 'MV Oriental Ruby',
      flag: 'Panama',
      grossTonnage: 14200,
      shipType: ShipType.NIAGA,
      shippingCategory: ShippingCategory.LUAR_NEGERI,
    },
    // 9. Kapal Non-Niaga (Patroli Kemenhub/Pemda)
    {
      operatorId: mimikaOpId,
      registrationNumber: 'REG-KPLP-001',
      imoNumber: null,
      name: 'KN Salawaku 358',
      flag: 'Indonesia',
      grossTonnage: 320,
      shipType: ShipType.NON_NIAGA,
      shippingCategory: ShippingCategory.DALAM_NEGERI,
    },
  ];

  const vesselMap = new Map<string, any>();

  for (const v of vesselsData) {
    const vessel = await prisma.vessel.upsert({
      where: { registrationNumber: v.registrationNumber },
      update: {
        operatorId: v.operatorId,
        imoNumber: v.imoNumber,
        name: v.name,
        flag: v.flag,
        grossTonnage: v.grossTonnage,
        shipType: v.shipType,
        shippingCategory: v.shippingCategory,
        verificationStatus: VerificationStatus.VERIFIED,
      },
      create: {
        ...v,
        verificationStatus: VerificationStatus.VERIFIED,
        verifiedAt: new Date('2023-01-20T09:00:00Z'),
        verifiedById: adminUserId,
      },
    });

    // Seed Verified Ship Certificates (Surat Ukur & Pas)
    const existingDoc = await prisma.document.findFirst({
      where: { vesselId: vessel.id, category: DocumentCategory.SURAT_UKUR },
    });

    if (!existingDoc) {
      await prisma.document.create({
        data: {
          operatorId: v.operatorId,
          vesselId: vessel.id,
          category: DocumentCategory.SURAT_UKUR,
          documentNumber: `SU-KEMENHUB-${vessel.id}/2023`,
          filePath: `/uploads/vessels/surat_ukur_${vessel.id}.pdf`,
          fileName: `Surat_Ukur_${vessel.name.replace(/\s+/g, '_')}.pdf`,
          mimeType: 'application/pdf',
          uploadedById: adminUserId,
          verificationStatus: VerificationStatus.VERIFIED,
          notes: 'Surat Ukur Internasional / Kebangsaan disahkan oleh Ditjen Hubla.',
        },
      });

      await prisma.document.create({
        data: {
          operatorId: v.operatorId,
          vesselId: vessel.id,
          category: DocumentCategory.PAS_BESAR_KECIL,
          documentNumber: `PAS-${Number(vessel.grossTonnage) > 175 ? 'BESAR' : 'KECIL'}-${vessel.id}/2023`,
          filePath: `/uploads/vessels/pas_${vessel.id}.pdf`,
          fileName: `Pas_Kapal_${vessel.name.replace(/\s+/g, '_')}.pdf`,
          mimeType: 'application/pdf',
          uploadedById: adminUserId,
          verificationStatus: VerificationStatus.VERIFIED,
          notes: 'Surat Tanda Kebangsaan Kapal Pas Laut.',
        },
      });
    }

    vesselMap.set(v.registrationNumber, vessel);
  }

  console.log(`Vessels seeded: ${vesselsData.length} active vessels.`);
  return { vesselMap };
}
