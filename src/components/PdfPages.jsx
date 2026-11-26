import React, {useEffect, useRef, useState} from 'react';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {Loading} from './ui.jsx';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function Page({page}) {
  const canvas = useRef(null);
  useEffect(() => {
    const viewport = page.getViewport({scale: 1.6});
    canvas.current.width = viewport.width;
    canvas.current.height = viewport.height;
    const task = page.render({canvas: canvas.current, canvasContext: canvas.current.getContext('2d'), viewport});
    task.promise.catch(() => {});
    return () => task.cancel();
  }, [page]);
  return <canvas ref={canvas} className="pdf-canvas" />;
}

/** Renders each PDF page with an overlay layer. Field positions are 0..1 from the top left. */
export default function PdfPages({blob, overlay, onPlace}) {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let task;
    let live = true;
    blob.arrayBuffer().then(async (data) => {
      try {
        task = pdfjs.getDocument({data});
        const doc = await task.promise;
        const all = await Promise.all(Array.from({length: doc.numPages}, (_, i) => doc.getPage(i + 1)));
        if (live) setPages(all);
      } catch {
        if (live) setError('לא ניתן להציג את קובץ ה־PDF');
      }
    });
    return () => {
      live = false;
      task?.destroy();
    };
  }, [blob]);

  if (!pages) return <Loading error={error} />;
  return pages.map((page, index) => (
    <div
      key={index}
      className="pdf-page"
      dir="ltr"
      onClick={(event) => {
        if (!onPlace || event.target.closest('.pdf-field')) return;
        const box = event.currentTarget.getBoundingClientRect();
        onPlace(index, (event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
      }}
    >
      <Page page={page} />
      {overlay?.(index)}
    </div>
  ));
}
