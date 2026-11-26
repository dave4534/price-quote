import React, {useEffect, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Grid} from '@astryxdesign/core/Grid';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {ImageField, Loading, PageHeader, Panel} from '../components/ui.jsx';
import {api, attempt, useData} from '../lib/app.js';

export default function Settings() {
  const settings = useData('v1/settings');
  const [form, setForm] = useState(null);
  useEffect(() => setForm(settings.data), [settings.data]);
  if (!form) return <Loading error={settings.error} />;
  const set = (key) => (value) => setForm((f) => ({...f, [key]: value}));
  const field = (key, label, props) => <TextInput label={label} value={String(form[key] ?? '')} onChange={set(key)} {...props} />;
  const area = (key, label) => <TextArea label={label} rows={6} value={form[key] || ''} onChange={set(key)} />;
  const save = async () => {
    const saved = await attempt(() => api('v1/settings', {method: 'PATCH', body: form}), 'ההגדרות נשמרו');
    if (saved) setForm(saved);
  };

  return (
    <VStack gap={4}>
      <PageHeader title="הגדרות"><Button label="שמירת הגדרות" variant="primary" onClick={save} /></PageHeader>
      <Panel title="העסק">
        <ImageField label="לוגו העסק" value={form.logoId} onChange={set('logoId')} />
        <Grid columns={{minWidth: 240}} gap={3}>
          {field('businessName', 'שם העסק')}
          {field('ownerName', 'שם בעל העסק')}
          {field('phone', 'טלפון', {type: 'tel'})}
          {field('email', 'דוא״ל', {type: 'email'})}
          {field('address', 'כתובת')}
          {field('website', 'אתר', {type: 'url'})}
          {field('businessType', 'סוג העסק (עוסק פטור / מורשה / חברה)')}
          {field('businessNumber', 'מספר עוסק')}
        </Grid>
      </Panel>
      <Panel title="עיצוב ההצעה ומספור">
        <Grid columns={{minWidth: 200}} gap={3}>
          {field('pdfColor', 'צבע ראשי (#hex)')}
          {field('pdfAccent', 'צבע טקסט על הרקע (#hex)')}
          {field('pdfHeader', 'שורה עליונה')}
          {field('vatRate', 'מע״מ %')}
          {field('nextQuoteNumber', 'מספר ההצעה הבאה')}
        </Grid>
      </Panel>
      <Panel title="תוכן שמור להצעות חדשות">
        {area('defaultNotes', 'הערות')}
        {area('defaultTerms', 'תנאים ומידע חשוב')}
        {area('defaultPaymentTerms', 'תנאי תשלום')}
        {area('defaultAbout', 'אודות העסק')}
      </Panel>
      <Panel title="Webhooks לאוטומציות">
        {field('webhookUrl', 'כתובת Webhook (https)', {type: 'url', placeholder: 'https://example.workers.dev/hooks/quotedesk'})}
        {form.webhookSecret && <TextInput label="מפתח לאימות החתימה" value={form.webhookSecret} onChange={() => {}} isReadOnly />}
        <Text type="supporting" color="secondary">אירועים נשלחים בחתימה, צפייה ושינוי. הפרטים בעמוד ה־API.</Text>
      </Panel>
    </VStack>
  );
}
