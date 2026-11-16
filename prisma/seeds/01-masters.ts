import {
  AuthorityType,
  BerthType,
  BillingEligibility,
  DocumentCategory,
  OperatorProfile,
  PrismaClient,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export async function seedMasters(prisma: PrismaClient) {
  console.log('Seeding Master Data (Port, Berths, Operators, Users, Documents)...');

  // 1. Port Poumako
  const pomako = await prisma.port.upsert({
    where: { code: 'PMK' },
    update: {
      name: 'Pelabuhan Poumako',
      location: 'Distrik Mimika Timur, Kabupaten Mimika, Papua Tengah',
      isActive: true,
    },
    create: {
      code: 'PMK',
      name: 'Pelabuhan Poumako',
      location: 'Distrik Mimika Timur, Kabupaten Mimika, Papua Tengah',
    },
  });

  // 2. Berths
  const berthsData = [
    {
      code: 'DRM-PEMDA-01',
      name: 'Dermaga Beton Nusantara Pemda',
      berthType: BerthType.DERMAGA_BESI_BETON_KAYU,
      authorityType: AuthorityType.PEMDA_DISHUB,
      billingEligibility: BillingEligibility.BILLABLE,
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI',
      managementEvidence: 'SK Bupati Mimika No. 120/2021 Pengelolaan Dermaga Pemda Poumako',
      maxLengthMeters: 120,
    },
    {
      code: 'TLD-PEMDA-01',
      name: 'Tambatan Talud Cenderawasih',
      berthType: BerthType.PINGGIRAN_TALUD,
      authorityType: AuthorityType.PEMDA_DISHUB,
      billingEligibility: BillingEligibility.BILLABLE,
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI',
      managementEvidence: 'Aset Daerah Dishub Mimika Kartu Inventaris Barang (KIB) C',
      maxLengthMeters: 60,
    },
    {
      code: 'DRM-UPP-01',
      name: 'Dermaga UPP Kemenhub (Non-Retribusi Pemda)',
      berthType: BerthType.DERMAGA_BESI_BETON_KAYU,
      authorityType: AuthorityType.UPP_KEMENHUB,
      billingEligibility: BillingEligibility.NOT_BILLABLE,
      legalBasis: 'Pasal 79 UU HKPD & PM Perhubungan No. 36 Tahun 2012',
      managementEvidence: 'Kementerian Perhubungan Kantor UPP Kelas II Pomako',
      maxLengthMeters: 150,
    },
    {
      code: 'DOL-PEMDA-01',
      name: 'Dolphin Bressing MB Penyeberangan Ferry',
      berthType: BerthType.BRESSING_DOLPHIN_PELAMPUNG,
      authorityType: AuthorityType.PEMDA_DISHUB,
      billingEligibility: BillingEligibility.BILLABLE,
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI',
      managementEvidence: 'Fasilitas Movable Bridge Dishub Mimika 2020',
      maxLengthMeters: 80,
    },
    {
      code: 'DRM-PELRA-01',
      name: 'Dermaga Pelabuhan Rakyat Muara Pomako',
      berthType: BerthType.DERMAGA_BESI_BETON_KAYU,
      authorityType: AuthorityType.PEMDA_DISHUB,
      billingEligibility: BillingEligibility.BILLABLE,
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI',
      managementEvidence: 'SK Pengelolaan Pelabuhan Tradisional Mimika Timur',
      maxLengthMeters: 50,
    },
    {
      code: 'TUKS-MIMIKA-01',
      name: 'Dermaga TUKS Logistik Pantai Selatan',
      berthType: BerthType.DERMAGA_BESI_BETON_KAYU,
      authorityType: AuthorityType.TUKS_TERSUS,
      billingEligibility: BillingEligibility.BILLABLE,
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Bagian A.2',
      managementEvidence: 'Izin Operasional TUKS No. 503/TUKS-MMK/2022',
      maxLengthMeters: 100,
    },
  ];

  for (const b of berthsData) {
    await prisma.berth.upsert({
      where: { portId_code: { portId: pomako.id, code: b.code } },
      update: {
        name: b.name,
        berthType: b.berthType,
        authorityType: b.authorityType,
        billingEligibility: b.billingEligibility,
        legalBasis: b.legalBasis,
        managementEvidence: b.managementEvidence,
        maxLengthMeters: b.maxLengthMeters,
      },
      create: {
        portId: pomako.id,
        ...b,
      },
    });
  }

  // 3. Operators
  const operatorsData = [
    {
      name: 'PT Pelayaran Mimika Sejahtera',
      npwp: '01.234.567.8-954.000',
      phone: '081234567890',
      email: 'ops@mimika-shipping.co.id',
      address: 'Jl. Poros Pomako Km 12, Timika Timur',
      operatorProfile: OperatorProfile.REGULAR_SCHEDULED,
    },
    {
      name: 'PT Pelayaran Nasional Indonesia (Persero) - Cabang Timika',
      npwp: '01.001.234.5-954.000',
      phone: '0901-321456',
      email: 'ops@pelni-timika.co.id',
      address: 'Jl. Cenderawasih SP2 No. 88, Timika',
      operatorProfile: OperatorProfile.REGULAR_SCHEDULED,
    },
    {
      name: 'PT ASDP Indonesia Ferry (Persero) Cabang Merauke/Poumako',
      npwp: '01.002.876.5-954.000',
      phone: '0901-326789',
      email: 'operasional@asdp-poumako.co.id',
      address: 'Kompleks Pelabuhan Penyeberangan Poumako, Timika',
      operatorProfile: OperatorProfile.REGULAR_SCHEDULED,
    },
    {
      name: 'PT Tempuran Emas Tbk (Temas Line) Cabang Timika',
      npwp: '01.003.543.2-954.000',
      phone: '0901-312987',
      email: 'timika.agency@temasline.com',
      address: 'Jl. Yos Sudarso No. 45, Nawaripi, Timika',
      operatorProfile: OperatorProfile.REGULAR_SCHEDULED,
    },
    {
      name: 'PT Meratus Line Cabang Mimika',
      npwp: '01.004.998.1-954.000',
      phone: '0901-322114',
      email: 'mimika@meratusline.com',
      address: 'Jl. Hasanuddin No. 12B, Timika',
      operatorProfile: OperatorProfile.REGULAR_SCHEDULED,
    },
    {
      name: 'PT Pelayaran Perintis Papua Mandiri',
      npwp: '02.123.456.7-954.000',
      phone: '08114890012',
      email: 'ops@sabuknusantara-papua.co.id',
      address: 'Kawasan Pelabuhan Poumako Blok B No. 3',
      operatorProfile: OperatorProfile.REGULAR_SCHEDULED,
    },
    {
      name: 'Koperasi Angkutan Laut Kamoro Asmat (Pelra)',
      npwp: '03.987.654.3-954.000',
      phone: '085244556677',
      email: 'koperasi.pelra@gmail.com',
      address: 'Dermaga Tradisional Poumako, Mimika Timur',
      operatorProfile: OperatorProfile.INCIDENTAL,
    },
    {
      name: 'PT Indo Papua Marine Services',
      npwp: '01.555.666.7-954.000',
      phone: '081299887766',
      email: 'charter@indopapuamarine.co.id',
      address: 'Jl. Timika Indah No. 5A, Mimika Baru',
      operatorProfile: OperatorProfile.INCIDENTAL,
    },
    {
      name: 'Eastern Dragon Shipping Ltd (Agency PT Samudera Mimika)',
      npwp: '09.888.777.6-954.000',
      phone: '021-50882200',
      email: 'agent.timika@easterndragon.com',
      address: 'Gedung Wisma Samudera Lt. 4 Jakarta / Perwakilan Pomako',
      operatorProfile: OperatorProfile.INCIDENTAL,
    },
  ];

  const operatorMap = new Map<string, number>();

  for (const op of operatorsData) {
    let rec = await prisma.shipOperator.findFirst({
      where: { email: op.email },
    });
    if (!rec) {
      rec = await prisma.shipOperator.create({
        data: {
          ...op,
          verificationStatus: VerificationStatus.VERIFIED,
          verifiedAt: new Date('2023-01-15T08:00:00Z'),
        },
      });
    } else {
      rec = await prisma.shipOperator.update({
        where: { id: rec.id },
        data: {
          name: op.name,
          npwp: op.npwp,
          phone: op.phone,
          address: op.address,
          operatorProfile: op.operatorProfile,
          verificationStatus: VerificationStatus.VERIFIED,
        },
      });
    }
    operatorMap.set(op.email, rec.id);
  }

  // 4. Users (RBAC)
  const passwordHash = await bcrypt.hash('Porta123!', 10);
  const usersData = [
    {
      email: 'superadmin@porta.mimikakab.go.id',
      fullName: 'Superadmin PORTA Mimika',
      role: UserRole.SUPERADMIN,
      portId: null,
      operatorId: null,
    },
    {
      email: 'admin.pomako@porta.mimikakab.go.id',
      fullName: 'Administrator UPTD Poumako',
      role: UserRole.ADMIN_PELABUHAN,
      portId: pomako.id,
      operatorId: null,
    },
    {
      email: 'petugas.pomako@porta.mimikakab.go.id',
      fullName: 'Yohanes Maturbongs (Petugas Shift Pagi)',
      role: UserRole.PETUGAS_DERMAGA,
      portId: pomako.id,
      operatorId: null,
    },
    {
      email: 'petugas.malam@porta.mimikakab.go.id',
      fullName: 'Markus Karafir (Petugas Shift Malam)',
      role: UserRole.PETUGAS_DERMAGA,
      portId: pomako.id,
      operatorId: null,
    },
    {
      email: 'bendahara.pomako@porta.mimikakab.go.id',
      fullName: 'Siti Rahmawati, S.E. (Bendahara Penerimaan UPTD)',
      role: UserRole.BENDAHARA,
      portId: pomako.id,
      operatorId: null,
    },
    {
      email: 'dishub@porta.mimikakab.go.id',
      fullName: 'Jania Basir, S.STP (Kepala Dinas Perhubungan Mimika)',
      role: UserRole.DISHUB_EKSEKUTIF,
      portId: null,
      operatorId: null,
    },
    {
      email: 'operator@mimika-shipping.co.id',
      fullName: 'Hermanus Weya (Operasional PT Pelayaran Mimika)',
      role: UserRole.OPERATOR_KAPAL,
      portId: null,
      operatorId: operatorMap.get('ops@mimika-shipping.co.id') ?? null,
    },
    {
      email: 'agen.pelni@pelni-timika.co.id',
      fullName: 'Bambang Sugiarto (Kepala Operasi PELNI Timika)',
      role: UserRole.OPERATOR_KAPAL,
      portId: null,
      operatorId: operatorMap.get('ops@pelni-timika.co.id') ?? null,
    },
    {
      email: 'agen.asdp@asdp-poumako.co.id',
      fullName: 'Kornelis Tanati (Supervisor ASDP Pelabuhan Poumako)',
      role: UserRole.OPERATOR_KAPAL,
      portId: null,
      operatorId: operatorMap.get('operasional@asdp-poumako.co.id') ?? null,
    },
    {
      email: 'agen.temas@temasline.com',
      fullName: 'Dedy Prasetyo (Port Captain Temas Line Timika)',
      role: UserRole.OPERATOR_KAPAL,
      portId: null,
      operatorId: operatorMap.get('timika.agency@temasline.com') ?? null,
    },
    {
      email: 'agen.meratus@meratusline.com',
      fullName: 'Rico Simanjuntak (Branch Ops Meratus Mimika)',
      role: UserRole.OPERATOR_KAPAL,
      portId: null,
      operatorId: operatorMap.get('mimika@meratusline.com') ?? null,
    },
    {
      email: 'agen.pelra@pelra-mimika.org',
      fullName: 'Simon Beanal (Ketua Koperasi Pelra Kamoro-Asmat)',
      role: UserRole.OPERATOR_KAPAL,
      portId: null,
      operatorId: operatorMap.get('koperasi.pelra@gmail.com') ?? null,
    },
  ];

  const userMap = new Map<string, number>();

  for (const u of usersData) {
    const userRec = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        fullName: u.fullName,
        role: u.role,
        portId: u.portId,
        operatorId: u.operatorId,
      },
      create: { ...u, passwordHash },
    });
    userMap.set(u.email, userRec.id);
  }

  // 5. Seed Verified Onboarding Documents for Operators
  const adminId = userMap.get('admin.pomako@porta.mimikakab.go.id')!;

  for (const [email, opId] of operatorMap.entries()) {
    const existingDoc = await prisma.document.findFirst({
      where: { operatorId: opId, category: DocumentCategory.SIUPAL_NIB },
    });

    if (!existingDoc) {
      await prisma.document.create({
        data: {
          operatorId: opId,
          category: DocumentCategory.SIUPAL_NIB,
          documentNumber: `SIUPAL-MMK-${opId}-2023`,
          filePath: `/uploads/documents/siupal_${opId}.pdf`,
          fileName: `SIUPAL_NIB_${email.split('@')[0]}.pdf`,
          mimeType: 'application/pdf',
          uploadedById: adminId,
          verificationStatus: VerificationStatus.VERIFIED,
          notes: 'Dokumen legalitas perizinan berusaha bidang pelayaran terverifikasi aktif OSS RBA.',
        },
      });

      await prisma.document.create({
        data: {
          operatorId: opId,
          category: DocumentCategory.NPWP,
          documentNumber: `NPWP-MMK-${opId}`,
          filePath: `/uploads/documents/npwp_${opId}.pdf`,
          fileName: `NPWP_${email.split('@')[0]}.pdf`,
          mimeType: 'application/pdf',
          uploadedById: adminId,
          verificationStatus: VerificationStatus.VERIFIED,
          notes: 'NPWP valid terdaftar di KPP Pratama Timika.',
        },
      });
    }
  }

  console.log('Master data seeded successfully.');
  return { pomako, operatorMap, userMap };
}

