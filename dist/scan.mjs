import tesseract from './ocr/tesseract.mjs';
import {parseScannedInvoice} from './invoice.mjs';

export async function startScan() {
  const assets = new URL('./ocr/',import.meta.url);
  const worker = await tesseract.createWorker('por',1,{
    workerPath:new URL('worker.min.js',assets).href,
    corePath:new URL('tesseract-core-lstm.wasm.js',assets).href,
    langPath:new URL('lang',assets).href,
    workerBlobURL:false
  });
  try {
    await worker.setParameters({tessedit_pageseg_mode:'11', user_defined_dpi:'300'});
  } catch (error) {
    await worker.terminate();
    throw error;
  }
  return {
    async read(page) {
      const base = page.getViewport({scale:1});
      const viewport = page.getViewport({scale:Math.min(300/72,3600/Math.max(base.width,base.height))});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      try {
        await page.render({canvas,viewport,background:'#fff'}).promise;
        const {data} = await worker.recognize(canvas,{}, {tsv:true,text:false});
        const words = data.tsv.split('\n').flatMap(line => {
          const [level,,,,,,left,top,,height,,value] = line.split('\t');
          if (level !== '5' || !value?.trim() || /^\|+$/.test(value.trim())) return [];
          return [{x:Number(left),y:-Number(top)-Number(height),text:value.trim()}];
        });
        return parseScannedInvoice(words,canvas.width);
      } finally {
        canvas.width = canvas.height = 0;
      }
    },
    close:() => worker.terminate()
  };
}
