import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: number;
  email: string;
  username: string | null;
  fullName: string;
  role: UserRole;
  portId: number | null;
  operatorId: number | null;
  tenantId: number | null;
  mustChangePassword: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

