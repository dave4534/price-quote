// Input cleaning. Only listed fields are ever stored; everything else is dropped.
export const fail = (status, message) => Object.assign(new Error(message), {status});

const str = (max) => (v) => (v == null ? '' : String(v).slice(0, max));
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(n, 1e10)) : 0;
};
const bool = (v) => v === true || v === 'true';
const oneOf = (values, fallback) => (v) => (values.includes(v) ? v : fallback);
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const time = (v) => (/^\d{2}:\d{2}$/.test(v) ? v : '');
const id = (v) => (typeof v === 'string' && /^[\w-]{1,80}$/.test(v) ? v : '');
const url = (v) => (typeof v === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(v) ? v.slice(0, 500) : '');
const ids = (max) => (v) => (Array.isArray(v) ? v.map(id).filter(Boolean).slice(0, max) : []);
const list = (shape, max) => (v) => (Array.isArray(v) ? v.slice(0, max).map((item) => pick(shape, item)) : []);

export function pick(shape, input = {}, {partial = false} = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const output = {};
  for (const [key, clean] of Object.entries(shape)) {
    if (partial && !(key in source)) continue;
    output[key] = clean(source[key]);
  }
  return output;
}

const item = {description: str(1000), details: str(4000), qty: num, price: num};

const quoteContent = {
  title: str(200),
  items: list(item, 100),
  discount: num,
  discountType: oneOf(['amount', 'percent'], 'amount'),
  vatMode: oneOf(['none', 'add', 'included'], 'none'),
  vatRate: (v) => (v == null || v === '' ? 18 : Math.min(num(v), 100)),
  header: str(100),
  notes: str(10000),
  terms: str(20000),
  paymentTerms: str(5000),
  about: str(10000),
  imageIds: ids(3),
  requireSignature: (v) => (v == null ? true : bool(v)),
  validityDays: (v) => Math.min(num(v), 3650),
};

export const shapes = {
  template: {name: str(200), ...quoteContent},
  quote: {
    ...quoteContent,
    contactId: id,
    customer: (v) => pick({name: str(200), phone: str(40), email: str(200), address: str(300)}, v),
    date,
    expiry: date,
    arrivalDate: date,
    arrivalTime: time,
    status: oneOf(['draft', 'to_send', 'awaiting_signature', 'signed', 'declined'], 'draft'),
    externalId: str(200),
  },
  contact: {name: str(200), type: oneOf(['private', 'business'], 'private'), phone: str(40), email: str(200), address: str(300), notes: str(4000)},
  document: {
    title: str(200),
    intro: str(4000),
    kind: oneOf(['pdf', 'text'], 'text'),
    body: str(60000),
    fileId: id,
    fileName: str(200),
    imageIds: ids(6),
    contactId: id,
    recipient: (v) => pick({name: str(200), phone: str(40), email: str(200)}, v),
    requireSignature: (v) => (v == null ? true : bool(v)),
    dueDate: date,
    fields: list(
      {
        id,
        type: oneOf(['signature', 'name', 'date', 'text', 'idNumber'], 'signature'),
        page: (v) => Math.floor(num(v)),
        x: (v) => Math.min(num(v), 1),
        y: (v) => Math.min(num(v), 1),
        w: (v) => Math.min(num(v) || 0.25, 1),
        h: (v) => Math.min(num(v) || 0.05, 1),
        label: str(100),
      },
      60,
    ),
    isTemplate: bool,
  },
  card: {
    name: str(200),
    slug: (v) => String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60),
    tagline: str(300),
    about: str(4000),
    phone: str(40),
    whatsapp: str(40),
    email: str(200),
    website: url,
    address: str(300),
    reviewsUrl: url,
    facebook: url,
    instagram: url,
    color: (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : '#0b1636'),
    logoId: id,
    coverId: id,
    galleryIds: ids(6),
    services: str(4000),
    isPrimary: bool,
  },
  settings: {
    businessName: str(200),
    ownerName: str(200),
    phone: str(40),
    email: str(200),
    address: str(300),
    website: url,
    businessNumber: str(40),
    businessType: str(60),
    logoId: id,
    pdfColor: (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : '#1f0303'),
    pdfAccent: (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : '#1a6bff'),
    pdfHeader: str(100),
    vatRate: (v) => Math.min(num(v), 100),
    nextQuoteNumber: (v) => Math.max(1, Math.floor(num(v))),
    defaultNotes: str(10000),
    defaultTerms: str(20000),
    defaultPaymentTerms: str(5000),
    defaultAbout: str(10000),
    webhookUrl: (v) => (typeof v === 'string' && /^https:\/\/[^\s]+$/i.test(v) ? v.slice(0, 500) : ''),
  },
};
