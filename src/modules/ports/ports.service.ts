import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBerthDto, CreatePortDto } from './dto/ports.dto';

@Injectable()
export class PortsService {
  constructor(private readonly prisma: PrismaService) {}

  findAllPorts() {
    return this.prisma.port.findMany({
      where: { isActive: true },
      include: { berths: { where: { isActive: true } } },
      orderBy: { name: 'asc' },
    });
  }

  createPort(dto: CreatePortDto) {
    return this.prisma.port.create({ data: dto });
  }

  async findBerthsByPort(portId: number) {
    return this.prisma.berth.findMany({
      where: { portId, isActive: true },
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
        authorityType: dto.authorityType,
        billingEligibility: dto.billingEligibility,
        legalBasis: dto.legalBasis,
        managementEvidence: dto.managementEvidence,
        maxLengthMeters: dto.maxLengthMeters,
      },
    });
  }
}

