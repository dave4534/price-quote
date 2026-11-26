import React, {useEffect, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Table} from '@astryxdesign/core/Table';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {formatDate, whatsappLink} from '../../shared/model.js';
import {Confirm, ImageField, Loading, Metric, PageHeader, Panel} from '../components/ui.jsx';
import {api, attempt, copy, navigate, useData} from '../lib/app.js';
import CardView from '../public/CardView.jsx';

const cardUrl = (card) => `${window.location.origin}/card/${card.slug}`;
const STAT_LABELS = {views: 'צפיות', call: 'חיוגים', whatsapp: 'WhatsApp', save: 'שמירות איש קשר', email: 'דוא״ל', website: 'כניסות לאתר'};

export default function Cards() {
  const cards = useData('v1/cards');
  const columns = [
    {key: 'name', header: 'שם הכרטיס', renderCell: (c) => <Button label={c.name || c.slug} variant="ghost" size="sm" onClick={() => navigate(`/cards/${c.id}`)} />},
    {key: 'createdAt', header: 'תאריך יצירה', renderCell: (c) => formatDate(c.createdAt)},
    {key: 'views', header: 'צפיות', renderCell: (c) => c.stats?.views || 0},
    {key: 'primary', header: 'כרטיס ראשי', renderCell: (c) => (c.isPrimary ? 'כן' : '—')},
    {key: 'actions', header: 'קישור', renderCell: (c) => <HStack gap={1}><Button label="העתקת קישור" size="sm" onClick={() => attempt(() => copy(cardUrl(c)))} /><Button label="תצוגה" size="sm" variant="ghost" href={cardUrl(c)} target="_blank" /></HStack>},
  ];
  return (
    <VStack gap={5}>
      <PageHeader title="כרטיס ביקור דיגיטלי" subtitle="עמוד עסק לשיתוף, עם חיוג, WhatsApp ושמירת איש קשר">
        <Button label="כרטיס חדש" variant="primary" onClick={() => navigate('/cards/new')} />
      </PageHeader>
      {!cards.data ? <Loading error={cards.error} /> : cards.data.length === 0 ? <EmptyState title="אין עדיין כרטיס ביקור" /> : <div className="scroll-x"><Table data={cards.data} columns={columns} idKey="id" hasHover /></div>}
    </VStack>
  );
}

export function CardEditor({id}) {
  const isNew = id === 'new';
  const record = useData(isNew ? null : `v1/cards/${id}`);
  const settings = useData(isNew ? 'v1/settings' : null);
  const [form, setForm] = useState(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (record.data) setForm(record.data);
    else if (isNew && settings.data) {
      const s = settings.data;
      setForm({name: s.businessName || '', slug: '', tagline: '', about: s.defaultAbout || '', services: '', phone: s.phone || '', whatsapp: s.phone || '', email: s.email || '', website: s.website || '', address: s.address || '', reviewsUrl: '', facebook: '', instagram: '', color: '#0b1636', logoId: s.logoId || '', coverId: '', galleryIds: [], isPrimary: false});
    }
  }, [record.data, settings.data, isNew]);

  if (!form) return <Loading error={record.error || settings.error} />;
  const set = (key) => (value) => setForm((f) => ({...f, [key]: value}));
  const field = (key, label, props) => <TextInput label={label} value={form[key] || ''} onChange={set(key)} {...props} />;

  const save = async () => {
    const saved = await attempt(() => api(isNew ? 'v1/cards' : `v1/cards/${id}`, {method: isNew ? 'POST' : 'PATCH', body: form}), 'הכרטיס נשמר');
    if (saved) {
      if (isNew) navigate(`/cards/${saved.id}`);
      else setForm(saved);
    }
  };

  return (
    <VStack gap={4}>
      <PageHeader title={isNew ? 'כרטיס ביקור חדש' : form.name}>
        <Button label="חזרה" variant="ghost" onClick={() => navigate('/cards')} />
        {!isNew && <>
          <Button label="מחיקה" variant="ghost" onClick={() => setRemoving(true)} />
          <Button label="העתקת קישור" onClick={() => attempt(() => copy(cardUrl(form)))} />
          <Button label="שיתוף ב־WhatsApp" href={whatsappLink('', `${form.name}: ${cardUrl(form)}`)} target="_blank" />
          <Button label="תצוגה" href={cardUrl(form)} target="_blank" />
        </>}
        <Button label="שמירה" variant="primary" onClick={save} />
      </PageHeader>
      {form.stats && <Grid columns={{minWidth: 120}} gap={2}>{Object.entries(STAT_LABELS).map(([key, label]) => <Metric key={key} label={label} value={form.stats[key] || 0} />)}</Grid>}
      <div className="editor">
        <VStack gap={4}>
          <Panel title="פרטי העסק">
            <Grid columns={{minWidth: 220}} gap={3}>
              {field('name', 'שם העסק')}
              {field('slug', 'כתובת הכרטיס (אנגלית)', {placeholder: 'my-business'})}
              {field('tagline', 'שורת תיאור')}
              {field('phone', 'טלפון', {type: 'tel'})}
              {field('whatsapp', 'WhatsApp', {type: 'tel'})}
              {field('email', 'דוא״ל', {type: 'email'})}
              {field('address', 'כתובת')}
              {field('website', 'אתר', {type: 'url', placeholder: 'https://'})}
              {field('reviewsUrl', 'קישור לביקורות', {type: 'url', placeholder: 'https://'})}
              {field('facebook', 'Facebook', {type: 'url', placeholder: 'https://'})}
              {field('instagram', 'Instagram', {type: 'url', placeholder: 'https://'})}
              {field('color', 'צבע רקע (#hex)')}
            </Grid>
            <TextArea label="שירותים" rows={4} value={form.services || ''} onChange={set('services')} />
            <TextArea label="אודות" rows={6} value={form.about || ''} onChange={set('about')} />
          </Panel>
          <Panel title="תמונות">
            <ImageField label="לוגו" value={form.logoId} onChange={set('logoId')} />
            <ImageField label="תמונת נושא" value={form.coverId} onChange={set('coverId')} />
            <ImageField label="גלריה (עד 6)" max={6} value={form.galleryIds} onChange={set('galleryIds')} />
            <CheckboxInput label="כרטיס ראשי" description="יוסיף כפתור ״אודות העסק״ לעמוד ההצעה שהלקוח רואה" value={Boolean(form.isPrimary)} onChange={set('isPrimary')} />
          </Panel>
        </VStack>
        <CardView card={form} image={(fileId) => `/api/v1/files/${fileId}`} preview />
      </div>
      <Confirm question={removing ? 'למחוק את הכרטיס? הקישור יפסיק לעבוד.' : ''} onClose={() => setRemoving(false)} onConfirm={async () => { if (await attempt(() => api(`v1/cards/${id}`, {method: 'DELETE'}), 'נמחק')) navigate('/cards'); }} />
    </VStack>
  );
}
