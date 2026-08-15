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
  page.drawText('BACC · PGIA compliance report', { x: 48, y: 770, size: 12, font: bold, color: rgb(1, 1, 1) });
  y = 740;
  line('America/Belize  ·  Annex D slice  ·  not a controlled form', { size: 9, color: muted, gap: 18 });

  const sla = payload.sla ?? {};
  const noc = payload.noc ?? {};
  const reinspect = payload.reinspect ?? {};
  line(`SLA on track ${sla.onTrack ?? '—'}  ·  warning ${sla.warning ?? '—'}  ·  breached ${sla.breached ?? '—'}`, {
    font: bold,
    size: 11,
  });
  line(`NOC register  open ${noc.open ?? 0}  /  closed ${noc.closed ?? 0}`);
  line(
    `Re-inspection verification  ${
      reinspect.rate != null ? `${Math.round(reinspect.rate * 100)}%` : '—'
    }  (${reinspect.withSatReinspection ?? 0}/${reinspect.closed ?? 0})`,
    { gap: 20 },
  );

  line('Open deficiencies by Level', { font: bold, size: 11, color: navy });
  for (const row of payload.levels ?? []) {
    line(`  ${row.label}: ${row.count}`);
  }
  y -= 8;
  line('Overdue / missed inspections', { font: bold, size: 11, color: navy });
  for (const row of payload.overdue ?? []) {
    line(`  ${row.templateCode}  ${row.assignee}  ${String(row.due_at).slice(0, 10)}  ${row.status}  ${row.daysOverdue}d`);
  }
  y -= 8;
  line('Completion rate', { font: bold, size: 11, color: navy });
  for (const row of payload.completion?.points ?? []) {
    line(`  ${row.period}  ${row.submitted}/${row.due}  ${Math.round(row.rate * 100)}%`);
  }

  y -= 16;
  line('This PDF is a house-style report. Approved annexes continue to use the overlay pipeline.', {
    size: 8,
    color: muted,
  });

  const bytes = await doc.save();
  return { bytes, filename: 'BACC-compliance-report.pdf' };
}
