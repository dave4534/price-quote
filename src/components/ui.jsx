import React, {useState} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {FileInput} from '@astryxdesign/core/FileInput';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Heading, Text} from '@astryxdesign/core/Text';
import {attempt, upload} from '../lib/app.js';

export function PageHeader({title, subtitle, children}) {
  return (
    <HStack wrap="wrap" gap={3} vAlign="center" justify="between">
      <VStack gap={0.5}>
        <Heading level={1}>{title}</Heading>
        {subtitle && <Text color="secondary">{subtitle}</Text>}
      </VStack>
      <HStack wrap="wrap" gap={2} vAlign="center">{children}</HStack>
    </HStack>
  );
}

export const Panel = ({title, children, actions}) => (
  <Card padding={4}>
    <VStack gap={3}>
      {title && (
        <HStack justify="between" vAlign="center" wrap="wrap" gap={2}>
          <Heading level={2} accessibilityLevel={2}><Text type="large" weight="semibold">{title}</Text></Heading>
          {actions}
        </HStack>
      )}
      {children}
    </VStack>
  </Card>
);

export const Metric = ({label, value}) => (
  <Card padding={3}>
    <VStack gap={1}>
      <Text type="supporting" color="secondary">{label}</Text>
      <Heading level={2}>{value}</Heading>
    </VStack>
  </Card>
);

export function Loading({error}) {
  if (error) return <Banner status="error" title={error} />;
  return <HStack justify="center" padding={8}><Spinner /></HStack>;
}

export function Modal({isOpen, onClose, title, children, footer, width = 560}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} width={`min(${width}px, 94vw)`} maxHeight="90dvh" purpose="form">
      <VStack gap={3}>
        <DialogHeader title={title} onOpenChange={onClose} />
        {children}
        {footer && <HStack justify="end" gap={2} wrap="wrap">{footer}</HStack>}
      </VStack>
    </Dialog>
  );
}

export function Confirm({question, onConfirm, onClose, confirmLabel = 'מחיקה'}) {
  return (
    <Modal
      isOpen={Boolean(question)}
      onClose={onClose}
      title="אישור"
      width={420}
      footer={<>
        <Button label="ביטול" onClick={onClose} />
        <Button label={confirmLabel} variant="destructive" onClick={onConfirm} />
      </>}
    >
      <Text>{question}</Text>
    </Modal>
  );
}

/** Uploads images and keeps their ids. `value` is an id, or a list when max > 1. */
export function ImageField({label, value, onChange, max = 1, source = (id) => `/api/v1/files/${id}`}) {
  const [busy, setBusy] = useState(false);
  const ids = max > 1 ? value || [] : value ? [value] : [];
  const emit = (next) => onChange(max > 1 ? next : next[0] || '');
  const add = async (file) => {
    if (!file) return;
    setBusy(true);
    const saved = await attempt(() => upload(file));
    setBusy(false);
    if (saved) emit([...ids, saved.id].slice(-max));
  };
  return (
    <VStack gap={2}>
      <FileInput label={label} value={null} isLoading={busy} accept="image/png,image/jpeg,image/webp" placeholder="בחירת תמונה" onChange={(files) => add(Array.isArray(files) ? files[0] : files)} />
      {ids.length > 0 && (
        <HStack gap={2} wrap="wrap">
          {ids.map((id) => (
            <VStack key={id} gap={1} hAlign="center">
              <img className="thumb" src={source(id)} alt="" />
              <Button label="הסרה" size="sm" variant="ghost" onClick={() => emit(ids.filter((x) => x !== id))} />
            </VStack>
          ))}
        </HStack>
      )}
    </VStack>
  );
}

/** Self-contained printed page, sized to its content. */
export function HtmlPreview({html, title}) {
  const resize = (event) => {
    const frame = event.target;
    frame.style.height = `${frame.contentDocument.documentElement.scrollHeight}px`;
  };
  return <iframe className="preview" title={title} srcDoc={html} sandbox="allow-same-origin allow-popups" onLoad={resize} />;
}
