import puppeteer from 'puppeteer-core';
import {PDFDocument, StandardFonts, rgb} from 'pdf-lib';

async function launch() {
  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell'});
  }
  return puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
}

export async function htmlToPdf(html) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    // The page is self-contained, so scripts and network access are never needed.
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => (/^(data|about):/.test(request.url()) ? request.continue() : request.abort()));
    await page.setContent(html, {waitUntil: 'load'});
    await page.emulateMediaType('print');
    return Buffer.from(await page.pdf({format: 'A4', printBackground: true, preferCSSPageSize: true}));
  } finally {
    await browser.close();
  }
}

const png = (value) => Buffer.from(String(value).split(',')[1] || '', 'base64');

/**
 * Stamp the signer's field images onto an uploaded PDF and append a signing record.
 * Field images are drawn in the browser, which handles Hebrew text direction.
 */
export async function stampPdf(source, {fields, values, signature, record}) {
  const doc = await PDFDocument.load(source, {ignoreEncryption: true});
  const pages = doc.getPages();
  for (const field of fields) {
    const value = values[field.id];
    const page = pages[field.page];
    if (!value || !page) continue;
    const image = await doc.embedPng(png(value));
    const {width, height} = page.getSize();
    const box = {w: field.w * width, h: field.h * height};
    const scale = Math.min(box.w / image.width, box.h / image.height);
    page.drawImage(image, {
      x: field.x * width + (box.w - image.width * scale) / 2,
      y: height - field.y * height - box.h + (box.h - image.height * scale) / 2,
      width: image.width * scale,
      height: image.height * scale,
    });
  }
  const certificate = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const write = (text, y, size = 11) =>
    certificate.drawText(text.replace(/[^\x20-\x7e]/g, '?'), {x: 56, y, size, font, color: rgb(0.1, 0.1, 0.1)});
  write('Signature record', 770, 18);
  write(`Document ID: ${record.id}`, 736);
  write(`Signed at (UTC): ${record.at}`, 718);
  write(`Signer IP address: ${record.ip}`, 700);
  write('Signature:', 668);
  if (signature) {
    const image = await doc.embedPng(png(signature));
    const scale = Math.min(260 / image.width, 100 / image.height);
    certificate.drawImage(image, {x: 56, y: 550, width: image.width * scale, height: image.height * scale});
  }
  return Buffer.from(await doc.save());
}
