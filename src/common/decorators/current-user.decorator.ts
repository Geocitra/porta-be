import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  portId: number | null;
  operatorId: number | null;
  tenantId: number | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

