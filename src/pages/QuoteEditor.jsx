import React, {useEffect, useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {DateInput} from '@astryxdesign/core/DateInput';
import {Divider} from '@astryxdesign/core/Divider';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Selector} from '@astryxdesign/core/Selector';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {formatDate, money, QUOTE_STATUS, totals, VAT_MODES, whatsappLink} from '../../shared/model.js';
import {Confirm, HtmlPreview, ImageField, Loading, Modal, PageHeader, Panel} from '../components/ui.jsx';
import {api, attempt, copy, download, navigate, useData} from '../lib/app.js';
import {STATUS_COLOR} from './Quotes.jsx';

const emptyItem = {description: '', details: '', qty: 1, price: 0};
const blankTemplate = {name: '', title: 'הצעת מחיר', items: [emptyItem], vatMode: 'none', vatRate: 18, requireSignature: true, validityDays: 7};

const Numeric = ({value, onChange, label}) => (
  <TextInput label={label} value={String(value ?? '')} onChange={(v) => /^\d*\.?\d*$/.test(v) && onChange(v)} />
);

function SendDialog({quote, onClose}) {
  const message = `שלום ${quote.customer?.name || ''}, מצורפת ${quote.title || 'הצעת מחיר'} מספר ${quote.number}. לצפייה וחתימה: ${quote.url}`;
  const sent = () => api(`v1/quotes/${quote.id}/mark-sent`, {method: 'POST'}).catch(() => {});
  return (
    <Modal isOpen onClose={onClose} title="שליחה ללקוח">
      <TextInput label="קישור לצפייה וחתימה" value={quote.url} onChange={() => {}} isReadOnly />
      <HStack gap={2} wrap="wrap">
        <Button label="שליחה ב־WhatsApp" variant="primary" href={whatsappLink(quote.customer?.phone, message)} target="_blank" onClick={sent} />
        <Button label="שליחה בדוא״ל" href={`mailto:${quote.customer?.email || ''}?subject=${encodeURIComponent(quote.title)}&body=${encodeURIComponent(message)}`} onClick={sent} />
        <Button label="העתקת קישור" onClick={() => attempt(async () => { await copy(quote.url); await sent(); })} />
        <Button label="פתיחת תצוגת לקוח" variant="ghost" href={quote.url} target="_blank" />
      </HStack>
      <Text type="supporting" color="secondary">ההודעה נפתחת באפליקציה שלכם ונשלחת רק כשאתם לוחצים שליחה.</Text>
    </Modal>
  );
}

