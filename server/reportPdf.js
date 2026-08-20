import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * House-style compliance report. Not an overlay onto an approved annex.
 */
export async function buildReportPdf(payload = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.043, 0.118, 0.239);
  const ink = rgb(0.102, 0.137, 0.196);
  const muted = rgb(0.357, 0.42, 0.502);

  let page = doc.addPage([612, 792]);
  let y = 750;

  const ensure = (need) => {
    if (y - need < 48) {
      page = doc.addPage([612, 792]);
      y = 750;
    }
  };

  const line = (text, { size = 10, color = ink, font: f = font, gap = 14 } = {}) => {
    ensure(gap + 4);
    page.drawText(String(text).slice(0, 110), { x: 48, y, size, font: f, color });
    y -= gap;
  };

  page.drawRectangle({ x: 0, y: 760, width: 612, height: 32, color: navy });
  page.drawText('BACC · PGIA inspection report', { x: 48, y: 770, size: 12, font: bold, color: rgb(1, 1, 1) });
  y = 740;
  line('America/Belize  ·  scheduled inspection programme  ·  not a controlled form', { size: 9, color: muted, gap: 18 });

  const totals = payload.totals ?? {};
  const rate = payload.onTimeRate;

  line(
    `${totals.behind ?? 0} inspections behind  ·  ${totals.outstanding ?? 0} still to do  ·  ${
      rate == null ? '—' : `${rate}%`
    } filed on time`,
    { font: bold, size: 11, gap: 20 },
  );

  line('Which teams still have inspections to complete?', { font: bold, size: 11, color: navy });
  for (const row of payload.teams ?? []) {
    const behind = (row.overdue ?? 0) + (row.missed ?? 0);
    line(
      `  ${row.label}: ${row.completed}/${row.scheduled} done (${Math.round((row.rate ?? 0) * 100)}%)` +
        `${behind ? `  ·  ${behind} past due` : ''}${row.late ? `  ·  ${row.late} filed late` : ''}`,
    );
  }
  y -= 8;

  line('Filed on time vs late, by week', { font: bold, size: 11, color: navy });
  for (const row of payload.weeks ?? []) {
    if (!row.onTime && !row.late) continue;
    line(`  week of ${row.label}: ${row.onTime} on time, ${row.late} late`);
  }
  y -= 8;

  line('What was filed late?', { font: bold, size: 11, color: navy });
  for (const row of payload.late ?? []) {
    line(`  ${row.code}  ${row.team}  due ${row.due}  filed ${row.completed}  ${row.daysLate}d late`);
  }

  y -= 16;
  line('This PDF is a house-style report. Approved annexes continue to use the overlay pipeline.', {
    size: 8,
    color: muted,
  });

  const bytes = await doc.save();
  return { bytes, filename: 'BACC-inspection-report.pdf' };
}
