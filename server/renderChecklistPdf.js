import { chromium as playwright } from 'playwright-core';
import path from 'node:path';

export async function htmlToPdfBuffer(html) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.emulateMedia({ media: 'print' });
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images].map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
              }),
        ),
      );
    });
    return await page.pdf({
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } finally {
    await browser.close();
  }
}

async function launchBrowser() {
  const isVercel = Boolean(process.env.VERCEL);

  if (isVercel) {
    const chromium = (await import('@sparticuz/chromium')).default;
    if (!process.env.AWS_LAMBDA_JS_RUNTIME) {
      process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs22.x';
    }
    if (typeof chromium.setGraphicsMode === 'function') {
      chromium.setGraphicsMode(false);
    }
    const executablePath = await chromium.executablePath();
    process.env.LD_LIBRARY_PATH = [path.dirname(executablePath), process.env.LD_LIBRARY_PATH]
      .filter(Boolean)
      .join(path.delimiter);

    return playwright.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });
  }

  const attempts = [{ channel: 'msedge' }, { channel: 'chrome' }, { channel: 'chromium' }, {}];
  let lastError;
  for (const opts of attempts) {
    try {
      return await playwright.launch({ ...opts, headless: true });
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `Could not launch a local browser for PDF export (${lastError?.message ?? 'unknown error'}). Install Google Chrome or Microsoft Edge.`,
  );
}
