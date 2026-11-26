import React, {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Selector} from '@astryxdesign/core/Selector';
import {Table} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Confirm, Loading, Modal, PageHeader} from '../components/ui.jsx';
import {api, attempt, useData} from '../lib/app.js';
import {NewQuoteDialog} from './Quotes.jsx';

const blank = {name: '', type: 'private', phone: '', email: '', address: '', notes: ''};

export default function Contacts() {
  const contacts = useData('v1/contacts');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null);
  const [quoteFor, setQuoteFor] = useState('');
  const [removing, setRemoving] = useState(null);
  const set = (key) => (value) => setForm((f) => ({...f, [key]: value}));

  const save = async () => {
    const ok = await attempt(() => api(form.id ? `v1/contacts/${form.id}` : 'v1/contacts', {method: form.id ? 'PATCH' : 'POST', body: form}), 'איש הקשר נשמר');
    if (ok) {
      setForm(null);
      contacts.reload();
    }
  };

  const columns = [
    {key: 'name', header: 'שם', renderCell: (c) => <Button label={c.name || '—'} variant="ghost" size="sm" onClick={() => setForm(c)} />},
    {key: 'phone', header: 'טלפון', renderCell: (c) => <bdi>{c.phone}</bdi>},
    {key: 'email', header: 'דוא״ל'},
    {key: 'address', header: 'כתובת'},
    {key: 'actions', header: 'פעולות', renderCell: (c) => <Button label="הצעה חדשה" size="sm" onClick={() => setQuoteFor(c.id)} />},
  ];

  return (
    <VStack gap={5}>
      <PageHeader title="אנשי קשר" subtitle="לקוחות ועסקים">
        <TextInput label="חיפוש אנשי קשר" isLabelHidden value={search} onChange={setSearch} placeholder="חיפוש" />
        <Button label="איש קשר חדש" variant="primary" onClick={() => setForm(blank)} />
      </PageHeader>
      {!contacts.data ? <Loading error={contacts.error} /> : (
        <div className="scroll-x">
          <Table data={contacts.data.filter((c) => `${c.name} ${c.phone} ${c.email} ${c.address}`.toLowerCase().includes(search.toLowerCase()))} columns={columns} idKey="id" hasHover emptyState={<Text>אין אנשי קשר להצגה.</Text>} />
        </div>
      )}
      {form && (
        <Modal
          isOpen
          onClose={() => setForm(null)}
          title={form.id ? 'עריכת איש קשר' : 'איש קשר חדש'}
          footer={<>
            {form.id && <Button label="מחיקה" variant="ghost" onClick={() => { setRemoving(form); setForm(null); }} />}
            <Button label="ביטול" onClick={() => setForm(null)} />
            <Button label="שמירה" variant="primary" isDisabled={!form.name.trim()} onClick={save} />
          </>}
        >
          <TextInput label="שם" value={form.name} onChange={set('name')} isRequired />
          <HStack gap={2} wrap="wrap">
            <Selector label="סוג לקוח" value={form.type} onChange={set('type')} options={[{value: 'private', label: 'פרטי'}, {value: 'business', label: 'עסקי'}]} />
            <TextInput label="טלפון" type="tel" value={form.phone} onChange={set('phone')} />
          </HStack>
          <TextInput label="דוא״ל" type="email" value={form.email} onChange={set('email')} />
          <TextInput label="כתובת" value={form.address} onChange={set('address')} />
          <TextArea label="הערות" value={form.notes || ''} onChange={set('notes')} />
        </Modal>
      )}
      <Confirm
        question={removing ? `למחוק את ${removing.name}?` : ''}
        onClose={() => setRemoving(null)}
        onConfirm={async () => { await attempt(() => api(`v1/contacts/${removing.id}`, {method: 'DELETE'}), 'נמחק'); setRemoving(null); contacts.reload(); }}
      />
      {quoteFor && <NewQuoteDialog isOpen contactId={quoteFor} onClose={() => setQuoteFor('')} />}
    </VStack>
  );
}
