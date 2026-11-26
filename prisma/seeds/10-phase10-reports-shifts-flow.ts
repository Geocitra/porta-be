import * as fs from 'fs';
import * as path from 'path';
import {
  DailyReportReviewStatus,
  DailyReportStatus,
  Prisma,
  PrismaClient,
  TaskExecutionStatus,
  TaskPriority,
  TaskReviewStage,
  TaskReviewStatus,
  TaskSourceType,
  TaskType,
  UserRole,
} from '@prisma/client';

/**
 * Step 11 (Phase 10 Seeder):
 * - File bukti contoh nyata di /uploads/seed/ agar preview & download langsung jalan
 * - Tugas dengan lampiran terikat per item checklist di seluruh stage workflow:
 *   1) SUBMITTED / WAITING_ADMIN (sudah ada lampiran bukti -> siap dicek Admin Checker)
 *   2) IN_PROGRESS / ADMIN_RETURNED (dikembalikan Admin Checker karena bukti kurang sesuai)
 *   3) SUBMITTED / WAITING_HEAD_VERIFICATION (lolos Admin Checker -> siap verifikasi Kepala)
 *   4) OVERDUE / NOT_STARTED (tertahan di Petugas -> muncul di Radar Bottleneck)
 * - Laporan Harian (DailyPortReport) di seluruh status review:
 *   WAITING_ADMIN, ADMIN_RETURNED, WAITING_HEAD_VERIFICATION, HEAD_VERIFIED
 *   lengkap dengan domainSummaryJson terstruktur.
 */
