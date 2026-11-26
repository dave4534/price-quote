import React, {useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Selector} from '@astryxdesign/core/Selector';
import {Table} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {formatDate, money, QUOTE_STATUS} from '../../shared/model.js';
import {Loading, Metric, Modal, PageHeader} from '../components/ui.jsx';
import {attempt, api, navigate, useData} from '../lib/app.js';

export const STATUS_COLOR = {draft: 'neutral', to_send: 'warning', awaiting_signature: 'info', signed: 'success', declined: 'error'};

/** Pick a template and a contact, then open the new quote for editing. */
export function NewQuoteDialog({isOpen, onClose, templateId = '', contactId = ''}) {
  const templates = useData(isOpen ? 'v1/templates' : null);
  const contacts = useData(isOpen ? 'v1/contacts' : null);
  const [template, setTemplate] = useState(templateId);
  const [contact, setContact] = useState(contactId);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    const quote = await attempt(() => api('v1/quotes', {method: 'POST', body: {templateId: template || undefined, contactId: contact || undefined}}));
    setBusy(false);
    if (quote) {
      onClose();
      navigate(`/quotes/${quote.id}`);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="הצעת מחיר חדשה"
      footer={<>
        <Button label="ביטול" onClick={onClose} />
        <Button label="יצירת הצעה" variant="primary" isLoading={busy} onClick={create} />
      </>}
    >
      <Selector
        label="תבנית"
        hasSearch
        value={template}
        onChange={setTemplate}
        options={[{value: '', label: 'ללא תבנית (הצעה ריקה)'}, ...(templates.data || []).map((t) => ({value: t.id, label: t.name || t.title}))]}
      />
      <Selector
        label="לקוח"
        hasSearch
        value={contact}
        onChange={setContact}
        options={[{value: '', label: 'אמלא את הפרטים בהצעה'}, ...(contacts.data || []).map((c) => ({value: c.id, label: [c.name, c.phone].filter(Boolean).join(' · ')}))]}
      />
    </Modal>
  );
}

export default function Quotes() {
  const quotes = useData('v1/quotes');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [creating, setCreating] = useState(false);
  const all = quotes.data || [];
  const sum = (list) => money(list.reduce((total, q) => total + q.totals.total, 0));
  const by = (key) => all.filter((q) => q.status === key);
  const shown = all.filter(
    (q) => (status === 'all' || q.status === status) && `${q.number} ${q.title} ${q.customer?.name} ${q.customer?.phone}`.toLowerCase().includes(search.toLowerCase()),
  );

  const columns = [
    {key: 'number', header: 'מס׳', renderCell: (q) => <Button label={`#${q.number}`} variant="ghost" size="sm" onClick={() => navigate(`/quotes/${q.id}`)} />},
    {key: 'customer', header: 'לקוח', renderCell: (q) => q.customer?.name || '—'},
    {key: 'title', header: 'כותרת ההצעה', renderCell: (q) => <Button label={q.title || 'ללא כותרת'} variant="ghost" size="sm" onClick={() => navigate(`/quotes/${q.id}`)} />},
    {key: 'date', header: 'תאריך', renderCell: (q) => formatDate(q.date)},
    {key: 'status', header: 'סטטוס', renderCell: (q) => <Badge variant={STATUS_COLOR[q.status]} label={QUOTE_STATUS[q.status]} />},
    {key: 'views', header: 'צפיות', renderCell: (q) => q.views || '—'},
    {key: 'total', header: 'סכום', renderCell: (q) => <Text weight="semibold">{money(q.totals.total)}</Text>},
  ];

  return (
    <VStack gap={5}>
      <PageHeader title="הצעות מחיר" subtitle="מעקב, שליחה וחתימה במקום אחד">
        <Button label="תבניות" onClick={() => navigate('/templates')} />
        <Button label="הצעת מחיר חדשה" variant="primary" onClick={() => setCreating(true)} />
      </PageHeader>
      {!quotes.data ? <Loading error={quotes.error} /> : <>
        <Grid columns={{minWidth: 180}} gap={3}>
          <Metric label={`${all.length} הצעות שנשמרו`} value={sum(all)} />
          <Metric label={`${by('signed').length} נחתמו`} value={sum(by('signed'))} />
          <Metric label={`${by('awaiting_signature').length} ממתינות לחתימה`} value={sum(by('awaiting_signature'))} />
          <Metric label="אחוז המרה" value={`${all.length ? Math.round((by('signed').length / all.length) * 1000) / 10 : 0}%`} />
        </Grid>
        <HStack justify="between" wrap="wrap" gap={2}>
          <SegmentedControl label="סינון לפי סטטוס" value={status} onChange={setStatus}>
            <SegmentedControlItem value="all" label="הכל" />
            {Object.entries(QUOTE_STATUS).map(([key, label]) => <SegmentedControlItem key={key} value={key} label={label} />)}
          </SegmentedControl>
          <TextInput label="חיפוש הצעות" isLabelHidden value={search} onChange={setSearch} placeholder="חיפוש לפי לקוח, כותרת או מספר" />
        </HStack>
        <div className="scroll-x">
          <Table data={shown} columns={columns} idKey="id" hasHover emptyState={<Text>לא נמצאו הצעות מחיר.</Text>} />
        </div>
      </>}
      {creating && <NewQuoteDialog isOpen onClose={() => setCreating(false)} />}
    </VStack>
  );
}
