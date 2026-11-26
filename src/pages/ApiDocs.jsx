import React from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Table} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {endpoints, webhookEvents} from '../../lib/openapi.js';
import {PageHeader, Panel} from '../components/ui.jsx';

const base = window.location.origin;

const Code = ({children, language = 'bash'}) => <div dir="ltr"><CodeBlock code={children} language={language} width="100%" isWrapped /></div>;

const examples = {
  curl: `# List templates
curl ${base}/api/v1/templates -H "Authorization: Bearer $QUOTEDESK_API_KEY"

# Create a quote from a template
curl -X POST ${base}/api/v1/quotes \\
  -H "Authorization: Bearer $QUOTEDESK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"templateId":"TEMPLATE_ID","externalId":"call-8812",
       "contact":{"name":"Dana Levi","phone":"0500000000"},
       "arrivalDate":"2026-12-01","arrivalTime":"09:00"}'

# Download its PDF
curl ${base}/api/v1/quotes/QUOTE_ID/pdf \\
  -H "Authorization: Bearer $QUOTEDESK_API_KEY" -o quote.pdf`,
  worker: `// Cloudflare Worker: turn an incoming lead or call into a draft quote.
// Secrets:  npx wrangler secret put QUOTEDESK_API_KEY
//           npx wrangler secret put INBOUND_SECRET
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('POST only', {status: 405});
    if (request.headers.get('x-inbound-secret') !== env.INBOUND_SECRET) {
      return new Response('Forbidden', {status: 403});
    }
    const lead = await request.json();
    const response = await fetch('${base}/api/v1/quotes', {
      method: 'POST',
      headers: {
        authorization: \`Bearer \${env.QUOTEDESK_API_KEY}\`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        templateId: lead.templateId,
        externalId: lead.id, // retries return the same quote
        contact: {name: lead.name, phone: lead.phone, address: lead.address},
      }),
    });
    return new Response(await response.text(), {status: response.status});
  },
};`,
  webhook: `// Cloudflare Worker: receive QuoteDesk events and verify they are genuine.
// Secret:  npx wrangler secret put QUOTEDESK_WEBHOOK_SECRET   (shown in Settings)
export default {
  async fetch(request, env) {
    const body = await request.text();
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(env.QUOTEDESK_WEBHOOK_SECRET),
      {name: 'HMAC', hash: 'SHA-256'}, false, ['verify']);
    const hex = (request.headers.get('x-quotedesk-signature') || '').replace('sha256=', '');
    const signature = new Uint8Array((hex.match(/../g) || []).map((b) => parseInt(b, 16)));
    const valid = await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(body));
    if (!valid) return new Response('Bad signature', {status: 401});

    const {event, data} = JSON.parse(body);
    if (event === 'quote.signed') {
      // e.g. open a calendar entry, message the office, start a report
      console.log('signed', data.number, data.customer?.name);
    }
    return new Response('ok');
  },
};`,
};

export default function ApiDocs() {
  const groups = [...new Set(endpoints.map(([group]) => group))];
  return (
    <VStack gap={4}>
      <PageHeader title="API ותיעוד" subtitle="לחיבור אוטומציות, למשל עם Cloudflare Workers">
        <Button label="קובץ OpenAPI" href="/api/openapi.json" target="_blank" />
      </PageHeader>
      <div dir="ltr">
        <VStack gap={4}>
          <Panel title="Basics">
            <Text>Base URL: {base}/api/v1</Text>
            <Text>Send the API key on every request as a header: Authorization: Bearer YOUR_API_KEY. Keep it in a Worker secret, never in code or in a browser.</Text>
            <Text>Requests and responses are JSON. Success returns {'{"data": …}'}, failure returns {'{"error": "…"}'} with a 4xx or 5xx status. Dates are YYYY-MM-DD, amounts are in shekels. Uploads are limited to 4 MB.</Text>
          </Panel>
          {groups.map((group) => (
            <Panel key={group} title={group}>
              <div className="scroll-x">
                <Table
                  idKey="key"
                  data={endpoints.filter(([g]) => g === group).map(([, method, path, summary]) => ({key: method + path, method, path, summary}))}
                  columns={[
                    {key: 'method', header: 'Method', renderCell: (e) => <Badge label={e.method.toUpperCase()} variant={{get: 'blue', post: 'green', patch: 'orange', delete: 'red'}[e.method]} />},
                    {key: 'path', header: 'Path', renderCell: (e) => <Text type="code">{e.path}</Text>},
                    {key: 'summary', header: 'What it does'},
                  ]}
                />
              </div>
            </Panel>
          ))}
          <Panel title="Examples with curl"><Code>{examples.curl}</Code></Panel>
          <Panel title="Cloudflare Worker: create quotes"><Code language="javascript">{examples.worker}</Code></Panel>
          <Panel title="Webhooks">
            <Text>Set an https address in Settings. Each event is a POST with {'{event, sentAt, data}'} and the header X-QuoteDesk-Signature: sha256=HMAC of the raw body. Delivery is attempted once with a 4 second timeout, so reconcile important state with a GET.</Text>
            <HStack gap={1} wrap="wrap">{webhookEvents.map((event) => <Badge key={event} label={event} />)}</HStack>
            <Code language="javascript">{examples.webhook}</Code>
          </Panel>
        </VStack>
      </div>
    </VStack>
  );
}
