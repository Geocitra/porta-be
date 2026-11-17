import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/common/prisma/prisma.service';

describe('Role Security, Edge Cases & Tenant Isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let superadminToken: string;
  let superadminId: number;
  let adminToken: string;
  let adminId: number;
  let petugasToken: string;
  let seededTenantToken: string;
  let portId: number;

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
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    const saRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@porta.mimikakab.go.id', password: 'Porta123!' })
      .expect(201);
    superadminToken = saRes.body.accessToken;
    superadminId = saRes.body.user.id;

    const admRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin.pomako@porta.mimikakab.go.id', password: 'Porta123!' })
      .expect(201);
    adminToken = admRes.body.accessToken;
    adminId = admRes.body.user.id;
    portId = admRes.body.user.portId;

    const ptgRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'petugas.pomako@porta.mimikakab.go.id', password: 'Porta123!' })
      .expect(201);
    petugasToken = ptgRes.body.accessToken;

    const tntRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'tenant@sinarpapua.co.id', password: 'Porta123!' })
      .expect(201);
    seededTenantToken = tntRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. SUPERADMIN: can view audit logs, other roles are forbidden, and cannot self-deactivate', async () => {
    const logsRes = await request(app.getHttpServer())
      .get('/api/v1/reports/audit-logs')
      .set('Authorization', `Bearer ${superadminToken}`)
      .expect(200);
    expect(Array.isArray(logsRes.body)).toBe(true);

    await request(app.getHttpServer())
      .get('/api/v1/reports/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/reports/audit-logs')
      .set('Authorization', `Bearer ${petugasToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/reports/audit-logs')
      .set('Authorization', `Bearer ${seededTenantToken}`)
      .expect(403);

    // Self-deactivation must be blocked
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${superadminId}/status`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ isActive: false })
      .expect(403);
  });

  it('2. ADMIN_PELABUHAN & Users: prevents privilege escalation, cross-port user creation, and orphan TENANT user', async () => {
    // ADMIN_PELABUHAN cannot create SUPERADMIN
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `escalate-${Date.now()}@porta.test`,
        password: 'Password123!',
        fullName: 'Hacker Escalation',
        role: UserRole.SUPERADMIN,
      })
      .expect(403);

    // ADMIN_PELABUHAN cannot deactivate self or another ADMIN_PELABUHAN
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${adminId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(403);

    // ADMIN_PELABUHAN cannot create user for another portId
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `crossport-${Date.now()}@porta.test`,
        password: 'Password123!',
        fullName: 'Cross Port Petugas',
        role: UserRole.PETUGAS_DERMAGA,
        portId: portId + 999,
      })
      .expect(403);

    // SUPERADMIN cannot create TENANT user without tenantId
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        email: `orphantenant-${Date.now()}@porta.test`,
        password: 'Password123!',
        fullName: 'Orphan Tenant',
        role: UserRole.TENANT,
      })
      .expect(400);
  });

  it('3. PETUGAS_DERMAGA: enforces Maker-Checker and blocks admin-only endpoints', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/vessels/operators/1/verify')
      .set('Authorization', `Bearer ${petugasToken}`)
      .send({ status: 'VERIFIED' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/gate-ticketing/books')
      .set('Authorization', `Bearer ${petugasToken}`)
      .send({
        portId,
        bookCode: `UNAUTH-${Date.now()}`,
        ticketCategory: 'PAS_PENUMPANG',
        serialStart: 1,
        serialEnd: 10,
        nominalPerTicket: 5000,
      })
      .expect(403);

    // Can list handovers via the new GET endpoint
    const handoversRes = await request(app.getHttpServer())
      .get('/api/v1/gate-ticketing/handovers')
      .set('Authorization', `Bearer ${petugasToken}`)
      .expect(200);
    expect(Array.isArray(handoversRes.body)).toBe(true);
  });

  it('4. TENANT: blocks cross-module data access, enforces verification gate, lease renewal, and utility isolation', async () => {
    // Cross-module bypass checks: TENANT must get 403 on ship/billing/warning endpoints
    await request(app.getHttpServer())
      .get('/api/v1/vessels')
      .set('Authorization', `Bearer ${seededTenantToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/vessels/operators')
      .set('Authorization', `Bearer ${seededTenantToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/visits')
      .set('Authorization', `Bearer ${seededTenantToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/billing/invoices')
      .set('Authorization', `Bearer ${seededTenantToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/warnings')
      .set('Authorization', `Bearer ${seededTenantToken}`)
      .expect(403);

    // Self-register a new PENDING tenant
    const suffix = Date.now();
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send({
        email: `tenant-${suffix}@test.co.id`,
        password: 'Password123!',
        fullName: 'Budi Tenant Baru',
        businessName: `CV Uji Coba ${suffix}`,
        npwp: '09.888.777.6-954.000',
      })
      .expect(201);

    const newTenantToken = regRes.body.accessToken;
    const newTenantId = regRes.body.user.tenantId;

    // Create a fresh BILLABLE AVAILABLE asset via ADMIN_PELABUHAN
    const assetRes = await request(app.getHttpServer())
      .post('/api/v1/assets-leases/assets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        portId,
        assetCode: `KIOS-E2E-${suffix}`,
        name: `Kios Uji E2E ${suffix}`,
        assetType: 'KIOS',
        areaSqm: 15,
        annualRatePerSqmIdr: 100000,
        billingEligibility: 'BILLABLE',
      })
      .expect(201);
    const assetId = assetRes.body.id;

    // Unverified PENDING tenant MUST be blocked from requesting a lease
    await request(app.getHttpServer())
      .post('/api/v1/assets-leases/leases/request')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .send({
        assetId,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      })
      .expect(403);

    // ADMIN_PELABUHAN verifies the new tenant
    await request(app.getHttpServer())
      .patch(`/api/v1/assets-leases/tenants/${newTenantId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ verificationStatus: 'VERIFIED' })
      .expect(200);

    // Verified tenant requests lease -> REQUESTED
    const leaseReqRes = await request(app.getHttpServer())
      .post('/api/v1/assets-leases/leases/request')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .send({
        assetId,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      })
      .expect(201);
    expect(leaseReqRes.body.status).toBe('REQUESTED');
    const leaseId = leaseReqRes.body.id;

    // Duplicate pending request by same tenant -> 409 Conflict
    await request(app.getHttpServer())
      .post('/api/v1/assets-leases/leases/request')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .send({
        assetId,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      })
      .expect(409);

    // ADMIN_PELABUHAN approves lease -> ACTIVE & asset LEASED
    const approveRes = await request(app.getHttpServer())
      .patch(`/api/v1/assets-leases/leases/${leaseId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(approveRes.body.status).toBe('ACTIVE');

    // Another tenant (seededTenant) trying to request the same LEASED asset -> 409 Conflict
    await request(app.getHttpServer())
      .post('/api/v1/assets-leases/leases/request')
      .set('Authorization', `Bearer ${seededTenantToken}`)
      .send({
        assetId,
        startDate: '2027-01-01',
        endDate: '2027-12-31',
      })
      .expect(409);

    // Same tenant CAN request a renewal for the next period!
    const renewalRes = await request(app.getHttpServer())
      .post('/api/v1/assets-leases/leases/request')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .send({
        assetId,
        startDate: '2027-01-01',
        endDate: '2027-12-31',
      })
      .expect(201);
    expect(renewalRes.body.status).toBe('REQUESTED');

    // Record a utility meter reading on newTenant's asset -> seededTenant must NOT see it!
    const utilRes = await request(app.getHttpServer())
      .post('/api/v1/cargo-utility/utilities')
      .set('Authorization', `Bearer ${petugasToken}`)
      .send({
        portId,
        assetId,
        utilityType: 'LISTRIK',
        meterStart: 100,
        meterEnd: 250,
        unitLabel: 'kWh',
        ratePerUnitIdr: 1500,
      })
      .expect(201);

    const seededUtils = await request(app.getHttpServer())
      .get('/api/v1/cargo-utility/utilities')
      .set('Authorization', `Bearer ${seededTenantToken}`)
      .expect(200);
    const leaked = (seededUtils.body as Array<{ id: number }>).some(
      (u) => u.id === utilRes.body.id,
    );
    expect(leaked).toBe(false);

    // Clean up created E2E records in reverse FK order
    const newTenantUserId = regRes.body.user.id;
    await prisma.utilityMeterReading.delete({ where: { id: utilRes.body.id } });
    await prisma.assetLease.deleteMany({ where: { assetId } });
    await prisma.portAsset.delete({ where: { id: assetId } });
    await prisma.auditLog.deleteMany({ where: { actorId: newTenantUserId } });
    await prisma.user.deleteMany({ where: { tenantId: newTenantId } });
    await prisma.tenant.delete({ where: { id: newTenantId } });
  });
});
