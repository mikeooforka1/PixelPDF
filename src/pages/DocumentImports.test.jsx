import '@testing-library/jest-dom';
import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import DocumentWorkspace,{summarizeRecognition} from './DocumentWorkspace';
import {getDocument} from 'pdfjs-dist';
import {createWorker} from 'tesseract.js';
jest.mock('pdfjs-dist',()=>({getDocument:jest.fn(),GlobalWorkerOptions:{}}));
jest.mock('tesseract.js',()=>({createWorker:jest.fn()}));
jest.mock('../utils/documentExport',()=>({downloadDocument:jest.fn()}));
const file=(name,text,type='application/octet-stream')=>({name,type,size:text.length,arrayBuffer:async()=>new TextEncoder().encode(text).buffer});
async function upload(files){fireEvent.change(screen.getByLabelText('Document photos'),{target:{files}});await waitFor(()=>expect(screen.getByText('Scan pages')).toBeEnabled());fireEvent.click(screen.getByText('Scan pages'));}
beforeEach(()=>{getDocument.mockReset();createWorker.mockReset();URL.createObjectURL=jest.fn(()=> 'blob:test');URL.revokeObjectURL=jest.fn();});
test('plain text with generic MIME imports verbatim without OCR',async()=>{render(<DocumentWorkspace/>);await upload([file('note.txt','Hello\nRésumé 12345')]);await waitFor(()=>expect(screen.getByLabelText('Review and edit text')).toHaveValue('Hello\nRésumé 12345'));expect(createWorker).not.toHaveBeenCalled();});
test('HTML keeps visible text without script content or execution',async()=>{render(<DocumentWorkspace/>);await upload([file('note.html','<h1>Invoice</h1><p>Total 12345</p><script>window.bad=true</script>')]);await waitFor(()=>expect(screen.getByLabelText('Review and edit text').value).toContain('12345'));expect(screen.getByLabelText('Review and edit text').value).not.toContain('window.bad');expect(window.bad).toBeUndefined();});
test('unsupported file does not discard a valid text document in the same batch',async()=>{render(<DocumentWorkspace/>);await upload([file('wrong.exe','bad'),file('good.txt','Retain this document')]);await waitFor(()=>expect(screen.getByLabelText('Review and edit text')).toHaveValue('Retain this document'));});
test('PDF stored text bypasses OCR and releases resources',async()=>{const destroy=jest.fn().mockResolvedValue();getDocument.mockReturnValue({destroy,promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:'Exact PDF text 12345',hasEOL:true}]}),cleanup:jest.fn()})})});render(<DocumentWorkspace kind="extract"/>);fireEvent.change(screen.getByLabelText('Select PDF'),{target:{files:[file('note.pdf','PDF')]}});await waitFor(()=>expect(screen.getByLabelText('Review and edit text')).toHaveValue('Exact PDF text 12345'));expect(createWorker).not.toHaveBeenCalled();expect(destroy).toHaveBeenCalled();});
test('recover text from word blocks when engine text field is empty',()=>{expect(summarizeRecognition({text:'',confidence:0,blocks:[{paragraphs:[{lines:[{words:[{text:'Recovered',confidence:0}]}]}]}]}).text).toBe('Recovered');});
