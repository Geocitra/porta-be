import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import {
  BillingStage,
  CollectionInstrument,
  PaymentMethod,
  ShipType,
  ShippingCategory,
  VerificationStatus,
  VisitActivityMode,
  VisitOrigin,
} from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/common/prisma/prisma.service';

describe('PORTA End-to-End Flow & Security Guardrails (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const uniqueSuffix = Date.now();
  const testOpEmail = `e2e-op-${uniqueSuffix}@mimika-test.co.id`;
  let operatorToken = '';
  let adminToken = '';
  let petugasToken = '';
  let bendaharaToken = '';

  let createdOperatorId = 0;
  let createdUserId = 0;
  let createdVesselId = 0;
  let createdVisitId = 0;
  let createdComplaintTicket = '';
  let createdGateBookId = 0;
  let createdAssetId = 0;
  let createdMaintenanceId = 0;
  let createdCargoId = 0;
  let createdEquipmentId = 0;
  let createdUtilityId = 0;
  let createdManifestId = 0;
  let pomakoPortId = 0;
  let pemdaBerthId = 0;
  let uppBerthId = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    // Lookup seeded Port Poumako & Berths
    const port = await prisma.port.findUniqueOrThrow({ where: { code: 'PMK' } });
    pomakoPortId = port.id;
    const pemdaBerth = await prisma.berth.findUniqueOrThrow({
      where: { portId_code: { portId: pomakoPortId, code: 'DRM-PEMDA-01' } },
    });
    pemdaBerthId = pemdaBerth.id;
    const uppBerth = await prisma.berth.findUniqueOrThrow({
      where: { portId_code: { portId: pomakoPortId, code: 'DRM-UPP-01' } },
    });
    uppBerthId = uppBerth.id;

    // Login seeded staff accounts
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin.pomako@porta.mimikakab.go.id', password: 'Porta123!' })
      .expect(201);
    adminToken = adminLogin.body.accessToken;

    const petugasLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'petugas.pomako@porta.mimikakab.go.id', password: 'Porta123!' })
      .expect(201);
    petugasToken = petugasLogin.body.accessToken;

    const bendaharaLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'bendahara.pomako@porta.mimikakab.go.id', password: 'Porta123!' })
      .expect(201);
    bendaharaToken = bendaharaLogin.body.accessToken;
  });

  afterAll(async () => {
    // Cleanup E2E test records in strict FK order (respecting onDelete: Restrict)
    if (createdCargoId) {
      await prisma.cargoHandlingRecord.delete({ where: { id: createdCargoId } });
    }
    if (createdEquipmentId) {
      await prisma.equipmentRentalRecord.delete({ where: { id: createdEquipmentId } });
    }
    if (createdUtilityId) {
      await prisma.utilityMeterReading.delete({ where: { id: createdUtilityId } });
    }
    if (createdManifestId) {
      await prisma.vesselManifest.delete({ where: { id: createdManifestId } });
    }
    if (createdVisitId) {
      const invoices = await prisma.invoice.findMany({ where: { visitId: createdVisitId } });
      const invoiceIds = invoices.map((i) => i.id);
      if (invoiceIds.length > 0) {
        await prisma.warning.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
      }
      await prisma.berthingRecord.deleteMany({ where: { visitId: createdVisitId } });
      await prisma.shipVisit.delete({ where: { id: createdVisitId } });
    }
    if (createdVesselId) {
      await prisma.vessel.delete({ where: { id: createdVesselId } });
    }
    if (createdUserId) {
      await prisma.auditLog.deleteMany({ where: { actorId: createdUserId } });
      await prisma.notification.deleteMany({ where: { userId: createdUserId } });
      await prisma.user.delete({ where: { id: createdUserId } });
    }
    if (createdOperatorId) {
      await prisma.shipOperator.delete({ where: { id: createdOperatorId } });
    }
    if (createdComplaintTicket) {
      await prisma.complaint.deleteMany({ where: { ticketNumber: createdComplaintTicket } });
    }
    if (createdGateBookId) {
      await prisma.gateWardenHandover.deleteMany({ where: { bookId: createdGateBookId } });
      await prisma.gateTicketBook.delete({ where: { id: createdGateBookId } });
    }
    if (createdMaintenanceId) {
      await prisma.maintenanceTicket.delete({ where: { id: createdMaintenanceId } });
    }
    if (createdAssetId) {
      const leases = await prisma.assetLease.findMany({ where: { assetId: createdAssetId } });
      const leaseIds = leases.map((l) => l.id);
      if (leaseIds.length > 0) {
        await prisma.assetLeasePayment.deleteMany({ where: { leaseId: { in: leaseIds } } });
        await prisma.assetLease.deleteMany({ where: { id: { in: leaseIds } } });
      }
      await prisma.portAsset.delete({ where: { id: createdAssetId } });
    }
    await app.close();
  });

  it('1. Rejects phantom/unknown payload fields (forbidNonWhitelisted)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin.pomako@porta.mimikakab.go.id',
        password: 'Porta123!',
        phantomField: 'hack',
      })
      .expect(400);
  });

  it('2. Enforces Onboarding & Verification Gate before Operator can request visit', async () => {
    // Register Operator
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: testOpEmail,
        password: 'Password123!',
        fullName: 'E2E Operator Tester',
        companyName: `PT E2E Shipping ${uniqueSuffix}`,
      })
      .expect(201);

    operatorToken = regRes.body.accessToken;
    createdUserId = regRes.body.user.id;
    createdOperatorId = regRes.body.user.operatorId;
    expect(regRes.body.user.operatorVerificationStatus).toBe(VerificationStatus.PENDING);

    // Register Vessel (500 GT Dalam Negeri Niaga)
    const vesselRes = await request(app.getHttpServer())
      .post('/api/v1/vessels')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        operatorId: createdOperatorId,
        registrationNumber: `E2E-REG-${uniqueSuffix}`,
        name: 'KM E2E Nusantara',
        grossTonnage: 500,
        shipType: ShipType.NIAGA,
        shippingCategory: ShippingCategory.DALAM_NEGERI,
      })
      .expect(201);
    createdVesselId = vesselRes.body.id;

    // Attempt to create visit BEFORE verification -> MUST FAIL 403
    await request(app.getHttpServer())
      .post('/api/v1/visits')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        portId: pomakoPortId,
        vesselId: createdVesselId,
        visitOrigin: VisitOrigin.OPERATOR_REQUEST,
        activityMode: VisitActivityMode.NORMAL,
        eta: '2026-11-16T08:00:00.000Z',
        etd: '2026-11-17T08:00:00.000Z',
      })
      .expect(403);

    // Admin verifies Operator and Vessel
    await request(app.getHttpServer())
      .post(`/api/v1/vessels/operators/${createdOperatorId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: VerificationStatus.VERIFIED })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/vessels/${createdVesselId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: VerificationStatus.VERIFIED })
      .expect(201);

    // Now Operator creates visit -> MUST SUCCEED
    const visitRes = await request(app.getHttpServer())
      .post('/api/v1/visits')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        portId: pomakoPortId,
        vesselId: createdVesselId,
        visitOrigin: VisitOrigin.OPERATOR_REQUEST,
        activityMode: VisitActivityMode.NORMAL,
        eta: '2026-11-16T08:00:00.000Z',
        etd: '2026-11-17T08:00:00.000Z',
      })
      .expect(201);
    createdVisitId = visitRes.body.id;
  });

  it('3. Executes Perbup 25/2024 (Karcis before service) + Pasal 79 (UPP excluded) + Idempotent Payment', async () => {
    // Petugas approves visit
    await request(app.getHttpServer())
      .post(`/api/v1/visits/${createdVisitId}/approve`)
      .set('Authorization', `Bearer ${petugasToken}`)
      .expect(201);

    // Bendahara generates KARCIS (ADVANCE_SKRD) BEFORE berthing
    const karcisRes = await request(app.getHttpServer())
      .post(`/api/v1/billing/visits/${createdVisitId}/advance-skrd`)
      .set('Authorization', `Bearer ${bendaharaToken}`)
      .send({ collectionInstrument: CollectionInstrument.KARCIS })
      .expect(201);

    expect(karcisRes.body.collectionInstrument).toBe(CollectionInstrument.KARCIS);
    expect(karcisRes.body.invoiceNumber).toMatch(/^KRC-/);
    // 500 GT * 1 period (15 days) * Rp 50 = Rp 25.000 (Jasa Labuh)
    expect(Number(karcisRes.body.totalAmountIdr)).toBe(25000);

    // Issue Karcis
    await request(app.getHttpServer())
      .post(`/api/v1/billing/invoices/${karcisRes.body.id}/issue`)
      .set('Authorization', `Bearer ${bendaharaToken}`)
      .expect(201);

    // Record payment with Idempotency Key
    const idempKey = `E2E-IDEMP-${uniqueSuffix}`;
    const pay1 = await request(app.getHttpServer())
      .post(`/api/v1/billing/invoices/${karcisRes.body.id}/payments`)
      .set('Authorization', `Bearer ${bendaharaToken}`)
      .send({
        idempotencyKey: idempKey,
        amountIdr: 25000,
        method: PaymentMethod.CASH_TREASURER,
        paidAt: '2026-11-16T08:15:00.000Z',
      })
      .expect(201);

    // Retry same idempotencyKey -> returns same payment, no duplicate
    const pay2 = await request(app.getHttpServer())
      .post(`/api/v1/billing/invoices/${karcisRes.body.id}/payments`)
      .set('Authorization', `Bearer ${bendaharaToken}`)
      .send({
        idempotencyKey: idempKey,
        amountIdr: 25000,
        method: PaymentMethod.CASH_TREASURER,
        paidAt: '2026-11-16T08:15:00.000Z',
      })
      .expect(201);
    expect(pay2.body.id).toBe(pay1.body.id);

    // Verify SSRD number auto-generated on settled Karcis & print payload works
    const printRes = await request(app.getHttpServer())
      .get(`/api/v1/billing/invoices/${karcisRes.body.id}/print-payload`)
      .set('Authorization', `Bearer ${bendaharaToken}`)
      .expect(200);
    expect(printRes.body.ssrdNumber).toMatch(/^SSRD-/);
    expect(printRes.body.remainingDueIdr).toBe(0);

    // Berthing 1: UPP Kemenhub berth (NOT_BILLABLE) -> should NOT be billed
    const uppStart = await request(app.getHttpServer())
      .post(`/api/v1/visits/${createdVisitId}/berthings/start`)
      .set('Authorization', `Bearer ${petugasToken}`)
      .field('berthId', String(uppBerthId))
      .field('berthCategory', 'UMUM')
      .field('actualStartAt', '2026-11-16T09:00:00.000Z')
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/visits/${createdVisitId}/berthings/${uppStart.body.id}/end`)
      .set('Authorization', `Bearer ${petugasToken}`)
      .send({ actualEndAt: '2026-11-16T15:00:00.000Z' })
      .expect(201);

    // Berthing 2: Pemda Beton berth (BILLABLE, 24 hours = 1 etmal -> 500 * 1 * 38 = Rp 19.000)
    const pemdaStart = await request(app.getHttpServer())
      .post(`/api/v1/visits/${createdVisitId}/berthings/start`)
      .set('Authorization', `Bearer ${petugasToken}`)
      .field('berthId', String(pemdaBerthId))
      .field('berthCategory', 'UMUM')
      .field('actualStartAt', '2026-11-16T16:00:00.000Z')
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/visits/${createdVisitId}/berthings/${pemdaStart.body.id}/end`)
      .set('Authorization', `Bearer ${petugasToken}`)
      .send({ actualEndAt: '2026-11-17T16:00:00.000Z' })
      .expect(201);

    // Depart -> auto-drafts FINAL_SKRD via Domain Event
    await request(app.getHttpServer())
      .post(`/api/v1/visits/${createdVisitId}/depart`)
      .set('Authorization', `Bearer ${petugasToken}`)
      .send({ atdPort: '2026-11-17T17:00:00.000Z' })
      .expect(201);

    // Allow async @OnEvent handler to finish
    await new Promise((r) => setTimeout(r, 400));

    const finalInvoice = await prisma.invoice.findFirstOrThrow({
      where: { visitId: createdVisitId, billingStage: BillingStage.FINAL_SKRD },
      include: { items: true },
    });

    // Total = Jasa Labuh (25.000) + Tambat Pemda (19.000) = Rp 44.000 (UPP berth excluded!)
    expect(finalInvoice.items).toHaveLength(2);
    expect(Number(finalInvoice.totalAmountIdr)).toBe(44000);

    // Issue FINAL_SKRD -> PARTIAL (since Rp 25.000 was already paid via Karcis)
    const issuedFinal = await request(app.getHttpServer())
      .post(`/api/v1/billing/invoices/${finalInvoice.id}/issue`)
      .set('Authorization', `Bearer ${bendaharaToken}`)
      .expect(201);
    expect(issuedFinal.body.status).toBe('PARTIAL');

    // Once FINAL_SKRD is issued, mutating visit (e.g. start berthing) is strictly locked
    await request(app.getHttpServer())
      .post(`/api/v1/visits/${createdVisitId}/berthings/start`)
      .set('Authorization', `Bearer ${petugasToken}`)
      .field('berthId', String(pemdaBerthId))
      .field('berthCategory', 'UMUM')
      .field('actualStartAt', '2026-11-17T18:00:00.000Z')
      .expect(409);
  });

  it('4. Serves Public Portal (tariffs, invoice check, & complaint submission/tracking)', async () => {
    const tariffsRes = await request(app.getHttpServer())
      .get('/api/v1/public/tariffs')
      .expect(200);
    expect(tariffsRes.body.length).toBeGreaterThanOrEqual(25);

    const complaintRes = await request(app.getHttpServer())
      .post('/api/v1/public/complaints')
      .send({
        portId: pomakoPortId,
        reporterName: 'Warga Paumako',
        category: 'FASILITAS_DERMAGA',
        subject: 'Lampu dermaga padam',
        description: 'Mohon perbaikan lampu dermaga sisi timur.',
      })
      .expect(201);

    createdComplaintTicket = complaintRes.body.ticketNumber;
    expect(createdComplaintTicket).toMatch(/^ADU-PMK-/);

    const trackRes = await request(app.getHttpServer())
      .get(`/api/v1/public/complaints/track?ticketNumber=${createdComplaintTicket}`)
      .expect(200);
    expect(trackRes.body.status).toBe('OPEN');
  });

  it('5. Enforces Optimistic Locking & Zero Discrepancy in Phase 2 Gate Ticketing', async () => {
    const bookRes = await request(app.getHttpServer())
      .post('/api/v1/gate-ticketing/books')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        portId: pomakoPortId,
        bookCode: `E2E-BOOK-${uniqueSuffix}`,
        ticketCategory: 'MB_TRUCK_BUS_BESAR',
        serialStart: 1,
        serialEnd: 50,
        nominalPerTicket: 35000,
      })
      .expect(201);
    createdGateBookId = bookRes.body.id;

    // Open shift handover
    const openRes = await request(app.getHttpServer())
      .post('/api/v1/gate-ticketing/handovers/open')
      .set('Authorization', `Bearer ${petugasToken}`)
      .send({ bookId: createdGateBookId, wardenName: 'Juru Gerbang E2E' })
      .expect(201);

    // Second shift trying to claim the same ACTIVE book -> 409 Conflict
    await request(app.getHttpServer())
      .post('/api/v1/gate-ticketing/handovers/open')
      .set('Authorization', `Bearer ${petugasToken}`)
      .send({ bookId: createdGateBookId, wardenName: 'Juru Gerbang 2' })
      .expect(409);

    // Close handover with discrepancy (10 tickets * 35.000 = 350.000, settled 300.000) -> 400 Bad Request
    await request(app.getHttpServer())
      .post(`/api/v1/gate-ticketing/handovers/${openRes.body.id}/close`)
      .set('Authorization', `Bearer ${bendaharaToken}`)
      .send({ lastReturnedSerial: 11, actualCashSettledIdr: 300000 })
      .expect(400);

    // Close handover with exact amount (Zero Discrepancy) -> 201 Created
    const settleRes = await request(app.getHttpServer())
      .post(`/api/v1/gate-ticketing/handovers/${openRes.body.id}/close`)
      .set('Authorization', `Bearer ${bendaharaToken}`)
      .send({ lastReturnedSerial: 11, actualCashSettledIdr: 350000 })
      .expect(201);
    expect(settleRes.body.soldQty).toBe(10);
    expect(Number(settleRes.body.unmatchedAmountIdr)).toBe(0);
  });

  it('6. Enforces Optimistic Locking on Port Asset Leases, Maintenance Tickets & Unified Revenue Summary', async () => {
    const assetRes = await request(app.getHttpServer())
      .post('/api/v1/assets-leases/assets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        portId: pomakoPortId,
        assetCode: `E2E-KIOS-${uniqueSuffix}`,
        name: 'Kios E2E Terminal',
        assetType: 'KIOS',
        areaSqm: 20,
        annualRatePerSqmIdr: 5000,
        billingEligibility: 'BILLABLE',
      })
      .expect(201);
    createdAssetId = assetRes.body.id;

    // Create & activate lease (20 sqm * 5000 = 100.000)
    const leaseRes = await request(app.getHttpServer())
      .post('/api/v1/assets-leases/leases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        assetId: createdAssetId,
        tenantName: 'CV E2E Niaga',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      })
      .expect(201);
    expect(Number(leaseRes.body.totalAnnualAmountIdr)).toBe(100000);

    // Concurrent/second lease on already LEASED asset -> 409 Conflict
    await request(app.getHttpServer())
      .post('/api/v1/assets-leases/leases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        assetId: createdAssetId,
        tenantName: 'CV Lain',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      })
      .expect(409);

    // Record lease payment
    await request(app.getHttpServer())
      .post(`/api/v1/assets-leases/leases/${leaseRes.body.id}/payments`)
      .set('Authorization', `Bearer ${bendaharaToken}`)
      .send({
        idempotencyKey: `E2E-LEASE-PAY-${uniqueSuffix}`,
        periodYear: 2026,
        amountIdr: 100000,
        paidAt: '2026-11-16T10:00:00.000Z',
      })
      .expect(201);

    // Report & resolve maintenance ticket on Pemda berth
    const mntRes = await request(app.getHttpServer())
      .post('/api/v1/maintenance')
      .set('Authorization', `Bearer ${petugasToken}`)
      .field('portId', String(pomakoPortId))
      .field('berthId', String(pemdaBerthId))
      .field('severity', 'HIGH')
      .field('title', 'Bolder Dermaga Longgar')
      .field('description', 'Perlu pengelasan ulang')
      .expect(201);
    createdMaintenanceId = mntRes.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/maintenance/${createdMaintenanceId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'VERIFIED_FIXED', resolutionNote: 'Sudah diperbaiki' })
      .expect(200);

    // Verify unified revenue summary combines all 3 revenue streams cleanly
    const summaryRes = await request(app.getHttpServer())
      .get('/api/v1/reports/revenue-summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(summaryRes.body.vesselRevenueIdr).toBeGreaterThanOrEqual(25000);
    expect(summaryRes.body.gateTicketingRevenueIdr).toBeGreaterThanOrEqual(350000);
    expect(summaryRes.body.assetLeaseRevenueIdr).toBeGreaterThanOrEqual(100000);
  });

  it('7. Handles Phase 2B Cargo Handling, Equipment Rental & Utility Meters (Lampiran XI B, C, D)', async () => {
    const cargoRes = await request(app.getHttpServer())
      .post('/api/v1/cargo-utility/cargo')
      .set('Authorization', `Bearer ${petugasToken}`)
      .send({
        portId: pomakoPortId,
        visitId: createdVisitId,
        cargoCategory: 'BARANG_BULOG_PUPUK',
        description: 'Beras Bulog 50 ton',
        quantity: 50,
        unitLabel: 'ton',
        ratePerUnitIdr: 2500,
      })
      .expect(201);
    createdCargoId = cargoRes.body.id;
    expect(Number(cargoRes.body.totalAmountIdr)).toBe(125000);

    await request(app.getHttpServer())
      .post(`/api/v1/cargo-utility/cargo/${createdCargoId}/pay`)
      .set('Authorization', `Bearer ${bendaharaToken}`)
      .send({ idempotencyKey: `E2E-CRG-PAY-${uniqueSuffix}` })
      .expect(201);

    const eqRes = await request(app.getHttpServer())
      .post('/api/v1/cargo-utility/equipment')
      .set('Authorization', `Bearer ${petugasToken}`)
      .send({
        portId: pomakoPortId,
        visitId: createdVisitId,
        equipmentType: 'FORKLIFT',
        capacityLabel: 'Forklift 5 Ton',
        unitCount: 1,
        durationHours: 2,
        ratePerHourIdr: 150000,
      })
      .expect(201);
    createdEquipmentId = eqRes.body.id;
    expect(Number(eqRes.body.totalAmountIdr)).toBe(300000);

    await request(app.getHttpServer())
      .post(`/api/v1/cargo-utility/equipment/${createdEquipmentId}/pay`)
      .set('Authorization', `Bearer ${bendaharaToken}`)
      .send({ idempotencyKey: `E2E-EQP-PAY-${uniqueSuffix}` })
      .expect(201);

    // Invalid meter reading (meterEnd <= meterStart) -> 400 Bad Request
    await request(app.getHttpServer())
      .post('/api/v1/cargo-utility/utilities')
      .set('Authorization', `Bearer ${petugasToken}`)
      .send({
        portId: pomakoPortId,
        visitId: createdVisitId,
        utilityType: 'AIR_BERSIH',
        meterStart: 1000,
        meterEnd: 900,
        unitLabel: 'liter',
        ratePerUnitIdr: 500,
      })
      .expect(400);

    const utlRes = await request(app.getHttpServer())
      .post('/api/v1/cargo-utility/utilities')
      .set('Authorization', `Bearer ${petugasToken}`)
      .send({
        portId: pomakoPortId,
        visitId: createdVisitId,
        utilityType: 'AIR_BERSIH',
        meterStart: 1000,
        meterEnd: 1200,
        unitLabel: 'liter',
        ratePerUnitIdr: 500,
      })
      .expect(201);
    createdUtilityId = utlRes.body.id;
    expect(Number(utlRes.body.volumeConsumed)).toBe(200);
    expect(Number(utlRes.body.totalAmountIdr)).toBe(100000);

    await request(app.getHttpServer())
      .post(`/api/v1/cargo-utility/utilities/${createdUtilityId}/pay`)
      .set('Authorization', `Bearer ${bendaharaToken}`)
      .send({ idempotencyKey: `E2E-UTL-PAY-${uniqueSuffix}` })
      .expect(201);

    const summaryRes = await request(app.getHttpServer())
      .get('/api/v1/reports/revenue-summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(summaryRes.body.cargoEquipmentRevenueIdr).toBeGreaterThanOrEqual(425000);
    expect(summaryRes.body.utilityRevenueIdr).toBeGreaterThanOrEqual(100000);
  });

  it('8. Executes Phase 3 Bank Webhook (HMAC), Revenue Simulation & GIS Opportunities', async () => {
    const finalInvoice = await prisma.invoice.findFirstOrThrow({
      where: { visitId: createdVisitId, billingStage: BillingStage.FINAL_SKRD },
    });

    const idempKey = `BPD-WEBHOOK-${uniqueSuffix}`;
    const remainingAmount = 19000;
    const webhookBody = {
      idempotencyKey: idempKey,
      invoiceNumber: finalInvoice.invoiceNumber,
      amountIdr: remainingAmount,
      method: PaymentMethod.VA,
      referenceNo: `VA-BPD-${uniqueSuffix}`,
      paidAt: '2026-11-17T18:00:00.000Z',
    };

    // Invalid HMAC signature -> 401 Unauthorized
    await request(app.getHttpServer())
      .post('/api/v1/billing/webhooks/bank-payment')
      .set('x-porta-signature', 'invalid-signature')
      .send(webhookBody)
      .expect(401);

    // Valid HMAC-SHA256 signature -> settles FINAL_SKRD & transitions visit to SETTLED
    const secret = process.env.BANK_WEBHOOK_SECRET || 'porta-bank-webhook-secret-2026';
    const sig = crypto
      .createHmac('sha256', secret)
      .update(`${idempKey}:${finalInvoice.invoiceNumber}:${remainingAmount}`)
      .digest('hex');

    const webhookRes = await request(app.getHttpServer())
      .post('/api/v1/billing/webhooks/bank-payment')
      .set('x-porta-signature', sig)
      .send(webhookBody)
      .expect(201);

    expect(webhookRes.body.invoiceStatus).toBe('PAID');
    expect(webhookRes.body.ssrdNumber).toMatch(/^SSRD-/);

    const settledVisit = await prisma.shipVisit.findUniqueOrThrow({
      where: { id: createdVisitId },
    });
    expect(settledVisit.status).toBe('SETTLED');

    // Simulate PAD Revenue
    const simRes = await request(app.getHttpServer())
      .post('/api/v1/reports/simulate-revenue')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        estimatedMonthlyVisits: 10,
        averageGt: 500,
        averageEtmal: 2,
        tariffPerGtEtmalIdr: 38,
        labuhTariffPerGtIdr: 50,
        tariffAdjustmentPercent: 0,
      })
      .expect(201);
    expect(simRes.body.monthlyLabuhIdr).toBe(250000);
    expect(simRes.body.monthlyTambatIdr).toBe(380000);

    // GIS Opportunities
    const gisRes = await request(app.getHttpServer())
      .get('/api/v1/reports/gis-opportunities')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(gisRes.body.berths.length).toBeGreaterThanOrEqual(3);
  });

  it('9. Records Vessel Manifest, Passenger/Vehicle Log & Terminal Passenger Fees (Lampiran XI D.2)', async () => {
    const manifestRes = await request(app.getHttpServer())
      .post('/api/v1/gate-ticketing/manifests')
      .set('Authorization', `Bearer ${petugasToken}`)
      .send({
        portId: pomakoPortId,
        visitId: createdVisitId,
        terminalClass: 'KELAS_B',
        adultCount: 10,
        childCount: 5,
        infantCount: 2,
        greeterCount: 3,
        vehicleCount: 4,
        cargoTons: 2.5,
      })
      .expect(201);

    createdManifestId = manifestRes.body.id;
    // Kelas B: (10 + 5) * 3000 + 3 * 3000 = 54.000
    expect(Number(manifestRes.body.terminalFeeIdr)).toBe(54000);

    // Duplicate manifest for same visit -> 409 Conflict
    await request(app.getHttpServer())
      .post('/api/v1/gate-ticketing/manifests')
      .set('Authorization', `Bearer ${petugasToken}`)
      .send({
        portId: pomakoPortId,
        visitId: createdVisitId,
        adultCount: 1,
      })
      .expect(409);

    const summaryRes = await request(app.getHttpServer())
      .get('/api/v1/reports/revenue-summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(summaryRes.body.passengerTraffic.totalPassengers).toBeGreaterThanOrEqual(17);
    expect(summaryRes.body.passengerTraffic.totalVehicles).toBeGreaterThanOrEqual(4);
  });
});