/** Edits a quote, or a template when `isTemplate` is set. */
export default function QuoteEditor({id, isTemplate = false}) {
  const kind = isTemplate ? 'templates' : 'quotes';
  const isNew = id === 'new';
  const record = useData(isNew ? null : `v1/${kind}/${id}`);
  const settings = useData('v1/settings');
  const contacts = useData(isTemplate ? null : 'v1/contacts');
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState('');
  const [dialog, setDialog] = useState('');
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    if (isNew && settings.data) {
      const s = settings.data;
      setForm({...blankTemplate, vatRate: s.vatRate, notes: s.defaultNotes || '', terms: s.defaultTerms || '', paymentTerms: s.defaultPaymentTerms || '', about: s.defaultAbout || '', header: s.pdfHeader || ''});
    } else if (record.data) {
      setForm(record.data);
    }
    setDirty(false);
  }, [record.data, isNew, isNew && settings.data]);

  // Redraw the preview shortly after typing stops.
  useEffect(() => {
    if (!form) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      api('v1/preview/quote', {method: 'POST', body: form}).then((html) => live && setPreview(html), () => {});
    }, 600);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [form]);

  useEffect(() => {
    const warn = (event) => dirty && event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!form) return <Loading error={record.error || settings.error} />;

  const locked = Boolean(form.signature);
  const set = (key, value) => {
    setForm((f) => ({...f, [key]: value}));
    setDirty(true);
  };
  const setCustomer = (key, value) => set('customer', {...form.customer, [key]: value});
  const setItem = (index, key, value) => set('items', form.items.map((item, i) => (i === index ? {...item, [key]: value} : item)));
  const moveItem = (index) => {
    const items = [...form.items];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    set('items', items);
  };
  const sum = totals(form);
  const listPath = isTemplate ? '/templates' : '/quotes';

  const save = async () => {
    setBusy(true);
    const {signature, status, ...content} = form;
    const body = isTemplate ? content : {...content, status};
    const saved = await attempt(
      () => (isNew ? api(`v1/${kind}`, {method: 'POST', body}) : api(`v1/${kind}/${id}`, {method: 'PATCH', body})),
      isTemplate ? 'התבנית נשמרה' : 'ההצעה נשמרה',
    );
    setBusy(false);
    if (!saved) return false;
    setDirty(false);
    if (isNew) navigate(`/${kind}/${saved.id}`);
    else setForm(saved);
    return saved;
  };
  const saveIfNeeded = async () => (dirty && !locked ? save() : form);

  const exportPdf = async () => {
    const saved = await saveIfNeeded();
    if (!saved) return;
    setBusy(true);
    await attempt(() => download(`v1/quotes/${id}/pdf`, `quote-${saved.number}.pdf`));
    setBusy(false);
  };

  const chooseContact = (contactId) => {
    const contact = contacts.data?.find((c) => c.id === contactId);
    setForm((f) => ({...f, contactId: contactId || '', customer: contact ? {name: contact.name, phone: contact.phone, email: contact.email, address: contact.address} : f.customer}));
    setDirty(true);
  };

  return (
    <VStack gap={4}>
      <PageHeader
        title={isTemplate ? (isNew ? 'תבנית חדשה' : `תבנית: ${form.name}`) : `הצעה #${form.number}`}
        subtitle={isTemplate ? 'כל מה שכאן ייכנס להצעה חדשה מהתבנית' : form.views ? `הלקוח צפה ${form.views} פעמים` : undefined}
      >
        {!isTemplate && <Badge variant={STATUS_COLOR[form.status]} label={QUOTE_STATUS[form.status]} />}
        <Button label="חזרה" variant="ghost" onClick={() => (dirty && !locked ? setDialog('leave') : navigate(listPath))} />
        {!isNew && <Button label="מחיקה" variant="ghost" onClick={() => setDialog('delete')} />}
        {!isNew && !isTemplate && <>
          <Button label="שכפול" onClick={async () => { const q = await attempt(() => api(`v1/quotes/${id}/duplicate`, {method: 'POST'}), 'נוצר העתק'); if (q) navigate(`/quotes/${q.id}`); }} />
          <Button label="שמירה כתבנית" onClick={() => { setTemplateName(form.title); setDialog('template'); }} />
          <Button label="ייצוא PDF" isLoading={busy} onClick={exportPdf} />
          <Button label="שליחה ללקוח" onClick={async () => (await saveIfNeeded()) && setDialog('send')} />
        </>}
        {isTemplate && !isNew && <Button label="הצעה מתבנית" onClick={async () => { const q = await attempt(() => api('v1/quotes', {method: 'POST', body: {templateId: id}})); if (q) navigate(`/quotes/${q.id}`); }} />}
        {!locked && <Button label="שמירה" variant="primary" isLoading={busy} onClick={save} />}
      </PageHeader>

      {locked && <Banner status="success" title={`ההצעה נחתמה על ידי ${form.signature.name} בתאריך ${formatDate(form.signature.at)}`} description="הצעה חתומה נעולה לעריכה. כדי לשנות, שכפלו אותה." />}

      <div className="editor">
        <fieldset className="plain" disabled={locked}>
          <VStack gap={4}>
            <Panel title="פרטי ההצעה">
              <Grid columns={{minWidth: 220}} gap={3}>
                {isTemplate && <TextInput label="שם התבנית" value={form.name || ''} onChange={(v) => set('name', v)} isRequired />}
                <TextInput label="כותרת ההצעה" value={form.title || ''} onChange={(v) => set('title', v)} />
                <TextInput label="שורה עליונה (למשל בס״ד)" value={form.header || ''} onChange={(v) => set('header', v)} />
                <Numeric label="תוקף בימים" value={form.validityDays} onChange={(v) => set('validityDays', v)} />
                {!isTemplate && <>
                  <DateInput label="תאריך" value={form.date || undefined} onChange={(v) => set('date', v || '')} />
                  <DateInput label="בתוקף עד" hasClear value={form.expiry || undefined} onChange={(v) => set('expiry', v || '')} />
                  <DateInput label="תאריך הגעה" hasClear value={form.arrivalDate || undefined} onChange={(v) => set('arrivalDate', v || '')} />
                  <TextInput label="שעת הגעה" placeholder="09:00" value={form.arrivalTime || ''} onChange={(v) => set('arrivalTime', v)} />
                  <Selector label="סטטוס" value={form.status} onChange={(v) => set('status', v)} options={Object.entries(QUOTE_STATUS).filter(([k]) => k !== 'signed' || form.status === 'signed').map(([value, label]) => ({value, label}))} />
                </>}
              </Grid>
            </Panel>

            {!isTemplate && (
              <Panel title="לקוח">
                <Selector label="בחירה מאנשי הקשר" hasSearch value={form.contactId || ''} onChange={chooseContact} options={[{value: '', label: 'ללא איש קשר שמור'}, ...(contacts.data || []).map((c) => ({value: c.id, label: [c.name, c.phone].filter(Boolean).join(' · ')}))]} />
                <Grid columns={{minWidth: 220}} gap={3}>
                  <TextInput label="שם" value={form.customer?.name || ''} onChange={(v) => setCustomer('name', v)} />
                  <TextInput label="טלפון" type="tel" value={form.customer?.phone || ''} onChange={(v) => setCustomer('phone', v)} />
                  <TextInput label="דוא״ל" type="email" value={form.customer?.email || ''} onChange={(v) => setCustomer('email', v)} />
                  <TextInput label="כתובת" value={form.customer?.address || ''} onChange={(v) => setCustomer('address', v)} />
                </Grid>
              </Panel>
            )}

            <Panel title="שירותים ומחירים">
              {form.items.map((item, i) => (
                <VStack key={i} gap={2}>
                  <TextArea label={`תיאור שירות ${i + 1}`} rows={2} value={item.description} onChange={(v) => setItem(i, 'description', v)} />
                  <TextArea label="הערות והבהרות לשורה" rows={3} value={item.details} onChange={(v) => setItem(i, 'details', v)} />
                  <HStack gap={2} wrap="wrap" vAlign="end">
                    <Numeric label="כמות" value={item.qty} onChange={(v) => setItem(i, 'qty', v)} />
                    <Numeric label="מחיר" value={item.price} onChange={(v) => setItem(i, 'price', v)} />
                    <Text weight="semibold">{money((Number(item.qty) || 0) * (Number(item.price) || 0))}</Text>
                    {i > 0 && <Button label="העלאה" size="sm" variant="ghost" onClick={() => moveItem(i)} />}
                    <Button label="הסרת שורה" size="sm" variant="ghost" onClick={() => set('items', form.items.filter((_, n) => n !== i))} />
                  </HStack>
                  <Divider />
                </VStack>
              ))}
              <HStack><Button label="הוספת שורה" onClick={() => set('items', [...form.items, {...emptyItem}])} /></HStack>
              <Grid columns={{minWidth: 200}} gap={3}>
                <Selector label="מע״מ" value={form.vatMode || 'none'} onChange={(v) => set('vatMode', v)} options={Object.entries(VAT_MODES).map(([value, label]) => ({value, label}))} />
                <Numeric label="שיעור מע״מ %" value={form.vatRate} onChange={(v) => set('vatRate', v)} />
                <Numeric label="הנחה" value={form.discount || ''} onChange={(v) => set('discount', v)} />
                <Selector label="סוג הנחה" value={form.discountType || 'amount'} onChange={(v) => set('discountType', v)} options={[{value: 'amount', label: 'בשקלים'}, {value: 'percent', label: 'באחוזים'}]} />
              </Grid>
            </Panel>

            <Panel title="הערות ותנאים">
              <TextArea label="הערות" rows={5} value={form.notes || ''} onChange={(v) => set('notes', v)} />
              <TextArea label="תנאים ומידע חשוב" rows={8} value={form.terms || ''} onChange={(v) => set('terms', v)} />
              <TextArea label="תנאי תשלום" rows={5} value={form.paymentTerms || ''} onChange={(v) => set('paymentTerms', v)} />
              <TextArea label="אודות העסק" rows={5} value={form.about || ''} onChange={(v) => set('about', v)} />
            </Panel>

            <Panel title="תמונות וחתימה">
              <ImageField label="תמונות להצעה (עד 3)" max={3} value={form.imageIds} onChange={(v) => set('imageIds', v)} />
              <CheckboxInput label="הלקוח חותם דיגיטלית" value={form.requireSignature !== false} onChange={(v) => set('requireSignature', v)} />
            </Panel>
          </VStack>
        </fieldset>

        <VStack gap={3}>
          <Panel title="סיכום">
            {sum.discount > 0 && <HStack justify="between"><Text>הנחה</Text><Text>{money(-sum.discount)}</Text></HStack>}
            <HStack justify="between"><Text>לפני מע״מ</Text><Text>{money(form.vatMode === 'included' ? sum.total - sum.vat : sum.net)}</Text></HStack>
            {form.vatMode !== 'none' && <HStack justify="between"><Text>מע״מ {sum.vatRate}%</Text><Text>{money(sum.vat)}</Text></HStack>}
            <Divider />
            <HStack justify="between"><Heading level={3}>סה״כ</Heading><Heading level={3}>{money(sum.total)}</Heading></HStack>
          </Panel>
          {preview ? <HtmlPreview title="תצוגה מקדימה של ה־PDF" html={preview} /> : <Loading />}
        </VStack>
      </div>

      {dialog === 'send' && <SendDialog quote={form} onClose={() => { setDialog(''); record.reload(); }} />}
      <Modal
        isOpen={dialog === 'template'}
        onClose={() => setDialog('')}
        title="שמירה כתבנית"
        footer={<Button label="שמירת תבנית" variant="primary" onClick={async () => { if (await saveIfNeeded() && await attempt(() => api(`v1/quotes/${id}/save-as-template`, {method: 'POST', body: {name: templateName}}), 'התבנית נשמרה')) setDialog(''); }} />}
      >
        <TextInput label="שם התבנית" value={templateName} onChange={setTemplateName} />
      </Modal>
      <Confirm
        question={dialog === 'delete' ? 'למחוק לצמיתות? לא ניתן לשחזר.' : ''}
        onClose={() => setDialog('')}
        onConfirm={async () => { if (await attempt(() => api(`v1/${kind}/${id}`, {method: 'DELETE'}), 'נמחק')) navigate(listPath); }}
      />
      <Confirm question={dialog === 'leave' ? 'יש שינויים שלא נשמרו. לצאת בלי לשמור?' : ''} confirmLabel="יציאה" onClose={() => setDialog('')} onConfirm={() => navigate(listPath)} />
    </VStack>
  );
}
