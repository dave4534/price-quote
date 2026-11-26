import React from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {whatsappNumber} from '../../shared/model.js';

/** The card as visitors see it; also used as the live preview while editing. */
export default function CardView({card, image, onAction = () => {}, preview = false}) {
  const link = (label, href, event, variant = 'secondary') =>
    href ? <Button label={label} variant={variant} size="lg" width="100%" href={preview ? undefined : href} target={href.startsWith('http') ? '_blank' : undefined} onClick={() => onAction(event)} /> : null;
  return (
    <VStack gap={3} hAlign="center" className="biz-card">
      <div className="cover" style={{background: card.color || '#0b1636'}}>
        {card.coverId && <img src={image(card.coverId)} alt="" />}
      </div>
      <div className="logo-ring">{card.logoId ? <img src={image(card.logoId)} alt="" /> : <Heading level={2}>{(card.name || '?').slice(0, 2)}</Heading>}</div>
      <VStack gap={1} hAlign="center" paddingInline={4}>
        <Heading level={1}>{card.name || 'שם העסק'}</Heading>
        {card.tagline && <Text color="secondary" justify="center">{card.tagline}</Text>}
      </VStack>
      <VStack gap={2} paddingInline={4} width="100%">
        <Grid columns={3} gap={2}>
          {link('חיוג', card.phone && `tel:${card.phone}`, 'call', 'primary')}
          {link('WhatsApp', (card.whatsapp || card.phone) && `https://wa.me/${whatsappNumber(card.whatsapp || card.phone)}`, 'whatsapp')}
          {link('שמירה', card.slug && `/api/public/cards/${card.slug}/vcard`, 'save')}
        </Grid>
        {link('שליחת דוא״ל', card.email && `mailto:${card.email}`, 'email')}
        {link('לאתר', card.website, 'website')}
        {link('ניווט ב־Waze', card.address && `https://waze.com/ul?q=${encodeURIComponent(card.address)}`)}
        {link('ביקורות בגוגל', card.reviewsUrl)}
        <HStack gap={2} justify="center">
          {card.facebook && <Button label="Facebook" variant="ghost" href={card.facebook} target="_blank" />}
          {card.instagram && <Button label="Instagram" variant="ghost" href={card.instagram} target="_blank" />}
        </HStack>
      </VStack>
      <VStack gap={3} paddingInline={4} width="100%" paddingBlockEnd={6}>
        {card.services && <VStack gap={1}><Heading level={3}>שירותים</Heading><Text className="pre">{card.services}</Text></VStack>}
        {card.about && <VStack gap={1}><Heading level={3}>אודות</Heading><Text className="pre">{card.about}</Text></VStack>}
        {card.address && <Text type="supporting" color="secondary">{card.address}</Text>}
        {card.galleryIds?.length > 0 && <Grid columns={{minWidth: 120}} gap={2}>{card.galleryIds.map((id) => <img key={id} className="gallery" src={image(id)} alt="" />)}</Grid>}
      </VStack>
    </VStack>
  );
}
