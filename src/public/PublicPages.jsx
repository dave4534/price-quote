import React, {Suspense, lazy, useCallback, useEffect, useState} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {formatDate, money} from '../../shared/model.js';
import {SignaturePad, textImage} from '../components/SignaturePad.jsx';
import {Confirm, HtmlPreview, Loading, Modal, Panel} from '../components/ui.jsx';
import {api, attempt, download} from '../lib/app.js';
import CardView from './CardView.jsx';

const PdfPages = lazy(() => import('../components/PdfPages.jsx'));
const FIELD_LABELS = {signature: 'חתימה', name: 'שם מלא', date: 'תאריך', idNumber: 'ת.ז', text: 'טקסט'};

function SignForm({defaultName, onSign, busy}) {
  const [name, setName] = useState(defaultName);
  const [signature, setSignature] = useState('');
  const [agreed, setAgreed] = useState(false);
  return (
    <Panel title="אישור וחתימה">
      <TextInput label="שם מלא" value={name} onChange={setName} isRequired />
      <SignaturePad onChange={setSignature} />
      <CheckboxInput label="קראתי את המסמך ואני מאשר/ת את תוכנו ותנאיו" value={agreed} onChange={setAgreed} />
      <Button label="חתימה ושליחה" variant="primary" size="lg" isLoading={busy} isDisabled={!name.trim() || !signature || !agreed} onClick={() => onSign({name, signature})} />
    </Panel>
  );
}

export function PublicQuote({token}) {
  const [state, setState] = useState({quote: null, html: '', error: ''});
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const load = useCallback(async (countView) => {
    try {
      const quote = countView ? await api(`public/quotes/${token}`) : countView;
      const html = await api(`public/quotes/${token}/html`);
      setState((s) => ({quote: quote || s.quote, html, error: ''}));
    } catch (error) {
      setState({quote: null, html: '', error: error.message});
    }
  }, [token]);
  useEffect(() => { load(true); }, [load]);
  const {quote, html, error} = state;
  if (!quote) return <VStack padding={4}><Loading error={error} /></VStack>;

  const act = async (action, body) => {
    setBusy(true);
    const result = await attempt(() => api(`public/quotes/${token}/${action}`, {method: 'POST', body}));
    setBusy(false);
    if (result) {
      setState((s) => ({...s, quote: result}));
      load(false);
    }
  };

  return (
    <VStack gap={4} padding={3} className="public-page">
      <HStack justify="between" wrap="wrap" gap={2} vAlign="center">
        <VStack gap={0.5}>
          <Heading level={1}>{quote.business.businessName}</Heading>
          <Text color="secondary">{quote.title} #{quote.number} · {money(quote.total)}</Text>
        </VStack>
        <HStack gap={2} wrap="wrap">
          {quote.cardSlug && <Button label="אודות העסק" href={`/card/${quote.cardSlug}`} target="_blank" />}
          {quote.business.phone && <Button label="חיוג לעסק" href={`tel:${quote.business.phone}`} />}
          <Button label="הורדת PDF" variant="primary" onClick={() => attempt(() => download(`public/quotes/${token}/pdf`, `quote-${quote.number}.pdf`))} />
        </HStack>
      </HStack>
      {quote.status === 'signed' && <Banner status="success" title={`ההצעה נחתמה בתאריך ${formatDate(quote.signedAt)}. תודה!`} />}
      {quote.status === 'declined' && <Banner status="info" title="סימנתם שאינכם מעוניינים. אפשר ליצור קשר עם העסק בכל שאלה." />}
      {quote.expired && quote.status !== 'signed' && <Banner status="warning" title="תוקף ההצעה פג. צרו קשר עם העסק לקבלת הצעה מעודכנת." />}
      {html ? <HtmlPreview title="הצעת המחיר" html={html} /> : <Loading />}
      {quote.requireSignature && !quote.expired && !['signed', 'declined'].includes(quote.status) && <>
        <SignForm defaultName={quote.customerName} busy={busy} onSign={(body) => act('sign', body)} />
        <HStack justify="center"><Button label="לא מעוניין/ת בהצעה" variant="ghost" onClick={() => setDeclining(true)} /></HStack>
      </>}
      <Confirm question={declining ? 'לסמן שאינכם מעוניינים בהצעה?' : ''} confirmLabel="לא מעוניין/ת" onClose={() => setDeclining(false)} onConfirm={() => { setDeclining(false); act('decline', {}); }} />
    </VStack>
  );
}

