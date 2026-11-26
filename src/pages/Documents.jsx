import React, {Suspense, lazy, useEffect, useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {DateInput} from '@astryxdesign/core/DateInput';
import {FileInput} from '@astryxdesign/core/FileInput';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Selector} from '@astryxdesign/core/Selector';
import {Table} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {DOC_STATUS, formatDate, whatsappLink} from '../../shared/model.js';
import {Confirm, ImageField, Loading, Metric, Modal, PageHeader, Panel} from '../components/ui.jsx';
import {api, attempt, copy, download, navigate, upload, useData} from '../lib/app.js';

const PdfPages = lazy(() => import('../components/PdfPages.jsx'));

export const FIELD_TYPES = {signature: 'חתימה', name: 'שם מלא', date: 'תאריך', idNumber: 'ת.ז', text: 'טקסט'};
const today = () => new Date().toISOString().slice(0, 10);
const blank = {title: '', intro: '', kind: 'text', body: '', fileId: '', fileName: '', imageIds: [], contactId: '', recipient: {name: '', phone: '', email: ''}, requireSignature: true, dueDate: '', fields: [], password: undefined};

export default function Documents() {
  const documents = useData('v1/documents');
  const [search, setSearch] = useState('');
  const all = (documents.data || []).filter((d) => !d.isTemplate);
  const templates = (documents.data || []).filter((d) => d.isTemplate);
  const overdue = (d) => d.status !== 'signed' && d.dueDate && d.dueDate < today();

  const fromTemplate = async (id) => {
    const copyDoc = await attempt(async () => {
      const made = await api(`v1/documents/${id}/duplicate`, {method: 'POST'});
      return api(`v1/documents/${made.id}`, {method: 'PATCH', body: {isTemplate: false}});
    });
    if (copyDoc) navigate(`/documents/${copyDoc.id}`);
  };

  const columns = [
    {key: 'title', header: 'כותרת', renderCell: (d) => <Button label={d.title || 'ללא כותרת'} variant="ghost" size="sm" onClick={() => navigate(`/documents/${d.id}`)} />},
    {key: 'recipient', header: 'נמען', renderCell: (d) => d.recipient?.name || '—'},
    {key: 'createdAt', header: 'נוצר', renderCell: (d) => formatDate(d.createdAt)},
    {key: 'dueDate', header: 'תאריך יעד', renderCell: (d) => formatDate(d.dueDate) || '—'},
    {key: 'views', header: 'צפיות', renderCell: (d) => d.views || '—'},
    {key: 'status', header: 'סטטוס', renderCell: (d) => <Badge variant={d.status === 'signed' ? 'success' : overdue(d) ? 'error' : d.status === 'sent' ? 'info' : 'neutral'} label={overdue(d) ? 'מאחר' : DOC_STATUS[d.status]} />},
    {key: 'actions', header: 'פעולות', renderCell: (d) => d.status === 'signed'
      ? <Button label="הורדה" size="sm" onClick={() => attempt(() => download(`v1/documents/${d.id}/file`, `${d.title}.pdf`))} />
      : <Button label="תזכורת" size="sm" href={whatsappLink(d.recipient?.phone, `שלום ${d.recipient?.name || ''}, תזכורת לחתום על "${d.title}": ${d.url}`)} target="_blank" />},
  ];

  return (
    <VStack gap={5}>
      <PageHeader title="מסמכים לחתימה" subtitle="העלאה או יצירה של מסמך ושליחתו לחתימה">
        {templates.length > 0 && <Selector label="מסמך מתבנית" isLabelHidden placeholder="מסמך מתבנית" value="" onChange={fromTemplate} options={templates.map((t) => ({value: t.id, label: t.title}))} />}
        <Button label="מסמך חדש" variant="primary" onClick={() => navigate('/documents/new')} />
      </PageHeader>
      {!documents.data ? <Loading error={documents.error} /> : <>
        <Grid columns={{minWidth: 180}} gap={3}>
          <Metric label="סה״כ מסמכים" value={all.length} />
          <Metric label="נחתמו" value={all.filter((d) => d.status === 'signed').length} />
          <Metric label="ממתינים לחתימה" value={all.filter((d) => d.status === 'sent').length} />
        </Grid>
        <TextInput label="חיפוש לפי כותרת או נמען" isLabelHidden placeholder="חיפוש לפי כותרת או נמען" value={search} onChange={setSearch} />
        <div className="scroll-x">
          <Table data={all.filter((d) => `${d.title} ${d.recipient?.name}`.includes(search))} columns={columns} idKey="id" hasHover emptyState={<Text>אין מסמכים להצגה.</Text>} />
        </div>
        {templates.length > 0 && (
          <Panel title="תבניות מסמכים">
            {templates.map((t) => <HStack key={t.id} justify="between" gap={2}><Text>{t.title}</Text><HStack gap={1}><Button label="שימוש" size="sm" onClick={() => fromTemplate(t.id)} /><Button label="עריכה" size="sm" variant="ghost" onClick={() => navigate(`/documents/${t.id}`)} /></HStack></HStack>)}
          </Panel>
        )}
      </>}
    </VStack>
  );
}

