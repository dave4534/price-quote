import React, {useRef} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export function SignaturePad({onChange}) {
  const canvas = useRef(null);
  const drawing = useRef(false);

  const point = (event) => {
    const box = canvas.current.getBoundingClientRect();
    return [((event.clientX - box.left) * canvas.current.width) / box.width, ((event.clientY - box.top) * canvas.current.height) / box.height];
  };
  const start = (event) => {
    drawing.current = true;
    canvas.current.setPointerCapture(event.pointerId);
    const context = canvas.current.getContext('2d');
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(...point(event));
  };
  const move = (event) => {
    if (!drawing.current) return;
    const context = canvas.current.getContext('2d');
    context.lineTo(...point(event));
    context.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvas.current.toDataURL('image/png'));
  };
  const clear = () => {
    canvas.current.getContext('2d').clearRect(0, 0, canvas.current.width, canvas.current.height);
    onChange('');
  };

  return (
    <VStack gap={1}>
      <canvas ref={canvas} className="signature-pad" width="600" height="200" aria-label="אזור חתימה" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      <HStack justify="between" vAlign="center">
        <Text type="supporting" color="secondary">חתמו עם האצבע או העכבר</Text>
        <Button label="ניקוי" size="sm" variant="ghost" onClick={clear} />
      </HStack>
    </VStack>
  );
}

/** Draw typed text as an image, so Hebrew is stamped onto a PDF correctly. */
export function textImage(text) {
  const canvas = document.createElement('canvas');
  const font = '40px Assistant, Arial, sans-serif';
  const measure = canvas.getContext('2d');
  measure.font = font;
  canvas.width = Math.ceil(measure.measureText(text).width) + 16;
  canvas.height = 56;
  const context = canvas.getContext('2d');
  context.font = font;
  context.direction = /[֐-׿]/.test(text) ? 'rtl' : 'ltr';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL('image/png');
}
