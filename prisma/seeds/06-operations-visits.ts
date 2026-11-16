import {
  ActivityMode,
  BerthCategory,
  BillingStage,
  CollectionInstrument,
  Currency,
  InvoiceStatus,
  PaymentMethod,
  PrismaClient,
  ServiceCode,
  TariffUnitType,
  TerminalClass,
  VisitActivityMode,
  VisitOrigin,
  VisitStatus,
  WarningLevel,
  WarningStatus,
} from '@prisma/client';

export async function seedOperationsVisits(
  prisma: PrismaClient,
  portId: number,
  vesselMap: Map<string, any>,
  adminUserId: number,
  petugasUserId: number,
  bendaharaUserId: number,
) {
  console.log('Seeding Realistic Port Operations (Visits, Berthings, Invoices, Payments, SSRD, Warnings, Manifests)...');

  // Lookup Berths
  const berths = await prisma.berth.findMany({ where: { portId } });
  const berthMap = new Map<string, any>();
  for (const b of berths) {
    berthMap.set(b.code, b);
  }

  // Lookup Tariffs
  const tariffs = await prisma.portTariff.findMany({ where: { isActive: true } });
  const tariffMap = new Map<string, any>();
  for (const t of tariffs) {
    tariffMap.set(t.tariffCode, t);
  }

  // Lookup Ferry Routes
  const routes = await prisma.ferryRoute.findMany({ where: { portId } });
  const routeMap = new Map<string, any>();
  for (const r of routes) {
    routeMap.set(r.destinationName, r);
  }

  const now = Date.now();
  const dayMs = 86400000;

  // Visit definitions representing realistic operational timeline
  const visitSpecs = [
    // 1. PELNI KM Tatamailau - 60 days ago (SETTLED)
    {
      visitNumber: 'VISIT-PMK-2024-001',
      vesselReg: 'REG-PELNI-001',
      originPort: 'Pelabuhan Merauke',
      destinationPort: 'Pelabuhan Agats',
      daysAgo: 60,
      durationHours: 14,
      berthCode: 'DRM-PEMDA-01',
      status: VisitStatus.SETTLED,
      isTransitOnly: false,
      hasManifest: true,
      adults: 320,
      greeters: 450,
      terminalFee: 320 * 3000 + 450 * 3000, // Kelas B
    },
    // 2. ASDP KMP Kokonao - 55 days ago (SETTLED)
    {
      visitNumber: 'VISIT-PMK-2024-002',
      vesselReg: 'REG-ASDP-001',
      originPort: 'Pelabuhan Agimuga',
      destinationPort: 'Pelabuhan Otakwa',
      daysAgo: 55,
      durationHours: 10,
      berthCode: 'DOL-PEMDA-01',
      status: VisitStatus.SETTLED,
      isTransitOnly: false,
      hasManifest: true,
      adults: 85,
      greeters: 120,
      terminalFee: 85 * 3000 + 120 * 3000,
      routeName: 'Otakwa',
    },
    // 3. Container KM Meratus Kampar - 50 days ago (SETTLED)
    {
      visitNumber: 'VISIT-PMK-2024-003',
      vesselReg: 'REG-MRT-001',
      originPort: 'Tanjung Perak Surabaya',
      destinationPort: 'Pelabuhan Jayapura',
      daysAgo: 50,
      durationHours: 48, // 2 etmals
      berthCode: 'DRM-PEMDA-01',
      status: VisitStatus.SETTLED,
      isTransitOnly: false,
      hasManifest: false,
    },
    // 4. Pelra KLM Bintang Paumako 08 - 45 days ago (SETTLED)
    {
      visitNumber: 'VISIT-PMK-2024-004',
      vesselReg: 'REG-PLR-001',
      originPort: 'Pelabuhan Dobo',
      destinationPort: 'Pelabuhan Agats',
      daysAgo: 45,
      durationHours: 36, // 2 etmals
      berthCode: 'TLD-PEMDA-01',
      status: VisitStatus.SETTLED,
      isTransitOnly: false,
      hasManifest: false,
    },
    // 5. KM Sabuk Nusantara 75 - 40 days ago (SETTLED)
    {
      visitNumber: 'VISIT-PMK-2024-005',
      vesselReg: 'REG-PRN-001',
      originPort: 'Pelabuhan Fakfak',
      destinationPort: 'Pelabuhan Kaimana',
      daysAgo: 40,
      durationHours: 18, // 1 etmal
      berthCode: 'DRM-PEMDA-01',
      status: VisitStatus.SETTLED,
      isTransitOnly: false,
      hasManifest: true,
      adults: 140,
      greeters: 180,
      terminalFee: 140 * 3000 + 180 * 3000,
    },
    // 6. Tugboat TB Mimika Star 01 (Fixed Activity) - 35 days ago (SETTLED)
    {
      visitNumber: 'VISIT-PMK-2024-006',
      vesselReg: 'REG-TB-001',
      originPort: 'Poumako Area',
      destinationPort: 'Poumako Area',
      daysAgo: 35,
      durationHours: 720, // 1 month fixed
      berthCode: 'TLD-PEMDA-01',
      status: VisitStatus.SETTLED,
      isTransitOnly: false,
      activityMode: VisitActivityMode.FIXED_ACTIVITY,
      hasManifest: false,
    },
    // 7. MV Oriental Ruby (Foreign Bulk Carrier) - 30 days ago (SETTLED)
    {
      visitNumber: 'VISIT-PMK-2024-007',
      vesselReg: 'REG-BULK-001',
      originPort: 'Port of Singapore',
      destinationPort: 'Port of Qingdao',
      daysAgo: 30,
      durationHours: 72, // 3 etmals
      berthCode: 'DRM-PEMDA-01',
      status: VisitStatus.SETTLED,
      isTransitOnly: false,
      hasManifest: false,
    },
    // 8. PELNI KM Sirimau - 25 days ago (SETTLED)
    {
      visitNumber: 'VISIT-PMK-2024-008',
      vesselReg: 'REG-PELNI-002',
      originPort: 'Pelabuhan Merauke',
      destinationPort: 'Pelabuhan Dobo',
      daysAgo: 25,
      durationHours: 12,
      berthCode: 'DRM-PEMDA-01',
      status: VisitStatus.SETTLED,
      isTransitOnly: false,
      hasManifest: true,
      adults: 410,
      greeters: 550,
      terminalFee: 410 * 3000 + 550 * 3000,
    },
    // 9. Container KM Temas Pride - 20 days ago (SETTLED)
    {
      visitNumber: 'VISIT-PMK-2024-009',
      vesselReg: 'REG-TMS-001',
      originPort: 'Pelabuhan Tanjung Priok',
      destinationPort: 'Pelabuhan Merauke',
      daysAgo: 20,
      durationHours: 60, // 3 etmals
      berthCode: 'DRM-PEMDA-01',
      status: VisitStatus.SETTLED,
      isTransitOnly: false,
      hasManifest: false,
    },
    // 10. ASDP KMP Terubuk I - 18 days ago (SETTLED)
    {
      visitNumber: 'VISIT-PMK-2024-010',
      vesselReg: 'REG-ASDP-002',
      originPort: 'Pelabuhan Kokonau',
      destinationPort: 'Pelabuhan Potowai Buru',
      daysAgo: 18,
      durationHours: 12,
      berthCode: 'DOL-PEMDA-01',
      status: VisitStatus.SETTLED,
      isTransitOnly: false,
      hasManifest: true,
      adults: 60,
      greeters: 90,
      terminalFee: 60 * 3000 + 90 * 3000,
      routeName: 'Kokonau',
    },
    // 11. Overdue Visit 1: KM SPIL Hening - 15 days ago (BILLED + TEGURAN_1)
    {
      visitNumber: 'VISIT-PMK-2024-011',
      vesselReg: 'REG-SPL-001',
      originPort: 'Pelabuhan Tanjung Perak',
      destinationPort: 'Pelabuhan Sorong',
      daysAgo: 15,
      durationHours: 48,
      berthCode: 'DRM-PEMDA-01',
      status: VisitStatus.BILLED,
      isTransitOnly: false,
      warningLevel: WarningLevel.TEGURAN_1,
      hasManifest: false,
    },
    // 12. Overdue Visit 2: KLM Asmat Permai - 12 days ago (BILLED + TEGURAN_2)
    {
      visitNumber: 'VISIT-PMK-2024-012',
      vesselReg: 'REG-PLR-002',
      originPort: 'Pelabuhan Agats',
      destinationPort: 'Pelabuhan Merauke',
      daysAgo: 12,
      durationHours: 36,
      berthCode: 'TLD-PEMDA-01',
      status: VisitStatus.BILLED,
      isTransitOnly: false,
      warningLevel: WarningLevel.TEGURAN_2,
      hasManifest: false,
    },
    // 13. PELNI KM Leuser - 8 days ago (SETTLED)
    {
      visitNumber: 'VISIT-PMK-2024-013',
      vesselReg: 'REG-PELNI-003',
      originPort: 'Pelabuhan Ambon',
      destinationPort: 'Pelabuhan Merauke',
      daysAgo: 8,
      durationHours: 15,
      berthCode: 'DRM-PEMDA-01',
      status: VisitStatus.SETTLED,
      isTransitOnly: false,
      hasManifest: true,
      adults: 280,
      greeters: 390,
      terminalFee: 280 * 3000 + 390 * 3000,
    },
    // 14. Non-Billable Visit at UPP Kemenhub - 6 days ago (DEPARTED, NO INVOICE)
    {
      visitNumber: 'VISIT-PMK-2024-014',
      vesselReg: 'REG-KPLP-001',
      originPort: 'Wilayah Kerja Pomako',
      destinationPort: 'Wilayah Kerja Pomako',
      daysAgo: 6,
      durationHours: 24,
      berthCode: 'DRM-UPP-01', // UPP Berth -> NOT_BILLABLE!
      status: VisitStatus.DEPARTED,
      isTransitOnly: false,
      hasManifest: false,
    },
    // 15. Transit-Only Visit - 4 days ago (DEPARTED)
    {
      visitNumber: 'VISIT-PMK-2024-015',
      vesselReg: 'REG-PMK-001',
      originPort: 'Pelabuhan Dobo',
      destinationPort: 'Pelabuhan Timika Barat',
      daysAgo: 4,
      durationHours: 4,
      berthCode: 'TLD-PEMDA-01',
      status: VisitStatus.DEPARTED,
      isTransitOnly: true, // Labuh only, no tambat
      hasManifest: false,
    },
    // 16. Active Berthed 1: KM Meratus Kampar (BERTHED NOW)
    {
      visitNumber: 'VISIT-PMK-2024-016',
      vesselReg: 'REG-MRT-001',
      originPort: 'Tanjung Perak Surabaya',
      destinationPort: 'Pelabuhan Jayapura',
      daysAgo: 1, // Arrived yesterday, berthed right now
      durationHours: 30,
      berthCode: 'DRM-PEMDA-01',
      status: VisitStatus.BERTHED,
      isTransitOnly: false,
      hasManifest: false,
    },
    // 17. Active Berthed 2: KLM Putri Kamoro (BERTHED NOW)
    {
      visitNumber: 'VISIT-PMK-2024-017',
      vesselReg: 'REG-PLR-003',
      originPort: 'Pelabuhan Agats',
      destinationPort: 'Pelabuhan Pomako Timur',
      daysAgo: 0.5,
      durationHours: 12,
      berthCode: 'TLD-PEMDA-01',
      status: VisitStatus.BERTHED,
      isTransitOnly: false,
      hasManifest: false,
    },
    // 18. Active Anchored: KMP Kokonao (ANCHORED NOW waiting for high tide)
    {
      visitNumber: 'VISIT-PMK-2024-018',
      vesselReg: 'REG-ASDP-001',
      originPort: 'Pelabuhan Otakwa',
      destinationPort: 'Pelabuhan Poumako',
      daysAgo: 0.2, // Arrived 5 hours ago
      durationHours: 5,
      berthCode: 'DOL-PEMDA-01',
      status: VisitStatus.ANCHORED,
      isTransitOnly: false,
      hasManifest: false,
    },
  ];

  let visitIndex = 1;

  for (const spec of visitSpecs) {
    const vessel = vesselMap.get(spec.vesselReg);
    if (!vessel) continue;

    const berth = berthMap.get(spec.berthCode);
    if (!berth) continue;

    const visitStart = new Date(now - spec.daysAgo * dayMs);
    const visitEnd = new Date(visitStart.getTime() + spec.durationHours * 3600000);

    const existingVisit = await prisma.shipVisit.findUnique({
      where: { visitNumber: spec.visitNumber },
    });

    let visit = existingVisit;

    if (!visit) {
      visit = await prisma.shipVisit.create({
        data: {
          visitNumber: spec.visitNumber,
          portId,
          vesselId: vessel.id,
          operatorId: vessel.operatorId,
          visitOrigin: VisitOrigin.OPERATOR_REQUEST,
          activityMode: spec.activityMode ?? VisitActivityMode.NORMAL,
          isTransitOnly: spec.isTransitOnly,
          originPort: spec.originPort,
          destinationPort: spec.destinationPort,
          eta: new Date(visitStart.getTime() - 2 * 3600000),
          etd: visitEnd,
          ataAnchorage: visitStart,
          atdPort: spec.status === VisitStatus.SETTLED || spec.status === VisitStatus.DEPARTED || spec.status === VisitStatus.BILLED ? visitEnd : null,
          status: spec.status,
          notes: `Kunjungan operasional kapal ${vessel.name} di Pelabuhan Poumako.`,
        },
      });
    }

    // Berthing Record
    const existingBerthing = await prisma.berthingRecord.findFirst({
      where: { visitId: visit.id },
    });

    if (!existingBerthing && !spec.isTransitOnly) {
      const etmalCalculated = Math.ceil(spec.durationHours / 24);
      await prisma.berthingRecord.create({
        data: {
          portId,
          visitId: visit.id,
          berthId: berth.id,
          berthCategory: BerthCategory.UMUM,
          plannedStartAt: visitStart,
          plannedEndAt: visitEnd,
          actualStartAt: visitStart,
          actualEndAt: spec.status === VisitStatus.BERTHED ? null : visitEnd,
          calculatedHours: spec.durationHours,
          billableEtmal: etmalCalculated,
          evidencePhoto: `/uploads/berthings/${spec.visitNumber}.jpg`,
          isOverstay: false,
          recordedById: petugasUserId,
        },
      });
    }

    // Vessel Manifest (for Passenger / Ferry routes)
    if (spec.hasManifest) {
      const existingManifest = await prisma.vesselManifest.findUnique({
        where: { visitId: visit.id },
      });

      if (!existingManifest) {
        const route = spec.routeName ? routeMap.get(spec.routeName) : null;
        await prisma.vesselManifest.create({
          data: {
            manifestNumber: `MNF-PMK-${spec.visitNumber}`,
            portId,
            visitId: visit.id,
            ferryRouteId: route?.id ?? null,
            terminalClass: TerminalClass.KELAS_B,
            adultCount: spec.adults ?? 100,
            childCount: 20,
            infantCount: 5,
            greeterCount: spec.greeters ?? 150,
            vehicleCount: spec.routeName ? 15 : 0,
            cargoTons: 25.5,
            terminalFeeIdr: spec.terminalFee ?? 1500000,
            notes: 'Manifest penumpang dan pengantar tercatat di Terminal Penumpang Kelas B Pelabuhan Poumako.',
            recordedById: petugasUserId,
          },
        });
      }
    }

    // Billing & Invoice (Only for Billable berths & non-transit with status BILLED or SETTLED)
    if (berth.billingEligibility === 'BILLABLE' && (spec.status === VisitStatus.SETTLED || spec.status === VisitStatus.BILLED)) {
      const existingInvoice = await prisma.invoice.findFirst({
        where: { visitId: visit.id },
      });

      if (!existingInvoice) {
        // Calculate realistic amounts
        const gt = Number(vessel.grossTonnage);
        const etmal = Math.ceil(spec.durationHours / 24);
        
        let labuhTariffCode = 'LABUH_NIAGA_DN';
        let tambatTariffCode = 'TAMBAT_UMUM_DERMAGA_DN';

        if (vessel.shippingCategory === 'PELRA_PERINTIS') {
          labuhTariffCode = 'LABUH_NIAGA_PELRA';
          tambatTariffCode = 'TAMBAT_UMUM_DERMAGA_PELRA';
        } else if (vessel.shippingCategory === 'LUAR_NEGERI') {
          labuhTariffCode = 'LABUH_NIAGA_LN';
          tambatTariffCode = 'TAMBAT_UMUM_DERMAGA_LN';
        }

        if (berth.berthType === 'PINGGIRAN_TALUD') {
          tambatTariffCode = vessel.shippingCategory === 'PELRA_PERINTIS' ? 'TAMBAT_UMUM_TALUD_PELRA' : 'TAMBAT_UMUM_TALUD_DN';
        } else if (berth.berthType === 'BRESSING_DOLPHIN_PELAMPUNG') {
          tambatTariffCode = vessel.shippingCategory === 'PELRA_PERINTIS' ? 'TAMBAT_UMUM_DOLPHIN_PELRA' : 'TAMBAT_UMUM_DOLPHIN_DN';
        }

        const labuhTariff = tariffMap.get(labuhTariffCode);
        const tambatTariff = tariffMap.get(tambatTariffCode);

        const labuhRate = labuhTariff ? Number(labuhTariff.amount) : 50;
        const tambatRate = tambatTariff ? Number(tambatTariff.amount) : 38;

        const labuhSubtotal = gt * 1 * labuhRate;
        const tambatSubtotal = gt * etmal * tambatRate;
        const totalInvoice = labuhSubtotal + tambatSubtotal;

        const invoiceNumber = `SKRD-PMK-${visitStart.getFullYear()}-${String(visitIndex).padStart(4, '0')}`;
        const ssrdNumber = spec.status === VisitStatus.SETTLED ? `SSRD-MMK-${visitStart.getFullYear()}-${String(visitIndex).padStart(4, '0')}` : null;

        const invoice = await prisma.invoice.create({
          data: {
            invoiceNumber,
            ssrdNumber,
            collectionInstrument: CollectionInstrument.SKRD,
            portId,
            visitId: visit.id,
            operatorId: vessel.operatorId,
            billingStage: BillingStage.FINAL_SKRD,
            exchangeRateUsd: 16000,
            totalAmountIdr: totalInvoice,
            status: spec.status === VisitStatus.SETTLED ? InvoiceStatus.PAID : InvoiceStatus.ISSUED,
            issuedAt: visitEnd,
            dueDate: new Date(visitEnd.getTime() + 7 * dayMs),
          },
        });

        // Invoice Items
        if (labuhTariff) {
          await prisma.invoiceItem.create({
            data: {
              invoiceId: invoice.id,
              tariffId: labuhTariff.id,
              serviceCode: ServiceCode.JASA_LABUH,
              description: `Jasa Labuh Kapal ${vessel.name} (${gt} GT)`,
              gtSnapshot: gt,
              unitsCharged: 1,
              unitType: TariffUnitType.GT_PER_15_DAYS,
              tariffAmountSnapshot: labuhRate,
              currency: Currency.IDR,
              subtotalOriginal: labuhSubtotal,
              subtotalIdr: labuhSubtotal,
              formulaNote: `${gt} GT x 1 Periode (15 Hari) x Rp ${labuhRate}`,
            },
          });
        }

        if (tambatTariff) {
          await prisma.invoiceItem.create({
            data: {
              invoiceId: invoice.id,
              tariffId: tambatTariff.id,
              serviceCode: ServiceCode.JASA_TAMBAT_UMUM,
              description: `Jasa Tambat Kapal di ${berth.name} (${etmal} Etmal)`,
              gtSnapshot: gt,
              unitsCharged: etmal,
              unitType: TariffUnitType.GT_PER_ETMAL,
              tariffAmountSnapshot: tambatRate,
              currency: Currency.IDR,
              subtotalOriginal: tambatSubtotal,
              subtotalIdr: tambatSubtotal,
              formulaNote: `${gt} GT x ${etmal} Etmal x Rp ${tambatRate}`,
            },
          });
        }

        // Verified Payment for SETTLED invoices
        if (spec.status === VisitStatus.SETTLED) {
          await prisma.payment.create({
            data: {
              invoiceId: invoice.id,
              idempotencyKey: `PAY-${invoice.invoiceNumber}`,
              amountIdr: totalInvoice,
              method: PaymentMethod.BANK_TRANSFER,
              referenceNo: `TRF-BAPDA-${100000 + visitIndex}`,
              proofFilePath: `/uploads/payments/receipt_${invoice.invoiceNumber}.pdf`,
              paidAt: new Date(visitEnd.getTime() + 2 * 3600000), // Paid 2 hours after departure
              isVerified: true,
              verifiedById: bendaharaUserId,
              verifiedAt: new Date(visitEnd.getTime() + 3 * 3600000),
            },
          });
        }

        // Warnings for Overdue visits
        if (spec.warningLevel) {
          await prisma.warning.create({
            data: {
              warningNumber: `SP-${spec.warningLevel === WarningLevel.TEGURAN_1 ? 'I' : 'II'}-DISHUB-MMK/${visitIndex}/2024`,
              portId,
              operatorId: vessel.operatorId,
              invoiceId: invoice.id,
              warningLevel: spec.warningLevel,
              message: `Surat Teguran ${spec.warningLevel}: Kewajiban retribusi jasa kapal untuk ${invoice.invoiceNumber} telah melewati jatuh tempo. Harap segera melunasi ke Rekening Kas Daerah Pemkab Mimika.`,
              issuedById: bendaharaUserId,
              status: WarningStatus.SENT,
            },
          });
        }
      }
    }

    visitIndex++;
  }

  console.log(`Operations Visits seeded: ${visitSpecs.length} realistic visits.`);
}

