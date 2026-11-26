// One description of the API, served as /api/openapi.json and rendered by the in-app docs page.
const str = {type: 'string'};
const num = {type: 'number'};
const item = {type: 'object', properties: {description: str, details: str, qty: num, price: num}};
const customer = {type: 'object', properties: {name: str, phone: str, email: str, address: str}};

export const endpoints = [
  ['Quotes', 'get', '/api/v1/quotes', 'List quotes. Filters: status, contactId, externalId, q.'],
  ['Quotes', 'post', '/api/v1/quotes', 'Create a quote, usually from a template. Repeating the same externalId returns the existing quote, so retries are safe.', 'quote'],
  ['Quotes', 'get', '/api/v1/quotes/{id}', 'Read one quote with totals and the customer link.'],
  ['Quotes', 'patch', '/api/v1/quotes/{id}', 'Change fields of an unsigned quote.', 'quote'],
  ['Quotes', 'delete', '/api/v1/quotes/{id}', 'Delete a quote.'],
  ['Quotes', 'get', '/api/v1/quotes/{id}/pdf', 'Download the quote as a PDF.'],
  ['Quotes', 'post', '/api/v1/quotes/{id}/mark-sent', 'Mark the quote as sent and waiting for the customer.'],
  ['Quotes', 'post', '/api/v1/quotes/{id}/duplicate', 'Copy a quote into a new draft.'],
  ['Quotes', 'post', '/api/v1/quotes/{id}/save-as-template', 'Create a template from a quote.'],
  ['Templates', 'get', '/api/v1/templates', 'List quote templates.'],
  ['Templates', 'post', '/api/v1/templates', 'Create a template.', 'template'],
  ['Templates', 'get', '/api/v1/templates/{id}', 'Read a template.'],
  ['Templates', 'patch', '/api/v1/templates/{id}', 'Change a template.', 'template'],
  ['Templates', 'delete', '/api/v1/templates/{id}', 'Delete a template.'],
  ['Contacts', 'get', '/api/v1/contacts', 'List contacts.'],
  ['Contacts', 'post', '/api/v1/contacts', 'Create a contact, or update the one with the same phone or email.', 'contact'],
  ['Contacts', 'get', '/api/v1/contacts/{id}', 'Read a contact.'],
  ['Contacts', 'patch', '/api/v1/contacts/{id}', 'Change a contact.', 'contact'],
  ['Contacts', 'delete', '/api/v1/contacts/{id}', 'Delete a contact.'],
  ['Documents', 'get', '/api/v1/documents', 'List documents for signature.'],
  ['Documents', 'post', '/api/v1/documents', 'Create a document. kind is "text" (use body) or "pdf" (use fileId from /files).', 'document'],
  ['Documents', 'get', '/api/v1/documents/{id}', 'Read a document and its signing link.'],
  ['Documents', 'patch', '/api/v1/documents/{id}', 'Change an unsigned document.', 'document'],
  ['Documents', 'delete', '/api/v1/documents/{id}', 'Delete a document.'],
  ['Documents', 'get', '/api/v1/documents/{id}/file', 'Download the document PDF (the signed copy once signed).'],
  ['Documents', 'post', '/api/v1/documents/{id}/mark-sent', 'Mark a document as sent.'],
  ['Business cards', 'get', '/api/v1/cards', 'List digital business cards with their statistics.'],
  ['Business cards', 'post', '/api/v1/cards', 'Create a card. It is public at /card/{slug}.', 'card'],
  ['Business cards', 'patch', '/api/v1/cards/{id}', 'Change a card.', 'card'],
  ['Business cards', 'delete', '/api/v1/cards/{id}', 'Delete a card.'],
  ['Files', 'post', '/api/v1/files?type={mime}', 'Upload raw bytes (application/octet-stream), up to 4 MB: PNG, JPEG, WebP or PDF. Returns an id.'],
  ['Business', 'get', '/api/v1/settings', 'Read business settings.'],
  ['Business', 'patch', '/api/v1/settings', 'Change business settings, including webhookUrl.', 'settings'],
  ['Business', 'get', '/api/v1/stats', 'Totals, signed and waiting amounts, conversion rate.'],
];

export const webhookEvents = ['quote.created', 'quote.updated', 'quote.viewed', 'quote.signed', 'quote.declined', 'document.viewed', 'document.signed', 'contact.created'];

const schemas = {
  quote: {
    type: 'object',
    properties: {
      templateId: str,
      externalId: str,
      title: str,
      contactId: str,
      contact: customer,
      customer,
      items: {type: 'array', items: item},
      discount: num,
      discountType: {enum: ['amount', 'percent']},
      vatMode: {enum: ['none', 'add', 'included']},
      vatRate: num,
      arrivalDate: {type: 'string', format: 'date'},
      arrivalTime: {type: 'string', example: '09:00'},
      expiry: {type: 'string', format: 'date'},
      notes: str,
      terms: str,
      paymentTerms: str,
      about: str,
      requireSignature: {type: 'boolean'},
      status: {enum: ['draft', 'to_send', 'awaiting_signature', 'declined']},
    },
  },
  template: {type: 'object', properties: {name: str, title: str, items: {type: 'array', items: item}, notes: str, terms: str, paymentTerms: str, about: str}},
  contact: {type: 'object', properties: {...customer.properties, type: {enum: ['private', 'business']}, notes: str}},
  document: {type: 'object', properties: {title: str, intro: str, kind: {enum: ['text', 'pdf']}, body: str, fileId: str, contactId: str, recipient: customer, requireSignature: {type: 'boolean'}, dueDate: {type: 'string', format: 'date'}, password: str}},
  card: {type: 'object', properties: {name: str, slug: str, tagline: str, about: str, services: str, phone: str, whatsapp: str, email: str, website: str, address: str, logoId: str, coverId: str, isPrimary: {type: 'boolean'}}},
  settings: {type: 'object', properties: {businessName: str, phone: str, email: str, address: str, vatRate: num, nextQuoteNumber: num, webhookUrl: str}},
};

export function openapi(server) {
  const paths = {};
  for (const [tag, method, rawPath, summary, schema] of endpoints) {
    const [pathname, query] = rawPath.split('?');
    const parameters = [...pathname.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({name, in: 'path', required: true, schema: str}));
    if (query) parameters.push({name: query.split('=')[0], in: 'query', required: true, schema: str});
    (paths[pathname] ||= {})[method] = {
      tags: [tag],
      summary,
      parameters,
      ...(schema ? {requestBody: {content: {'application/json': {schema: {$ref: `#/components/schemas/${schema}`}}}}} : {}),
      responses: {200: {description: 'Success'}, 401: {description: 'Missing or wrong API key'}},
    };
  }
  return {
    openapi: '3.1.0',
    info: {title: 'QuoteDesk API', version: '1.0.0', description: 'Quotes, templates, contacts, signature documents and business cards.'},
    servers: [{url: server}],
    security: [{apiKey: []}],
    components: {securitySchemes: {apiKey: {type: 'http', scheme: 'bearer'}}, schemas},
    paths,
  };
}
