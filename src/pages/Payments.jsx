import React from 'react';
import {VStack} from '@astryxdesign/core/Layout';
import {Table} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {PageHeader, Panel} from '../components/ui.jsx';

const fees = [
  {kind: 'ויזה, מאסטרקארד, ישראכרט', fee: '1.20%'},
  {kind: 'אמריקן אקספרס (Amex)', fee: '2.20%'},
  {kind: 'ביט (Bit)', fee: '1.50%'},
  {kind: 'דיינרס (Diners)', fee: '1.40%'},
];

export default function Payments() {
  return (
    <VStack gap={4}>
      <PageHeader title="קבלת תשלומים" subtitle="מידע בלבד. סליקה עדיין לא מחוברת למערכת." />
      <Panel title="Easy Card: חבילה ותמחור">
        <Text>דמי שימוש חודשיים: 35 ₪ לחודש, בתשלום ישירות ל־Easy Card. המחירים והעמלות אינם כוללים מע״מ.</Text>
        <Table data={fees} columns={[{key: 'kind', header: 'סוג העסקה / הכרטיס'}, {key: 'fee', header: 'עמלה'}]} idKey="kind" />
        <Text>הקמה תוך יום עסקים אחד, בכפוף לאישור חברות האשראי ובדיקות KYC/AML.</Text>
        <Text>מכשיר סליקה פיזי (אופציונלי), PAX A77 או Nayax F45: רכישה ב־1,399 ₪, דמי שימוש 33 ₪ לחודש, SIM ב־11 ₪ לחודש.</Text>
      </Panel>
    </VStack>
  );
}
