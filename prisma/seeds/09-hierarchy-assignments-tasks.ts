import {
  AssignmentStatus,
  FacilityConditionStatus,
  PrismaClient,
  TaskExecutionStatus,
  TaskPriority,
  TaskReviewStage,
  TaskReviewStatus,
  TaskSourceType,
  TaskType,
  TerminalClass,
  TerminalType,
  UserRole,
  ZoneType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_PERMISSION_CATALOG } from '../../src/modules/assignments/assignments.service';
import { DEFAULT_SOP_CHECKLISTS } from '../../src/modules/tasks/tasks.service';

export async function seedHierarchyAssignmentsAndTasks(
  prisma: PrismaClient,
  ports: { pomakoId: number; pomakoBarangId: number; pomakoPenumpangId: number },
) {
  console.log(
    'Seeding Organizational Hierarchy, Ecosystem Master, Assignments & Task Workflow...',
  );

  // 1. Divisions (Bidang Dinas Perhubungan) & DivisionPort Scope
  const divLaut = await prisma.division.upsert({
    where: { code: 'BID-LAUT' },
    update: {
      name: 'Bidang Perhubungan Laut & Kepelabuhanan',
      description: 'Membawahi Pelabuhan Umum Poumako dan Pelabuhan Barang & Logistik Poumako',
      isActive: true,
    },
    create: {
      code: 'BID-LAUT',
      name: 'Bidang Perhubungan Laut & Kepelabuhanan',
      description: 'Membawahi Pelabuhan Umum Poumako dan Pelabuhan Barang & Logistik Poumako',
    },
  });

  const divAsdp = await prisma.division.upsert({
    where: { code: 'BID-ASDP' },
    update: {
      name: 'Bidang Angkutan Sungai, Danau & Penyeberangan (ASDP)',
      description: 'Membawahi Pelabuhan Penumpang & Angkutan Orang Poumako',
      isActive: true,
    },
    create: {
      code: 'BID-ASDP',
      name: 'Bidang Angkutan Sungai, Danau & Penyeberangan (ASDP)',
      description: 'Membawahi Pelabuhan Penumpang & Angkutan Orang Poumako',
    },
  });

  await prisma.divisionPort.upsert({
    where: { divisionId_portId: { divisionId: divLaut.id, portId: ports.pomakoId } },
    update: {},
    create: { divisionId: divLaut.id, portId: ports.pomakoId },
  });
  await prisma.divisionPort.upsert({
    where: { divisionId_portId: { divisionId: divLaut.id, portId: ports.pomakoBarangId } },
    update: {},
    create: { divisionId: divLaut.id, portId: ports.pomakoBarangId },
  });
  await prisma.divisionPort.upsert({
    where: { divisionId_portId: { divisionId: divAsdp.id, portId: ports.pomakoPenumpangId } },
    update: {},
    create: { divisionId: divAsdp.id, portId: ports.pomakoPenumpangId },
  });

  // 2. Permissions Catalog
  for (const perm of DEFAULT_PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, module: perm.module },
      create: { code: perm.code, name: perm.name, module: perm.module },
    });
  }

  // 3. Terminals, Zones & Facilities for Pelabuhan Umum Poumako
  const termMultipurpose = await prisma.terminal.upsert({
    where: { portId_code: { portId: ports.pomakoId, code: 'TRM-PMK-MP' } },
    update: {
      name: 'Terminal Multipurpose Nusantara Poumako',
      terminalType: TerminalType.MULTIPURPOSE,
      terminalClass: TerminalClass.KELAS_B,
    },
    create: {
      portId: ports.pomakoId,
      code: 'TRM-PMK-MP',
      name: 'Terminal Multipurpose Nusantara Poumako',
      terminalType: TerminalType.MULTIPURPOSE,
      terminalClass: TerminalClass.KELAS_B,
      description: 'Terminal utama pelayanan kapal campuran dan logistik Poumako',
    },
  });

  const berthsPomako = await prisma.berth.findMany({
    where: { portId: ports.pomakoId },
    orderBy: { id: 'asc' },
  });
  const dermagaA = berthsPomako[0]; // DRM-PEMDA-01
  const dermagaB = berthsPomako[1] ?? berthsPomako[0]; // TLD-PEMDA-01

  if (dermagaA) {
    await prisma.berth.update({
      where: { id: dermagaA.id },
      data: { terminalId: termMultipurpose.id, maxGrossTonnage: 10000 },
    });

    const zoneDermagaA = await prisma.portZone.upsert({
      where: { portId_code: { portId: ports.pomakoId, code: 'ZN-PMK-CY01' } },
      update: {
        terminalId: termMultipurpose.id,
        berthId: dermagaA.id,
        name: 'Zona Lapangan Penumpukan & Apron Dermaga A',
        zoneType: ZoneType.AREA_DERMAGA,
        areaSqm: 3200,
      },
      create: {
        portId: ports.pomakoId,
        terminalId: termMultipurpose.id,
        berthId: dermagaA.id,
        code: 'ZN-PMK-CY01',
        name: 'Zona Lapangan Penumpukan & Apron Dermaga A',
        zoneType: ZoneType.AREA_DERMAGA,
        areaSqm: 3200,
      },
    });

    await prisma.portFacility.upsert({
      where: { portId_code: { portId: ports.pomakoId, code: 'FAC-PMK-BLD01' } },
      update: {
        terminalId: termMultipurpose.id,
        berthId: dermagaA.id,
        zoneId: zoneDermagaA.id,
        name: 'Bollard & Rubber Fender Dermaga Beton Nusantara (12 Unit)',
        facilityType: 'BOLLARD_FENDER',
        conditionStatus: FacilityConditionStatus.GOOD,
      },
      create: {
        portId: ports.pomakoId,
        terminalId: termMultipurpose.id,
        berthId: dermagaA.id,
        zoneId: zoneDermagaA.id,
        code: 'FAC-PMK-BLD01',
        name: 'Bollard & Rubber Fender Dermaga Beton Nusantara (12 Unit)',
        facilityType: 'BOLLARD_FENDER',
        conditionStatus: FacilityConditionStatus.GOOD,
      },
    });
  }

  // 4. Hierarchical Users (KADIS, KABID, KEPALA_PELABUHAN, ADMIN_PELABUHAN, PETUGAS_PELABUHAN)
  const passwordHash = await bcrypt.hash('Porta123!', 10);

  const kadisUser = await prisma.user.upsert({
    where: { email: 'kadis@porta.mimikakab.go.id' },
    update: {
      fullName: 'Drs. Jania Basir, M.Si (Kepala Dinas Perhubungan)',
      role: UserRole.KEPALA_DINAS,
      portId: null,
      divisionId: null,
    },
    create: {
      email: 'kadis@porta.mimikakab.go.id',
      username: 'kadis.dishub',
      passwordHash,
      fullName: 'Drs. Jania Basir, M.Si (Kepala Dinas Perhubungan)',
      role: UserRole.KEPALA_DINAS,
    },
  });

  const kabidLautUser = await prisma.user.upsert({
    where: { email: 'kabid.laut@porta.mimikakab.go.id' },
    update: {
      fullName: 'Ir. Lukas Magal, M.T. (Kabid Perhubungan Laut)',
      role: UserRole.KEPALA_BIDANG,
      divisionId: divLaut.id,
      portId: null,
    },
    create: {
      email: 'kabid.laut@porta.mimikakab.go.id',
      username: 'kabid.laut',
      passwordHash,
      fullName: 'Ir. Lukas Magal, M.T. (Kabid Perhubungan Laut)',
      role: UserRole.KEPALA_BIDANG,
      divisionId: divLaut.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'kabid.asdp@porta.mimikakab.go.id' },
    update: {
      fullName: 'Fransiskus Ohee, S.STP (Kabid Penyeberangan ASDP)',
      role: UserRole.KEPALA_BIDANG,
      divisionId: divAsdp.id,
      portId: null,
    },
    create: {
      email: 'kabid.asdp@porta.mimikakab.go.id',
      username: 'kabid.asdp',
      passwordHash,
      fullName: 'Fransiskus Ohee, S.STP (Kabid Penyeberangan ASDP)',
      role: UserRole.KEPALA_BIDANG,
      divisionId: divAsdp.id,
    },
  });

  const kepalaPelabuhanPmK = await prisma.user.upsert({
    where: { email: 'kepala.pomako@porta.mimikakab.go.id' },
    update: {
      fullName: 'Capt. Willem Wandikbo, M.Mar (Kepala Pelabuhan Poumako)',
      role: UserRole.KEPALA_PELABUHAN,
      portId: ports.pomakoId,
    },
    create: {
      email: 'kepala.pomako@porta.mimikakab.go.id',
      username: 'kepala.pomako',
      passwordHash,
      fullName: 'Capt. Willem Wandikbo, M.Mar (Kepala Pelabuhan Poumako)',
      role: UserRole.KEPALA_PELABUHAN,
      portId: ports.pomakoId,
    },
  });

  const adminPortPmk = await prisma.user.upsert({
    where: { email: 'checker.pomako@porta.mimikakab.go.id' },
    update: {
      fullName: 'Maria Numberi, S.AP (Admin Checker Pelabuhan Poumako)',
      role: UserRole.ADMIN_PELABUHAN,
      portId: ports.pomakoId,
    },
    create: {
      email: 'checker.pomako@porta.mimikakab.go.id',
      username: 'checker.pomako',
      passwordHash,
      fullName: 'Maria Numberi, S.AP (Admin Checker Pelabuhan Poumako)',
      role: UserRole.ADMIN_PELABUHAN,
      portId: ports.pomakoId,
    },
  });

  const petugasDermagaA = await prisma.user.upsert({
    where: { email: 'petugas.dermaga.a@porta.mimikakab.go.id' },
    update: {
      fullName: 'Yohanes Maturbongs (Petugas Dermaga A)',
      role: UserRole.PETUGAS_PELABUHAN,
      portId: ports.pomakoId,
    },
    create: {
      email: 'petugas.dermaga.a@porta.mimikakab.go.id',
      username: 'petugas.dermaga.a',
      passwordHash,
      fullName: 'Yohanes Maturbongs (Petugas Dermaga A)',
      role: UserRole.PETUGAS_PELABUHAN,
      portId: ports.pomakoId,
    },
  });

  const petugasDermagaB = await prisma.user.upsert({
    where: { email: 'petugas.dermaga.b@porta.mimikakab.go.id' },
    update: {
      fullName: 'Markus Karafir (Petugas Dermaga B)',
      role: UserRole.PETUGAS_PELABUHAN,
      portId: ports.pomakoId,
    },
    create: {
      email: 'petugas.dermaga.b@porta.mimikakab.go.id',
      username: 'petugas.dermaga.b',
      passwordHash,
      fullName: 'Markus Karafir (Petugas Dermaga B)',
      role: UserRole.PETUGAS_PELABUHAN,
      portId: ports.pomakoId,
    },
  });

  // 5. UserAssignments (Petugas A -> Dermaga A, Petugas B -> Dermaga B)
  const assignA = await prisma.userAssignment.upsert({
    where: { assignmentCode: 'ASG-PMK-DRM-A-01' },
    update: {
      userId: petugasDermagaA.id,
      role: UserRole.PETUGAS_PELABUHAN,
      portId: ports.pomakoId,
      terminalId: termMultipurpose.id,
      berthId: dermagaA?.id ?? null,
      taskTypes: [
        TaskType.MANIFEST_CHECK,
        TaskType.VESSEL_ARRIVAL_CHECK,
        TaskType.BERTHING_INSPECTION,
        TaskType.PASSENGER_SERVICE,
      ],
      permissionCodes: [
        'manifest.create',
        'manifest.update',
        'manifest.submit',
        'vessel.arrival.create',
        'vessel.berthing.create',
        'task.execute',
        'task.submit',
      ],
      status: AssignmentStatus.ACTIVE,
      assignedById: kepalaPelabuhanPmK.id,
    },
    create: {
      assignmentCode: 'ASG-PMK-DRM-A-01',
      userId: petugasDermagaA.id,
      role: UserRole.PETUGAS_PELABUHAN,
      portId: ports.pomakoId,
      terminalId: termMultipurpose.id,
      berthId: dermagaA?.id ?? null,
      taskTypes: [
        TaskType.MANIFEST_CHECK,
        TaskType.VESSEL_ARRIVAL_CHECK,
        TaskType.BERTHING_INSPECTION,
        TaskType.PASSENGER_SERVICE,
      ],
      permissionCodes: [
        'manifest.create',
        'manifest.update',
        'manifest.submit',
        'vessel.arrival.create',
        'vessel.berthing.create',
        'task.execute',
        'task.submit',
      ],
      startDate: new Date('2026-01-01T00:00:00Z'),
      status: AssignmentStatus.ACTIVE,
      assignedById: kepalaPelabuhanPmK.id,
      notes: 'Penugasan tetap Petugas A pada Dermaga Beton Nusantara (Dermaga A)',
    },
  });

  const assignB = await prisma.userAssignment.upsert({
    where: { assignmentCode: 'ASG-PMK-DRM-B-01' },
    update: {
      userId: petugasDermagaB.id,
      role: UserRole.PETUGAS_PELABUHAN,
      portId: ports.pomakoId,
      berthId: dermagaB?.id ?? null,
      taskTypes: [
        TaskType.CARGO_HANDLING_CHECK,
        TaskType.VESSEL_DEPARTURE_CLEARANCE,
        TaskType.FACILITY_INSPECTION,
        TaskType.MAINTENANCE_HANDLING,
      ],
      permissionCodes: [
        'cargo.create',
        'cargo.update',
        'vessel.departure.update',
        'facility.inspect',
        'task.execute',
        'task.submit',
      ],
      status: AssignmentStatus.ACTIVE,
      assignedById: kepalaPelabuhanPmK.id,
    },
    create: {
      assignmentCode: 'ASG-PMK-DRM-B-01',
      userId: petugasDermagaB.id,
      role: UserRole.PETUGAS_PELABUHAN,
      portId: ports.pomakoId,
      berthId: dermagaB?.id ?? null,
      taskTypes: [
        TaskType.CARGO_HANDLING_CHECK,
        TaskType.VESSEL_DEPARTURE_CLEARANCE,
        TaskType.FACILITY_INSPECTION,
        TaskType.MAINTENANCE_HANDLING,
      ],
      permissionCodes: [
        'cargo.create',
        'cargo.update',
        'vessel.departure.update',
        'facility.inspect',
        'task.execute',
        'task.submit',
      ],
      startDate: new Date('2026-01-01T00:00:00Z'),
      status: AssignmentStatus.ACTIVE,
      assignedById: kepalaPelabuhanPmK.id,
      notes: 'Penugasan tetap Petugas B pada Tambatan Talud Cenderawasih (Dermaga B)',
    },
  });

  // 6. Task Templates & SOP Checklists
  for (const [taskTypeKey, checklistItems] of Object.entries(DEFAULT_SOP_CHECKLISTS)) {
    const taskType = taskTypeKey as TaskType;
    const code = `TPL-${taskType}`;
    const existingTpl = await prisma.taskTemplate.findUnique({ where: { taskType } });
    if (!existingTpl) {
      await prisma.taskTemplate.create({
        data: {
          code,
          taskType,
          titleTemplate: `SOP ${taskType.replace(/_/g, ' ')}`,
          description: `Standar Operasional Prosedur untuk pelaksanaan dan pemeriksaan ${taskType}`,
          defaultPriority: TaskPriority.HIGH,
          slaMinutes: 240,
          sopReference: 'SOP-DISHUB-MMK/2024',
          checklistItems: {
            create: checklistItems.map((item) => ({
              itemOrder: item.itemOrder,
              code: item.code,
              label: item.label,
              isRequired: item.isRequired,
              requiresAttachment: item.requiresAttachment,
              applicableVesselCategories: item.applicableVesselCategories,
            })),
          },
        },
      });
    }
  }

  // 7. Sample Tasks across Workflow States
  const sampleVisit = await prisma.shipVisit.findFirst({
    where: { portId: ports.pomakoId },
    include: { vessel: true },
    orderBy: { id: 'asc' },
  });

  const manifestTpl = await prisma.taskTemplate.findUnique({
    where: { taskType: TaskType.MANIFEST_CHECK },
    include: { checklistItems: true },
  });

  // Task 1: Verified & Completed (Petugas A -> Admin Checked -> Kepala Pelabuhan Verified)
  const existingTask1 = await prisma.task.findUnique({
    where: { taskNumber: 'TSK-PMK-SEED-001' },
  });
  if (!existingTask1 && sampleVisit && manifestTpl) {
    await prisma.task.create({
      data: {
        taskNumber: 'TSK-PMK-SEED-001',
        taskType: TaskType.MANIFEST_CHECK,
        templateId: manifestTpl.id,
        title: `Pemeriksaan Manifest ${sampleVisit.vessel.name} (${sampleVisit.visitNumber})`,
        description: 'Pemeriksaan kelengkapan manifest kedatangan kapal di Dermaga A',
        sourceType: TaskSourceType.SHIP_VISIT,
        sourceId: String(sampleVisit.id),
        portId: ports.pomakoId,
        terminalId: termMultipurpose.id,
        berthId: dermagaA?.id ?? null,
        visitId: sampleVisit.id,
        assigneeId: petugasDermagaA.id,
        assignmentId: assignA.id,
        createdById: adminPortPmk.id,
        priority: TaskPriority.HIGH,
        obligationDate: new Date(),
        dueDate: new Date(Date.now() + 8 * 3600 * 1000),
        executionStatus: TaskExecutionStatus.COMPLETED,
        reviewStatus: TaskReviewStatus.HEAD_VERIFIED,
        startedAt: new Date(Date.now() - 3 * 3600 * 1000),
        submittedAt: new Date(Date.now() - 2 * 3600 * 1000),
        adminReviewedById: adminPortPmk.id,
        adminReviewedAt: new Date(Date.now() - 1 * 3600 * 1000),
        adminReviewNotes: 'Seluruh item checklist manifest lengkap sesuai dokumen kapal.',
        headVerifiedById: kepalaPelabuhanPmK.id,
        headVerifiedAt: new Date(),
        headVerifyNotes: 'Telah diverifikasi Kepala Pelabuhan Poumako.',
        completedAt: new Date(),
        checklistItems: {
          create: manifestTpl.checklistItems.map((c) => ({
            itemOrder: c.itemOrder,
            code: c.code,
            label: c.label,
            isRequired: c.isRequired,
            isApplicable: true,
            requiresAttachment: c.requiresAttachment,
            checkedByOfficer: true,
            officerNotes: 'Terverifikasi lapangan',
            attachmentPath: '/uploads/tasks/sample_manifest_verified.pdf',
            checkedByAdmin: true,
            adminNotes: 'Sesuai dokumen',
          })),
        },
        submissions: {
          create: {
            submissionNumber: 1,
            submittedById: petugasDermagaA.id,
            notes: 'Pemeriksaan manifest telah lengkap.',
          },
        },
        reviews: {
          create: [
            {
              reviewStage: TaskReviewStage.ADMIN_CHECK,
              reviewerId: adminPortPmk.id,
              reviewerRole: UserRole.ADMIN_PELABUHAN,
              decision: 'ADMIN_APPROVED',
              notes: 'Checklist lengkap.',
            },
            {
              reviewStage: TaskReviewStage.HEAD_VERIFICATION,
              reviewerId: kepalaPelabuhanPmK.id,
              reviewerRole: UserRole.KEPALA_PELABUHAN,
              decision: 'HEAD_VERIFIED',
              notes: 'Disetujui Kepala Pelabuhan.',
            },
          ],
        },
      },
    });
  }

  // Task 2: Waiting Admin Review (Submitted by Petugas A)
  const existingTask2 = await prisma.task.findUnique({
    where: { taskNumber: 'TSK-PMK-SEED-002' },
  });
  if (!existingTask2) {
    await prisma.task.create({
      data: {
        taskNumber: 'TSK-PMK-SEED-002',
        taskType: TaskType.VESSEL_ARRIVAL_CHECK,
        title: 'Pemeriksaan Kedatangan Kapal Dermaga A',
        description: 'Verifikasi waktu labuh dan warta kedatangan kapal',
        sourceType: TaskSourceType.SHIP_VISIT,
        portId: ports.pomakoId,
        terminalId: termMultipurpose.id,
        berthId: dermagaA?.id ?? null,
        assigneeId: petugasDermagaA.id,
        assignmentId: assignA.id,
        priority: TaskPriority.HIGH,
        obligationDate: new Date(),
        dueDate: new Date(Date.now() + 4 * 3600 * 1000),
        executionStatus: TaskExecutionStatus.SUBMITTED,
        reviewStatus: TaskReviewStatus.WAITING_ADMIN,
        startedAt: new Date(Date.now() - 3600 * 1000),
        submittedAt: new Date(),
        checklistItems: {
          create: DEFAULT_SOP_CHECKLISTS[TaskType.VESSEL_ARRIVAL_CHECK].map((c) => ({
            itemOrder: c.itemOrder,
            code: c.code,
            label: c.label,
            isRequired: c.isRequired,
            isApplicable: true,
            requiresAttachment: c.requiresAttachment,
            checkedByOfficer: true,
          })),
        },
      },
    });
  }

  // Task 3: Not Started / Obligation on Dermaga B (Petugas B)
  const existingTask3 = await prisma.task.findUnique({
    where: { taskNumber: 'TSK-PMK-SEED-003' },
  });
  if (!existingTask3) {
    await prisma.task.create({
      data: {
        taskNumber: 'TSK-PMK-SEED-003',
        taskType: TaskType.CARGO_HANDLING_CHECK,
        title: 'Pengawasan Bongkar Muat Logistik Dermaga B',
        description: 'Pemeriksaan kuantitas bongkar muat dan area penumpukan Dermaga B',
        sourceType: TaskSourceType.SOP_SCHEDULE,
        portId: ports.pomakoId,
        berthId: dermagaB?.id ?? null,
        assigneeId: petugasDermagaB.id,
        assignmentId: assignB.id,
        priority: TaskPriority.MEDIUM,
        obligationDate: new Date(),
        dueDate: new Date(Date.now() + 6 * 3600 * 1000),
        executionStatus: TaskExecutionStatus.NOT_STARTED,
        reviewStatus: TaskReviewStatus.NOT_SUBMITTED,
        checklistItems: {
          create: DEFAULT_SOP_CHECKLISTS[TaskType.CARGO_HANDLING_CHECK].map((c) => ({
            itemOrder: c.itemOrder,
            code: c.code,
            label: c.label,
            isRequired: c.isRequired,
            isApplicable: true,
            requiresAttachment: c.requiresAttachment,
            checkedByOfficer: false,
          })),
        },
      },
    });
  }

  console.log('Hierarchy, Assignments, and Tasks seeded successfully.');
  return {
    divLaut,
    divAsdp,
    kadisUser,
    kabidLautUser,
    kepalaPelabuhanPmK,
    adminPortPmk,
    petugasDermagaA,
    petugasDermagaB,
  };
}
