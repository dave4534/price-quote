// The printed quote / document. This HTML is the single source for the on-screen
// preview, the customer page and the exported PDF.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {formatDate, money, totals} from '../shared/model.js';
import {getFile} from './store.js';

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

/** Plain text to HTML: keeps line breaks and turns web addresses into links. */
const prose = (value) =>
  esc(value).replace(/https?:\/\/[^\s<()"]+/g, (link) => `<a href="${link}" dir="ltr">${link}</a>`);

let fontCss;
function fonts() {
  if (fontCss !== undefined) return fontCss;
  const dir = path.join(process.cwd(), 'node_modules/@fontsource/assistant/files');
  const ranges = {hebrew: 'U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F', latin: 'U+0000-00FF,U+2000-206F,U+20AA,U+20AC'};
  fontCss = '';
  for (const subset of ['hebrew', 'latin']) {
    for (const weight of [400, 600, 700]) {
      const data = readFileSync(path.join(dir, `assistant-${subset}-${weight}-normal.woff2`)).toString('base64');
      fontCss += `@font-face{font-family:Assistant;font-weight:${weight};src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${ranges[subset]}}`;
    }
  }
  return fontCss;
}

export async function dataUrl(id) {
  const file = id ? await getFile(id) : null;
  return file ? `data:${file.contentType};base64,${file.buffer.toString('base64')}` : '';
}

const baseCss = (color, accent) => `
@page{size:A4;margin:12mm 0 14mm}
@page:first{margin-top:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;background:#fff;color:#141414;font-family:Assistant,Arial,sans-serif;font-size:13px;line-height:1.45}
a{color:${accent}}
.sheet{max-width:210mm;margin:0 auto;background:#fff;position:relative}
.wedge{height:25mm;background:${color};clip-path:polygon(0 0,100% 0,0 100%)}
.pad{padding:0 12mm}
.top{position:relative;margin-top:-17mm;text-align:right;padding-top:0}
.corner{font-size:12px;color:#555;margin-bottom:4mm;padding-inline-start:5mm}
.logo{display:block;max-width:52mm;max-height:20mm;margin-bottom:3mm}
h1{font-size:23px;margin:0 0 2mm;line-height:1.25}
.biz{font-size:17px;font-weight:600;margin:0 0 1mm}
.meta{color:#333}
.parties{display:flex;justify-content:space-between;gap:12mm;margin:10mm 0 8mm}
.party{max-width:80mm;overflow-wrap:anywhere}
.party:last-child{text-align:left}
.party h2{font-size:14px;margin:0 0 2mm}
table{width:100%;border-collapse:separate;border-spacing:0}
thead{display:table-header-group}
th{background:${color};color:${accent};font-weight:700;font-size:14px;padding:3.5mm 3mm;text-align:right}
th:first-child{border-start-start-radius:3mm}
th:last-child{border-start-end-radius:3mm;text-align:left}
tbody tr{break-inside:avoid}
tbody tr:nth-child(even){background:#f7f7f3}
td{padding:3mm;vertical-align:middle;border-bottom:1px solid #ececea}
td.num,th.num{text-align:center;white-space:nowrap;width:24mm}
td:last-child{text-align:left;white-space:nowrap;width:24mm}
td.desc{white-space:normal}
.desc strong{font-weight:400;font-size:14px;white-space:pre-line;display:block}
.desc span{display:block;color:#666;font-size:12px;white-space:pre-line;margin-top:1mm}
.totals{width:78mm;margin-inline-start:auto;background:${color};color:${accent};border-radius:0 0 3mm 3mm;break-inside:avoid;padding:1.5mm 3mm}
.totals div{display:flex;justify-content:space-between;padding:1.5mm 0;font-size:14px}
.totals .grand{font-size:16px;font-weight:700}
.vatnote{width:78mm;margin-inline-start:auto;text-align:left;color:#666;font-size:11px;margin-top:1mm}
section{margin-top:9mm}
h3{font-size:15px;margin:0 0 2mm;break-after:avoid}
.text{white-space:pre-line;color:#222;orphans:3;widows:3}
.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;break-inside:avoid}
.photos img{width:100%;height:46mm;object-fit:contain}
.signs{display:flex;gap:8mm;break-inside:avoid}
.sign{flex:1;background:#f1ece1;border-bottom:2px solid #111;border-radius:3mm 3mm 0 0;min-height:30mm;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:3mm;text-align:center;color:#40404a;font-size:14px}
.sign img{max-height:18mm;max-width:100%}
footer{margin-top:9mm;background:${color};color:${accent};padding:4mm 12mm;font-size:12px;break-inside:avoid}
footer bdi{margin-inline-end:1mm}
@media screen{body{background:#ececec;padding:12px 0}.sheet{box-shadow:0 2px 18px rgba(0,0,0,.12)}}
@media screen and (max-width:700px){body{padding:0;font-size:12px}.pad{padding:0 4mm}.top{margin-top:-12mm}.parties{flex-direction:column;gap:4mm}.party:last-child{text-align:right}td,th{padding:2mm 1mm}td.num,th.num,td:last-child{width:auto}.signs{flex-direction:column}.totals,.vatnote{width:100%}footer{padding:4mm}}
`;

const page = (title, css, body) =>
  `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${fonts()}${css}</style></head><body><main class="sheet">${body}</main></body></html>`;

// Mixed Hebrew/Latin values (a Latin brand name inside a Hebrew sentence) read right to left.
const bdi = (v) => `<bdi dir="${/[\u0590-\u05FF]/.test(v) ? 'rtl' : 'ltr'}">${esc(v)}</bdi>`;
const lines = (...values) => values.filter(Boolean).map((v) => `<div>${bdi(v)}</div>`).join('');

const section = (title, value) => (value?.trim() ? `<section>${title ? `<h3>${title}</h3>` : ''}<div class="text">${prose(value)}</div></section>` : '');

const footer = (settings, created) => {
  const parts = [settings.businessName, settings.address, settings.phone, settings.email].filter(Boolean);
  return `<footer>${parts.map(bdi).join(' | ')}${created ? `<div>נוצר בתאריך ${esc(formatDate(created))}</div>` : ''}</footer>`;
};

export async function quoteHtml(quote, settings) {
  const sum = totals(quote);
  const color = settings.pdfColor || '#1f0303';
  const accent = settings.pdfAccent || '#1a6bff';
  const logo = await dataUrl(settings.logoId);
  const photos = (await Promise.all((quote.imageIds || []).map(dataUrl))).filter(Boolean);
  const customer = quote.customer || {};
  const rows = (quote.items || [])
    .map(
      (item, index) =>
        `<tr><td class="desc"><strong>${index + 1}. ${esc(item.description)}</strong>${item.details ? `<span>${prose(item.details)}</span>` : ''}</td><td class="num">${esc(item.qty)}</td><td class="num"><bdi>${money(item.price)}</bdi></td><td><bdi>${money(item.qty * item.price)}</bdi></td></tr>`,
    )
    .join('');
  const totalRows = [];
  if (sum.discount > 0) totalRows.push(['סה״כ לפני הנחה', sum.subtotal], ['הנחה', -sum.discount]);
  if (quote.vatMode === 'add') totalRows.push(['סה״כ', sum.net], [`מע״מ (${sum.vatRate}%)`, sum.vat]);
  const totalsHtml =
    totalRows.map(([label, value]) => `<div><span>${label}</span><bdi>${money(value)}</bdi></div>`).join('') +
    `<div class="grand"><span>${quote.vatMode === 'add' ? 'סה״כ לתשלום' : 'סה״כ'}</span><bdi>${money(sum.total)}</bdi></div>`;
  const vatNote = quote.vatMode === 'included' ? `המחיר כולל מע״מ בסך ${money(sum.vat)}` : quote.vatMode === 'none' ? 'המחיר ללא מע״מ' : '';
  const arrival = [formatDate(quote.arrivalDate), quote.arrivalTime].filter(Boolean).join(' - ');

  const signature = quote.signature;
  const signs = quote.requireSignature
    ? `<section><h3>חתימה</h3><div class="signs">
<div class="sign">${signature ? `<img src="${signature.image}" alt="חתימה">` : ''}<div>${esc(signature?.name || customer.name || 'חתימת הלקוח')}</div>${signature ? `<div>נחתם בתאריך: ${esc(formatDate(signature.at))}</div>` : ''}</div>
<div class="sign"><div>${esc(settings.businessName)}</div></div></div></section>`
    : '';

  const body = `<div class="wedge"></div><div class="pad"><header class="top">
<div class="corner">${esc(quote.header ?? settings.pdfHeader ?? '')}</div>
${logo ? `<img class="logo" src="${logo}" alt="${esc(settings.businessName)}">` : ''}
<h1>${esc(quote.title || 'הצעת מחיר')}</h1>
<p class="biz">${esc(settings.businessName)}</p>
<div class="meta"><div>הצעה מספר <bdi>#${esc(quote.number ?? 'XXX')}</bdi></div>${quote.date ? `<div>נוצר בתאריך ${formatDate(quote.date)}</div>` : ''}${arrival ? `<div>תאריך ושעת הגעה: <bdi>${esc(arrival)}</bdi></div>` : ''}${quote.expiry ? `<div>בתוקף עד ${formatDate(quote.expiry)}</div>` : ''}</div>
</header>
<div class="parties">
<div class="party"><h2>מאת:</h2>${lines(settings.businessName, settings.phone, settings.address, settings.email, settings.businessNumber && `${settings.businessType || 'ע.מ'} ${settings.businessNumber}`)}</div>
${customer.name || customer.phone ? `<div class="party"><h2>עבור:</h2>${lines(customer.name, customer.phone, customer.address, customer.email)}</div>` : ''}
</div>
<table><thead><tr><th>תיאור</th><th class="num">כמות</th><th class="num">מחיר</th><th>סה״כ</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals">${totalsHtml}</div>${vatNote ? `<div class="vatnote">${vatNote}</div>` : ''}
${section('הערות', quote.notes)}
${section('תנאים ומידע חשוב', quote.terms)}
${section('תנאי תשלום', quote.paymentTerms)}
${section('', quote.about)}
${photos.length ? `<section><h3>תמונות רלוונטיות להצעת המחיר</h3><div class="photos">${photos.map((src) => `<img src="${src}" alt="">`).join('')}</div></section>` : ''}
${signs}
</div>${footer(settings, quote.date)}`;

  return page(`${quote.title || 'הצעת מחיר'} #${quote.number ?? ''}`, baseCss(color, accent), body);
}

export async function documentHtml(document, settings) {
  const logo = await dataUrl(settings.logoId);
  const photos = (await Promise.all((document.imageIds || []).map(dataUrl))).filter(Boolean);
  const signature = document.signature;
  const body = `<div class="wedge"></div><div class="pad"><header class="top"><div class="corner">${esc(settings.pdfHeader || '')}</div>
${logo ? `<img class="logo" src="${logo}" alt="${esc(settings.businessName)}">` : ''}<h1>${esc(document.title)}</h1><p class="biz">${esc(settings.businessName)}</p>
${document.recipient?.name ? `<div class="meta">עבור: ${esc(document.recipient.name)}</div>` : ''}</header>
${section('', document.body)}
${photos.length ? `<section><div class="photos">${photos.map((src) => `<img src="${src}" alt="">`).join('')}</div></section>` : ''}
${document.requireSignature ? `<section><h3>חתימה</h3><div class="signs"><div class="sign">${signature ? `<img src="${signature.image}" alt="חתימה"><div>${esc(signature.name)}</div><div>נחתם בתאריך: ${formatDate(signature.at)}</div>` : `<div>${esc(document.recipient?.name || 'חתימה')}</div>`}</div><div class="sign"><div>${esc(settings.businessName)}</div></div></div></section>` : ''}
</div>${footer(settings, document.createdAt)}`;
  return page(document.title, baseCss(settings.pdfColor || '#1f0303', settings.pdfAccent || '#1a6bff'), body);
}
