import {createHmac, randomUUID} from 'node:crypto';
import {totals} from '../shared/model.js';
import {authKind, checkPassword, hashPassword, randomToken, sessionCookie, verifyHash} from './auth.js';
import {openapi} from './openapi.js';
import {htmlToPdf, stampPdf} from './pdf.js';
import {documentHtml, quoteHtml} from './render.js';
import {fail, pick, shapes} from './schema.js';
import {getFile, mutate, putFile, readDb, removeFile} from './store.js';

const MAX_BODY = 4 * 1024 * 1024;
const now = () => new Date().toISOString();
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Jerusalem'}).format(new Date());
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

async function readBody(req) {
  let parsed;
  try {
    parsed = req.body;
  } catch {
    throw fail(400, 'The request body is not valid JSON');
  }
  if (parsed !== undefined) {
    if (Buffer.isBuffer(parsed)) return parsed;
    return Buffer.from(typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw fail(413, 'The upload is larger than 4 MB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw fail(400, 'The request body is not valid JSON');
  }
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  if (Buffer.isBuffer(body) || typeof body === 'string') return res.end(body);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

const sendHtml = (res, html) =>
  send(res, 200, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; sandbox allow-popups allow-same-origin",
  });

const sendFile = (res, buffer, contentType, name, inline = false) =>
  send(res, 200, buffer, {
    'Content-Type': contentType,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
  });

/* ---------------------------------------------------------------- webhooks */

async function emit(event, data) {
  const {settings} = await readDb();
  if (!settings.webhookUrl) return;
  const body = JSON.stringify({event, sentAt: now(), data});
  const signature = createHmac('sha256', settings.webhookSecret || '').update(body).digest('hex');
  try {
    await fetch(settings.webhookUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-QuoteDesk-Event': event, 'X-QuoteDesk-Signature': `sha256=${signature}`},
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
    });
  } catch (error) {
    console.warn(`Webhook ${event} failed: ${error.message}`);
  }
}

/* ------------------------------------------------------------- view models */

const publicBase = (req) => `${(req.headers['x-forwarded-proto'] || 'http').split(',')[0]}://${req.headers.host}`;

const quoteView = (req, quote) => ({...quote, totals: totals(quote), url: `${publicBase(req)}/q/${quote.token}`});

const documentView = (req, doc) => {
  const {passwordHash, ...rest} = doc;
  return {...rest, hasPassword: Boolean(passwordHash), url: `${publicBase(req)}/d/${doc.token}`};
};

const settingsView = (settings) => ({pdfColor: '#1f0303', pdfAccent: '#1a6bff', vatRate: 18, nextQuoteNumber: 1001, ...settings});

const find = (db, collection, id) => {
  const record = db[collection].find((entry) => entry.id === id);
  if (!record) throw fail(404, 'Not found');
  return record;
};

const record = (data) => ({id: randomUUID(), createdAt: now(), updatedAt: now(), ...data});

function upsertContact(db, input) {
  const data = pick(shapes.contact, input);
  const digits = data.phone.replace(/\D/g, '');
  const existing = db.contacts.find(
    (c) => (digits && c.phone.replace(/\D/g, '') === digits) || (data.email && c.email.toLowerCase() === data.email.toLowerCase()),
  );
  if (existing) {
    for (const [key, value] of Object.entries(pick(shapes.contact, input, {partial: true}))) if (value) existing[key] = value;
    existing.updatedAt = now();
    return {contact: existing, created: false};
  }
  const contact = record(data);
  db.contacts.unshift(contact);
  return {contact, created: true};
}

/* ------------------------------------------------------------------ quotes */

function createQuote(db, input) {
  const settings = settingsView(db.settings);
  if (input.externalId) {
    const existing = db.quotes.find((q) => q.externalId === String(input.externalId));
    if (existing) return {quote: existing, created: false};
  }
  let base = {
    header: settings.pdfHeader || '',
    notes: settings.defaultNotes || '',
    terms: settings.defaultTerms || '',
    paymentTerms: settings.defaultPaymentTerms || '',
    about: settings.defaultAbout || '',
    vatRate: settings.vatRate,
    items: [{description: '', details: '', qty: 1, price: 0}],
  };
  let templateId = '';
  if (input.templateId) {
    const template = db.templates.find((t) => t.id === input.templateId);
    if (!template) throw fail(422, 'templateId does not match any template');
    const {id, name, createdAt, updatedAt, ...content} = template;
    base = {...base, ...structuredClone(content)};
    templateId = id;
  }
  const overrides = pick(shapes.quote, input, {partial: true});
  const data = {...pick(shapes.quote, {...base, ...overrides}), templateId};
  if (input.contact && !overrides.contactId) data.contactId = upsertContact(db, input.contact).contact.id;
  const contact = db.contacts.find((c) => c.id === data.contactId);
  if (contact && !data.customer.name) data.customer = pick(shapes.quote, {customer: contact}).customer;
  if (input.contact && !data.customer.name) data.customer = pick(shapes.quote, {customer: input.contact}).customer;
  data.date ||= today();
  if (!data.expiry && data.validityDays) {
    data.expiry = new Date(Date.parse(data.date) + data.validityDays * 86400000).toISOString().slice(0, 10);
  }
  // Signing is only ever recorded by the customer's own signature.
  if (data.status === 'signed') data.status = 'draft';
  const number = settings.nextQuoteNumber;
  db.settings.nextQuoteNumber = number + 1;
  const quote = record({...data, number, token: randomToken(), views: 0});
  db.quotes.unshift(quote);
  return {quote, created: true};
}

function updateQuote(db, id, input) {
  const quote = find(db, 'quotes', id);
  const changes = pick(shapes.quote, input, {partial: true});
  delete changes.externalId;
  if (quote.signature) {
    if (Object.keys(changes).some((key) => key !== 'status')) throw fail(409, 'A signed quote cannot be edited. Duplicate it instead.');
    return quote;
  }
  if (changes.status === 'signed') throw fail(422, 'Only the customer can sign a quote');
  Object.assign(quote, changes, {updatedAt: now()});
  return quote;
}

async function quotes(req, res, [id, action]) {
  const method = req.method;
  if (!id) {
    if (method === 'GET') {
      const db = await readDb();
      const {status, contactId, q, externalId} = req.query;
      const needle = String(q || '').toLowerCase();
      const found = db.quotes.filter(
        (x) =>
          (!status || x.status === status) &&
          (!contactId || x.contactId === contactId) &&
          (!externalId || x.externalId === externalId) &&
          (!needle || `${x.number} ${x.title} ${x.customer?.name} ${x.customer?.phone}`.toLowerCase().includes(needle)),
      );
      return send(res, 200, {data: found.map((x) => quoteView(req, x))});
    }
    if (method === 'POST') {
      const input = await readJson(req);
      const {quote, created} = await mutate((db) => createQuote(db, input));
      if (created) await emit('quote.created', quoteView(req, quote));
      return send(res, created ? 201 : 200, {data: quoteView(req, quote)});
    }
  } else if (!action) {
    if (method === 'GET') return send(res, 200, {data: quoteView(req, find(await readDb(), 'quotes', id))});
    if (method === 'PATCH') {
      const input = await readJson(req);
      const quote = await mutate((db) => updateQuote(db, id, input));
      await emit('quote.updated', quoteView(req, quote));
      return send(res, 200, {data: quoteView(req, quote)});
    }
    if (method === 'DELETE') {
      await mutate((db) => {
        find(db, 'quotes', id);
        db.quotes = db.quotes.filter((x) => x.id !== id);
      });
      return send(res, 200, {ok: true});
    }
  } else if (method === 'GET' && (action === 'pdf' || action === 'html')) {
    const db = await readDb();
    const quote = find(db, 'quotes', id);
    const html = await quoteHtml(quote, settingsView(db.settings));
    if (action === 'html') return sendHtml(res, html);
    return sendFile(res, await htmlToPdf(html), 'application/pdf', `quote-${quote.number}.pdf`);
  } else if (method === 'POST' && action === 'duplicate') {
    const quote = await mutate((db) => {
      const {id: _, number, token, createdAt, updatedAt, signature, views, viewedAt, externalId, ...copy} = find(db, 'quotes', id);
      return createQuote(db, {...copy, status: 'draft', date: today(), expiry: ''}).quote;
    });
    return send(res, 201, {data: quoteView(req, quote)});
  } else if (method === 'POST' && action === 'save-as-template') {
    const input = await readJson(req);
    const template = await mutate((db) => {
      const quote = find(db, 'quotes', id);
      const saved = record(pick(shapes.template, {...quote, name: input.name || quote.title}));
      db.templates.unshift(saved);
      return saved;
    });
    return send(res, 201, {data: template});
  } else if (method === 'POST' && action === 'mark-sent') {
    const quote = await mutate((db) => {
      const found = find(db, 'quotes', id);
      if (!found.signature) Object.assign(found, {status: found.requireSignature ? 'awaiting_signature' : 'to_send', sentAt: now()});
      return found;
    });
    return send(res, 200, {data: quoteView(req, quote)});
  }
  throw fail(405, 'Method not allowed');
}

/* ------------------------------------------------- simple CRUD collections */

async function crud(req, res, collection, shape, [id], hooks = {}) {
  const view = hooks.view || ((_, x) => x);
  const method = req.method;
  if (!id) {
    if (method === 'GET') return send(res, 200, {data: (await readDb())[collection].map((x) => view(req, x))});
    if (method === 'POST') {
      const input = await readJson(req);
      const saved = await mutate((db) => {
        const entry = record(pick(shape, input));
        hooks.prepare?.(db, entry, input);
        db[collection].unshift(entry);
        return entry;
      });
      return send(res, 201, {data: view(req, saved)});
    }
  } else {
    if (method === 'GET') return send(res, 200, {data: view(req, find(await readDb(), collection, id))});
    if (method === 'PATCH') {
      const input = await readJson(req);
      const saved = await mutate((db) => {
        const entry = find(db, collection, id);
        Object.assign(entry, pick(shape, input, {partial: true}), {updatedAt: now()});
        hooks.prepare?.(db, entry, input);
        return entry;
      });
      return send(res, 200, {data: view(req, saved)});
    }
    if (method === 'DELETE') {
      await mutate((db) => {
        find(db, collection, id);
        db[collection] = db[collection].filter((x) => x.id !== id);
      });
      return send(res, 200, {ok: true});
    }
  }
  throw fail(405, 'Method not allowed');
}

function prepareCard(db, card) {
  card.slug ||= `card-${randomToken(5).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  if (db.cards.some((c) => c.id !== card.id && c.slug === card.slug)) throw fail(409, 'This card address is already taken');
  card.stats ||= {views: 0, call: 0, whatsapp: 0, save: 0, email: 0, website: 0};
  if (card.isPrimary) for (const other of db.cards) if (other.id !== card.id) other.isPrimary = false;
}

function prepareDocument(db, doc, input) {
  doc.token ||= randomToken();
  doc.status ||= 'draft';
  doc.views ||= 0;
  const contact = db.contacts.find((c) => c.id === doc.contactId);
  if (contact && !doc.recipient?.name) doc.recipient = {name: contact.name, phone: contact.phone, email: contact.email};
  if (input.password) doc.passwordHash = hashPassword(String(input.password).slice(0, 100));
  if (input.password === '') delete doc.passwordHash;
}

async function documents(req, res, parts) {
  const [id, action] = parts;
  if (id && req.method === 'PATCH' && !action) {
    if (find(await readDb(), 'documents', id).signature) throw fail(409, 'A signed document cannot be edited');
  }
  if (!action) return crud(req, res, 'documents', shapes.document, parts, {view: documentView, prepare: prepareDocument});
  const db = await readDb();
  const doc = find(db, 'documents', id);
  if (req.method === 'GET' && action === 'html') return sendHtml(res, await documentHtml(doc, settingsView(db.settings)));
  if (req.method === 'GET' && action === 'file') return sendDocumentFile(res, doc, settingsView(db.settings));
  if (req.method === 'POST' && action === 'mark-sent') {
    const saved = await mutate((fresh) => {
      const entry = find(fresh, 'documents', id);
      if (!entry.signature) Object.assign(entry, {status: 'sent', sentAt: now()});
      return entry;
    });
    return send(res, 200, {data: documentView(req, saved)});
  }
  if (req.method === 'POST' && (action === 'duplicate' || action === 'save-as-template')) {
    const saved = await mutate((fresh) => {
      const source = find(fresh, 'documents', id);
      const entry = record(pick(shapes.document, {...source, isTemplate: action === 'save-as-template'}));
      if (entry.isTemplate) Object.assign(entry, {contactId: '', recipient: {name: '', phone: '', email: ''}, dueDate: ''});
      prepareDocument(fresh, entry, {});
      fresh.documents.unshift(entry);
      return entry;
    });
    return send(res, 201, {data: documentView(req, saved)});
  }
  throw fail(405, 'Method not allowed');
}

async function sendDocumentFile(res, doc, settings) {
  const name = `${doc.title || 'document'}.pdf`;
  if (doc.kind === 'pdf') {
    const file = await getFile(doc.signedFileId || doc.fileId);
    if (!file) throw fail(404, 'This document has no file');
    return sendFile(res, file.buffer, 'application/pdf', name, true);
  }
  return sendFile(res, await htmlToPdf(await documentHtml(doc, settings)), 'application/pdf', name, true);
}

/* ------------------------------------------------------------------- files */

const fileKinds = {
  'image/png': (b) => b.subarray(0, 4).toString('hex') === '89504e47',
  'image/jpeg': (b) => b.subarray(0, 3).toString('hex') === 'ffd8ff',
  'image/webp': (b) => b.subarray(8, 12).toString() === 'WEBP',
  'application/pdf': (b) => b.subarray(0, 5).toString() === '%PDF-',
};

async function files(req, res, [id]) {
  if (req.method === 'POST' && !id) {
    const type = String(req.query.type || '');
    const buffer = await readBody(req);
    if (buffer.length > MAX_BODY) throw fail(413, 'The upload is larger than 4 MB');
    if (!fileKinds[type]?.(buffer)) throw fail(415, 'Upload a PNG, JPEG, WebP or PDF file');
    const fileId = randomToken();
    await putFile(fileId, buffer, type);
    return send(res, 201, {data: {id: fileId}});
  }
  if (req.method === 'GET' && id) {
    const file = await getFile(id);
    if (!file) throw fail(404, 'Not found');
    return sendFile(res, file.buffer, file.contentType, id, true);
  }
  if (req.method === 'DELETE' && id) {
    await removeFile(id);
    return send(res, 200, {ok: true});
  }
  throw fail(405, 'Method not allowed');
}

/* ------------------------------------------------------------------ public */

const signatureImage = (value) => {
  if (typeof value !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) || value.length > 300000) {
    throw fail(422, 'A signature is required');
  }
  return value;
};

const signerName = (value) => {
  const name = String(value || '').trim().slice(0, 200);
  if (!name) throw fail(422, 'The signer name is required');
  return name;
};

const publicSettings = (s) => ({businessName: s.businessName || '', phone: s.phone || ''});

async function publicQuote(req, res, [token, action]) {
  const db = await readDb();
  const quote = db.quotes.find((q) => q.token === token);
  if (!quote) throw fail(404, 'This link is not valid');
  const settings = settingsView(db.settings);
  const view = (q) => {
    const primary = db.cards.find((c) => c.isPrimary);
    return {
      number: q.number,
      title: q.title,
      status: q.status,
      total: totals(q).total,
      requireSignature: q.requireSignature,
      signedAt: q.signature?.at || null,
      expired: Boolean(q.expiry && q.expiry < today()),
      customerName: q.customer?.name || '',
      business: publicSettings(settings),
      cardSlug: primary?.slug || null,
    };
  };
  // The owner previewing their own link should not count as a customer view.
  const owner = authKind(req) === 'session';
  if (req.method === 'GET' && !action) {
    if (!owner) {
      const saved = await mutate((fresh) => {
        const q = fresh.quotes.find((x) => x.token === token);
        q.views = (q.views || 0) + 1;
        q.viewedAt = now();
        return q;
      });
      if (saved.views === 1) await emit('quote.viewed', quoteView(req, saved));
    }
    return send(res, 200, {data: view(quote)});
  }
  if (req.method === 'GET' && action === 'html') return sendHtml(res, await quoteHtml(quote, settings));
  if (req.method === 'GET' && action === 'pdf') {
    return sendFile(res, await htmlToPdf(await quoteHtml(quote, settings)), 'application/pdf', `quote-${quote.number}.pdf`);
  }
  if (req.method === 'POST' && (action === 'sign' || action === 'decline')) {
    const input = await readJson(req);
    const saved = await mutate((fresh) => {
      const q = fresh.quotes.find((x) => x.token === token);
      if (q.signature) throw fail(409, 'This quote is already signed');
      if (q.expiry && q.expiry < today()) throw fail(409, 'This quote has expired');
      if (action === 'decline') {
        Object.assign(q, {status: 'declined', declinedAt: now()});
      } else {
        if (!q.requireSignature) throw fail(409, 'This quote does not ask for a signature');
        q.signature = {name: signerName(input.name), image: signatureImage(input.signature), at: now(), ip: clientIp(req)};
        q.status = 'signed';
      }
      return q;
    });
    await emit(action === 'sign' ? 'quote.signed' : 'quote.declined', quoteView(req, {...saved, signature: saved.signature && {name: saved.signature.name, at: saved.signature.at}}));
    return send(res, 200, {data: view(saved)});
  }
  throw fail(405, 'Method not allowed');
}

async function publicDocument(req, res, [token, action]) {
  const db = await readDb();
  const doc = db.documents.find((d) => d.token === token && !d.isTemplate);
  if (!doc) throw fail(404, 'This link is not valid');
  const settings = settingsView(db.settings);
  if (doc.passwordHash && !verifyHash(req.headers['x-document-password'] || '', doc.passwordHash)) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    throw fail(401, 'A password is required');
  }
  const view = (d) => ({
    title: d.title,
    intro: d.intro,
    kind: d.kind,
    requireSignature: d.requireSignature,
    fields: d.fields || [],
    status: d.status,
    signedAt: d.signature?.at || null,
    recipientName: d.recipient?.name || '',
    business: publicSettings(settings),
  });
  if (req.method === 'GET' && !action) {
    if (authKind(req) !== 'session') {
      const saved = await mutate((fresh) => {
        const d = fresh.documents.find((x) => x.token === token);
        d.views = (d.views || 0) + 1;
        d.viewedAt = now();
        return d;
      });
      if (saved.views === 1) await emit('document.viewed', {id: saved.id, title: saved.title});
    }
    return send(res, 200, {data: view(doc)});
  }
  if (req.method === 'GET' && action === 'html') return sendHtml(res, await documentHtml(doc, settings));
  if (req.method === 'GET' && action === 'file') return sendDocumentFile(res, doc, settings);
  if (req.method === 'POST' && action === 'sign') {
    const input = await readJson(req);
    if (doc.signature) throw fail(409, 'This document is already signed');
    if (!doc.requireSignature) throw fail(409, 'This document does not ask for a signature');
    const signature = {name: signerName(input.name), image: signatureImage(input.signature), at: now(), ip: clientIp(req)};
    let signedFileId;
    if (doc.kind === 'pdf') {
      const source = await getFile(doc.fileId);
      if (!source) throw fail(404, 'This document has no file');
      const values = {};
      for (const field of doc.fields || []) {
        const value = input.values?.[field.id];
        if (!value) throw fail(422, 'Fill in every field before signing');
        values[field.id] = signatureImage(value);
      }
      const stamped = await stampPdf(source.buffer, {
        fields: doc.fields || [],
        values,
        signature: signature.image,
        record: {id: doc.id, at: signature.at, ip: signature.ip},
      });
      signedFileId = randomToken();
      await putFile(signedFileId, stamped, 'application/pdf');
    }
    const saved = await mutate((fresh) => {
      const d = fresh.documents.find((x) => x.token === token);
      if (d.signature) throw fail(409, 'This document is already signed');
      Object.assign(d, {signature, signedFileId, status: 'signed', updatedAt: now()});
      return d;
    });
    await emit('document.signed', {id: saved.id, title: saved.title, signerName: signature.name, signedAt: signature.at});
    return send(res, 200, {data: view(saved)});
  }
  throw fail(405, 'Method not allowed');
}

const CARD_EVENTS = ['call', 'whatsapp', 'save', 'email', 'website'];

async function publicCard(req, res, [slug, action, arg]) {
  const db = await readDb();
  const card = db.cards.find((c) => c.slug === slug);
  if (!card) throw fail(404, 'This card does not exist');
  const bump = (key) =>
    mutate((fresh) => {
      const c = fresh.cards.find((x) => x.slug === slug);
      c.stats[key] = (c.stats[key] || 0) + 1;
    });
  if (req.method === 'GET' && !action) {
    if (authKind(req) !== 'session') await bump('views');
    const {id, stats, createdAt, updatedAt, isPrimary, ...visible} = card;
    return send(res, 200, {data: visible});
  }
  if (req.method === 'GET' && action === 'image') {
    // Only images this card actually references are readable without signing in.
    if (![card.logoId, card.coverId, ...(card.galleryIds || [])].includes(arg)) throw fail(404, 'Not found');
    const file = await getFile(arg);
    if (!file) throw fail(404, 'Not found');
    return sendFile(res, file.buffer, file.contentType, arg, true);
  }
  if (req.method === 'GET' && action === 'vcard') {
    const clean = (v) => String(v || '').replace(/[\r\n]+/g, ' ').replace(/([,;\\])/g, '\\$1');
    const rows = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${clean(card.name)}`, `ORG:${clean(card.name)}`];
    if (card.phone) rows.push(`TEL;TYPE=WORK,VOICE:${clean(card.phone)}`);
    if (card.email) rows.push(`EMAIL:${clean(card.email)}`);
    if (card.website) rows.push(`URL:${clean(card.website)}`);
    if (card.address) rows.push(`ADR;TYPE=WORK:;;${clean(card.address)};;;;`);
    rows.push('END:VCARD');
    return sendFile(res, rows.join('\r\n'), 'text/vcard; charset=utf-8', `${card.name || 'contact'}.vcf`);
  }
  if (req.method === 'POST' && action === 'event') {
    const {type} = await readJson(req);
    if (CARD_EVENTS.includes(type)) await bump(type);
    return send(res, 200, {ok: true});
  }
  throw fail(405, 'Method not allowed');
}

