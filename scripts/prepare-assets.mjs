import {copyFile, mkdir} from 'node:fs/promises';

const assets = {
  'pdfjs-dist/legacy/build/pdf.min.mjs': 'pdf.min.mjs',
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs': 'pdf.worker.min.mjs',
  'tesseract.js/dist/tesseract.esm.min.js': 'ocr/tesseract.mjs',
  'tesseract.js/dist/worker.min.js': 'ocr/worker.min.js',
  'tesseract.js-core/tesseract-core-lstm.wasm.js': 'ocr/tesseract-core-lstm.wasm.js',
  'tesseract.js-core/tesseract-core-lstm.wasm': 'ocr/tesseract-core-lstm.wasm',
  '@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz': 'ocr/lang/por.traineddata.gz'
};
await mkdir('dist/ocr/lang', {recursive:true});
await Promise.all(Object.entries(assets).map(([source,target]) => copyFile('node_modules/'+source,'dist/'+target)));
