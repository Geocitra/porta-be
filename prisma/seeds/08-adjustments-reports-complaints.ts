import {
  AdjustmentApprovalStatus,
  BillingAdjustmentType,
  ComplaintStatus,
  DailyReportStatus,
  PrismaClient,
} from '@prisma/client';

export async function seedAdjustmentsReportsComplaints(
  prisma: PrismaClient,
  portId: number,
  adminUserId: number,
  petugasUserId: number,
  kadishubUserId: number,
  bendaharaUserId: number,
) {
  console.log('Seeding Billing Adjustments (Perbup 25/2024), Daily Reports, Complaints, Notifications & Audit Logs...');

  // 1. Billing Adjustments (Perbup 25/2024)
  const invoices = await prisma.invoice.findMany({
    where: { portId },
    take: 3,
    orderBy: { id: 'asc' },
  });

  if (invoices.length > 0) {
    const inv1 = invoices[0];
    const inv2 = invoices[1] ?? invoices[0];
    const inv3 = invoices[2] ?? invoices[0];

    // Request 1: Angsuran (Installment Plan) - APPROVED
    await prisma.billingAdjustment.upsert({
      where: { requestNumber: 'ADJ-REQ-2024-001' },
      update: {
        adjustmentType: BillingAdjustmentType.INSTALLMENT_PLAN,
        requestedAmountIdr: inv1.totalAmountIdr,
        installmentCount: 3,
        status: AdjustmentApprovalStatus.APPROVED,
        approvedById: kadishubUserId,
        approvedAt: new Date('2024-02-05T10:00:00Z'),
      },
      create: {
        requestNumber: 'ADJ-REQ-2024-001',
        portId,
        invoiceId: inv1.id,
        adjustmentType: BillingAdjustmentType.INSTALLMENT_PLAN,
        requestedAmountIdr: inv1.totalAmountIdr,
        installmentCount: 3,
        reason: 'Permohonan pembayaran retribusi diangsur 3 kali sesuai Pasal 18 Perbup Mimika No. 25 Tahun 2024.',
        status: AdjustmentApprovalStatus.APPROVED,
        requestedById: adminUserId,
        approvedById: kadishubUserId,
        approvedAt: new Date('2024-02-05T10:00:00Z'),
      },
    });

    // Request 2: Penundaan (Payment Deferral) - APPROVED
    await prisma.billingAdjustment.upsert({
      where: { requestNumber: 'ADJ-REQ-2024-002' },
      update: {
        adjustmentType: BillingAdjustmentType.PAYMENT_DEFERRAL,
        requestedAmountIdr: inv2.totalAmountIdr,
        deferredUntil: new Date('2024-03-15'),
        status: AdjustmentApprovalStatus.APPROVED,
        approvedById: kadishubUserId,
        approvedAt: new Date('2024-02-20T11:00:00Z'),
      },
      create: {
        requestNumber: 'ADJ-REQ-2024-002',
        portId,
        invoiceId: inv2.id,
        adjustmentType: BillingAdjustmentType.PAYMENT_DEFERRAL,
        requestedAmountIdr: inv2.totalAmountIdr,
        deferredUntil: new Date('2024-03-15'),
        reason: 'Permohonan penundaan pembayaran jatuh tempo karena kendala rekonsiliasi transfer antarbank.',
        status: AdjustmentApprovalStatus.APPROVED,
        requestedById: adminUserId,
        approvedById: kadishubUserId,
        approvedAt: new Date('2024-02-20T11:00:00Z'),
      },
    });

    // Request 3: Pengembalian Kelebihan (Overpayment Refund) - REQUESTED
    await prisma.billingAdjustment.upsert({
      where: { requestNumber: 'ADJ-REQ-2024-003' },
      update: {
        adjustmentType: BillingAdjustmentType.OVERPAYMENT_REFUND,
        requestedAmountIdr: 500000,
        status: AdjustmentApprovalStatus.REQUESTED,
      },
      create: {
        requestNumber: 'ADJ-REQ-2024-003',
        portId,
        invoiceId: inv3.id,
        adjustmentType: BillingAdjustmentType.OVERPAYMENT_REFUND,
        requestedAmountIdr: 500000,
        reason: 'Pengajuan pengembalian kelebihan bayar retribusi tambat akibat pengurangan jam tambat kapal.',
        status: AdjustmentApprovalStatus.REQUESTED,
        requestedById: adminUserId,
      },
    });
  }

  // 2. Daily Port Shift Reports (MARS alignment)
  const reportDates = [
    { date: new Date('2024-03-10'), vesselsStaying: 3, notes: 'Cuaca cerah berawan, pasang air laut 3.1 meter. Operasional bongkar muat kargo lancar.' },
    { date: new Date('2024-03-11'), vesselsStaying: 4, notes: 'Hujan lokal di muara Poumako pada sore hari. Satu kapal perintis labuh di luar alur.' },
    { date: new Date('2024-03-12'), vesselsStaying: 2, notes: 'Aktivitas penumpang ferry ASDP ramai lancar. Pengamanan terpadu bersama Polsek Kawasan Pelabuhan.' },
  ];

  for (const rd of reportDates) {
    const existingReport = await prisma.dailyPortReport.findFirst({
      where: { portId, reportDate: rd.date },
    });

    if (!existingReport) {
      const rep = await prisma.dailyPortReport.create({
        data: {
          portId,
          reportDate: rd.date,
          officerId: petugasUserId,
          totalVesselsStaying: rd.vesselsStaying,
          generalNotes: rd.notes,
          status: DailyReportStatus.ACKNOWLEDGED,
        },
      });

      // Report items
      await prisma.dailyPortReportItem.create({
        data: {
          reportId: rep.id,
          portId,
          vesselNameSnapshot: 'KM Tatamailau',
          registrationNumberSnapshot: 'REG-PELNI-001',
          evidencePhoto: '/uploads/reports/shift_tatamailau.jpg',
          isAdhoc: false,
          notes: 'Kapal sandar tepat waktu pada dermaga beton.',
        },
      });
    }
  }

  // 3. Public Complaints (Public Portal)
  const complaintsData = [
    {
      ticketNumber: 'CMP-PMK-2024-001',
      reporterName: 'Marthina Weya',
      reporterPhone: '081234998877',
      reporterEmail: 'marthina@gmail.com',
      category: 'FASILITAS_TERMINAL',
      subject: 'Kondisi Toilet Terminal Penumpang',
      description: 'Air bersih di toilet perempuan lantai 1 sempat mati saat kedatangan kapal PELNI Tatamailau.',
      status: ComplaintStatus.RESOLVED,
      resolutionNote: 'Pompa cadangan air bersih telah dihidupkan dan kran telah diperbaiki oleh tim sarpras.',
      resolvedAt: new Date('2024-02-12T10:00:00Z'),
    },
    {
      ticketNumber: 'CMP-PMK-2024-002',
      reporterName: 'Albertus Karafir (Agen Pelra)',
      reporterPhone: '085244112233',
      reporterEmail: 'albert.pelra@yahoo.com',
      category: 'LAYANAN_DERMAGA',
      subject: 'Antrean Bongkar Muat di Tambatan Talud',
      description: 'Perlu pengaturan alur tambat kapal kayu agar tidak saling berhimpitan di bibir talud muara.',
      status: ComplaintStatus.RESOLVED,
      resolutionNote: 'Petugas dermaga telah memberlakukan zonasi tambatan kapal perintis dan kapal nelayan rakyat.',
      resolvedAt: new Date('2024-02-25T14:00:00Z'),
    },
    {
      ticketNumber: 'CMP-PMK-2024-003',
      reporterName: 'Fransiskus Magal',
      reporterPhone: '081148776655',
      reporterEmail: 'f.magal@gmail.com',
      category: 'TIKET_GATE',
      subject: 'Antrean Panjang di Gerbang Masuk Mobil Penumpang',
      description: 'Pada akhir pekan saat ferry berangkat, antrean pembelian tiket karcis mobil cukup panjang.',
      status: ComplaintStatus.IN_PROGRESS,
      resolutionNote: 'Sedang disiapkan jalur tambahan mobile gate warden menggunakan karcis porporasi cepat.',
      resolvedAt: null,
    },
    {
      ticketNumber: 'CMP-PMK-2024-004',
      reporterName: 'Kornelis Murib',
      reporterPhone: '081399881122',
      reporterEmail: null,
      category: 'KEAMANAN_KETERTIBAN',
      subject: 'Penerangan Jalan Akses Pelabuhan',
      description: 'Beberapa titik lampu jalan dari jembatan Poumako menuju gerbang pelabuhan agak gelap saat malam.',
      status: ComplaintStatus.OPEN,
      resolutionNote: null,
      resolvedAt: null,
    },
  ];

  for (const c of complaintsData) {
    await prisma.complaint.upsert({
      where: { ticketNumber: c.ticketNumber },
      update: {
        category: c.category,
        subject: c.subject,
        description: c.description,
        status: c.status,
        resolutionNote: c.resolutionNote,
        resolvedAt: c.resolvedAt,
      },
      create: {
        portId,
        ...c,
      },
    });
  }

  // 4. Notifications
  const existingNotification = await prisma.notification.findFirst({
    where: { userId: bendaharaUserId },
  });

  if (!existingNotification) {
    await prisma.notification.createMany({
      data: [
        {
          userId: bendaharaUserId,
          title: 'Pembayaran Retribusi Terkonfirmasi',
          message: 'Setoran retribusi kapal SKRD-PMK-2024-0001 sebesar Rp 3.200.000 telah masuk rekening kas daerah.',
          type: 'PAYMENT_SUCCESS',
          isRead: true,
          linkUrl: '/billing/invoices/1',
        },
        {
          userId: bendaharaUserId,
          title: 'Peringatan Jatuh Tempo (Teguran I)',
          message: 'Invoice SKRD-PMK-2024-0011 telah melewati jatuh tempo 7 hari. Surat Teguran I telah diterbitkan.',
          type: 'WARNING_ISSUED',
          isRead: false,
          linkUrl: '/warnings',
        },
        {
          userId: adminUserId,
          title: 'Permohonan Kunjungan Kapal Masuk',
          message: 'KM Meratus Kampar mengajukan jadwal sandar di Dermaga Beton Pemda Poumako.',
          type: 'VISIT_REQUEST',
          isRead: true,
          linkUrl: '/visits',
        },
      ],
    });
  }

  // 5. Audit Logs
  const existingAudit = await prisma.auditLog.findFirst({
    where: { actorId: bendaharaUserId },
  });

  if (!existingAudit) {
    await prisma.auditLog.createMany({
      data: [
        {
          actorId: bendaharaUserId,
          action: 'PAYMENT_VERIFIED',
          entityName: 'Payment',
          entityId: 'PAY-SKRD-PMK-2024-0001',
          beforeData: { isVerified: false },
          afterData: { isVerified: true, verifiedAt: new Date().toISOString() },
          reason: 'Verifikasi kliring setoran rekening Bank Papua Kasda Mimika.',
        },
        {
          actorId: kadishubUserId,
          action: 'BILLING_ADJUSTMENT_APPROVED',
          entityName: 'BillingAdjustment',
          entityId: 'ADJ-REQ-2024-001',
          beforeData: { status: 'REQUESTED' },
          afterData: { status: 'APPROVED', approvedAt: new Date().toISOString() },
          reason: 'Pemberian persetujuan angsuran 3 termin sesuai Perbup 25/2024.',
        },
      ],
    });
  }

  console.log('Billing Adjustments, Reports, Complaints, Notifications & Audit Logs seeded successfully.');
}

