import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  TaskExecutionStatus,
  TaskReviewStatus,
  UserRole,
} from '@prisma/client';
import { isPetugasRole } from '../../common/decorators/current-user.decorator';

export type TaskWorkflowAction =
  | 'START_EXECUTION'
  | 'SUBMIT_TASK'
  | 'ADMIN_START_REVIEW'
  | 'ADMIN_RETURN'
  | 'ADMIN_APPROVE'
  | 'HEAD_VERIFY'
  | 'HEAD_RETURN'
  | 'HEAD_REJECT';

export interface TaskStateTransitionInput {
  action: TaskWorkflowAction;
  actorRole: UserRole;
  actorId: number;
  assigneeId?: number | null;
  currentExecutionStatus: TaskExecutionStatus;
  currentReviewStatus: TaskReviewStatus;
}

export interface TaskStateTransitionResult {
  nextExecutionStatus: TaskExecutionStatus;
  nextReviewStatus: TaskReviewStatus;
}

/**
 * Dual-Axis Workflow State Machine for PORTA Tasks:
 * Separates executionStatus (Petugas) and reviewStatus (Admin Checker -> Kepala Pelabuhan).
 * Enforces strict role separation: SUPERADMIN is strictly prohibited from operational execution,
 * administrative checking, and substantive verification.
 */
function isTaskExecutorRole(role: UserRole): boolean {
  return isPetugasRole(role) || role === UserRole.BENDAHARA;
}