export function PublicDocument({token}) {
  const [password, setPassword] = useState('');
  const [attemptPassword, setAttemptPassword] = useState('');
  const [state, setState] = useState({doc: null, error: '', locked: false});
  const [content, setContent] = useState(null);
  const [values, setValues] = useState({});
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const headers = password ? {'X-Document-Password': password} : {};

  const loadContent = async (doc, auth) => {
    setContent(await api(`public/documents/${token}/${doc.kind === 'pdf' ? 'file' : 'html'}`, {headers: auth}));
  };
  const load = async (secret) => {
    const auth = secret ? {'X-Document-Password': secret} : {};
    try {
      const doc = await api(`public/documents/${token}`, {headers: auth});
      setPassword(secret);
      setState({doc, error: '', locked: false});
      await loadContent(doc, auth);
    } catch (error) {
      setState({doc: null, error: error.status === 401 ? (secret ? 'סיסמה שגויה' : '') : error.message, locked: error.status === 401});
    }
  };
  useEffect(() => { load(''); }, [token]);
  const {doc, error, locked} = state;

  if (locked) {
    return (
      <VStack gap={3} padding={4} className="public-page narrow">
        <Heading level={1}>המסמך מוגן בסיסמה</Heading>
        {error && <Banner status="error" title={error} />}
        <TextInput label="סיסמה" type="password" value={attemptPassword} onChange={setAttemptPassword} onEnter={() => load(attemptPassword)} />
        <Button label="פתיחה" variant="primary" onClick={() => load(attemptPassword)} />
      </VStack>
    );
  }
  if (!doc) return <VStack padding={4}><Loading error={error} /></VStack>;

  const signed = doc.status === 'signed';
  const fields = doc.kind === 'pdf' && !signed ? doc.fields : [];
  const missing = fields.filter((f) => !values[f.id]).length;
  const open = (field) => {
    setEditing(field);
    setDraft(field.type === 'date' ? new Date().toLocaleDateString('he-IL') : field.type === 'name' ? doc.recipientName : '');
  };
  const fill = () => {
    const image = editing.type === 'signature' ? draft : draft.trim() && textImage(draft.trim());
    if (image) setValues((v) => ({...v, [editing.id]: image}));
    setEditing(null);
  };
  const sign = async (body) => {
    if (missing) return attempt(() => Promise.reject(new Error(`נשארו ${missing} שדות למילוי במסמך`)));
    setBusy(true);
    const result = await attempt(() => api(`public/documents/${token}/sign`, {method: 'POST', headers, body: {...body, values}}));
    setBusy(false);
    if (result) {
      setState({doc: result, error: '', locked: false});
      setContent(null);
      await attempt(() => loadContent(result, headers));
    }
  };

  return (
    <VStack gap={4} padding={3} className="public-page">
      <HStack justify="between" wrap="wrap" gap={2} vAlign="center">
        <VStack gap={0.5}>
          <Heading level={1}>{doc.title}</Heading>
          <Text color="secondary">{doc.business.businessName}</Text>
        </VStack>
        <Button label="הורדת PDF" onClick={() => attempt(() => download(`public/documents/${token}/file`, `${doc.title}.pdf`, {headers}))} />
      </HStack>
      {doc.intro && <Text className="pre">{doc.intro}</Text>}
      {signed && <Banner status="success" title={`המסמך נחתם בתאריך ${formatDate(doc.signedAt)}. תודה!`} />}
      {!content ? <Loading /> : doc.kind === 'text' ? <HtmlPreview title={doc.title} html={content} /> : (
        <Suspense fallback={<Loading />}>
          <PdfPages blob={content} overlay={(page) => fields.filter((f) => f.page === page).map((f) => (
            <button type="button" key={f.id} className="pdf-field" style={{left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`}} onClick={() => open(f)}>
              {values[f.id] ? <img src={values[f.id]} alt={FIELD_LABELS[f.type]} /> : FIELD_LABELS[f.type]}
            </button>
          ))} />
        </Suspense>
      )}
      {doc.requireSignature && !signed && <>
        {missing > 0 && <Banner status="info" title={`לחצו על השדות המסומנים במסמך כדי למלא אותם (${missing} נותרו)`} />}
        <SignForm defaultName={doc.recipientName} busy={busy} onSign={sign} />
      </>}
      {editing && (
        <Modal isOpen onClose={() => setEditing(null)} title={FIELD_LABELS[editing.type]} footer={<Button label="אישור" variant="primary" onClick={fill} />}>
          {editing.type === 'signature' ? <SignaturePad onChange={setDraft} /> : <TextInput label={FIELD_LABELS[editing.type]} value={draft} onChange={setDraft} onEnter={fill} />}
        </Modal>
      )}
    </VStack>
  );
}

export function PublicCard({slug}) {
  const [state, setState] = useState({card: null, error: ''});
  useEffect(() => {
    api(`public/cards/${slug}`).then(
      (card) => { setState({card, error: ''}); document.title = card.name; },
      (error) => setState({card: null, error: error.message}),
    );
  }, [slug]);
  if (!state.card) return <VStack padding={4}><Loading error={state.error} /></VStack>;
  const track = (type) => type && api(`public/cards/${slug}/event`, {method: 'POST', body: {type}}).catch(() => {});
  return <VStack className="public-page narrow"><CardView card={state.card} image={(id) => `/api/public/cards/${slug}/image/${id}`} onAction={track} /></VStack>;
}
