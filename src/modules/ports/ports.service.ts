import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BerthServiceCategory, PortCategory } from '@prisma/client';
import { ScopeFilter } from '../../common/guards/port-scope.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBerthDto, CreatePortDto, UpdateBerthDto, UpdatePortDto } from './dto/ports.dto';

@Injectable()
export class PortsService {
  constructor(private readonly prisma: PrismaService) {}

  findAllPorts(portCategory?: PortCategory) {
    return this.prisma.port.findMany({
      where: {
        isActive: true,
        ...(portCategory ? { portCategory } : {}),
      },
      include: { berths: { where: { isActive: true } } },
      orderBy: { name: 'asc' },
    });
  }

  createPort(dto: CreatePortDto) {
    return this.prisma.port.create({ data: dto });
  }

  async findBerthsByPort(portId: number, berthServiceCategory?: BerthServiceCategory) {
    return this.prisma.berth.findMany({
      where: {
        portId,
        isActive: true,
        ...(berthServiceCategory ? { berthServiceCategory } : {}),
      },
      orderBy: { code: 'asc' },
    });
  }

  async createBerth(dto: CreateBerthDto) {
    const port = await this.prisma.port.findUnique({ where: { id: dto.portId } });
    if (!port) throw new NotFoundException(`Port #${dto.portId} not found`);

    return this.prisma.berth.create({
      data: {
        portId: dto.portId,
        code: dto.code,
        name: dto.name,
        berthType: dto.berthType,
        berthServiceCategory: dto.berthServiceCategory,
        operationalStatus: dto.operationalStatus,
        authorityType: dto.authorityType,
        billingEligibility: dto.billingEligibility,
        legalBasis: dto.legalBasis,
        managementEvidence: dto.managementEvidence,
        maxLengthMeters: dto.maxLengthMeters,
        maxDraftMeters: dto.maxDraftMeters,
      },
    });
  }

  async updatePort(portId: number, dto: UpdatePortDto) {
    const existing = await this.prisma.port.findUnique({ where: { id: portId } });
    if (!existing) throw new NotFoundException(`Port #${portId} not found`);

    return this.prisma.port.update({
      where: { id: portId },
      data: dto,
    });
  }

  async updateBerth(berthId: number, dto: UpdateBerthDto, scope: ScopeFilter) {
    const existing = await this.prisma.berth.findUnique({ where: { id: berthId } });
    if (!existing) throw new NotFoundException(`Berth #${berthId} not found`);
    if (scope.portId && existing.portId !== scope.portId) {
      throw new ForbiddenException('Cross-port access denied');
    }

    return this.prisma.berth.update({
      where: { id: berthId },
      data: dto,
    });
  }
}