export function evaluateTaskStateTransition(
  input: TaskStateTransitionInput,
): TaskStateTransitionResult {
  const {
    action,
    actorRole,
    actorId,
    assigneeId,
    currentExecutionStatus,
    currentReviewStatus,
  } = input;

  if (actorRole === UserRole.SUPERADMIN) {
    throw new ForbiddenException(
      'SUPERADMIN hanya berwenang mengelola akun dan sistem, serta dilarang terlibat dalam eksekusi, pemeriksaan administratif, maupun verifikasi operasional.',
    );
  }

  switch (action) {
    case 'START_EXECUTION': {
      if (!isTaskExecutorRole(actorRole)) {
        throw new ForbiddenException('Hanya Petugas Pelabuhan / Bendahara yang dapat memulai pelaksanaan pekerjaan.');
      }
      if (
        currentExecutionStatus !== TaskExecutionStatus.NOT_STARTED &&
        currentExecutionStatus !== TaskExecutionStatus.OVERDUE &&
        currentExecutionStatus !== TaskExecutionStatus.IN_PROGRESS
      ) {
        throw new BadRequestException(
          `Transisi status tidak valid: tidak dapat memulai pekerjaan dari status pelaksanaan ${currentExecutionStatus}`,
        );
      }
      if (
        currentReviewStatus !== TaskReviewStatus.NOT_SUBMITTED &&
        currentReviewStatus !== TaskReviewStatus.ADMIN_RETURNED &&
        currentReviewStatus !== TaskReviewStatus.HEAD_RETURNED
      ) {
        throw new BadRequestException(
          `Transisi status tidak valid: pekerjaan sedang berada dalam tahap pemeriksaan ${currentReviewStatus}`,
        );
      }
      return {
        nextExecutionStatus: TaskExecutionStatus.IN_PROGRESS,
        nextReviewStatus: currentReviewStatus,
      };
    }

    case 'SUBMIT_TASK': {
      if (!isTaskExecutorRole(actorRole)) {
        throw new ForbiddenException('Hanya Petugas Pelabuhan / Bendahara yang dapat mengirim (submit) pekerjaan.');
      }
      if (
        currentExecutionStatus === TaskExecutionStatus.SUBMITTED ||
        currentExecutionStatus === TaskExecutionStatus.COMPLETED ||
        currentExecutionStatus === TaskExecutionStatus.CANCELLED
      ) {
        throw new BadRequestException(
          `Tidak dapat mengirim pekerjaan: status pelaksanaan saat ini adalah ${currentExecutionStatus} (${currentReviewStatus})`,
        );
      }
      if (
        currentReviewStatus !== TaskReviewStatus.NOT_SUBMITTED &&
        currentReviewStatus !== TaskReviewStatus.ADMIN_RETURNED &&
        currentReviewStatus !== TaskReviewStatus.HEAD_RETURNED
      ) {
        throw new BadRequestException(
          `Duplikasi submission ditolak: pekerjaan sudah berada pada status pemeriksaan ${currentReviewStatus}`,
        );
      }
      return {
        nextExecutionStatus: TaskExecutionStatus.SUBMITTED,
        nextReviewStatus: TaskReviewStatus.WAITING_ADMIN,
      };
    }

    case 'ADMIN_START_REVIEW': {
      if (actorRole !== UserRole.ADMIN_PELABUHAN) {
        throw new ForbiddenException('Hanya ADMIN_PELABUHAN (Checker) yang dapat memulai pemeriksaan administratif.');
      }
      if (assigneeId && assigneeId === actorId) {
        throw new ForbiddenException('Pembuat/pelaksana pekerjaan tidak diizinkan memeriksa pekerjaannya sendiri.');
      }
      if (
        currentExecutionStatus !== TaskExecutionStatus.SUBMITTED ||
        (currentReviewStatus !== TaskReviewStatus.WAITING_ADMIN &&
          currentReviewStatus !== TaskReviewStatus.ADMIN_REVIEW)
      ) {
        throw new BadRequestException(
          `Transisi status tidak valid untuk pemeriksaan Admin: (${currentExecutionStatus} / ${currentReviewStatus})`,
        );
      }
      return {
        nextExecutionStatus: TaskExecutionStatus.SUBMITTED,
        nextReviewStatus: TaskReviewStatus.ADMIN_REVIEW,
      };
    }

    case 'ADMIN_RETURN': {
      if (actorRole !== UserRole.ADMIN_PELABUHAN) {
        throw new ForbiddenException('Hanya ADMIN_PELABUHAN (Checker) yang dapat mengembalikan pekerjaan karena ketidaklengkapan.');
      }
      if (assigneeId && assigneeId === actorId) {
        throw new ForbiddenException('Pembuat/pelaksana pekerjaan tidak diizinkan memeriksa pekerjaannya sendiri.');
      }
      if (
        currentExecutionStatus !== TaskExecutionStatus.SUBMITTED ||
        (currentReviewStatus !== TaskReviewStatus.WAITING_ADMIN &&
          currentReviewStatus !== TaskReviewStatus.ADMIN_REVIEW)
      ) {
        throw new BadRequestException(
          `Tidak dapat mengembalikan pekerjaan dari status (${currentExecutionStatus} / ${currentReviewStatus})`,
        );
      }
      return {
        nextExecutionStatus: TaskExecutionStatus.IN_PROGRESS,
        nextReviewStatus: TaskReviewStatus.ADMIN_RETURNED,
      };
    }

    case 'ADMIN_APPROVE': {
      if (actorRole !== UserRole.ADMIN_PELABUHAN) {
        throw new ForbiddenException('Hanya ADMIN_PELABUHAN (Checker) yang dapat menyetujui kelengkapan administratif.');
      }
      if (assigneeId && assigneeId === actorId) {
        throw new ForbiddenException('Pembuat/pelaksana pekerjaan tidak diizinkan menyetujui pekerjaannya sendiri.');
      }
      if (
        currentExecutionStatus !== TaskExecutionStatus.SUBMITTED ||
        (currentReviewStatus !== TaskReviewStatus.WAITING_ADMIN &&
          currentReviewStatus !== TaskReviewStatus.ADMIN_REVIEW)
      ) {
        throw new BadRequestException(
          `Tidak dapat menyetujui kelengkapan administratif dari status (${currentExecutionStatus} / ${currentReviewStatus})`,
        );
      }
      // Automatically forwards to Kepala Pelabuhan verification queue (WAITING_HEAD_VERIFICATION)
      return {
        nextExecutionStatus: TaskExecutionStatus.SUBMITTED,
        nextReviewStatus: TaskReviewStatus.WAITING_HEAD_VERIFICATION,
      };
    }

    case 'HEAD_VERIFY': {
      if (actorRole !== UserRole.KEPALA_PELABUHAN) {
        throw new ForbiddenException('Hanya KEPALA_PELABUHAN yang berwenang melakukan verifikasi akhir pekerjaan.');
      }
      if (assigneeId && assigneeId === actorId) {
        throw new ForbiddenException('Pembuat/pelaksana pekerjaan tidak diizinkan memverifikasi pekerjaannya sendiri.');
      }
      if (
        currentExecutionStatus !== TaskExecutionStatus.SUBMITTED ||
        (currentReviewStatus !== TaskReviewStatus.WAITING_HEAD_VERIFICATION &&
          currentReviewStatus !== TaskReviewStatus.ADMIN_APPROVED)
      ) {
        throw new BadRequestException(
          `Kepala Pelabuhan hanya dapat memverifikasi pekerjaan yang telah lolos pemeriksaan Admin (status saat ini: ${currentReviewStatus})`,
        );
      }
      return {
        nextExecutionStatus: TaskExecutionStatus.COMPLETED,
        nextReviewStatus: TaskReviewStatus.HEAD_VERIFIED,
      };
    }

    case 'HEAD_RETURN': {
      if (actorRole !== UserRole.KEPALA_PELABUHAN) {
        throw new ForbiddenException('Hanya KEPALA_PELABUHAN yang dapat mengembalikan pekerjaan pada tahap verifikasi akhir.');
      }
      if (
        currentExecutionStatus !== TaskExecutionStatus.SUBMITTED ||
        (currentReviewStatus !== TaskReviewStatus.WAITING_HEAD_VERIFICATION &&
          currentReviewStatus !== TaskReviewStatus.ADMIN_APPROVED)
      ) {
        throw new BadRequestException(
          `Tidak dapat mengembalikan pekerjaan dari status (${currentExecutionStatus} / ${currentReviewStatus})`,
        );
      }
      return {
        nextExecutionStatus: TaskExecutionStatus.IN_PROGRESS,
        nextReviewStatus: TaskReviewStatus.HEAD_RETURNED,
      };
    }

    case 'HEAD_REJECT': {
      if (actorRole !== UserRole.KEPALA_PELABUHAN) {
        throw new ForbiddenException('Hanya KEPALA_PELABUHAN yang dapat menolak pekerjaan secara substantif.');
      }
      if (
        currentExecutionStatus !== TaskExecutionStatus.SUBMITTED ||
        (currentReviewStatus !== TaskReviewStatus.WAITING_HEAD_VERIFICATION &&
          currentReviewStatus !== TaskReviewStatus.ADMIN_APPROVED)
      ) {
        throw new BadRequestException(
          `Tidak dapat menolak pekerjaan dari status (${currentExecutionStatus} / ${currentReviewStatus})`,
        );
      }
      return {
        nextExecutionStatus: TaskExecutionStatus.CANCELLED,
        nextReviewStatus: TaskReviewStatus.HEAD_REJECTED,
      };
    }

    default:
      throw new BadRequestException(`Unknown workflow action: ${action}`);
  }
}
