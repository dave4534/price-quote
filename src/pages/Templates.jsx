import React, {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {money, totals} from '../../shared/model.js';
import {Loading, PageHeader} from '../components/ui.jsx';
import {navigate, useData} from '../lib/app.js';
import {NewQuoteDialog} from './Quotes.jsx';

export default function Templates() {
  const templates = useData('v1/templates');
  const [from, setFrom] = useState('');
  return (
    <VStack gap={5}>
      <PageHeader title="תבניות" subtitle="בחרו תבנית ופתחו ממנה הצעה מוכנה למילוי">
        <Button label="תבנית חדשה" variant="primary" onClick={() => navigate('/templates/new')} />
      </PageHeader>
      {!templates.data ? <Loading error={templates.error} /> : templates.data.length === 0 ? (
        <EmptyState title="אין עדיין תבניות" description="צרו תבנית, או שמרו הצעה קיימת כתבנית." />
      ) : (
        <Grid columns={{minWidth: 260}} gap={4}>
          {templates.data.map((t) => {
            const lines = t.items.filter((i) => i.description?.trim().length > 1).length;
            const total = totals(t).total;
            return (
              <Card key={t.id} padding={4}>
                <VStack gap={3} height="100%" justify="between">
                  <VStack gap={1}>
                    <Heading level={3}>{t.name || t.title}</Heading>
                    <Text type="supporting" color="secondary">{lines ? `${lines} שורות שירות` : 'ללא שורות שירות'}{total ? ` · ${money(total)}` : ''}</Text>
                  </VStack>
                  <HStack gap={2}>
                    <Button label="הצעה מתבנית" variant="primary" onClick={() => setFrom(t.id)} />
                    <Button label="עריכה" onClick={() => navigate(`/templates/${t.id}`)} />
                  </HStack>
                </VStack>
              </Card>
            );
          })}
        </Grid>
      )}
      {from && <NewQuoteDialog isOpen templateId={from} onClose={() => setFrom('')} />}
    </VStack>
  );
}