/* ------------------------------------------------------------------ router */

function stats(db) {
  const sum = (list) => list.reduce((total, q) => total + totals(q).total, 0);
  const by = (status) => db.quotes.filter((q) => q.status === status);
  return {
    quotes: db.quotes.length,
    savedAmount: sum(db.quotes),
    signed: by('signed').length,
    signedAmount: sum(by('signed')),
    awaiting: by('awaiting_signature').length,
    awaitingAmount: sum(by('awaiting_signature')),
    conversion: db.quotes.length ? Math.round((by('signed').length / db.quotes.length) * 1000) / 10 : 0,
  };
}

async function route(req, res) {
  const url = new URL(req.url, 'http://local');
  const rewritten = url.searchParams.get('__path');
  const path = rewritten != null ? rewritten : url.pathname.replace(/^\/api\/?/, '');
  url.searchParams.delete('__path');
  req.query = Object.fromEntries(url.searchParams);
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const [area, ...rest] = parts;

  if (area === 'openapi.json') return send(res, 200, openapi(publicBase(req)));

  // Browsers send Origin on cross-site writes; refuse any that is not this site.
  if (req.method !== 'GET' && req.headers.origin && !req.headers.authorization) {
    let host = '';
    try {
      host = new URL(req.headers.origin).host;
    } catch {}
    if (host !== req.headers.host) throw fail(403, 'Cross-origin requests are not allowed');
  }

  if (area === 'auth') {
    if (rest[0] === 'me') return send(res, 200, {signedIn: Boolean(authKind(req))});
    if (req.method !== 'POST') throw fail(405, 'Method not allowed');
    if (rest[0] === 'logout') return send(res, 200, {ok: true}, {'Set-Cookie': sessionCookie(req, true)});
    if (rest[0] === 'login') {
      const {password} = await readJson(req);
      if (!checkPassword(password || '')) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        throw fail(401, 'Wrong password');
      }
      return send(res, 200, {ok: true}, {'Set-Cookie': sessionCookie(req)});
    }
  }

  if (area === 'public') {
    const [kind, ...args] = rest;
    if (kind === 'quotes') return publicQuote(req, res, args);
    if (kind === 'documents') return publicDocument(req, res, args);
    if (kind === 'cards') return publicCard(req, res, args);
    throw fail(404, 'Not found');
  }

  if (area !== 'v1') throw fail(404, 'Not found');
  if (!authKind(req)) throw fail(401, 'Sign in, or send Authorization: Bearer <API key>');
  const [resource, ...args] = rest;

  if (resource === 'quotes') return quotes(req, res, args);
  if (resource === 'templates') return crud(req, res, 'templates', shapes.template, args);
  if (resource === 'cards') return crud(req, res, 'cards', shapes.card, args, {prepare: prepareCard});
  if (resource === 'documents') return documents(req, res, args);
  if (resource === 'files') return files(req, res, args);
  if (resource === 'contacts') {
    if (req.method === 'POST' && !args.length) {
      const input = await readJson(req);
      if (!input.name && !input.phone && !input.email) throw fail(422, 'Send a name, phone or email');
      const {contact, created} = await mutate((db) => upsertContact(db, input));
      if (created) await emit('contact.created', contact);
      return send(res, created ? 201 : 200, {data: contact});
    }
    return crud(req, res, 'contacts', shapes.contact, args);
  }
  if (resource === 'stats' && req.method === 'GET') return send(res, 200, {data: stats(await readDb())});
  if (resource === 'preview' && args[0] === 'quote' && req.method === 'POST') {
    const input = await readJson(req);
    const db = await readDb();
    const draft = {...pick(shapes.quote, input), number: input.number, signature: undefined};
    return sendHtml(res, await quoteHtml(draft, settingsView(db.settings)));
  }
  if (resource === 'settings') {
    if (req.method === 'PATCH') {
      const input = await readJson(req);
      await mutate((db) => {
        Object.assign(db.settings, pick(shapes.settings, input, {partial: true}));
        if (db.settings.webhookUrl) db.settings.webhookSecret ||= randomToken(24);
      });
    } else if (req.method !== 'GET') throw fail(405, 'Method not allowed');
    return send(res, 200, {data: settingsView((await readDb()).settings)});
  }
  throw fail(404, 'Not found');
}

export default async function handler(req, res) {
  try {
    await route(req, res);
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) send(res, error.status || 500, {error: error.status ? error.message : 'Something went wrong on the server'});
  }
}
