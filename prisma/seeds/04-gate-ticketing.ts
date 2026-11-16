import {
  GateTicketBookStatus,
  HandoverStatus,
  PrismaClient,
} from '@prisma/client';

export async function seedGateTicketing(prisma: PrismaClient, portId: number) {
  console.log('Seeding Gate Ticketing Books & Shift Handovers (Zero Discrepancy)...');

  const booksData = [
    {
      bookCode: 'KRC-PMK-ORANG-01',
      ticketCategory: 'TANDA_MASUK_HARIAN_ORANG',
      serialStart: 1,
      serialEnd: 500,
      nominalPerTicket: 2000,
      status: GateTicketBookStatus.ACTIVE,
      porporasiNumber: 'PORP/BAPENDA-MMK/KRC-01/2024',
      porporasiDate: new Date('2024-01-05'),
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Hal. 83',
    },
    {
      bookCode: 'KRC-PMK-R2-01',
      ticketCategory: 'TANDA_MASUK_SEPEDA_MOTOR',
      serialStart: 1,
      serialEnd: 300,
      nominalPerTicket: 3000,
      status: GateTicketBookStatus.ACTIVE,
      porporasiNumber: 'PORP/BAPENDA-MMK/KRC-02/2024',
      porporasiDate: new Date('2024-01-05'),
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Hal. 83',
    },
    {
      bookCode: 'KRC-PMK-R4-01',
      ticketCategory: 'TANDA_MASUK_MOBIL_PENUMPANG',
      serialStart: 1,
      serialEnd: 200,
      nominalPerTicket: 5000,
      status: GateTicketBookStatus.ACTIVE,
      porporasiNumber: 'PORP/BAPENDA-MMK/KRC-03/2024',
      porporasiDate: new Date('2024-01-05'),
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Hal. 83',
    },
    {
      bookCode: 'KRC-PMK-TRUK-01',
      ticketCategory: 'TANDA_MASUK_TRUK_BUS',
      serialStart: 1,
      serialEnd: 150,
      nominalPerTicket: 10000,
      status: GateTicketBookStatus.ACTIVE,
      porporasiNumber: 'PORP/BAPENDA-MMK/KRC-04/2024',
      porporasiDate: new Date('2024-01-05'),
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Hal. 83',
    },
    {
      bookCode: 'KRC-PMK-MB-R2-01',
      ticketCategory: 'JASA_MB_GOL_II_SEPEDA_MOTOR',
      serialStart: 1,
      serialEnd: 200,
      nominalPerTicket: 15000,
      status: GateTicketBookStatus.ACTIVE,
      porporasiNumber: 'PORP/BAPENDA-MMK/MB-01/2024',
      porporasiDate: new Date('2024-01-08'),
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Hal. 84',
    },
    {
      bookCode: 'KRC-PMK-MB-R4-01',
      ticketCategory: 'JASA_MB_GOL_IV_PENUMPANG',
      serialStart: 1,
      serialEnd: 100,
      nominalPerTicket: 75000,
      status: GateTicketBookStatus.ACTIVE,
      porporasiNumber: 'PORP/BAPENDA-MMK/MB-02/2024',
      porporasiDate: new Date('2024-01-08'),
      legalBasis: 'Perda Kab. Mimika No. 4 Tahun 2023 Lampiran XI Hal. 84',
    },
  ];

  const bookMap = new Map<string, number>();

  for (const b of booksData) {
    const book = await prisma.gateTicketBook.upsert({
      where: { bookCode: b.bookCode },
      update: {
        ticketCategory: b.ticketCategory,
        serialStart: b.serialStart,
        serialEnd: b.serialEnd,
        nominalPerTicket: b.nominalPerTicket,
        status: b.status,
        porporasiNumber: b.porporasiNumber,
        porporasiDate: b.porporasiDate,
        legalBasis: b.legalBasis,
      },
      create: {
        portId,
        ...b,
      },
    });
    bookMap.set(b.bookCode, book.id);
  }

  // Seed Handovers (Shift Warden)
  const orangBookId = bookMap.get('KRC-PMK-ORANG-01')!;
  const r2BookId = bookMap.get('KRC-PMK-R2-01')!;
  const r4BookId = bookMap.get('KRC-PMK-R4-01')!;

  const existingHandovers = await prisma.gateWardenHandover.findFirst({
    where: { portId, bookId: orangBookId },
  });

  if (!existingHandovers) {
    // Shift 1: Settled with zero discrepancy
    await prisma.gateWardenHandover.create({
      data: {
        portId,
        bookId: orangBookId,
        wardenName: 'Yohanes Maturbongs',
        dispatchedSerialStart: 1,
        dispatchedSerialEnd: 100,
        lastReturnedSerial: 80,
        soldQty: 80,
        expectedAmountIdr: 160000, // 80 * 2000
        actualCashSettledIdr: 160000,
        unmatchedAmountIdr: 0,
        status: HandoverStatus.SETTLED,
        notes: 'Shift Pagi 07:00 - 15:00. Rekonsiliasi fisik karcis klop dan uang tunai disetor ke Bendahara Penerimaan.',
        dispatchTime: new Date(Date.now() - 3 * 86400000), // 3 days ago
        settleTime: new Date(Date.now() - 3 * 86400000 + 8 * 3600000),
      },
    });

    // Shift 2: Motor R2 Settled with zero discrepancy
    await prisma.gateWardenHandover.create({
      data: {
        portId,
        bookId: r2BookId,
        wardenName: 'Markus Karafir',
        dispatchedSerialStart: 1,
        dispatchedSerialEnd: 80,
        lastReturnedSerial: 50,
        soldQty: 50,
        expectedAmountIdr: 150000, // 50 * 3000
        actualCashSettledIdr: 150000,
        unmatchedAmountIdr: 0,
        status: HandoverStatus.SETTLED,
        notes: 'Shift Siang-Malam 15:00 - 22:00. Penyetoran klop tanpa selisih (Zero Discrepancy).',
        dispatchTime: new Date(Date.now() - 2 * 86400000),
        settleTime: new Date(Date.now() - 2 * 86400000 + 7 * 3600000),
      },
    });

    // Shift 3: Active ongoing shift
    await prisma.gateWardenHandover.create({
      data: {
        portId,
        bookId: r4BookId,
        wardenName: 'Yohanes Maturbongs',
        dispatchedSerialStart: 1,
        dispatchedSerialEnd: 50,
        status: HandoverStatus.DISTRIBUTED,
        notes: 'Shift operasional aktif saat ini di pos gerbang portal Poumako.',
        dispatchTime: new Date(),
      },
    });
  }

  console.log('Gate Ticketing seeded successfully.');
  return { bookMap };
}
