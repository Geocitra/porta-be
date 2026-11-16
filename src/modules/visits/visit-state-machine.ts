import { BadRequestException } from '@nestjs/common';
import { VisitStatus } from '@prisma/client';

export const ALLOWED_VISIT_TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  [VisitStatus.REQUESTED]: [VisitStatus.APPROVED, VisitStatus.CANCELLED],
  [VisitStatus.APPROVED]: [VisitStatus.ANCHORED, VisitStatus.BERTHED, VisitStatus.CANCELLED],
  [VisitStatus.ANCHORED]: [VisitStatus.BERTHED, VisitStatus.DEPARTED],
  [VisitStatus.BERTHED]: [VisitStatus.DEPARTED],
  [VisitStatus.DEPARTED]: [VisitStatus.BILLED],
  [VisitStatus.BILLED]: [VisitStatus.SETTLED, VisitStatus.DEPARTED], // DEPARTED only when FINAL_SKRD is VOIDed
  [VisitStatus.SETTLED]: [],
  [VisitStatus.CANCELLED]: [],
};

export function assertValidVisitTransition(current: VisitStatus, next: VisitStatus): void {
  const allowed = ALLOWED_VISIT_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new BadRequestException(`Invalid visit state transition: ${current} -> ${next}`);
  }
}

