/**
 * Generate the BACC portal IT infrastructure security assessment as a PDF.
 *
 *   node scripts/generate-security-assessment-pdf.mjs
 *
 * Output: docs/security-assessment-bacc-portal.pdf
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs');
const outPdf = path.join(outDir, 'security-assessment-bacc-portal.pdf');
const outHtml = path.join(outDir, 'security-assessment-bacc-portal.html');

const ASSESSMENT_DATE = '31 August 2026';
const VERSION = '1.0';

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { left: 50, right: 50, top: 56, bottom: 56 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;

function wrapLine(font, text, size, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapParagraphs(font, paragraphs, size, maxWidth) {
  const out = [];
  for (const para of paragraphs) {
    if (!para) {
      out.push('');
      continue;
    }
    out.push(...wrapLine(font, para, size, maxWidth));
    out.push('');
  }
  if (out[out.length - 1] === '') out.pop();
  return out;
}

class PdfWriter {
  constructor(pdfDoc, fonts) {
    this.pdfDoc = pdfDoc;
    this.fonts = fonts;
    this.page = null;
    this.y = 0;
    this.pageNumber = 0;
    this.newPage();
  }

  newPage() {
    this.page = this.pdfDoc.addPage([PAGE.width, PAGE.height]);
    this.pageNumber += 1;
    this.y = PAGE.height - MARGIN.top;
    if (this.pageNumber > 1) {
      this.page.drawText(`BACC Portal Security Assessment v${VERSION}`, {
        x: MARGIN.left,
        y: 28,
        size: 8,
        font: this.fonts.regular,
        color: rgb(0.45, 0.5, 0.58),
      });
      this.page.drawText(String(this.pageNumber), {
        x: PAGE.width - MARGIN.right - 10,
        y: 28,
        size: 8,
        font: this.fonts.regular,
        color: rgb(0.45, 0.5, 0.58),
      });
    }
  }

  ensureSpace(height) {
    if (this.y - height < MARGIN.bottom) this.newPage();
  }

  drawTitle(text) {
    this.ensureSpace(36);
    this.page.drawText(text, {
      x: MARGIN.left,
      y: this.y,
      size: 20,
      font: this.fonts.bold,
      color: rgb(0.043, 0.118, 0.239),
    });
    this.y -= 30;
  }

  drawHeading(text) {
    this.ensureSpace(28);
    this.y -= 8;
    this.page.drawText(text, {
      x: MARGIN.left,
      y: this.y,
      size: 13,
      font: this.fonts.bold,
      color: rgb(0.043, 0.118, 0.239),
    });
    this.y -= 6;
    this.page.drawLine({
      start: { x: MARGIN.left, y: this.y },
      end: { x: PAGE.width - MARGIN.right, y: this.y },
      thickness: 1.5,
      color: rgb(0.043, 0.118, 0.239),
    });
    this.y -= 16;
  }

  drawSubheading(text) {
    this.ensureSpace(20);
    this.page.drawText(text, {
      x: MARGIN.left,
      y: this.y,
      size: 11,
      font: this.fonts.bold,
      color: rgb(0.043, 0.118, 0.239),
    });
    this.y -= 16;
  }

  drawBody(text, size = 10) {
    const lines = wrapParagraphs(this.fonts.regular, [text], size, CONTENT_WIDTH);
    for (const line of lines) {
      this.ensureSpace(size + 4);
      if (line) {
        this.page.drawText(line, {
          x: MARGIN.left,
          y: this.y,
          size,
          font: this.fonts.regular,
          color: rgb(0.043, 0.118, 0.239),
          lineHeight: size + 3,
        });
      }
      this.y -= line ? size + 4 : size;
    }
  }

  drawBullets(items, size = 10) {
    for (const item of items) {
      const lines = wrapLine(this.fonts.regular, item, size, CONTENT_WIDTH - 14);
      lines.forEach((line, i) => {
        this.ensureSpace(size + 4);
        if (i === 0) {
          this.page.drawText('•', {
            x: MARGIN.left,
            y: this.y,
            size,
            font: this.fonts.regular,
            color: rgb(0.043, 0.118, 0.239),
          });
        }
        this.page.drawText(line, {
          x: MARGIN.left + 14,
          y: this.y,
          size,
          font: this.fonts.regular,
          color: rgb(0.043, 0.118, 0.239),
        });
        this.y -= size + 4;
      });
    }
    this.y -= 4;
  }

  drawCallout(text) {
    const lines = wrapParagraphs(this.fonts.regular, [text], 9.5, CONTENT_WIDTH - 20);
    const boxHeight = lines.length * 12 + 16;
    this.ensureSpace(boxHeight);
    this.page.drawRectangle({
      x: MARGIN.left,
      y: this.y - boxHeight + 10,
      width: CONTENT_WIDTH,
      height: boxHeight,
      color: rgb(0.93, 0.95, 0.97),
      borderColor: rgb(0.043, 0.118, 0.239),
      borderWidth: 0,
    });
    this.page.drawRectangle({
      x: MARGIN.left,
      y: this.y - boxHeight + 10,
      width: 3,
      height: boxHeight,
      color: rgb(0.043, 0.118, 0.239),
    });
    let cy = this.y - 6;
    for (const line of lines) {
      this.page.drawText(line, {
        x: MARGIN.left + 12,
        y: cy,
        size: 9.5,
        font: this.fonts.regular,
        color: rgb(0.043, 0.118, 0.239),
      });
      cy -= 12;
    }
    this.y -= boxHeight + 8;
  }

  drawTable(headers, rows, colWidths) {
    const size = 8.5;
    const pad = 5;
    const rowHeight = 22;
    const drawRow = (cells, bold = false) => {
      const wrapped = cells.map((cell, i) =>
        wrapLine(bold ? this.fonts.bold : this.fonts.regular, cell, size, colWidths[i] - pad * 2),
      );
      const lines = Math.max(...wrapped.map((w) => w.length), 1);
      const height = lines * (size + 2) + pad * 2;
      this.ensureSpace(height);
      let x = MARGIN.left;
      cells.forEach((cell, i) => {
        this.page.drawRectangle({
          x,
          y: this.y - height,
          width: colWidths[i],
          height,
          borderColor: rgb(0.77, 0.82, 0.88),
          borderWidth: 0.5,
          color: bold ? rgb(0.93, 0.95, 0.97) : rgb(1, 1, 1),
        });
        let cy = this.y - pad - size;
        for (const line of wrapped[i]) {
          this.page.drawText(line, {
            x: x + pad,
            y: cy,
            size,
            font: bold ? this.fonts.bold : this.fonts.regular,
            color: rgb(0.043, 0.118, 0.239),
          });
          cy -= size + 2;
        }
        x += colWidths[i];
      });
      this.y -= height;
    };
    drawRow(headers, true);
    for (const row of rows) drawRow(row);
    this.y -= 6;
  }
}

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<title>BACC Airport Portal — IT Infrastructure Security Assessment</title></head>
<body>
<p>See security-assessment-bacc-portal.pdf for the formatted assessment. HTML mirror for browser viewing.</p>
</body></html>`;

const pdfDoc = await PDFDocument.create();
const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
const w = new PdfWriter(pdfDoc, { regular, bold });

// Cover
w.drawTitle('IT Infrastructure Security Assessment');
w.drawBody('BACC Airport Operations Portal', 13);
w.drawBody('Philip S.W. Goldson International Airport (PGIA)', 11);
w.y -= 8;
w.drawBody(`Assessment date: ${ASSESSMENT_DATE}  ·  Version ${VERSION}`, 9.5);
w.y -= 20;
w.drawBody('Prepared for: Belize Airports Authority Company (BACC)', 11);
w.drawBody('Prepared by: Vision Forge Ltd', 11);
w.drawCallout(
  'Scope. This document assesses the security posture of the BACC operations portal as deployed today (GitHub Pages static demo with client-side mock data) and outlines requirements for a production deployment suitable for airport authority operations.',
);
w.newPage();

w.drawHeading('1. Executive summary');
w.drawBody(
  'The portal is currently a demonstration environment published as a static site on GitHub Pages. It is appropriate for showcasing approved forms, workflows, and UI to BACC stakeholders. It is not production-ready for handling live operational data, staff credentials, or safety-critical records without substantial infrastructure and security hardening.',
);
w.drawBody(
  'Supabase migrations and Row Level Security (RLS) policies exist in the repository and represent a sound foundation for production. The live demo bypasses these controls by storing all data in browser localStorage with passwordless demo sign-in.',
);
w.drawTable(
  ['Severity', 'Count', 'Summary'],
  [
    ['Critical', '3', 'No real authentication; client-tamperable data; unauthenticated PDF APIs'],
    ['High', '4', 'Client-only role checks; sensitive data in browser; PII on public demo; missing headers'],
    ['Medium', '5', 'Incomplete RLS mapping; upload validation; audit gaps; PWA cache; location retention'],
    ['Low', '3', 'Supply chain; verbose API errors; demo session handling'],
  ],
  [70, 42, CONTENT_WIDTH - 112],
);

w.drawHeading('2. System architecture');
w.drawSubheading('2.1 Application stack');
w.drawBullets([
  'Frontend: React 19, Vite 7, Tailwind 4, React Router 7, PWA (Workbox)',
  'Data (demo): Mock repositories persisting to localStorage (bacc-demo-store)',
  'Data (production): Supabase PostgreSQL + Auth + Storage with RLS in supabase/migrations/',
  'PDF export: Node.js API routes overlaying values onto approved base PDFs via pdf-lib',
  'Deployment (demo): GitHub Pages (gh-pages branch) — static files only; no server APIs',
]);

w.drawSubheading('2.2 Authentication (demo mode)');
w.drawBullets([
  'Password is not validated when Supabase is not configured',
  'User ID stored in sessionStorage (bacc-local-auth)',
  'Any visitor can sign in as any seeded demo account',
  'AppShell route guard only checks that a session exists — not credentials',
]);

w.drawSubheading('2.3 Authorisation');
w.drawBody(
  'Role-based access (OM, duty manager, apron supervisor, electrical tech, SMS, etc.) is enforced primarily in React components and the mock repository. Supabase RLS policies restrict submissions to owners and OM/admin roles, but these policies are inactive while the demo data source is in use.',
);

w.drawHeading('3. Risk register — Critical');
w.drawTable(
  ['Risk', 'Recommendation'],
  [
    [
      'C1 — No real authentication',
      'Enable Supabase Auth or enterprise IdP. Enforce password policy, lockout, and MFA for OM/admin. Remove demo bypass in production.',
    ],
    [
      'C2 — Client-tamperable data',
      'Set VITE_DATA_SOURCE=supabase. Treat browser storage as offline cache only. All writes via authenticated API.',
    ],
    [
      'C3 — Unauthenticated PDF APIs',
      'Require JWT on every /api/export-* route. Validate caller owns the submission. Rate-limit and audit exports.',
    ],
  ],
  [120, CONTENT_WIDTH - 120],
);

w.drawHeading('3. Risk register — High');
w.drawTable(
  ['Risk', 'Recommendation'],
  [
    [
      'H1 — Role checks client-side only',
      'Enforce all role decisions in Supabase RLS and API middleware. Client checks are UX hints only.',
    ],
    [
      'H2 — Sensitive data in browser storage',
      'Store artifacts in Supabase Storage with signed URLs. Encrypt at rest. Clear cache on sign-out.',
    ],
    [
      'H3 — PII on public demo',
      'Use synthetic data on public demos. Production must be private. Obtain staff consent for go-live.',
    ],
    [
      'H4 — Missing security headers',
      'Configure CSP, X-Frame-Options: DENY, Strict-Transport-Security, Referrer-Policy at CDN/proxy.',
    ],
  ],
  [120, CONTENT_WIDTH - 120],
);

w.drawHeading('3. Risk register — Medium & Low');
w.drawTable(
  ['Risk', 'Recommendation'],
  [
    ['M1 — Incomplete RLS role mapping', 'Complete RLS per BACC permission matrix (A3/A4). Pen test before go-live.'],
    ['M2 — File upload without server validation', 'Validate type, size, dimensions server-side. Consider AV scanning.'],
    ['M3 — Audit trail gaps in demo', 'Immutable audit log on every submission, acknowledgment, and incident transition.'],
    ['M4 — PWA service worker caching', 'Never cache authenticated API responses. Version cache on deploy.'],
    ['M5 — Location data retention', 'Define retention period. Restrict map providers. Document lawful basis.'],
    ['L1 — Dependency supply chain', 'Enable Dependabot. Run npm audit in CI. Pin lockfile.'],
    ['L2 — Verbose API errors', 'Generic errors to clients; log details server-side only.'],
  ],
  [130, CONTENT_WIDTH - 130],
);

w.drawHeading('4. Data classification');
w.drawTable(
  ['Data type', 'Sensitivity', 'Production requirement'],
  [
    ['Staff directory', 'Internal / PII', 'RLS-protected profiles; no public exposure'],
    ['Inspection submissions', 'Operational / safety', 'PostgreSQL with RLS; immutable after submit (BACC §11)'],
    ['Digital signatures', 'Legal / evidential', 'Encrypted storage; bind to user and timestamp'],
    ['Incident photos & GPS', 'Operational / PII', 'Private object storage; signed URLs; retention policy'],
    ['Exported PDFs', 'Official records', 'Authenticated API only; audit each export'],
  ],
  [110, 90, CONTENT_WIDTH - 200],
);

w.drawHeading('5. Production infrastructure checklist');
w.drawBullets([
  'Hosting: Private deployment behind HTTPS — not public GitHub Pages',
  'Database: Supabase Pro with RLS, daily backups, point-in-time recovery',
  'Authentication: Supabase Auth, session timeout, MFA for privileged roles',
  'API layer: JWT validation on every request; rate limiting per user/IP',
  'Object storage: Supabase Storage with bucket policies; no public evidence buckets',
  'Network: WAF (Cloudflare / Azure Front Door); optional IP allowlisting for admin',
  'Monitoring: Error tracking, auth failure alerts, weekly audit log review',
  'Compliance: Data processing agreement; assess Belize data residency',
  'Penetration testing: Third-party assessment before live operational data',
  'Disaster recovery: Documented RTO/RPO; tested restore annually',
]);

w.drawHeading('6. Deployment comparison');
w.drawTable(
  ['Capability', 'GitHub Pages (demo)', 'Production target'],
  [
    ['Authentication', 'None (demo picker)', 'Supabase Auth + MFA'],
    ['Data persistence', 'Browser localStorage', 'PostgreSQL with RLS'],
    ['PDF overlay export', 'Not available', 'Authenticated API routes'],
    ['Audit logging', 'None in demo', 'Immutable server-side audit trail'],
    ['Security headers', 'GitHub defaults', 'CSP, HSTS, frame denial'],
  ],
  [120, 150, CONTENT_WIDTH - 270],
);

w.drawHeading('7. Recommended phases');
w.drawSubheading('Phase 1 — Before any live data (4–6 weeks)');
w.drawBullets([
  'Deploy Supabase with migrations and RLS enabled',
  'Switch production to VITE_DATA_SOURCE=supabase',
  'Implement JWT validation on PDF export APIs',
  'Remove real staff PII from public demo',
  'Configure security headers at hosting layer',
]);
w.drawSubheading('Phase 2 — Pre go-live (2–4 weeks)');
w.drawBullets([
  'Complete role permission matrix in RLS policies',
  'Enable MFA for OM, COO, and admin accounts',
  'Server-side file upload validation and immutable audit logging',
  'Internal security review and dependency audit',
]);
w.drawSubheading('Phase 3 — Go-live and ongoing');
w.drawBullets([
  'Third-party penetration test',
  'Security monitoring and incident response runbook',
  'Quarterly access review; annual disaster recovery drill',
]);

w.drawHeading('8. Conclusion');
w.drawBody(
  'The BACC operations portal demonstrates a well-structured application architecture with approved-form fidelity, incident workflows, and a credible path to production via Supabase. The current GitHub Pages deployment is intentionally lightweight and must be treated as a non-production demo.',
);
w.drawBody(
  'Moving to production requires authenticating every user, enforcing authorisation server-side, protecting PDF generation APIs, and hosting on infrastructure with appropriate monitoring, backup, and security controls.',
);
w.y -= 12;
w.drawBody(
  `Document control: BACC Airport Portal Security Assessment v${VERSION} · ${ASSESSMENT_DATE}. Classification: Internal — BACC / Vision Forge Ltd.`,
  8.5,
);

const bytes = await pdfDoc.save();
await mkdir(outDir, { recursive: true });
await writeFile(outPdf, bytes);
await writeFile(outHtml, html, 'utf8');

console.log(`Wrote ${outPdf}`);
console.log(`Source HTML: ${outHtml}`);
