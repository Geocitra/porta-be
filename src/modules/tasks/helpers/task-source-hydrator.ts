import { Injectable } from '@nestjs/common';
import { TaskSourceType } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface TaskSourceDocument {
  label: string;
  fileName: string;
  filePath: string;
  status?: string;
}

export interface TaskSourceContext {
  kind: string;
  referenceCode: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  details: Record<string, string | number | boolean | null>;
  documents: TaskSourceDocument[];
}

@Injectable()
export class TaskSourceContextHydrator {
  constructor(private readonly prisma: PrismaService) {}

  async hydrate(task: {
    sourceType: TaskSourceType;
    sourceId?: string | null;
    visitId?: number | null;
  }): Promise<TaskSourceContext | null> {
    const sourceId = task.sourceId?.trim() ?? '';

    try {
      if (
        task.sourceType === TaskSourceType.DOCUMENT_SUBMISSION &&
        sourceId.startsWith('BERTHING-CONTRACT-')
      ) {
        const contractId = Number(sourceId.replace('BERTHING-CONTRACT-', ''));
        if (!Number.isFinite(contractId)) return null;
        const contract = await this.prisma.operatorBerthingContract.findUnique({
          where: { id: contractId },
          include: {
            operator: { select: { name: true, npwp: true, operatorProfile: true } },
            port: { select: { name: true, code: true } },
          },
        });
        if (!contract) return null;

        const documents: TaskSourceDocument[] = [];
        if (contract.filePath) {
          documents.push({
            label: 'Draft Kontrak PKS',
            fileName: contract.fileName ?? 'draft-pks.pdf',
            filePath: contract.filePath,
            status: contract.status,
          });
        }
        if (contract.signedFilePath) {
          documents.push({
            label: 'Kontrak PKS Bertanda Tangan',
            fileName: contract.signedFileName ?? 'signed-pks.pdf',
            filePath: contract.signedFilePath,
            status: contract.status,
          });
        }

        return {
          kind: 'BERTHING_CONTRACT',
          referenceCode: contract.contractNumber,
          title: contract.title,
          subtitle: `${contract.operator.name} (${contract.port.name})`,
          status: contract.status,
          details: {
            operatorName: contract.operator.name,
            npwp: contract.operator.npwp,
            operatorProfile: contract.operator.operatorProfile,
            monthlyQuota: contract.monthlyQuota,
            usedQuota: contract.usedQuota,
            dockAllocation: contract.dockAllocation,
            startDate: contract.startDate.toISOString().slice(0, 10),
            endDate: contract.endDate.toISOString().slice(0, 10),
          },
          documents,
        };
      }

      if (
        task.sourceType === TaskSourceType.DOCUMENT_SUBMISSION &&
        sourceId.startsWith('VESSEL-REVERIFY-')
      ) {
        const parts = sourceId.split('-');
        const vesselId = Number(parts[2]);
        if (!Number.isFinite(vesselId)) return null;
        const vessel = await this.prisma.vessel.findUnique({
          where: { id: vesselId },
          include: {
            documents: { orderBy: { createdAt: 'desc' }, take: 10 },
          },
        });
        if (!vessel) return null;
        return {
          kind: 'VESSEL_REVERIFY',
          referenceCode: vessel.registrationNumber,
          title: vessel.name,
          subtitle: `${vessel.vesselCategory} • GT ${Number(vessel.grossTonnage)}`,
          status: vessel.verificationStatus,
          details: {
            imoNumber: vessel.imoNumber,
            shipType: vessel.shipType,
            grossTonnage: Number(vessel.grossTonnage),
            vesselCategory: vessel.vesselCategory,
            shippingCategory: vessel.shippingCategory,
          },
          documents: vessel.documents.map((d) => ({
            label: d.category,
            fileName: d.fileName,
            filePath: d.filePath,
            status: d.verificationStatus,
          })),
        };
      }

      if (task.sourceType === TaskSourceType.DOCUMENT_SUBMISSION) {
        const docId = Number(sourceId);
        if (!Number.isFinite(docId)) return null;
        const doc = await this.prisma.document.findUnique({
          where: { id: docId },
          include: {
            operator: { select: { name: true, npwp: true } },
            tenant: { select: { name: true, npwp: true } },
            vessel: { select: { name: true, registrationNumber: true } },
          },
        });
        if (!doc) return null;
        const ownerName =
          doc.operator?.name ?? doc.tenant?.name ?? doc.vessel?.name ?? 'Mitra';
        return {
          kind: 'DOCUMENT',
          referenceCode: doc.documentNumber ?? `DOC-${doc.id}`,
          title: `Dokumen ${doc.category}`,
          subtitle: ownerName,
          status: doc.verificationStatus,
          details: {
            category: doc.category,
            documentNumber: doc.documentNumber,
            ownerName,
            notes: doc.notes,
          },
          documents: [
            {
              label: doc.category,
              fileName: doc.fileName,
              filePath: doc.filePath,
              status: doc.verificationStatus,
            },
          ],
        };
      }

      if (task.sourceType === TaskSourceType.COMPANY_ONBOARDING) {
        const [entityType, rawId] = sourceId.split('-');
        const entityId = Number(rawId);
        if (!Number.isFinite(entityId)) return null;

        if (entityType === 'OPERATOR') {
          const op = await this.prisma.shipOperator.findUnique({
            where: { id: entityId },
            include: { documents: { orderBy: { createdAt: 'desc' }, take: 10 } },
          });
          if (!op) return null;
          return {
            kind: 'COMPANY_ONBOARDING',
            referenceCode: op.npwp ?? `OP-${op.id}`,
            title: op.name,
            subtitle: `Operator Kapal • ${op.operatorProfile}`,
            status: op.verificationStatus,
            details: {
              npwp: op.npwp,
              operatorProfile: op.operatorProfile,
              email: op.email,
              phone: op.phone,
            },
            documents: op.documents.map((d) => ({
              label: d.category,
              fileName: d.fileName,
              filePath: d.filePath,
              status: d.verificationStatus,
            })),
          };
        }

        if (entityType === 'TENANT') {
          const tenant = await this.prisma.tenant.findUnique({
            where: { id: entityId },
            include: { documents: { orderBy: { createdAt: 'desc' }, take: 10 } },
          });
          if (!tenant) return null;
          return {
            kind: 'COMPANY_ONBOARDING',
            referenceCode: tenant.nib ?? tenant.npwp ?? `TNT-${tenant.id}`,
            title: tenant.name,
            subtitle: 'Tenant / Mitra Pelabuhan',
            status: tenant.verificationStatus,
            details: {
              npwp: tenant.npwp,
              nib: tenant.nib,
              email: tenant.email,
              phone: tenant.phone,
            },
            documents: tenant.documents.map((d) => ({
              label: d.category,
              fileName: d.fileName,
              filePath: d.filePath,
              status: d.verificationStatus,
            })),
          };
        }
      }

      if (task.sourceType === TaskSourceType.ASSET_LEASE) {
        const leaseId = Number(sourceId);
        if (!Number.isFinite(leaseId)) return null;
        const lease = await this.prisma.assetLease.findUnique({
          where: { id: leaseId },
          include: {
            asset: { select: { assetCode: true, name: true, assetType: true } },
            tenant: { select: { name: true, npwp: true } },
          },
        });
        if (!lease) return null;
        return {
          kind: 'ASSET_LEASE',
          referenceCode: lease.contractNumber,
          title: `${lease.asset.name} (${lease.asset.assetCode})`,
          subtitle: lease.tenant?.name ?? lease.tenantName,
          status: lease.status,
          details: {
            assetCode: lease.asset.assetCode,
            assetType: lease.asset.assetType,
            tenantName: lease.tenant?.name ?? lease.tenantName,
            startDate: lease.startDate.toISOString().slice(0, 10),
            endDate: lease.endDate.toISOString().slice(0, 10),
            annualAmountIdr: Number(lease.totalAnnualAmountIdr),
          },
          documents: [],
        };
      }

      if (task.sourceType === TaskSourceType.BILLING_INVOICE) {
        const invoiceId = Number(sourceId);
        if (!Number.isFinite(invoiceId)) return null;
        const inv = await this.prisma.invoice.findUnique({
          where: { id: invoiceId },
          include: {
            operator: { select: { name: true } },
            visit: { select: { visitNumber: true, vessel: { select: { name: true } } } },
          },
        });
        if (!inv) return null;
        return {
          kind: 'BILLING_INVOICE',
          referenceCode: inv.invoiceNumber,
          title: `Tagihan ${inv.billingStage} — ${inv.visit.vessel.name}`,
          subtitle: `${inv.operator.name} • Kunjungan ${inv.visit.visitNumber}`,
          status: inv.status,
          details: {
            ssrdNumber: inv.ssrdNumber,
            billingStage: inv.billingStage,
            totalAmountIdr: Number(inv.totalAmountIdr),
            dueDate: inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : null,
          },
          documents: [],
        };
      }

      if (task.sourceType === TaskSourceType.MAINTENANCE_TICKET) {
        const ticketId = Number(sourceId);
        if (!Number.isFinite(ticketId)) return null;
        const ticket = await this.prisma.maintenanceTicket.findUnique({
          where: { id: ticketId },
          include: {
            berth: { select: { code: true, name: true } },
            asset: { select: { assetCode: true, name: true } },
          },
        });
        if (!ticket) return null;
        return {
          kind: 'MAINTENANCE_TICKET',
          referenceCode: ticket.ticketNumber,
          title: ticket.title,
          subtitle: `${ticket.severity} • ${ticket.berth?.name ?? ticket.asset?.name ?? 'Fasilitas Pelabuhan'}`,
          status: ticket.status,
          details: {
            severity: ticket.severity,
            assignedTechnician: ticket.assignedTechnician,
            description: ticket.description,
          },
          documents: ticket.evidencePhoto
            ? [
                {
                  label: 'Foto Kerusakan',
                  fileName: 'evidence-photo',
                  filePath: ticket.evidencePhoto,
                  status: ticket.status,
                },
              ]
            : [],
        };
      }

      if (
        (task.sourceType === TaskSourceType.SHIP_VISIT ||
          task.sourceType === TaskSourceType.BERTHING_RECORD) &&
        (task.visitId || sourceId)
      ) {
        const visitId = task.visitId ?? Number(sourceId.split('-')[0]);
        if (!Number.isFinite(visitId)) return null;
        const visit = await this.prisma.shipVisit.findUnique({
          where: { id: visitId },
          include: {
            vessel: {
              select: {
                name: true,
                registrationNumber: true,
                grossTonnage: true,
                vesselCategory: true,
              },
            },
            operator: { select: { name: true } },
          },
        });
        if (!visit) return null;
        return {
          kind: task.sourceType,
          referenceCode: visit.visitNumber,
          title: `${visit.vessel.name} (${visit.vessel.registrationNumber})`,
          subtitle: `${visit.operator.name} • ${visit.vessel.vesselCategory}`,
          status: visit.status,
          details: {
            grossTonnage: Number(visit.vessel.grossTonnage),
            eta: visit.eta.toISOString(),
            etd: visit.etd ? visit.etd.toISOString() : null,
            originPort: visit.originPort,
            destinationPort: visit.destinationPort,
          },
          documents: [],
        };
      }
    } catch {
      return null;
    }

    return null;
  }
}