export async function seedPhase10ReportsAndShiftFlow(
  prisma: PrismaClient,
  ports: { pomakoId: number; pomakoBarangId: number; pomakoPenumpangId: number },
  users: {
    adminPortPmkId: number;
    kepalaPelabuhanPmkId: number;
    petugasDermagaAId: number;
    petugasDermagaBId: number;
  },
) {
  console.log('Seeding Phase 10: Per-Item Task Evidence, Shift Reports & Bottleneck Flow...');

  // 1. Pastikan folder & file contoh ada di uploads/seed/
  const seedUploadDir = path.resolve(process.cwd(), 'uploads', 'seed');
  if (!fs.existsSync(seedUploadDir)) {
    fs.mkdirSync(seedUploadDir, { recursive: true });
  }

  const samplePdfHeader = '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n';
  const sampleFiles = [
    { name: 'warta-kedatangan-demo.pdf', content: samplePdfHeader },
    { name: 'manifest-muatan-demo.pdf', content: samplePdfHeader },
    { name: 'berita-acara-sandar-demo.pdf', content: samplePdfHeader },
  ];
  for (const sf of sampleFiles) {
    const fullPath = path.join(seedUploadDir, sf.name);
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, sf.content, 'utf8');
    }
  }

  // Cari 1 ShipVisit & 1 Berth agar sourceContext terhidrasi nyata
  const sampleVisit = await prisma.shipVisit.findFirst({
    where: { portId: ports.pomakoId },
    orderBy: { id: 'asc' },
  });
  const sampleBerth = await prisma.berth.findFirst({
    where: { portId: ports.pomakoId },
    orderBy: { id: 'asc' },
  });

  // Cari petugas spesialis lain bila ada
  const [petugasKontrak, petugasBarang, petugasPenumpang, petugasRuangan, petugasTagihan] =
    await Promise.all([
      prisma.user.findFirst({ where: { role: UserRole.PETUGAS_REGISTRASI_KONTRAK, isActive: true } }),
      prisma.user.findFirst({ where: { role: UserRole.PETUGAS_DERMAGA_BARANG, isActive: true } }),
      prisma.user.findFirst({ where: { role: UserRole.PETUGAS_DERMAGA_PENUMPANG, isActive: true } }),
      prisma.user.findFirst({ where: { role: UserRole.PETUGAS_RUANGAN, isActive: true } }),
      prisma.user.findFirst({ where: { role: UserRole.PETUGAS_TAGIHAN, isActive: true } }),
    ]);

  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 3600 * 1000);
  const twelveHoursAgo = new Date(now.getTime() - 12 * 3600 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 48 * 3600 * 1000);

  // 2. Attach real file ke task TSK-PMK-SEED-002 bila belum punya attachment
  const seedTask002 = await prisma.task.findUnique({
    where: { taskNumber: 'TSK-PMK-SEED-002' },
    include: { checklistItems: true, attachments: true },
  });
  if (seedTask002) {
    if (!seedTask002.visitId && sampleVisit) {
      await prisma.task.update({
        where: { id: seedTask002.id },
        data: {
          visitId: sampleVisit.id,
          sourceId: String(sampleVisit.id),
        },
      });
    }
    const docItem = seedTask002.checklistItems.find(
      (c) => c.code === 'ARRIVAL_CLEARANCE_DOC',
    );
    if (docItem && seedTask002.attachments.length === 0) {
      const filePath = '/uploads/seed/warta-kedatangan-demo.pdf';
      await prisma.taskChecklistItem.update({
        where: { id: docItem.id },
        data: { requiresAttachment: true, attachmentPath: filePath },
      });
      await prisma.taskAttachment.create({
        data: {
          taskId: seedTask002.id,
          checklistItemId: docItem.id,
          fileName: 'warta-kedatangan-demo.pdf',
          filePath,
          mimeType: 'application/pdf',
          uploadedById: users.petugasDermagaAId,
          notes: 'Scan Warta Kedatangan Kapal (Demo Seed)',
        },
      });
    }
  }

  // 3. Seed 3 Tugas Tambahan untuk melengkapi semua stage Bottleneck & Checker
  const p10Tasks = [
    {
      taskNumber: 'TSK-PMK-P10-001',
      taskType: TaskType.MANIFEST_CHECK,
      title: 'Pemeriksaan Manifes Sif Pagi — KM Tatamailau',
      description: 'Pemeriksaan kelengkapan manifes penumpang dan muatan kapal sif pagi.',
      sourceType: TaskSourceType.SHIP_VISIT,
      sourceId: sampleVisit ? String(sampleVisit.id) : null,
      visitId: sampleVisit?.id ?? null,
      assigneeId: petugasPenumpang?.id ?? users.petugasDermagaAId,
      priority: TaskPriority.HIGH,
      dueDate: new Date(now.getTime() + 4 * 3600 * 1000),
      executionStatus: TaskExecutionStatus.SUBMITTED,
      reviewStatus: TaskReviewStatus.WAITING_HEAD_VERIFICATION,
      isOverdue: false,
      startedAt: twelveHoursAgo,
      submittedAt: sixHoursAgo,
      adminReviewedById: users.adminPortPmkId,
      adminReviewedAt: new Date(now.getTime() - 2 * 3600 * 1000),
      adminReviewNotes: 'Checklist dan lampiran manifes sudah lengkap, diteruskan ke Kepala Pelabuhan.',
      attachmentFile: {
        code: 'MANIFEST_DOC_AVAILABLE',
        label: 'Dokumen manifest resmi tersedia',
        fileName: 'manifest-muatan-demo.pdf',
        filePath: '/uploads/seed/manifest-muatan-demo.pdf',
      },
      checkedByAdmin: true,
    },
    {
      taskNumber: 'TSK-PMK-P10-002',
      taskType: TaskType.CARGO_HANDLING_CHECK,
      title: 'Laporan Bongkar Muat Sif Siang — Dermaga Barang',
      description: 'Verifikasi berita acara bongkar muat kontainer & lampiran foto lapangan.',
      sourceType: TaskSourceType.SHIP_VISIT,
      sourceId: sampleVisit ? String(sampleVisit.id) : null,
      visitId: sampleVisit?.id ?? null,
      assigneeId: petugasBarang?.id ?? users.petugasDermagaBId,
      priority: TaskPriority.HIGH,
      dueDate: sixHoursAgo,
      executionStatus: TaskExecutionStatus.IN_PROGRESS,
      reviewStatus: TaskReviewStatus.ADMIN_RETURNED,
      isOverdue: true,
      startedAt: twelveHoursAgo,
      rejectionReason: 'Lampiran berita acara bongkar muat buram, mohon unggah ulang dokumen yang jelas.',
      attachmentFile: {
        code: 'CARGO_TALLY_UPLOADED',
        label: 'Upload tally sheet & berita acara bongkar muat',
        fileName: 'berita-acara-sandar-demo.pdf',
        filePath: '/uploads/seed/berita-acara-sandar-demo.pdf',
      },
      checkedByAdmin: false,
    },
    {
      taskNumber: 'TSK-PMK-P10-003',
      taskType: TaskType.DOCUMENT_VERIFICATION,
      title: 'Verifikasi Berkas PKS Sandar Operator Baru',
      description: 'Pengecekan kelengkapan NIB, NPWP, dan draft PKS sandar kapal.',
      sourceType: TaskSourceType.DOCUMENT_SUBMISSION,
      sourceId: null,
      visitId: null,
      assigneeId: petugasKontrak?.id ?? users.petugasDermagaAId,
      priority: TaskPriority.MEDIUM,
      dueDate: twoDaysAgo,
      executionStatus: TaskExecutionStatus.NOT_STARTED,
      reviewStatus: TaskReviewStatus.NOT_SUBMITTED,
      isOverdue: true,
      startedAt: null,
      attachmentFile: null,
      checkedByAdmin: false,
    },
  ];

  for (const t of p10Tasks) {
    const existing = await prisma.task.findUnique({
      where: { taskNumber: t.taskNumber },
    });
    if (!existing) {
      const created = await prisma.task.create({
        data: {
          taskNumber: t.taskNumber,
          taskType: t.taskType,
          title: t.title,
          description: t.description,
          sourceType: t.sourceType,
          sourceId: t.sourceId,
          portId: ports.pomakoId,
          berthId: sampleBerth?.id ?? null,
          visitId: t.visitId,
          assigneeId: t.assigneeId,
          priority: t.priority,
          obligationDate: now,
          dueDate: t.dueDate,
          executionStatus: t.executionStatus,
          reviewStatus: t.reviewStatus,
          isOverdue: t.isOverdue,
          startedAt: t.startedAt,
          submittedAt: t.submittedAt ?? null,
          adminReviewedById: t.adminReviewedById ?? null,
          adminReviewedAt: t.adminReviewedAt ?? null,
          adminReviewNotes: t.adminReviewNotes ?? null,
          rejectionReason: t.rejectionReason ?? null,
          checklistItems: {
            create: [
              {
                itemOrder: 1,
                code: t.attachmentFile?.code ?? 'DOC_COMPLETENESS_CHECK',
                label: t.attachmentFile?.label ?? 'Kelengkapan dokumen persyaratan utama',
                isRequired: true,
                isApplicable: true,
                requiresAttachment: Boolean(t.attachmentFile),
                checkedByOfficer: t.executionStatus !== TaskExecutionStatus.NOT_STARTED,
                officerNotes:
                  t.executionStatus !== TaskExecutionStatus.NOT_STARTED
                    ? 'Sudah diperiksa petugas lapangan'
                    : null,
                attachmentPath: t.attachmentFile?.filePath ?? null,
                checkedByAdmin: t.checkedByAdmin,
                adminNotes: t.rejectionReason ?? (t.checkedByAdmin ? 'Sesuai' : null),
              },
            ],
          },
        },
        include: { checklistItems: true },
      });

      if (t.attachmentFile && created.checklistItems[0]) {
        await prisma.taskAttachment.create({
          data: {
            taskId: created.id,
            checklistItemId: created.checklistItems[0].id,
            fileName: t.attachmentFile.fileName,
            filePath: t.attachmentFile.filePath,
            mimeType: 'application/pdf',
            uploadedById: t.assigneeId,
            notes: `Lampiran bukti ${t.taskNumber}`,
          },
        });
      }

      if (t.reviewStatus === TaskReviewStatus.ADMIN_RETURNED) {
        await prisma.taskReview.create({
          data: {
            taskId: created.id,
            reviewStage: TaskReviewStage.ADMIN_CHECK,
            reviewerId: users.adminPortPmkId,
            reviewerRole: UserRole.ADMIN_PELABUHAN,
            decision: 'ADMIN_RETURN',
            reason: t.rejectionReason,
            notes: 'Dikembalikan oleh Admin Checker untuk perbaikan lampiran.',
          },
        });
      }
    }
  }

  // 4. Seed Laporan Harian (DailyPortReport) di berbagai tahap alur sif & verifikasi
  const domainSummarySample = [
    {
      domainCode: 'REGISTRATION_CONTRACT',
      domainLabel: 'Registrasi, Legalitas & Kontrak',
      total: 2,
      notStarted: 1,
      inProgress: 0,
      submitted: 1,
      returned: 0,
      headVerified: 0,
      overdue: 1,
      withIssues: 0,
    },
    {
      domainCode: 'CARGO_BERTH',
      domainLabel: 'Operasional Dermaga & Barang',
      total: 3,
      notStarted: 0,
      inProgress: 1,
      submitted: 2,
      returned: 1,
      headVerified: 0,
      overdue: 1,
      withIssues: 0,
    },
    {
      domainCode: 'PASSENGER_BERTH',
      domainLabel: 'Dermaga Penumpang & Manifes',
      total: 2,
      notStarted: 0,
      inProgress: 0,
      submitted: 2,
      returned: 0,
      headVerified: 1,
      overdue: 0,
      withIssues: 0,
    },
    {
      domainCode: 'ASSET_MAINTENANCE',
      domainLabel: 'Ruangan, Aset & Pemeliharaan',
      total: 1,
      notStarted: 0,
      inProgress: 0,
      submitted: 1,
      returned: 0,
      headVerified: 1,
      overdue: 0,
      withIssues: 0,
    },
    {
      domainCode: 'BILLING_TREASURY',
      domainLabel: 'Tagihan, Retribusi & Bendahara',
      total: 1,
      notStarted: 0,
      inProgress: 0,
      submitted: 1,
      returned: 0,
      headVerified: 1,
      overdue: 0,
      withIssues: 0,
    },
  ];

  const todayDate = new Date(now.toISOString().slice(0, 10));
  const yesterdayDate = new Date(new Date(now.getTime() - 86400 * 1000).toISOString().slice(0, 10));
  const twoDaysAgoDate = new Date(new Date(now.getTime() - 2 * 86400 * 1000).toISOString().slice(0, 10));

  const shiftReports = [
    {
      reportDate: todayDate,
      officerId: petugasBarang?.id ?? users.petugasDermagaAId,
      totalVesselsStaying: 3,
      generalNotes: '[Sif Pagi] Laporan operasional dermaga barang & kedatangan kapal — menunggu pemeriksaan Admin Pelabuhan.',
      status: DailyReportStatus.SUBMITTED,
      reviewStatus: DailyReportReviewStatus.WAITING_ADMIN,
      checkedByAdminId: null,
      checkedAt: null,
      adminNotes: null,
      verifiedByHeadId: null,
      verifiedAt: null,
      headNotes: null,
    },
    {
      reportDate: yesterdayDate,
      officerId: petugasPenumpang?.id ?? users.petugasDermagaBId,
      totalVesselsStaying: 2,
      generalNotes: '[Sif Siang] Laporan pelayanan penumpang & manifes kapal — sudah dicek Admin Pelabuhan, menunggu verifikasi Kepala Pelabuhan.',
      status: DailyReportStatus.SUBMITTED,
      reviewStatus: DailyReportReviewStatus.WAITING_HEAD_VERIFICATION,
      checkedByAdminId: users.adminPortPmkId,
      checkedAt: sixHoursAgo,
      adminNotes: 'Seluruh lampiran manifes dan rekap sif telah lengkap dan sesuai.',
      verifiedByHeadId: null,
      verifiedAt: null,
      headNotes: null,
    },
    {
      reportDate: twoDaysAgoDate,
      officerId: petugasRuangan?.id ?? petugasTagihan?.id ?? users.petugasDermagaAId,
      totalVesselsStaying: 4,
      generalNotes: '[Sif Malam] Laporan operasional lengkap harian pelabuhan — telah diverifikasi Kepala Pelabuhan.',
      status: DailyReportStatus.ACKNOWLEDGED,
      reviewStatus: DailyReportReviewStatus.HEAD_VERIFIED,
      checkedByAdminId: users.adminPortPmkId,
      checkedAt: twoDaysAgo,
      adminNotes: 'Rekap lengkap.',
      verifiedByHeadId: users.kepalaPelabuhanPmkId,
      verifiedAt: yesterdayDate,
      headNotes: 'Diterima dan diverifikasi.',
    },
  ];

  for (const sr of shiftReports) {
    const existingRep = await prisma.dailyPortReport.findFirst({
      where: {
        portId: ports.pomakoId,
        reportDate: sr.reportDate,
        officerId: sr.officerId,
      },
    });
    if (!existingRep) {
      await prisma.dailyPortReport.create({
        data: {
          portId: ports.pomakoId,
          reportDate: sr.reportDate,
          officerId: sr.officerId,
          totalVesselsStaying: sr.totalVesselsStaying,
          generalNotes: sr.generalNotes,
          status: sr.status,
          reviewStatus: sr.reviewStatus,
          checkedByAdminId: sr.checkedByAdminId,
          checkedAt: sr.checkedAt,
          adminNotes: sr.adminNotes,
          verifiedByHeadId: sr.verifiedByHeadId,
          verifiedAt: sr.verifiedAt,
          headNotes: sr.headNotes,
          domainSummaryJson: domainSummarySample as unknown as Prisma.InputJsonValue,
          items: sampleVisit
            ? {
                create: [
                  {
                    portId: ports.pomakoId,
                    visitId: sampleVisit.id,
                    berthId: sampleBerth?.id ?? null,
                    vesselNameSnapshot: 'KM Tatamailau',
                    registrationNumberSnapshot: 'REG-PELNI-001',
                    evidencePhoto: '/uploads/seed/warta-kedatangan-demo.pdf',
                    isAdhoc: false,
                    notes: 'Kapal sandar sesuai jadwal sif.',
                  },
                ],
              }
            : undefined,
        },
      });
    }
  }

  console.log('Phase 10 Reports, Shift Flow & Bottleneck Seeded Successfully.');
}
