/// <reference types="jest" />
import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AssignmentStatus,
  NotificationPriority,
  PortCategory,
  TaskExecutionStatus,
  TaskPriority,
  TaskReviewStatus,
  TaskSourceType,
  TaskType,
  UserRole,
  VerificationStatus,
  VesselCategory,
} from '@prisma/client';
import { AuthenticatedUser } from '../../src/common/decorators/current-user.decorator';
import { PortScopeGuard } from '../../src/common/guards/port-scope.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { AuditLogService } from '../../src/common/utils/audit-log.service';
import { CredentialGeneratorUtil } from '../../src/common/utils/credential-generator.util';
import { AssignmentsService } from '../../src/modules/assignments/assignments.service';
import { AuthService } from '../../src/modules/auth/auth.service';
import { DailyReportsService } from '../../src/modules/daily-reports/daily-reports.service';
import { MonitoringService } from '../../src/modules/monitoring/monitoring.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { evaluateTaskStateTransition } from '../../src/modules/tasks/task-state-machine';
import { TaskTriggerListener } from '../../src/modules/tasks/task-trigger.listener';
import { TasksService } from '../../src/modules/tasks/tasks.service';
import { UsersService } from '../../src/modules/users/users.service';
import { VesselsService } from '../../src/modules/vessels/vessels.service';

