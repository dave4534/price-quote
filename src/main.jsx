import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/Layout';
import {SideNav, SideNavHeading, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {Heading, Text} from '@astryxdesign/core/Text';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import heIL from '@astryxdesign/core/locales/he-IL.generated.js';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Theme, defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';
import {CodeBracketIcon, Cog6ToothIcon, CreditCardIcon, DocumentDuplicateIcon, DocumentTextIcon, IdentificationIcon, PencilSquareIcon, UsersIcon} from '@heroicons/react/24/outline';
import {Loading} from './components/ui.jsx';
import {api, attempt, navigate, usePath} from './lib/app.js';
import ApiDocs from './pages/ApiDocs.jsx';
import Cards, {CardEditor} from './pages/Cards.jsx';
import Contacts from './pages/Contacts.jsx';
import Documents, {DocumentEditor} from './pages/Documents.jsx';
import Payments from './pages/Payments.jsx';
import QuoteEditor from './pages/QuoteEditor.jsx';
import Quotes from './pages/Quotes.jsx';
import Settings from './pages/Settings.jsx';
import Templates from './pages/Templates.jsx';
import {PublicCard, PublicDocument, PublicQuote} from './public/PublicPages.jsx';
import './site.css';

const theme = defineTheme({name: 'quotedesk', extends: neutralTheme, color: {accent: '#1d4ed8'}});

const NAV = [
  ['quotes', 'הצעות מחיר', DocumentTextIcon],
  ['templates', 'תבניות', DocumentDuplicateIcon],
  ['contacts', 'אנשי קשר', UsersIcon],
  ['documents', 'מסמכים לחתימה', PencilSquareIcon],
  ['cards', 'כרטיס ביקור', IdentificationIcon],
  ['payments', 'קבלת תשלומים', CreditCardIcon],
  ['api-docs', 'API ותיעוד', CodeBracketIcon],
  ['settings', 'הגדרות', Cog6ToothIcon],
];

function Notices() {
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    let timer;
    const show = (event) => {
      clearTimeout(timer);
      setNotice(event.detail);
      timer = setTimeout(() => setNotice(null), event.detail.status === 'error' ? 6000 : 3000);
    };
    window.addEventListener('notice', show);
    return () => window.removeEventListener('notice', show);
  }, []);
  return <div className="toast" role="status" aria-live="polite">{notice && <Banner status={notice.status} title={notice.message} />}</div>;
}

function Login({onDone}) {
  const [password, setPassword] = useState('');
  const submit = async () => {
    if (await attempt(() => api('auth/login', {method: 'POST', body: {password}}))) onDone();
  };
  return (
    <VStack gap={3} padding={4} className="public-page narrow">
      <Heading level={1}>QuoteDesk</Heading>
      <Text color="secondary">כניסה לניהול העסק</Text>
      <TextInput label="סיסמה" type="password" value={password} onChange={setPassword} onEnter={submit} />
      <Button label="כניסה" variant="primary" size="lg" onClick={submit} />
    </VStack>
  );
}

function Screen({section, id}) {
  if (section === 'quotes') return id ? <QuoteEditor key={id} id={id} /> : <Quotes />;
  if (section === 'templates') return id ? <QuoteEditor key={id} id={id} isTemplate /> : <Templates />;
  if (section === 'contacts') return <Contacts />;
  if (section === 'documents') return id ? <DocumentEditor key={id} id={id} /> : <Documents />;
  if (section === 'cards') return id ? <CardEditor key={id} id={id} /> : <Cards />;
  if (section === 'payments') return <Payments />;
  if (section === 'api-docs') return <ApiDocs />;
  if (section === 'settings') return <Settings />;
  return <Quotes />;
}

function Admin({section, id}) {
  const [signedIn, setSignedIn] = useState(null);
  useEffect(() => {
    api('auth/me').then((r) => setSignedIn(r.signedIn), () => setSignedIn(false));
    const out = () => setSignedIn(false);
    window.addEventListener('signed-out', out);
    return () => window.removeEventListener('signed-out', out);
  }, []);
  if (signedIn === null) return <Loading />;
  if (!signedIn) return <Login onDone={() => setSignedIn(true)} />;

  const current = NAV.some(([key]) => key === section) ? section : 'quotes';
  const nav = (
    <SideNav
      collapsible
      header={<SideNavHeading heading="QuoteDesk" subheading="ניהול העסק" />}
      footer={<Button label="התנתקות" variant="ghost" onClick={async () => { await attempt(() => api('auth/logout', {method: 'POST'})); setSignedIn(false); }} />}
    >
      <SideNavSection title="ניהול" isHeaderHidden>
        {NAV.map(([key, label, icon]) => (
          <SideNavItem key={key} label={label} icon={icon} isSelected={current === key} href={`/${key}`} onClick={(event) => { if (event.metaKey || event.ctrlKey) return; event.preventDefault(); navigate(`/${key}`); }} />
        ))}
      </SideNavSection>
    </SideNav>
  );
  return (
    <AppShell height="auto" contentPadding={6} sideNav={nav}>
      <div className="content"><Screen section={current} id={id} /></div>
    </AppShell>
  );
}

function App() {
  const [section = '', id = ''] = usePath().split('/').filter(Boolean);
  return (
    <Theme theme={theme} mode="light">
      <InternationalizationProvider locale="he-IL" dir="rtl" messages={{'he-IL': heIL}}>
      <div className="page-root">
      {section === 'q' ? <PublicQuote token={id} /> : section === 'd' ? <PublicDocument token={id} /> : section === 'card' ? <PublicCard slug={id} /> : <Admin section={section || 'quotes'} id={id} />}
      <Notices />
      </div>
      </InternationalizationProvider>
    </Theme>
  );
}

createRoot(document.getElementById('root')).render(<App />);