function FieldMapper({fileId, fields, onChange, disabled}) {
  const [blob, setBlob] = useState(null);
  const [type, setType] = useState('signature');
  useEffect(() => {
    setBlob(null);
    api(`v1/files/${fileId}`).then(setBlob, () => {});
  }, [fileId]);
  const place = (page, x, y) => {
    const w = type === 'signature' ? 0.25 : 0.2;
    const h = type === 'signature' ? 0.06 : 0.03;
    onChange([...fields, {id: crypto.randomUUID(), type, page, x: Math.max(0, Math.min(1 - w, x - w / 2)), y: Math.max(0, Math.min(1 - h, y - h / 2)), w, h}]);
  };
  return (
    <VStack gap={3}>
      {!disabled && <>
        <Text type="supporting" color="secondary">בחרו סוג שדה ולחצו על העמוד כדי להציב אותו. לחיצה על שדה מסירה אותו.</Text>
        <SegmentedControl label="סוג שדה" value={type} onChange={setType}>
          {Object.entries(FIELD_TYPES).map(([value, label]) => <SegmentedControlItem key={value} value={value} label={label} />)}
        </SegmentedControl>
      </>}
      {blob ? (
        <Suspense fallback={<Loading />}>
          <PdfPages
            blob={blob}
            onPlace={disabled ? undefined : place}
            overlay={(page) => fields.filter((f) => f.page === page).map((f) => (
              <button type="button" key={f.id} className="pdf-field" style={{left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`}} onClick={() => !disabled && onChange(fields.filter((x) => x.id !== f.id))}>
                {FIELD_TYPES[f.type]}
              </button>
            ))}
          />
        </Suspense>
      ) : <Loading />}
    </VStack>
  );
}

export function DocumentEditor({id}) {
  const isNew = id === 'new';
  const record = useData(isNew ? null : `v1/documents/${id}`);
  const contacts = useData('v1/contacts');
  const [form, setForm] = useState(isNew ? blank : null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (record.data) setForm(record.data);
    else if (isNew) setForm(blank);
  }, [record.data, isNew]);

  if (!form) return <Loading error={record.error} />;
  const locked = Boolean(form.signature);
  const set = (key) => (value) => setForm((f) => ({...f, [key]: value}));
  const setRecipient = (key) => (value) => setForm((f) => ({...f, recipient: {...f.recipient, [key]: value}}));

  const save = async (extra = {}) => {
    if (!form.title.trim()) {
      await attempt(() => Promise.reject(new Error('צריך כותרת למסמך')));
      return false;
    }
    if (form.kind === 'pdf' && !form.fileId) {
      await attempt(() => Promise.reject(new Error('צריך להעלות קובץ PDF')));
      return false;
    }
    setBusy(true);
    const body = {...form, ...extra, ...(password ? {password} : {})};
    const saved = await attempt(() => api(isNew ? 'v1/documents' : `v1/documents/${id}`, {method: isNew ? 'POST' : 'PATCH', body}), 'המסמך נשמר');
    setBusy(false);
    if (!saved) return false;
    setPassword('');
    if (isNew) navigate(`/documents/${saved.id}`);
    else setForm(saved);
    return saved;
  };

  const uploadPdf = async (file) => {
    if (!file) return;
    setBusy(true);
    const saved = await attempt(() => upload(file));
    setBusy(false);
    if (saved) setForm((f) => ({...f, fileId: saved.id, fileName: file.name, fields: [], title: f.title || file.name.replace(/\.pdf$/i, '')}));
  };

  const message = `שלום ${form.recipient?.name || ''}, מצורף "${form.title}". ${form.intro || ''} לצפייה וחתימה: ${form.url}`;
  const sent = () => api(`v1/documents/${id}/mark-sent`, {method: 'POST'}).catch(() => {});

  return (
    <VStack gap={4}>
      <PageHeader title={isNew ? 'מסמך חדש לחתימה' : form.title} subtitle={form.isTemplate ? 'תבנית מסמך' : form.views ? `נצפה ${form.views} פעמים` : undefined}>
        <Button label="חזרה" variant="ghost" onClick={() => navigate('/documents')} />
        {!isNew && <Button label="מחיקה" variant="ghost" onClick={() => setDialog('delete')} />}
        {!isNew && !form.isTemplate && <Button label="שמירה כתבנית" onClick={() => attempt(() => api(`v1/documents/${id}/save-as-template`, {method: 'POST'}), 'התבנית נשמרה')} />}
        {!isNew && <Button label="הורדת PDF" onClick={() => attempt(() => download(`v1/documents/${id}/file`, `${form.title}.pdf`))} />}
        {!isNew && !form.isTemplate && <Button label="שליחה לחתימה" onClick={async () => (locked || (await save())) && setDialog('send')} />}
        {!locked && <Button label="שמירה" variant="primary" isLoading={busy} onClick={() => save()} />}
      </PageHeader>

      {locked && <Banner status="success" title={`נחתם על ידי ${form.signature.name} בתאריך ${formatDate(form.signature.at)}`} />}

      <fieldset className="plain" disabled={locked}>
        <VStack gap={4}>
          <Panel title="מה שולחים?">
            <SegmentedControl label="סוג המסמך" value={form.kind} onChange={set('kind')}>
              <SegmentedControlItem value="text" label="כתיבת מסמך" />
              <SegmentedControlItem value="pdf" label="העלאת PDF" />
            </SegmentedControl>
            <TextInput label="כותרת המסמך" value={form.title} onChange={set('title')} isRequired />
            <TextArea label="טקסט מקדים (יופיע בהודעה ובעמוד החתימה)" value={form.intro || ''} onChange={set('intro')} />
            {form.kind === 'text' ? <>
              <TextArea label="תוכן המסמך" rows={14} value={form.body || ''} onChange={set('body')} />
              <ImageField label="תמונות (עד 6)" max={6} value={form.imageIds} onChange={set('imageIds')} />
            </> : <>
              {!locked && <FileInput label="קובץ PDF" value={null} accept="application/pdf" description={form.fileName || 'עד 4MB'} placeholder={form.fileId ? 'החלפת הקובץ' : 'בחירת קובץ'} isLoading={busy} onChange={(files) => uploadPdf(Array.isArray(files) ? files[0] : files)} />}
              {form.fileId && <FieldMapper fileId={form.fileId} fields={form.fields || []} onChange={set('fields')} disabled={locked} />}
            </>}
          </Panel>

          <Panel title="למי שולחים?">
            <Selector label="בחירה מאנשי הקשר" hasSearch value={form.contactId || ''} options={[{value: '', label: 'ללא איש קשר שמור'}, ...(contacts.data || []).map((c) => ({value: c.id, label: c.name}))]}
              onChange={(contactId) => { const c = contacts.data?.find((x) => x.id === contactId); setForm((f) => ({...f, contactId: contactId || '', recipient: c ? {name: c.name, phone: c.phone, email: c.email} : f.recipient})); }} />
            <Grid columns={{minWidth: 220}} gap={3}>
              <TextInput label="שם" value={form.recipient?.name || ''} onChange={setRecipient('name')} />
              <TextInput label="טלפון" type="tel" value={form.recipient?.phone || ''} onChange={setRecipient('phone')} />
              <TextInput label="דוא״ל" type="email" value={form.recipient?.email || ''} onChange={setRecipient('email')} />
            </Grid>
          </Panel>

          <Panel title="הגדרות">
            <CheckboxInput label="הנמען חותם דיגיטלית" value={form.requireSignature} onChange={set('requireSignature')} />
            <Grid columns={{minWidth: 220}} gap={3}>
              <DateInput label="תאריך יעד לחתימה" hasClear value={form.dueDate || undefined} onChange={(v) => set('dueDate')(v || '')} />
              <TextInput label="סיסמה לפתיחת המסמך" type="password" value={password} onChange={setPassword} placeholder={form.hasPassword ? 'מוגדרת. הקלידו להחלפה' : 'לא חובה'} />
            </Grid>
            {form.hasPassword && <HStack><Button label="הסרת הסיסמה" variant="ghost" size="sm" onClick={() => save({password: ''})} /></HStack>}
          </Panel>
        </VStack>
      </fieldset>

      {dialog === 'send' && (
        <Modal isOpen onClose={() => { setDialog(''); record.reload(); }} title="שליחה לחתימה">
          <TextInput label="קישור לחתימה" value={form.url} onChange={() => {}} isReadOnly />
          <HStack gap={2} wrap="wrap">
            <Button label="שליחה ב־WhatsApp" variant="primary" href={whatsappLink(form.recipient?.phone, message)} target="_blank" onClick={sent} />
            <Button label="שליחה בדוא״ל" href={`mailto:${form.recipient?.email || ''}?subject=${encodeURIComponent(form.title)}&body=${encodeURIComponent(message)}`} onClick={sent} />
            <Button label="העתקת קישור" onClick={() => attempt(async () => { await copy(form.url); await sent(); })} />
            <Button label="פתיחת תצוגת נמען" variant="ghost" href={form.url} target="_blank" />
          </HStack>
        </Modal>
      )}
      <Confirm question={dialog === 'delete' ? 'למחוק את המסמך לצמיתות?' : ''} onClose={() => setDialog('')} onConfirm={async () => { if (await attempt(() => api(`v1/documents/${id}`, {method: 'DELETE'}), 'נמחק')) navigate('/documents'); }} />
    </VStack>
  );
}