describe('PORTA Master Restructuring — 20+ Mandatory Scenarios (Hierarchy, Assignment, Task, Workflow & Monitoring)', () => {
  // Actor fixtures
  const superadminActor: AuthenticatedUser = {
    id: 1,
    email: 'superadmin@porta.mimikakab.go.id',
    username: 'superadmin',
    fullName: 'Superadmin PORTA',
    role: UserRole.SUPERADMIN,
    portId: null,
    divisionId: null,
    operatorId: null,
    tenantId: null,
    mustChangePassword: false,
  };

  const kadisActor: AuthenticatedUser = {
    id: 2,
    email: 'kadis@porta.mimikakab.go.id',
    username: 'kadis',
    fullName: 'Kepala Dinas Perhubungan',
    role: UserRole.KEPALA_DINAS,
    portId: null,
    divisionId: null,
    operatorId: null,
    tenantId: null,
    mustChangePassword: false,
  };

  const kabidLautActor: AuthenticatedUser = {
    id: 3,
    email: 'kabid.laut@porta.mimikakab.go.id',
    username: 'kabid.laut',
    fullName: 'Kabid Perhubungan Laut',
    role: UserRole.KEPALA_BIDANG,
    portId: null,
    divisionId: 10, // Covers Port 1 & Port 2, NOT Port 3
    operatorId: null,
    tenantId: null,
    mustChangePassword: false,
  };

  const kepalaPelabuhanPort1: AuthenticatedUser = {
    id: 4,
    email: 'kepala.pomako@porta.mimikakab.go.id',
    username: 'kepala.pomako',
    fullName: 'Kepala Pelabuhan Poumako',
    role: UserRole.KEPALA_PELABUHAN,
    portId: 1,
    divisionId: null,
    operatorId: null,
    tenantId: null,
    mustChangePassword: false,
  };

  const adminPort1: AuthenticatedUser = {
    id: 5,
    email: 'checker.pomako@porta.mimikakab.go.id',
    username: 'checker.pomako',
    fullName: 'Admin Checker Poumako',
    role: UserRole.ADMIN_PELABUHAN,
    portId: 1,
    divisionId: null,
    operatorId: null,
    tenantId: null,
    mustChangePassword: false,
  };

  const petugasDermagaA: AuthenticatedUser = {
    id: 6,
    email: 'petugas.a@porta.mimikakab.go.id',
    username: 'petugas.a',
    fullName: 'Petugas Dermaga A',
    role: UserRole.PETUGAS_PELABUHAN,
    portId: 1,
    divisionId: null,
    operatorId: null,
    tenantId: null,
    mustChangePassword: false,
  };

  const petugasDermagaB: AuthenticatedUser = {
    id: 7,
    email: 'petugas.b@porta.mimikakab.go.id',
    username: 'petugas.b',
    fullName: 'Petugas Dermaga B',
    role: UserRole.PETUGAS_PELABUHAN,
    portId: 1,
    divisionId: null,
    operatorId: null,
    tenantId: null,
    mustChangePassword: false,
  };

  // ==========================================================================
  // SCENARIO 1 & 20: Assignment & Scope Guard Enforcement (Berth A vs Berth B, Port Manipulation)
  // ==========================================================================

  it('Scenario 1: Petugas Dermaga A cannot access or process a task assigned to Dermaga B without assignment', async () => {
    const mockPrisma: any = {
      userAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 101,
            assignmentCode: 'ASG-A',
            userId: petugasDermagaA.id,
            role: UserRole.PETUGAS_PELABUHAN,
            portId: 1,
            terminalId: 1,
            berthId: 10, // Only assigned to Dermaga A (berthId = 10)
            zoneId: null,
            taskTypes: [TaskType.MANIFEST_CHECK],
            permissionCodes: ['manifest.create', 'task.execute', 'task.submit'],
            status: AssignmentStatus.ACTIVE,
          },
        ]),
      },
    };
    const assignmentsService = new AssignmentsService(mockPrisma, {} as any);

    // Allowed on Dermaga A (berthId = 10)
    await expect(
      assignmentsService.assertOfficerAssignmentScope(petugasDermagaA, {
        portId: 1,
        berthId: 10,
        taskType: TaskType.MANIFEST_CHECK,
      }),
    ).resolves.toBeUndefined();

    // Forbidden on Dermaga B (berthId = 20)
    await expect(
      assignmentsService.assertOfficerAssignmentScope(petugasDermagaA, {
        portId: 1,
        berthId: 20,
        taskType: TaskType.MANIFEST_CHECK,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('Scenario 20: Unauthorized user cannot manipulate portId or berthId in request via PortScopeGuard', async () => {
    const mockPrisma: any = {
      userAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 101,
            assignmentCode: 'ASG-A',
            userId: petugasDermagaA.id,
            role: UserRole.PETUGAS_PELABUHAN,
            portId: 1,
            terminalId: 1,
            berthId: 10,
            zoneId: null,
            taskTypes: [TaskType.MANIFEST_CHECK],
            permissionCodes: ['task.execute'],
            status: AssignmentStatus.ACTIVE,
          },
        ]),
      },
      divisionPort: {
        findMany: jest.fn().mockResolvedValue([{ portId: 1 }, { portId: 2 }]),
      },
    };

    const guard = new PortScopeGuard(mockPrisma);

    const makeCtx = (user: AuthenticatedUser, body: any = {}, query: any = {}) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ user, body, query, params: {} }),
        }),
      }) as unknown as ExecutionContext;

    // 1. Petugas at Port 1 trying to send portId = 2 in body -> 403 Forbidden
    await expect(
      guard.canActivate(makeCtx(petugasDermagaA, { portId: 2 })),
    ).rejects.toThrow(ForbiddenException);

    // 2. Petugas assigned to Berth 10 trying to send berthId = 20 in body -> 403 Forbidden
    await expect(
      guard.canActivate(makeCtx(petugasDermagaA, { portId: 1, berthId: 20 })),
    ).rejects.toThrow(ForbiddenException);

    // 3. Kepala Pelabuhan Port 1 trying to access Port 3 -> 403 Forbidden
    await expect(
      guard.canActivate(makeCtx(kepalaPelabuhanPort1, {}, { portId: 3 })),
    ).rejects.toThrow(ForbiddenException);

    // 4. Kabid Laut (ports 1 & 2) trying to access Port 3 -> 403 Forbidden
    await expect(
      guard.canActivate(makeCtx(kabidLautActor, {}, { portId: 3 })),
    ).rejects.toThrow(ForbiddenException);
  });

  // ==========================================================================
  // SCENARIO 2, 3, & SUPERADMIN SEPARATION: State Machine & Role Separation
  // ==========================================================================

  it('Scenario 2 & 3: Petugas can start & submit task, but CANNOT perform Admin review or Kepala Pelabuhan verification; SUPERADMIN is blocked from all operational workflow actions', () => {
    // Petugas can start execution
    const started = evaluateTaskStateTransition({
      action: 'START_EXECUTION',
      actorRole: UserRole.PETUGAS_PELABUHAN,
      actorId: petugasDermagaA.id,
      assigneeId: petugasDermagaA.id,
      currentExecutionStatus: TaskExecutionStatus.NOT_STARTED,
      currentReviewStatus: TaskReviewStatus.NOT_SUBMITTED,
    });
    expect(started).toEqual({
      nextExecutionStatus: TaskExecutionStatus.IN_PROGRESS,
      nextReviewStatus: TaskReviewStatus.NOT_SUBMITTED,
    });

    // Petugas can submit task
    const submitted = evaluateTaskStateTransition({
      action: 'SUBMIT_TASK',
      actorRole: UserRole.PETUGAS_PELABUHAN,
      actorId: petugasDermagaA.id,
      assigneeId: petugasDermagaA.id,
      currentExecutionStatus: TaskExecutionStatus.IN_PROGRESS,
      currentReviewStatus: TaskReviewStatus.NOT_SUBMITTED,
    });
    expect(submitted).toEqual({
      nextExecutionStatus: TaskExecutionStatus.SUBMITTED,
      nextReviewStatus: TaskReviewStatus.WAITING_ADMIN,
    });

    // Petugas CANNOT perform Admin Approve
    expect(() =>
      evaluateTaskStateTransition({
        action: 'ADMIN_APPROVE',
        actorRole: UserRole.PETUGAS_PELABUHAN,
        actorId: petugasDermagaA.id,
        currentExecutionStatus: TaskExecutionStatus.SUBMITTED,
        currentReviewStatus: TaskReviewStatus.WAITING_ADMIN,
      }),
    ).toThrow(ForbiddenException);

    // Petugas CANNOT perform Head Verify
    expect(() =>
      evaluateTaskStateTransition({
        action: 'HEAD_VERIFY',
        actorRole: UserRole.PETUGAS_PELABUHAN,
        actorId: petugasDermagaA.id,
        currentExecutionStatus: TaskExecutionStatus.SUBMITTED,
        currentReviewStatus: TaskReviewStatus.WAITING_HEAD_VERIFICATION,
      }),
    ).toThrow(ForbiddenException);

    // SUPERADMIN is strictly blocked from operational execution, admin review, and head verification
    expect(() =>
      evaluateTaskStateTransition({
        action: 'START_EXECUTION',
        actorRole: UserRole.SUPERADMIN,
        actorId: superadminActor.id,
        currentExecutionStatus: TaskExecutionStatus.NOT_STARTED,
        currentReviewStatus: TaskReviewStatus.NOT_SUBMITTED,
      }),
    ).toThrow(ForbiddenException);

    expect(() =>
      evaluateTaskStateTransition({
        action: 'ADMIN_APPROVE',
        actorRole: UserRole.SUPERADMIN,
        actorId: superadminActor.id,
        currentExecutionStatus: TaskExecutionStatus.SUBMITTED,
        currentReviewStatus: TaskReviewStatus.WAITING_ADMIN,
      }),
    ).toThrow(ForbiddenException);

    expect(() =>
      evaluateTaskStateTransition({
        action: 'HEAD_VERIFY',
        actorRole: UserRole.SUPERADMIN,
        actorId: superadminActor.id,
        currentExecutionStatus: TaskExecutionStatus.SUBMITTED,
        currentReviewStatus: TaskReviewStatus.WAITING_HEAD_VERIFICATION,
      }),
    ).toThrow(ForbiddenException);
  });

  // ==========================================================================
  // SCENARIO 4, 5, 6, 7, 8: Admin Pelabuhan (Checker) Capabilities & Guardrails
  // ==========================================================================

  it('Scenario 4, 5, 6: Admin Checker only accesses their port scope and sees not-started, unsubmitted, waiting-review, and overdue tasks', async () => {
    const sampleTasks = [
      {
        id: 1,
        portId: 1,
        executionStatus: TaskExecutionStatus.NOT_STARTED,
        reviewStatus: TaskReviewStatus.NOT_SUBMITTED,
        isOverdue: false,
      },
      {
        id: 2,
        portId: 1,
        executionStatus: TaskExecutionStatus.IN_PROGRESS,
        reviewStatus: TaskReviewStatus.NOT_SUBMITTED,
        isOverdue: true,
      },
      {
        id: 3,
        portId: 1,
        executionStatus: TaskExecutionStatus.SUBMITTED,
        reviewStatus: TaskReviewStatus.WAITING_ADMIN,
        isOverdue: false,
      },
      {
        id: 4,
        portId: 1,
        executionStatus: TaskExecutionStatus.IN_PROGRESS,
        reviewStatus: TaskReviewStatus.ADMIN_RETURNED,
        isOverdue: false,
      },
    ];

    const mockPrisma: any = {
      task: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue(sampleTasks),
        findUnique: jest.fn().mockResolvedValue({ id: 99, portId: 2 }),
      },
      user: { findMany: jest.fn().mockResolvedValue([petugasDermagaA, petugasDermagaB]) },
      userAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      dailyPortReport: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const tasksService = new TasksService(
      mockPrisma,
      { record: jest.fn() } as any,
      {} as any,
      new AssignmentsService(mockPrisma, {} as any),
      new EventEmitter2(),
    );

    const dashboard = await tasksService.getAdminCheckerDashboard({ portId: 1 });
    expect(dashboard.summary.notStartedCount).toBe(1);
    expect(dashboard.summary.unsubmittedCount).toBe(3); // NOT_STARTED + IN_PROGRESS
    expect(dashboard.summary.waitingAdminReviewCount).toBe(1);
    expect(dashboard.summary.incompleteReturnedCount).toBe(1);
    expect(dashboard.summary.overdueCount).toBe(1);

    // Scenario 4: Admin Port 1 cannot access Task from Port 2
    await expect(
      tasksService.findById(99, adminPort1, { portId: 1 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('Scenario 7 & 8: Admin CANNOT approve task with incomplete mandatory checklist, and CAN return task to Petugas for correction', async () => {
    const taskWaitingAdmin = {
      id: 10,
      taskNumber: 'TSK-10',
      taskType: TaskType.MANIFEST_CHECK,
      title: 'Pemeriksaan Manifest',
      portId: 1,
      berthId: 10,
      assigneeId: petugasDermagaA.id,
      executionStatus: TaskExecutionStatus.SUBMITTED,
      reviewStatus: TaskReviewStatus.WAITING_ADMIN,
    };

    const mockTx: any = {
      taskChecklistItem: {
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            code: 'VESSEL_DATA_AVAILABLE',
            isApplicable: true,
            isRequired: true,
            checkedByOfficer: true,
            checkedByAdmin: true,
          },
          {
            code: 'MANIFEST_DOC_AVAILABLE',
            isApplicable: true,
            isRequired: true,
            checkedByOfficer: true,
            checkedByAdmin: false, // NOT checked by Admin!
          },
        ]),
      },
      task: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...taskWaitingAdmin,
          executionStatus: TaskExecutionStatus.IN_PROGRESS,
          reviewStatus: TaskReviewStatus.ADMIN_RETURNED,
        }),
      },
      taskSubmission: { findFirst: jest.fn().mockResolvedValue({ id: 1, submissionNumber: 1 }) },
      taskReview: { create: jest.fn() },
      taskHistory: { create: jest.fn() },
    };

    const mockPrisma: any = {
      task: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(taskWaitingAdmin),
      },
      $transaction: jest.fn(async (cb) => cb(mockTx)),
    };

    const tasksService = new TasksService(
      mockPrisma,
      { record: jest.fn() } as any,
      {} as any,
      new AssignmentsService(mockPrisma, {} as any),
      new EventEmitter2(),
    );

    // Scenario 7: Reject Admin approval when mandatory checklist item is not verified by Admin
    await expect(
      tasksService.adminApproveAndForward(10, { notes: 'Lanjut' }, adminPort1, { portId: 1 }),
    ).rejects.toThrow(BadRequestException);

    // Scenario 8: Admin can return task to Petugas -> transitions to IN_PROGRESS / ADMIN_RETURNED
    const returned = await tasksService.adminReturnTask(
      10,
      { reason: 'Lampiran dokumen manifest belum terbaca jelas' },
      adminPort1,
      { portId: 1 },
    );
    expect(returned.executionStatus).toBe(TaskExecutionStatus.IN_PROGRESS);
    expect(returned.reviewStatus).toBe(TaskReviewStatus.ADMIN_RETURNED);
  });

  // ==========================================================================
  // SCENARIO 9, 10, & 17: Kepala Pelabuhan Verification, Port Isolation & Concurrent Locking
  // ==========================================================================

  it('Scenario 9, 10 & 17: Kepala Pelabuhan verifies Admin-approved task, is blocked from other ports, and concurrent approval requests throw ConflictException', async () => {
    const taskWaitingHead = {
      id: 20,
      taskNumber: 'TSK-20',
      taskType: TaskType.MANIFEST_CHECK,
      title: 'Pemeriksaan Manifest KM Sabuk Nusantara',
      portId: 1,
      berthId: 10,
      assigneeId: petugasDermagaA.id,
      executionStatus: TaskExecutionStatus.SUBMITTED,
      reviewStatus: TaskReviewStatus.WAITING_HEAD_VERIFICATION,
    };

    let updateManyCallCount = 0;
    const mockTx: any = {
      task: {
        updateMany: jest.fn().mockImplementation(async () => {
          updateManyCallCount += 1;
          // First request succeeds (count = 1), concurrent second request sees 0 rows matching
          return { count: updateManyCallCount === 1 ? 1 : 0 };
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...taskWaitingHead,
          executionStatus: TaskExecutionStatus.COMPLETED,
          reviewStatus: TaskReviewStatus.HEAD_VERIFIED,
        }),
      },
      taskSubmission: { findFirst: jest.fn().mockResolvedValue({ id: 2, submissionNumber: 1 }) },
      taskReview: { create: jest.fn() },
      taskHistory: { create: jest.fn() },
    };

    const mockPrisma: any = {
      task: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.id === 999) return { ...taskWaitingHead, id: 999, portId: 2 };
          return taskWaitingHead;
        }),
      },
      $transaction: jest.fn(async (cb) => cb(mockTx)),
    };

    const auditRecordMock = jest.fn();
    const tasksService = new TasksService(
      mockPrisma,
      { record: auditRecordMock } as any,
      {} as any,
      new AssignmentsService(mockPrisma, {} as any),
      new EventEmitter2(),
    );

    // Scenario 9: First verification succeeds -> COMPLETED & HEAD_VERIFIED
    const verified = await tasksService.headVerifyTask(
      20,
      { notes: 'Diverifikasi Kepala Pelabuhan' },
      kepalaPelabuhanPort1,
      { portId: 1 },
    );
    expect(verified.executionStatus).toBe(TaskExecutionStatus.COMPLETED);
    expect(verified.reviewStatus).toBe(TaskReviewStatus.HEAD_VERIFIED);
    expect(auditRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TASK_HEAD_VERIFIED',
        actorId: kepalaPelabuhanPort1.id,
      }),
    );

    // Scenario 17: Concurrent second verification request on same task fails with ConflictException
    await expect(
      tasksService.headVerifyTask(
        20,
        { notes: 'Double click concurrent request' },
        kepalaPelabuhanPort1,
        { portId: 1 },
      ),
    ).rejects.toThrow(ConflictException);

    // Scenario 10: Kepala Pelabuhan Port 1 cannot verify/access task in Port 2
    await expect(
      tasksService.findById(999, kepalaPelabuhanPort1, { portId: 1 }),
    ).rejects.toThrow(ForbiddenException);
  });

  // ==========================================================================
  // SCENARIO 11 & 12: Kabid Scoped Monitoring & Kadis Agency-Wide Monitoring
  // ==========================================================================

  it('Scenario 11 & 12: Kabid can only monitor/drill-down ports in their division scope, while Kadis views agency-wide aggregation', async () => {
    const mockPrisma: any = {
      division: {
        findUnique: jest.fn().mockResolvedValue({
          id: 10,
          code: 'BID-LAUT',
          name: 'Bidang Perhubungan Laut',
          description: 'Ports 1 & 2',
          divisionPorts: [{ portId: 1 }, { portId: 2 }],
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 10,
            code: 'BID-LAUT',
            name: 'Bidang Perhubungan Laut',
            divisionPorts: [{ portId: 1 }, { portId: 2 }],
            users: [{ id: 3, fullName: 'Kabid Laut', email: 'kabid@porta.id' }],
          },
        ]),
      },
      divisionPort: {
        findMany: jest.fn().mockResolvedValue([{ portId: 1 }, { portId: 2 }]),
      },
      port: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            code: 'PMK',
            name: 'Pelabuhan Umum Poumako',
            portCategory: PortCategory.CAMPURAN,
            portClassification: 'PENGUMPUL',
            terminals: [],
            berths: [{ id: 10, operationalStatus: 'OPEN' }],
          },
        ]),
      },
      shipVisit: { findMany: jest.fn().mockResolvedValue([]) },
      task: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      vesselManifest: { findMany: jest.fn().mockResolvedValue([]) },
      cargoHandlingRecord: { findMany: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      gateWardenHandover: { findMany: jest.fn().mockResolvedValue([]) },
      assetLeasePayment: { findMany: jest.fn().mockResolvedValue([]) },
      dailyPortReport: { findMany: jest.fn().mockResolvedValue([]) },
      maintenanceTicket: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const monitoringService = new MonitoringService(mockPrisma, {
      syncOverdueTasks: jest.fn(),
    } as any);

    // Scenario 11a: Kabid Laut gets division aggregation for ports [1, 2]
    const kabidSummary = await monitoringService.getKabidMonitoring(kabidLautActor, {
      divisionId: 10,
      allowedPortIds: [1, 2],
    });
    expect(kabidSummary.division.code).toBe('BID-LAUT');

    // Scenario 11b: Kabid Laut drill-down to Port 3 (outside division) -> 403 Forbidden
    await expect(
      monitoringService.getKabidDrilldown(
        kabidLautActor,
        { divisionId: 10, allowedPortIds: [1, 2] },
        { portId: 3 },
      ),
    ).rejects.toThrow(ForbiddenException);

    // Scenario 12: Kadis gets agency-wide overview across all divisions and ports
    const kadisOverview = await monitoringService.getKadisMonitoring(kadisActor);
    expect(kadisOverview.agencyOverview).toBeDefined();
    expect(kadisOverview.divisionPerformance.length).toBe(1);
    expect(kadisOverview.portPerformance.length).toBe(1);
  });

  // ==========================================================================
  // SCENARIO 13 & 14: Automatic Task Generation + Dynamic Vessel Checklist + Overdue Detection
  // ==========================================================================

  it('Scenario 13 & 14: Automatic task creation on visit trigger adapts checklist to vesselCategory (BARANG vs PENUMPANG) and detects overdue tasks', async () => {
    let createdTaskPayload: any = null;
    const mockPrisma: any = {
      port: { findUnique: jest.fn().mockResolvedValue({ id: 1, isActive: true }) },
      shipVisit: {
        findUnique: jest.fn().mockResolvedValue({
          id: 50,
          portId: 1,
          vessel: { vesselCategory: VesselCategory.BARANG },
        }),
      },
      task: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          createdTaskPayload = data;
          return { id: 500, ...data };
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      userAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      taskTemplate: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };

    const tasksService = new TasksService(
      mockPrisma,
      { record: jest.fn() } as any,
      {} as any,
      new AssignmentsService(mockPrisma, {} as any),
      new EventEmitter2(),
    );

    const triggerListener = new TaskTriggerListener(tasksService, mockPrisma);

    // Trigger visit event for a BARANG vessel with past dueDate to also test overdue detection
    const pastEta = new Date(Date.now() - 10 * 3600 * 1000);
    await triggerListener.handleVisitScheduledOrApproved({
      visitId: 50,
      visitNumber: 'VST-50',
      portId: 1,
      vesselId: 7,
      vesselName: 'KM Logistik Papua (Barang)',
      vesselCategory: VesselCategory.BARANG,
      eta: pastEta,
      etd: new Date(Date.now() + 12 * 3600 * 1000),
      actorId: petugasDermagaA.id,
    });

    expect(mockPrisma.task.create).toHaveBeenCalled();
    // Verify that for a BARANG ship, PASSENGER_COUNT_RECORDED in MANIFEST_CHECK has isApplicable = false and isRequired = false!
    const createCalls = mockPrisma.task.create.mock.calls.map((c: any) => c[0].data);
    const manifestCall = createCalls.find((d: any) => d.taskType === TaskType.MANIFEST_CHECK);
    expect(manifestCall).toBeDefined();
    const passengerChecklist = manifestCall.checklistItems.create.find(
      (i: any) => i.code === 'PASSENGER_COUNT_RECORDED',
    );
    const cargoChecklist = manifestCall.checklistItems.create.find(
      (i: any) => i.code === 'CARGO_VOLUME_RECORDED',
    );
    expect(passengerChecklist.isApplicable).toBe(false);
    expect(passengerChecklist.isRequired).toBe(false);
    expect(cargoChecklist.isApplicable).toBe(true);
    expect(cargoChecklist.isRequired).toBe(true);

    // Scenario 14: Overdue detection sets isOverdue = true and executionStatus = OVERDUE when dueDate < now
    expect(manifestCall.isOverdue).toBe(true);
    expect(manifestCall.executionStatus).toBe(TaskExecutionStatus.OVERDUE);
  });

  // ==========================================================================
  // SCENARIO 15: Daily Report & Obligation Engine
  // ==========================================================================

  it('Scenario 15: Daily obligation recap includes unstarted & unsubmitted obligations and classifies all 7 states accurately', async () => {
    const mockPrisma: any = {
      shipVisit: { findMany: jest.fn().mockResolvedValue([]) },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: petugasDermagaA.id,
            fullName: petugasDermagaA.fullName,
            email: petugasDermagaA.email,
            role: UserRole.PETUGAS_PELABUHAN,
            portId: 1,
            port: { id: 1, code: 'PMK', name: 'Poumako' },
            assignments: [],
          },
        ]),
      },
      task: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            taskNumber: 'TSK-1',
            taskType: TaskType.MANIFEST_CHECK,
            title: 'Task Belum Dikerjakan',
            assigneeId: petugasDermagaA.id,
            executionStatus: TaskExecutionStatus.NOT_STARTED,
            reviewStatus: TaskReviewStatus.NOT_SUBMITTED,
            isOverdue: false,
            hasIssue: false,
            dueDate: new Date(),
          },
          {
            id: 2,
            taskNumber: 'TSK-2',
            taskType: TaskType.BERTHING_INSPECTION,
            title: 'Task Sudah Diverifikasi',
            assigneeId: petugasDermagaA.id,
            executionStatus: TaskExecutionStatus.COMPLETED,
            reviewStatus: TaskReviewStatus.HEAD_VERIFIED,
            isOverdue: false,
            hasIssue: false,
            dueDate: new Date(),
          },
        ]),
      },
    };

    const dailyReportsService = new DailyReportsService(
      mockPrisma,
      { record: jest.fn() } as any,
      {
        createTask: jest.fn(),
        syncOverdueTasks: jest.fn(),
      } as any,
    );

    const recap = await dailyReportsService.getDailyObligationRecap(
      { portId: 1 },
      adminPort1,
      { portId: 1 },
    );

    expect(recap.portTotals.totalObligated).toBe(2);
    expect(recap.portTotals.notStarted).toBe(1);
    expect(recap.portTotals.unsubmitted).toBe(1);
    expect(recap.portTotals.headVerified).toBe(1);
    expect(recap.officerRecaps[0].tasks[0].obligationState).toBe('OBLIGATION_NOT_STARTED');
    expect(recap.officerRecaps[0].tasks[1].obligationState).toBe('HEAD_VERIFIED');
  });

  // ==========================================================================
  // SCENARIO 16, 18, 19: Audit Log Sanitization, Registered Company -> Fleet Hierarchy, & Smart Notifications
  // ==========================================================================

  it('Scenario 16: AuditLogService strips sensitive fields (password, passwordHash, accessToken) and records actorRole & portId', async () => {
    const createMock = jest.fn().mockResolvedValue({ id: 1 });
    const auditService = new AuditLogService({
      auditLog: { create: createMock },
    } as any);

    await auditService.record({
      actorId: superadminActor.id,
      actorRole: superadminActor.role,
      portId: 1,
      action: 'USER_CREATED',
      entityName: 'users',
      entityId: 99,
      afterData: {
        id: 99,
        email: 'test@porta.id',
        password: 'SecretPassword123!',
        passwordHash: '$2a$10$hash',
        accessToken: 'jwt-secret-token',
        portId: 1,
      },
    });

    const recordedData = createMock.mock.calls[0][0].data;
    expect(recordedData.actorRole).toBe(UserRole.SUPERADMIN);
    expect(recordedData.portId).toBe(1);
    expect(recordedData.afterData.password).toBeUndefined();
    expect(recordedData.afterData.passwordHash).toBeUndefined();
    expect(recordedData.afterData.accessToken).toBeUndefined();
    expect(recordedData.afterData.email).toBe('test@porta.id');
  });

  it('Scenario 18: Registered Shipping Company (ShipOperator) acts as Parent Aggregate returning its fleet of vessels and fleetSummary', async () => {
    const mockPrisma: any = {
      shipOperator: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            name: 'PT Pelayaran Nasional Indonesia (PELNI)',
            verificationStatus: VerificationStatus.VERIFIED,
            documents: [],
            vessels: [
              { id: 10, name: 'KM Tatamailau', verificationStatus: VerificationStatus.VERIFIED },
              { id: 11, name: 'KM Sirimau', verificationStatus: VerificationStatus.PENDING },
            ],
          },
        ]),
      },
    };

    const vesselsService = new VesselsService(
      mockPrisma,
      {} as any,
      { record: jest.fn() } as any,
      new EventEmitter2(),
    );

    const companies = await vesselsService.findOperators({});
    expect(companies[0].vessels.length).toBe(2);
    expect(companies[0].fleetSummary).toEqual({
      totalVessels: 2,
      verifiedVesselsCount: 1,
      pendingVesselsCount: 1,
    });
  });

  it('Scenario 19: NotificationsService dispatches priority notifications to responsible recipients and prevents duplicate spam via dedupKey', async () => {
    const existingNotifications = new Map<string, any>();
    const mockPrisma: any = {
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      notification: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return existingNotifications.get(where.dedupKey) ?? null;
        }),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const rec = { id: existingNotifications.size + 1, ...data };
          if (data.dedupKey) existingNotifications.set(data.dedupKey, rec);
          return rec;
        }),
      },
    };

    const notificationsService = new NotificationsService(mockPrisma);

    const first = await notificationsService.dispatchNotification({
      userId: petugasDermagaA.id,
      portId: 1,
      title: 'Pekerjaan Terlambat',
      message: 'Segera selesaikan task manifest',
      type: 'TASK_OVERDUE',
      priority: NotificationPriority.URGENT,
      dedupKey: 'OVERDUE_TASK_1_USER_6_2026-11-18',
    });

    const duplicateSecond = await notificationsService.dispatchNotification({
      userId: petugasDermagaA.id,
      portId: 1,
      title: 'Pekerjaan Terlambat',
      message: 'Segera selesaikan task manifest',
      type: 'TASK_OVERDUE',
      priority: NotificationPriority.URGENT,
      dedupKey: 'OVERDUE_TASK_1_USER_6_2026-11-18',
    });

    expect(first?.id).toBe(1);
    expect(duplicateSecond?.id).toBe(1);
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // SCENARIO 20–23: Specialized Officer Roles, Anti-Bypass, Contract Quota & Multi-Stage PKS
  // ==========================================================================

  it('Scenario 20: Anti-Bypass — OPERATOR_KAPAL editing technical/tariff fields on a VERIFIED vessel automatically resets verificationStatus to PENDING and triggers reverification event', async () => {
    const eventEmitter = new EventEmitter2();
    const emitSpy = jest.spyOn(eventEmitter, 'emit');

    const mockPrisma: any = {
      vessel: {
        findUnique: jest.fn().mockResolvedValue({
          id: 77,
          operatorId: 10,
          name: 'KM Papua Mandiri',
          registrationNumber: 'REG-PM-77',
          grossTonnage: 800,
          lengthMeters: 65,
          draftMeters: 4.5,
          shipType: 'NIAGA',
          vesselCategory: VesselCategory.BARANG,
          shippingCategory: 'DALAM_NEGERI',
          verificationStatus: VerificationStatus.VERIFIED,
        }),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 77,
          operatorId: 10,
          name: 'KM Papua Mandiri',
          ...data,
        })),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };

    const vesselsService = new VesselsService(
      mockPrisma,
      {} as any,
      { record: jest.fn() } as any,
      eventEmitter,
    );

    const operatorActor: AuthenticatedUser = {
      id: 201,
      email: 'ops@papua-shipping.co.id',
      username: 'ops.papua',
      fullName: 'Operator Pelayaran',
      role: UserRole.OPERATOR_KAPAL,
      portId: null,
      operatorId: 10,
      tenantId: null,
      mustChangePassword: false,
    };

    const updated = await vesselsService.updateVessel(
      77,
      { grossTonnage: 350 },
      operatorActor,
      { operatorId: 10 },
    );

    expect(updated.verificationStatus).toBe(VerificationStatus.PENDING);
    expect(updated.verifiedAt).toBeNull();
    expect(updated.verifiedById).toBeNull();
    expect(emitSpy).toHaveBeenCalledWith(
      'vessel.reverification_required',
      expect.objectContaining({
        vesselId: 77,
        changedFields: ['grossTonnage'],
      }),
    );
  });

  it('Scenario 21: Multi-Stage OperatorBerthingContract — PETUGAS_REGISTRASI_KONTRAK reviews prerequisites (PENDING_HEAD_OF_PORT) and KEPALA_PELABUHAN grants final ACC (ACTIVE)', async () => {
    let contractState: any = {
      id: 300,
      contractNumber: 'PKS-SDR-2026-001',
      title: 'PKS Sandar Armada Rutin 2026',
      operatorId: 10,
      portId: 1,
      status: 'PENDING_VERIFICATION',
    };

    const mockPrisma: any = {
      operatorBerthingContract: {
        findUnique: jest.fn().mockImplementation(async () => contractState),
        update: jest.fn().mockImplementation(async ({ data }: any) => {
          contractState = { ...contractState, ...data };
          return contractState;
        }),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };

    const mockStorage: any = {
      saveFile: jest.fn(async () => 'uploads/contracts/berthing/10/signed/pks-ttd-basah.pdf'),
    };

    const vesselsService = new VesselsService(
      mockPrisma,
      mockStorage,
      { record: jest.fn() } as any,
      new EventEmitter2(),
    );

    const petugasRegActor: AuthenticatedUser = {
      id: 301,
      email: 'petugas.registrasi@porta.mimikakab.go.id',
      username: 'petugas.registrasi',
      fullName: 'Agustina Yoku (Petugas Registrasi & Kontrak)',
      role: UserRole.PETUGAS_REGISTRASI_KONTRAK,
      portId: 1,
      operatorId: null,
      tenantId: null,
      mustChangePassword: false,
    };

    const operatorActor: AuthenticatedUser = {
      id: 401,
      email: 'operator@mimikashipping.co.id',
      username: 'mimika.shipping',
      fullName: 'Operator PT Mimika Shipping',
      role: UserRole.OPERATOR_KAPAL,
      portId: 1,
      operatorId: 10,
      tenantId: null,
      mustChangePassword: false,
    };

    const reviewed = await vesselsService.reviewContractByOfficer(
      300,
      { decision: 'APPROVE', notes: 'SIUPAL dan daftar armada lengkap.' },
      petugasRegActor,
      { portId: 1 },
    );
    expect(reviewed.status).toBe('WAITING_OPERATOR_SIGNATURE');
    expect(reviewed.reviewedByOfficerId).toBe(petugasRegActor.id);
    expect(reviewed.draftContractGeneratedAt).toBeTruthy();

    const uploaded = await vesselsService.uploadSignedContract(
      300,
      { originalname: 'pks-ttd-basah.pdf', buffer: Buffer.from('pdf') } as any,
      operatorActor,
      { operatorId: 10, portId: 1 },
    );
    expect(uploaded.status).toBe('PENDING_HEAD_OF_PORT');
    expect(uploaded.signedFilePath).toBe('uploads/contracts/berthing/10/signed/pks-ttd-basah.pdf');

    const verified = await vesselsService.verifyContract(
      300,
      { status: 'ACTIVE' as any, signatureData: 'data:image/png;base64,iVBORw0KGgo=' },
      kepalaPelabuhanPort1,
      { portId: 1 },
    );
    expect(verified.status).toBe('ACTIVE');
    expect(verified.verifiedById).toBe(kepalaPelabuhanPort1.id);
    expect(verified.headSignatureHash).toBeTruthy();
  });

  it('Scenario 22: Smart Task Routing assigns automatic tasks to the exact specialized officer role (PETUGAS_REGISTRASI_KONTRAK, PETUGAS_DERMAGA_BARANG, PETUGAS_DERMAGA_PENUMPANG, PETUGAS_RUANGAN, PETUGAS_TAGIHAN)', async () => {
    const assignments = [
      {
        id: 1,
        userId: 101,
        role: UserRole.PETUGAS_REGISTRASI_KONTRAK,
        portId: 1,
        berthId: null,
        terminalId: null,
        zoneId: null,
        taskTypes: [TaskType.COMPANY_REGISTRATION_CHECK, TaskType.DOCUMENT_VERIFICATION],
      },
      {
        id: 2,
        userId: 102,
        role: UserRole.PETUGAS_DERMAGA_BARANG,
        portId: 1,
        berthId: null,
        terminalId: null,
        zoneId: null,
        taskTypes: [TaskType.VESSEL_ARRIVAL_CHECK, TaskType.CARGO_HANDLING_CHECK],
      },
      {
        id: 3,
        userId: 103,
        role: UserRole.PETUGAS_DERMAGA_PENUMPANG,
        portId: 1,
        berthId: null,
        terminalId: null,
        zoneId: null,
        taskTypes: [TaskType.VESSEL_ARRIVAL_CHECK, TaskType.PASSENGER_SERVICE],
      },
      {
        id: 4,
        userId: 104,
        role: UserRole.PETUGAS_RUANGAN,
        portId: 1,
        berthId: null,
        terminalId: null,
        zoneId: null,
        taskTypes: [TaskType.MAINTENANCE_HANDLING, TaskType.ASSET_MANAGEMENT_CHECK],
      },
      {
        id: 5,
        userId: 105,
        role: UserRole.PETUGAS_TAGIHAN,
        portId: 1,
        berthId: null,
        terminalId: null,
        zoneId: null,
        taskTypes: [TaskType.RETRIBUTION_COLLECTION],
      },
    ];

    const mockPrisma: any = {
      port: { findUnique: jest.fn().mockResolvedValue({ id: 1, isActive: true }) },
      shipVisit: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => ({
          id: where.id,
          portId: 1,
          vessel: {
            vesselCategory: where.id === 1 ? VesselCategory.BARANG : VesselCategory.PENUMPANG,
          },
        })),
      },
      userAssignment: { findMany: jest.fn().mockResolvedValue(assignments) },
      taskTemplate: { findUnique: jest.fn().mockResolvedValue(null) },
      task: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 900, ...data })),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };

    const tasksService = new TasksService(
      mockPrisma,
      { record: jest.fn() } as any,
      {} as any,
      new AssignmentsService(mockPrisma, {} as any),
      new EventEmitter2(),
    );

    const dueDate = new Date(Date.now() + 3600 * 1000).toISOString();

    const docTask = await tasksService.createTask({
      portId: 1,
      taskType: TaskType.DOCUMENT_VERIFICATION,
      title: 'Cek Dokumen SIUPAL',
      description: 'Pemeriksaan dokumen legalitas perusahaan',
      dueDate,
    });
    expect(docTask.assigneeId).toBe(101); // PETUGAS_REGISTRASI_KONTRAK

    const cargoVisitTask = await tasksService.createTask({
      portId: 1,
      visitId: 1, // BARANG vessel
      taskType: TaskType.VESSEL_ARRIVAL_CHECK,
      title: 'Kedatangan Kapal Barang',
      description: 'Pemeriksaan kedatangan kapal barang',
      dueDate,
    });
    expect(cargoVisitTask.assigneeId).toBe(102); // PETUGAS_DERMAGA_BARANG

    const passengerVisitTask = await tasksService.createTask({
      portId: 1,
      visitId: 2, // PENUMPANG vessel
      taskType: TaskType.VESSEL_ARRIVAL_CHECK,
      title: 'Kedatangan Kapal Penumpang',
      description: 'Pemeriksaan kedatangan kapal penumpang',
      dueDate,
    });
    expect(passengerVisitTask.assigneeId).toBe(103); // PETUGAS_DERMAGA_PENUMPANG

    const maintTask = await tasksService.createTask({
      portId: 1,
      taskType: TaskType.MAINTENANCE_HANDLING,
      title: 'Perbaikan Kios Terminal',
      description: 'Penanganan tiket pemeliharaan kios',
      dueDate,
    });
    expect(maintTask.assigneeId).toBe(104); // PETUGAS_RUANGAN

    const billingTask = await tasksService.createTask({
      portId: 1,
      taskType: TaskType.RETRIBUTION_COLLECTION,
      title: 'Penagihan SKRD',
      description: 'Penagihan retribusi SKRD kunjungan kapal',
      dueDate,
    });
    expect(billingTask.assigneeId).toBe(105); // PETUGAS_TAGIHAN
  });

  it('Scenario 23: End-to-End Event Triggers for AssetLease (ASSET_LEASE_REQUESTED_EVENT -> PETUGAS_RUANGAN) and Invoice (INVOICE_ISSUED_EVENT -> PETUGAS_TAGIHAN) plus BENDAHARA task execution state machine', async () => {
    const createTaskSpy = jest.fn().mockResolvedValue({ id: 999 });
    const triggerListener = new TaskTriggerListener(
      { createTask: createTaskSpy } as any,
      {} as any,
    );

    await triggerListener.handleAssetLeaseRequested({
      leaseId: 40,
      contractNumber: 'REQ-SWA-01',
      portId: 1,
      assetId: 5,
      assetName: 'Gudang Lini I Poumako',
      tenantName: 'PT Logistik Timika',
      actorId: 210,
    });

    expect(createTaskSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: TaskType.ASSET_MANAGEMENT_CHECK,
        sourceType: TaskSourceType.ASSET_LEASE,
        sourceId: '40',
        portId: 1,
      }),
    );

    await triggerListener.handleInvoiceIssued({
      invoiceId: 88,
      invoiceNumber: 'SKRD-PMK-088',
      portId: 1,
      visitId: 12,
      operatorId: 10,
      totalAmountIdr: 15_500_000,
      dueDate: new Date(Date.now() + 7 * 86400 * 1000),
      actorId: 105,
    });

    expect(createTaskSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: TaskType.RETRIBUTION_COLLECTION,
        sourceType: TaskSourceType.BILLING_INVOICE,
        sourceId: '88',
        portId: 1,
      }),
    );

    // Verify BENDAHARA can start and submit RETRIBUTION_COLLECTION tasks in the state machine
    const startTransition = evaluateTaskStateTransition({
      action: 'START_EXECUTION',
      actorRole: UserRole.BENDAHARA,
      actorId: 106,
      assigneeId: 106,
      currentExecutionStatus: TaskExecutionStatus.NOT_STARTED,
      currentReviewStatus: TaskReviewStatus.NOT_SUBMITTED,
    });
    expect(startTransition.nextExecutionStatus).toBe(TaskExecutionStatus.IN_PROGRESS);

    const submitTransition = evaluateTaskStateTransition({
      action: 'SUBMIT_TASK',
      actorRole: UserRole.BENDAHARA,
      actorId: 106,
      assigneeId: 106,
      currentExecutionStatus: TaskExecutionStatus.IN_PROGRESS,
      currentReviewStatus: TaskReviewStatus.NOT_SUBMITTED,
    });
    expect(submitTransition.nextExecutionStatus).toBe(TaskExecutionStatus.SUBMITTED);
    expect(submitTransition.nextReviewStatus).toBe(TaskReviewStatus.WAITING_ADMIN);
  });

  // ==========================================================================
  // SCENARIO 24–28: Auto-Provisioned Credentials, First-Login Guard, Reset Password & Dynamic RBAC
  // ==========================================================================

  it('Scenario 24: SUPERADMIN creates a new officer without username or password -> auto-generates unique username, strong temporaryPassword, active UserAssignment, and returns one-time copyable generatedCredentials while stripping plain password from AuditLog', async () => {
    let createdAssignment: any = null;
    const auditRecordMock = jest.fn();

    const mockPrisma: any = {
      port: { findUnique: jest.fn().mockResolvedValue({ id: 1, isActive: true }) },
      user: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.email) return null;
          if (where.username === 'barnabas.kapiyau') return { id: 9 }; // simulate first slug collision
          if (where.username === 'barnabas.kapiyau.2') return null;
          if (where.id === 501) {
            return {
              id: 501,
              email: 'barnabas.baru@porta.mimikakab.go.id',
              username: 'barnabas.kapiyau.2',
              fullName: 'Barnabas Kapiyau',
              role: UserRole.PETUGAS_DERMAGA_BARANG,
              portId: 1,
              divisionId: null,
              operatorId: null,
              tenantId: null,
              isActive: true,
              mustChangePassword: true,
              assignments: createdAssignment ? [createdAssignment] : [],
            };
          }
          return null;
        }),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 501,
          ...data,
          isActive: true,
        })),
      },
      userAssignment: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          createdAssignment = { id: 801, ...data };
          return createdAssignment;
        }),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };

    const usersService = new UsersService(mockPrisma, {
      record: auditRecordMock,
    } as any);

    const result = await usersService.createUser(
      {
        email: 'barnabas.baru@porta.mimikakab.go.id',
        fullName: 'Barnabas Kapiyau',
        role: UserRole.PETUGAS_DERMAGA_BARANG,
        portId: 1,
      },
      superadminActor,
    );

    expect(result.generatedCredentials).toBeDefined();
    expect(result.generatedCredentials.username).toBe('barnabas.kapiyau.2');
    expect(result.generatedCredentials.isUsernameAutoGenerated).toBe(true);
    expect(result.generatedCredentials.isPasswordAutoGenerated).toBe(true);
    expect(result.generatedCredentials.temporaryPassword).toMatch(/^Prt-/);
    expect(result.generatedCredentials.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    expect(result.generatedCredentials.mustChangePassword).toBe(true);
    expect(createdAssignment).not.toBeNull();
    expect(createdAssignment.role).toBe(UserRole.PETUGAS_DERMAGA_BARANG);
    expect(createdAssignment.taskTypes).toContain(TaskType.CARGO_HANDLING_CHECK);
  });

  it('Scenario 25: RolesGuard blocks any user with mustChangePassword=true from operational endpoints with 403 PASSWORD_CHANGE_REQUIRED, but allows @AllowWhenMustChangePassword endpoints (/auth/me/password)', () => {
    const firstLoginUser: AuthenticatedUser = {
      id: 501,
      email: 'barnabas.baru@porta.mimikakab.go.id',
      username: 'barnabas.kapiyau.2',
      fullName: 'Barnabas Kapiyau',
      role: UserRole.PETUGAS_DERMAGA_BARANG,
      portId: 1,
      operatorId: null,
      tenantId: null,
      mustChangePassword: true,
    };

    const operationalReflector: any = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === 'roles') return [UserRole.PETUGAS_DERMAGA_BARANG];
        if (key === 'allow_when_must_change_password') return false;
        return undefined;
      }),
    };

    const guardOperational = new RolesGuard(operationalReflector);
    const mockCtx: ExecutionContext = {
      getHandler: () => ({} as any),
      getClass: () => ({} as any),
      switchToHttp: () => ({
        getRequest: () => ({ user: firstLoginUser }),
      }),
    } as any;

    expect(() => guardOperational.canActivate(mockCtx)).toThrow(ForbiddenException);

    const passwordChangeReflector: any = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === 'allow_when_must_change_password') return true;
        return undefined;
      }),
    };
    const guardPasswordEndpoint = new RolesGuard(passwordChangeReflector);
    expect(guardPasswordEndpoint.canActivate(mockCtx)).toBe(true);
  });

  it('Scenario 26: AuthService.changeMyPassword rejects reusing the same temporary password and clears mustChangePassword=false upon setting a new distinct password', async () => {
    const tempPass = CredentialGeneratorUtil.generateTemporaryPassword();
    const bcrypt = await import('bcryptjs');
    const tempHash = await bcrypt.hash(tempPass, 10);

    const mockPrisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 501,
          email: 'barnabas.baru@porta.mimikakab.go.id',
          username: 'barnabas.kapiyau.2',
          fullName: 'Barnabas Kapiyau',
          role: UserRole.PETUGAS_DERMAGA_BARANG,
          portId: 1,
          operatorId: null,
          tenantId: null,
          isActive: true,
          mustChangePassword: true,
          passwordHash: tempHash,
        }),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 501,
          email: 'barnabas.baru@porta.mimikakab.go.id',
          username: 'barnabas.kapiyau.2',
          fullName: 'Barnabas Kapiyau',
          role: UserRole.PETUGAS_DERMAGA_BARANG,
          portId: 1,
          operatorId: null,
          tenantId: null,
          isActive: true,
          ...data,
        })),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };

    const authService = new AuthService(
      mockPrisma,
      { signAsync: jest.fn().mockResolvedValue('new-jwt-token') } as any,
      { record: jest.fn() } as any,
      new EventEmitter2(),
    );

    const actor: AuthenticatedUser = {
      id: 501,
      email: 'barnabas.baru@porta.mimikakab.go.id',
      username: 'barnabas.kapiyau.2',
      fullName: 'Barnabas Kapiyau',
      role: UserRole.PETUGAS_DERMAGA_BARANG,
      portId: 1,
      operatorId: null,
      tenantId: null,
      mustChangePassword: true,
    };

    // Reusing the temporary password must fail
    await expect(
      authService.changeMyPassword(actor, {
        currentPassword: tempPass,
        newPassword: tempPass,
      }),
    ).rejects.toThrow(BadRequestException);

    // Changing to a new password succeeds and unlocks the account
    const changed = await authService.changeMyPassword(actor, {
      currentPassword: tempPass,
      newPassword: 'SandiBaruSaya2026!',
    });

    expect(changed.requirePasswordChange).toBe(false);
    expect(changed.user.mustChangePassword).toBe(false);
    expect(changed.accessToken).toBe('new-jwt-token');
  });

  it('Scenario 27 & 28: Forgot-Password Admin Reset auto-generates a new temporary password with mustChangePassword=true, and SUPERADMIN manages RBAC RolePermission matrix dynamically', async () => {
    const mockPrisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 501,
          email: 'barnabas.baru@porta.mimikakab.go.id',
          username: 'barnabas.kapiyau.2',
          fullName: 'Barnabas Kapiyau',
          role: UserRole.PETUGAS_DERMAGA_BARANG,
          portId: 1,
          isActive: true,
          mustChangePassword: false,
        }),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 501,
          email: 'barnabas.baru@porta.mimikakab.go.id',
          username: 'barnabas.kapiyau.2',
          fullName: 'Barnabas Kapiyau',
          role: UserRole.PETUGAS_DERMAGA_BARANG,
          portId: 1,
          isActive: true,
          ...data,
        })),
        groupBy: jest.fn().mockResolvedValue([
          { role: UserRole.PETUGAS_DERMAGA_BARANG, _count: { _all: 2 } },
        ]),
      },
      permission: {
        upsert: jest.fn().mockImplementation(async ({ where }: any) => ({
          id: 99,
          code: where.code,
        })),
      },
      rolePermission: {
        findMany: jest.fn().mockResolvedValue([
          {
            role: UserRole.PETUGAS_DERMAGA_BARANG,
            permission: { code: 'berth:cargo:operate' },
          },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };

    const usersService = new UsersService(mockPrisma, {
      record: jest.fn(),
    } as any);

    // Scenario 27: Admin resets forgotten password without providing newPassword
    const resetResult = await usersService.resetPassword(501, {}, adminPort1, {
      portId: 1,
    });
    expect(resetResult.generatedCredentials.isPasswordAutoGenerated).toBe(true);
    expect(resetResult.generatedCredentials.temporaryPassword).toMatch(/^Prt-/);
    expect(resetResult.generatedCredentials.mustChangePassword).toBe(true);

    // Scenario 28: SUPERADMIN queries and updates RBAC role permissions
    const catalog = await usersService.getRbacRolesCatalog();
    expect(catalog.totalRoles).toBe(16);

    const updatedRbac = await usersService.updateRolePermissions(
      UserRole.PETUGAS_DERMAGA_BARANG,
      { permissionCodes: ['berth:cargo:operate', 'cargo:handling:record'] },
      superadminActor,
    );
    expect(updatedRbac.updatedPermissions).toEqual([
      'berth:cargo:operate',
      'cargo:handling:record',
    ]);
  });

  // ==========================================================================
  // SCENARIO 29–33: Global Independent Vessel Registry, Many-to-Many OperatorVessel & Anti-Typo Engine
  // ==========================================================================

  it('Scenario 29 & 30: SUPERADMIN creates Global Master Vessel without operatorId, and two different companies (PT A & PT B) claim the same vessel via OperatorVessel without duplicating the vessel', async () => {
    const claimedLinks: any[] = [];
    const mockPrisma: any = {
      shipOperator: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => ({
          id: where.id,
          name: where.id === 10 ? 'PT Pelayaran A' : 'PT Agen B',
          isActive: true,
        })),
      },
      vessel: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          id: 701,
          name: 'KM Mimika Nusantara',
          registrationNumber: 'REG-MMK-701',
          isActive: true,
          verificationStatus: VerificationStatus.VERIFIED,
        }),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 701,
          ...data,
        })),
      },
      operatorVessel: {
        upsert: jest.fn().mockImplementation(async ({ create }: any) => {
          const link = { id: claimedLinks.length + 1, ...create };
          claimedLinks.push(link);
          return link;
        }),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };

    const vesselsService = new VesselsService(
      mockPrisma,
      {} as any,
      { record: jest.fn() } as any,
      new EventEmitter2(),
    );

    // Scenario 29: SUPERADMIN creates vessel independently (NO operatorId required)
    const masterVessel = await vesselsService.createVessel(
      {
        registrationNumber: 'REG-MMK-701',
        name: 'KM Mimika Nusantara',
        grossTonnage: 1200,
        shipType: 'NIAGA' as any,
        vesselCategory: VesselCategory.CAMPURAN,
        shippingCategory: 'DALAM_NEGERI' as any,
      },
      {},
      superadminActor,
    );

    expect(masterVessel.id).toBe(701);
    expect(masterVessel.operatorId).toBeNull();
    expect(masterVessel.normalizedRegNumber).toBe('REGMMK701');
    expect(masterVessel.normalizedName).toBe('MIMIKA NUSANTARA');

    // Scenario 30: Both PT A (id=10) and PT B (id=20) claim the same vessel #701
    const claimA = await vesselsService.claimVesselForOperator(
      10,
      701,
      { relationshipType: 'OWNER' as any },
      undefined,
      superadminActor,
      {},
    );
    const claimB = await vesselsService.claimVesselForOperator(
      20,
      701,
      { relationshipType: 'AGENT' as any },
      undefined,
      superadminActor,
      {},
    );

    expect(claimA.operatorId).toBe(10);
    expect(claimB.operatorId).toBe(20);
    expect(claimedLinks.length).toBe(2);
  });

  it('Scenario 31 & 32: Anti-Typo Engine blocks "km. tatamilau" when "KM Tatamailau" exists (409 POSSIBLE_DUPLICATE_VESSEL) and blocks OPERATOR_KAPAL from modifying specs of a shared VERIFIED vessel', async () => {
    const mockPrisma: any = {
      vessel: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            name: 'KM Tatamailau',
            normalizedName: 'TATAMAILAU',
            registrationNumber: 'REG-PELNI-001',
            imoNumber: '8915641',
            grossTonnage: 6022,
            vesselCategory: VesselCategory.PENUMPANG,
          },
        ]),
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          operatorId: 10,
          name: 'KM Tatamailau',
          grossTonnage: 6022,
          verificationStatus: VerificationStatus.VERIFIED,
        }),
      },
      operatorVessel: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, operatorId: 10, vesselId: 1, isActive: true },
          { id: 2, operatorId: 20, vesselId: 1, isActive: true },
        ]),
      },
    };

    const vesselsService = new VesselsService(
      mockPrisma,
      {} as any,
      { record: jest.fn() } as any,
      new EventEmitter2(),
    );

    // Scenario 31: Typo "km. tatamilau" must be rejected with ConflictException
    await expect(
      vesselsService.createVessel(
        {
          registrationNumber: 'REG-NEW-999',
          name: 'km. tatamilau',
          grossTonnage: 6000,
          shipType: 'NIAGA' as any,
          vesselCategory: VesselCategory.PENUMPANG,
          shippingCategory: 'DALAM_NEGERI' as any,
        },
        {},
        superadminActor,
      ),
    ).rejects.toThrow(ConflictException);

    // Scenario 32: Operator B (id=20) cannot alter grossTonnage of shared VERIFIED vessel
    const operatorBActor: AuthenticatedUser = {
      id: 202,
      email: 'ops@agen-b.co.id',
      username: 'ops.agenb',
      fullName: 'Agen B',
      role: UserRole.OPERATOR_KAPAL,
      portId: null,
      operatorId: 20,
      tenantId: null,
      mustChangePassword: false,
    };

    await expect(
      vesselsService.updateVessel(1, { grossTonnage: 500 }, operatorBActor, {
        operatorId: 20,
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
