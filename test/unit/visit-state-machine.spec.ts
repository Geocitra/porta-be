import { BadRequestException } from '@nestjs/common';
import { VisitStatus } from '@prisma/client';
import { assertValidVisitTransition } from '../../src/modules/visits/visit-state-machine';

describe('Visit State Machine', () => {
  it('allows valid sequential transitions', () => {
    expect(() =>
      assertValidVisitTransition(VisitStatus.REQUESTED, VisitStatus.APPROVED),
    ).not.toThrow();
    expect(() =>
      assertValidVisitTransition(VisitStatus.APPROVED, VisitStatus.ANCHORED),
    ).not.toThrow();
    expect(() =>
      assertValidVisitTransition(VisitStatus.BERTHED, VisitStatus.DEPARTED),
    ).not.toThrow();
  });

  it('blocks bypassing states (e.g. REQUESTED -> DEPARTED)', () => {
    expect(() =>
      assertValidVisitTransition(VisitStatus.REQUESTED, VisitStatus.DEPARTED),
    ).toThrow(BadRequestException);
  });

  it('blocks mutating terminal SETTLED status', () => {
    expect(() =>
      assertValidVisitTransition(VisitStatus.SETTLED, VisitStatus.DEPARTED),
    ).toThrow(BadRequestException);
  });
});

