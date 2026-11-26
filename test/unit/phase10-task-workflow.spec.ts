import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TaskExecutionStatus,
  TaskPriority,
  TaskReviewStatus,
  TaskSourceType,
  TaskType,
  UserRole,
} from '@prisma/client';
import { TasksService } from '../../src/modules/tasks/tasks.service';

describe('Phase 10 Task Workflow & Bottleneck Radar', () => {
  const actor = {
    id: 10,
    email: 'petugas@porta.test',
    fullName: 'Petugas Kontrak',
    role: UserRole.PETUGAS_REGISTRASI_KONTRAK,
    portId: 1,
    operatorId: null,
    tenantId: null,
  };

  const headActor = {
    id: 2,
    email: 'kepala@porta.test',
    fullName: 'Kepala Pelabuhan',
    role: UserRole.KEPALA_PELABUHAN,
    portId: 1,
    operatorId: null,
    tenantId: null,
  };

  it('rejects submitTask when one requiresAttachment item has no bound attachment even if another attachment exists', async () => {
    const checklistItems = [
      {
        id: 101,
        taskId: 1,
        itemOrder: 1,
        code: 'DOC_A',
        label: 'Dokumen A',
        isRequired: true,
        isApplicable: true,
        requiresAttachment: true,
        checkedByOfficer: true,
        attachmentPath: '/uploads/tasks/1/doc-a.pdf',
      },
      {
        id: 102,
        taskId: 1,
        itemOrder: 2,
        code: 'DOC_B',
        label: 'Dokumen B',
        isRequired: true,
        isApplicable: true,
        requiresAttachment: true,
        checkedByOfficer: true,
        attachmentPath: null,
      },
    ];

    const mockTask = {
      id: 1,
      taskNumber: 'TSK-1',
      taskType: TaskType.DOCUMENT_VERIFICATION,
      title: 'Verifikasi Dokumen',
      sourceType: TaskSourceType.DOCUMENT_SUBMISSION,
      sourceId: '55',
      portId: 1,
      berthId: null,
      terminalId: null,
      assigneeId: 10,
      executionStatus: TaskExecutionStatus.IN_PROGRESS,
      reviewStatus: TaskReviewStatus.NOT_SUBMITTED,
      checklistItems,
    };

    const mockPrisma: any = {
      task: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(mockTask),
      },
      taskChecklistItem: {
        findMany: jest.fn().mockResolvedValue(checklistItems),
      },
      taskAttachment: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, checklistItemId: 101 }]),
      },
      $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
    };

    const service = new TasksService(
      mockPrisma,
      { record: jest.fn() } as any,
      { saveFile: jest.fn() } as any,
      { assertOfficerAssignmentScope: jest.fn().mockResolvedValue(undefined) } as any,
      new EventEmitter2(),
    );

    await expect(
      service.submitTask(1, { notes: 'Done' }, actor as any, { portId: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('classifies bottleneck stages, currentHolder, and missingChecklistItems in getHeadBottlenecks', async () => {
    const now = new Date();
    const tenHoursAgo = new Date(now.getTime() - 10 * 60 * 60 * 1000);

    const mockPrisma: any = {
      task: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 11,
            taskNumber: 'TSK-11',
            title: 'Cek Kontrak PKS',
            taskType: TaskType.DOCUMENT_VERIFICATION,
            sourceType: TaskSourceType.DOCUMENT_SUBMISSION,
            priority: TaskPriority.HIGH,
            executionStatus: TaskExecutionStatus.IN_PROGRESS,
            reviewStatus: TaskReviewStatus.ADMIN_RETURNED,
            isOverdue: true,
            hasIssue: false,
            issueNotes: null,
            rejectionReason: 'PKS belum ditandatangani',
            dueDate: tenHoursAgo,
            submittedAt: null,
            adminReviewedAt: null,
            updatedAt: tenHoursAgo,
            assignee: {
              id: 10,
              fullName: 'Budi Petugas',
              role: UserRole.PETUGAS_REGISTRASI_KONTRAK,
            },
            checklistItems: [
              {
                id: 201,
                code: 'SIGNED_PKS',
                label: 'Upload PKS Bertanda Tangan',
                isRequired: true,
                isApplicable: true,
                requiresAttachment: true,
                checkedByOfficer: false,
                checkedByAdmin: false,
                attachmentPath: null,
              },
            ],
            attachments: [],
            reviews: [{ decision: 'ADMIN_RETURN', reason: 'PKS belum ditandatangani', createdAt: tenHoursAgo }],
          },
          {
            id: 12,
            taskNumber: 'TSK-12',
            title: 'Cek Bongkar Muat',
            taskType: TaskType.CARGO_HANDLING_CHECK,
            sourceType: TaskSourceType.CARGO_RECORD,
            priority: TaskPriority.MEDIUM,
            executionStatus: TaskExecutionStatus.SUBMITTED,
            reviewStatus: TaskReviewStatus.WAITING_ADMIN,
            isOverdue: false,
            hasIssue: false,
            issueNotes: null,
            rejectionReason: null,
            dueDate: now,
            submittedAt: tenHoursAgo,
            adminReviewedAt: null,
            updatedAt: tenHoursAgo,
            assignee: {
              id: 15,
              fullName: 'Andi Dermaga',
              role: UserRole.PETUGAS_DERMAGA_BARANG,
            },
            checklistItems: [
              {
                id: 202,
                code: 'CARGO_PHOTO',
                label: 'Foto Bukti Bongkar',
                isRequired: true,
                isApplicable: true,
                requiresAttachment: true,
                checkedByOfficer: true,
                checkedByAdmin: false,
                attachmentPath: '/uploads/tasks/12/foto.jpg',
              },
            ],
            attachments: [{ id: 5, checklistItemId: 202 }],
            reviews: [],
          },
        ]),
      },
    };

    const service = new TasksService(
      mockPrisma,
      { record: jest.fn() } as any,
      { saveFile: jest.fn() } as any,
      { assertOfficerAssignmentScope: jest.fn() } as any,
      new EventEmitter2(),
    );

    const res = await service.getHeadBottlenecks({ portId: headActor.portId });
    expect(res.summary.totalActive).toBe(2);
    expect(res.summary.returnedLoop).toBe(1);
    expect(res.summary.stuckAtAdminChecker).toBe(1);
    expect(res.items[0].stage).toBe('RETURNED_LOOP');
    expect(res.items[0].currentHolder.fullName).toBe('Budi Petugas');
    expect(res.items[0].missingChecklistItems[0].missingAttachment).toBe(true);
    expect(res.items[1].stage).toBe('STUCK_AT_ADMIN_CHECKER');
    expect(res.items[1].currentHolder.role).toBe(UserRole.ADMIN_PELABUHAN);
  });
});
