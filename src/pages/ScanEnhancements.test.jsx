import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DocumentWorkspace, { enhancePixels, summarizeRecognition, chooseRecognition } from './DocumentWorkspace';
import { createWorker } from 'tesseract.js';
jest.mock('../utils/documentExport', () => ({ downloadDocument: jest.fn() }));
jest.mock('tesseract.js', () => ({ createWorker: jest.fn() }));
const word = (text, confidence) => ({text,confidence});
function result(text, confidence) {return {data:{text,confidence,blocks:[{paragraphs:[{lines:[{words:[word('12345',50),word('Invoice',98)]}]}]}]}};}
beforeEach(() => {
  URL.createObjectURL=jest.fn(()=> 'blob:photo'); URL.revokeObjectURL=jest.fn();
  global.Image=class {constructor(){this.width=40;this.height=30;}decode(){return Promise.resolve();}};
  jest.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(()=>({fillRect(){},translate(){},rotate(){},drawImage(){},getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4).fill(255)}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}}));
});
afterEach(()=>jest.restoreAllMocks());
test('preserves transparent background, dark strokes and bounded grayscale',()=>{
 const source=new Uint8ClampedArray([0,0,0,255,220,200,180,255,0,0,0,0]);
 const out=enhancePixels(source,3,1);expect(out[0]).toBe(0);expect(out[8]).toBe(255);expect(out[3]).toBe(255);
 const binary=enhancePixels(source,3,1,true);expect(binary[0]).toBe(0);expect(binary[8]).toBe(255);
});
test('empty and truncated OCR passes cannot silently replace a fuller page',()=>{
 const full=summarizeRecognition({text:'one two three four five six',confidence:85});
 expect(chooseRecognition(full,summarizeRecognition({text:'one',confidence:90}))).toBe(full);
 expect(chooseRecognition(full,summarizeRecognition({text:'',confidence:99}))).toBe(full);
 const flagged=summarizeRecognition(result('Invoice 12345',90).data);expect(flagged.uncertain).toEqual(['12345']);
});
test('multiple local passes retain the fuller best result and expose uncertain words',async()=>{
 const instance={setParameters:jest.fn().mockResolvedValue({}),recognize:jest.fn().mockResolvedValueOnce(result('Invoice total 12345',70)).mockResolvedValueOnce(result('Invoice total 12345',91)),terminate:jest.fn().mockResolvedValue({})};
 createWorker.mockResolvedValue(instance);render(<DocumentWorkspace/>);
 fireEvent.change(screen.getByLabelText('Document photos'),{target:{files:[new File(['image'],'page.png',{type:'image/png'})]}});
 await waitFor(()=>expect(screen.getByText('Scan pages')).toBeEnabled());fireEvent.click(screen.getByText('Scan pages'));
 await waitFor(()=>expect(screen.getByLabelText('Review and edit text')).toHaveValue('Invoice total 12345'));
 expect(instance.recognize).toHaveBeenCalledTimes(2);expect(screen.getByText('Review 1 uncertain word(s)')).toBeInTheDocument();
 expect(createWorker.mock.calls.at(-1)[2].langPath).toBe('/ocr');expect(instance.terminate).toHaveBeenCalled();
});
test('cancel preserves edited text and disposes a worker that finishes loading late',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r;});createWorker.mockReturnValue(pending);
 render(<DocumentWorkspace/>);fireEvent.change(screen.getByLabelText('Review and edit text'),{target:{value:'Keep my edited text'}});
 fireEvent.change(screen.getByLabelText('Document photos'),{target:{files:[new File(['image'],'page.png',{type:'image/png'})]}});
 await waitFor(()=>expect(screen.getByText('Scan pages')).toBeEnabled());fireEvent.click(screen.getByText('Scan pages'));await waitFor(()=>expect(createWorker).toHaveBeenCalled());
 fireEvent.click(screen.getByText('Cancel'));const instance={terminate:jest.fn().mockResolvedValue({})};resolve(instance);
 await waitFor(()=>expect(instance.terminate).toHaveBeenCalled());expect(screen.getByLabelText('Review and edit text')).toHaveValue('Keep my edited text');expect(screen.getByText('Scan pages')).toBeEnabled();
});
test('zero-confidence recovered text is kept for editing',async()=>{
 const instance={setParameters:jest.fn().mockResolvedValue({}),recognize:jest.fn().mockResolvedValue(result('Recovered faint words',0)),terminate:jest.fn().mockResolvedValue({})};createWorker.mockResolvedValue(instance);render(<DocumentWorkspace/>);
 fireEvent.change(screen.getByLabelText('Scan quality'),{target:{value:'fast'}});fireEvent.change(screen.getByLabelText('Document photos'),{target:{files:[new File(['photo'],'faint.png',{type:'image/png'})]}});
 await waitFor(()=>expect(screen.getByText('Scan pages')).toBeEnabled());fireEvent.click(screen.getByText('Scan pages'));await waitFor(()=>expect(screen.getByLabelText('Review and edit text')).toHaveValue('Recovered faint words'));expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
test('failure of a later pass preserves text from the earlier pass',async()=>{
 const instance={setParameters:jest.fn().mockResolvedValue({}),recognize:jest.fn().mockResolvedValueOnce(result('Retain first recovered text',50)).mockRejectedValueOnce(new Error('Engine stopped')),terminate:jest.fn().mockResolvedValue({})};createWorker.mockResolvedValue(instance);render(<DocumentWorkspace/>);
 fireEvent.change(screen.getByLabelText('Document photos'),{target:{files:[new File(['photo'],'page.png',{type:'image/png'})]}});await waitFor(()=>expect(screen.getByText('Scan pages')).toBeEnabled());fireEvent.click(screen.getByText('Scan pages'));await waitFor(()=>expect(screen.getByLabelText('Review and edit text')).toHaveValue('Retain first recovered text'));expect(screen.getByText('One scan pass failed; the recovered text was kept.')).toBeInTheDocument();
});
test('alternate readings stay available instead of silently losing recovered words',async()=>{
 const instance={setParameters:jest.fn().mockResolvedValue({}),recognize:jest.fn().mockResolvedValueOnce(result('Invoice 12345 extra faint word',70)).mockResolvedValueOnce(result('Invoice total 12345',95)),terminate:jest.fn().mockResolvedValue({})};createWorker.mockResolvedValue(instance);render(<DocumentWorkspace/>);
 fireEvent.change(screen.getByLabelText('Document photos'),{target:{files:[new File(['photo'],'page.png',{type:'image/png'})]}});await waitFor(()=>expect(screen.getByText('Scan pages')).toBeEnabled());fireEvent.click(screen.getByText('Scan pages'));await waitFor(()=>expect(screen.getByLabelText('Page 1 alternative 1')).toHaveValue('Invoice 12345 extra faint word'));
});
test('server mode sends a page and preserves its low-confidence text without browser OCR',async()=>{
 jest.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(cb=>cb(new Blob(['image'],{type:'image/png'})));
 global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({text:'Paddle handwritten words',confidence:12,uncertain:['handwritten']})});createWorker.mockClear();render(<DocumentWorkspace/>);
 fireEvent.change(screen.getByLabelText('Scanning engine'),{target:{value:'paddle'}});fireEvent.change(screen.getByLabelText('Document photos'),{target:{files:[new File(['photo'],'page.png',{type:'image/png'})]}});await waitFor(()=>expect(screen.getByText('Scan pages')).toBeEnabled());fireEvent.click(screen.getByText('Scan pages'));
 await waitFor(()=>expect(screen.getByLabelText('Review and edit text')).toHaveValue('Paddle handwritten words'));expect(createWorker).not.toHaveBeenCalled();expect(global.fetch.mock.calls[0][1].body.get('language')).toBe('eng');delete global.fetch;
});
test('server failure falls back visibly to local OCR',async()=>{
 jest.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(cb=>cb(new Blob(['image'],{type:'image/png'})));global.fetch=jest.fn().mockRejectedValue(new Error('Connection failed'));
 const instance={setParameters:jest.fn().mockResolvedValue({}),recognize:jest.fn().mockResolvedValue(result('Browser recovered text',95)),terminate:jest.fn().mockResolvedValue({})};createWorker.mockResolvedValue(instance);render(<DocumentWorkspace/>);
 fireEvent.change(screen.getByLabelText('Scanning engine'),{target:{value:'paddle'}});fireEvent.change(screen.getByLabelText('Document photos'),{target:{files:[new File(['photo'],'page.png',{type:'image/png'})]}});await waitFor(()=>expect(screen.getByText('Scan pages')).toBeEnabled());fireEvent.click(screen.getByText('Scan pages'));
 await waitFor(()=>expect(screen.getByLabelText('Review and edit text')).toHaveValue('Browser recovered text'));expect(screen.getByText(/PaddleOCR unavailable/)).toBeInTheDocument();delete global.fetch;
});
