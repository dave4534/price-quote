// Shared by the browser and the server so totals and labels never disagree.
export const QUOTE_STATUS = {
  draft: 'טיוטה',
  to_send: 'צריך לשלוח',
  awaiting_signature: 'ממתינה לחתימה',
  signed: 'נחתמה',
  declined: 'לקוח לא מעוניין',
};

export const DOC_STATUS = {draft: 'טיוטה', sent: 'ממתין לחתימה', signed: 'נחתם'};

export const VAT_MODES = {
  none: 'המחיר ללא מע״מ',
  add: 'להוסיף מע״מ למחיר',
  included: 'המחיר כולל מע״מ',
};

const number = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function totals(quote) {
  const subtotal = round((quote.items || []).reduce((sum, item) => sum + number(item.qty) * number(item.price), 0));
  const discount = round(
    Math.min(subtotal, Math.max(0, quote.discountType === 'percent' ? (subtotal * number(quote.discount)) / 100 : number(quote.discount))),
  );
  const net = round(subtotal - discount);
  const rate = number(quote.vatRate ?? 18);
  let vat = 0;
  let total = net;
  if (quote.vatMode === 'add') {
    vat = round((net * rate) / 100);
    total = round(net + vat);
  } else if (quote.vatMode === 'included') {
    vat = round(net - net / (1 + rate / 100));
  }
  return {subtotal, discount, net, vat, vatRate: rate, total};
}

export function money(value, currency = 'ILS') {
  const n = number(value);
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d ? `${d}/${m}/${y.slice(2)}` : String(iso);
}

/** Israeli numbers in the international form WhatsApp links need. */
export function whatsappNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
}

export const whatsappLink = (phone, text) => `https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(text)}`;
