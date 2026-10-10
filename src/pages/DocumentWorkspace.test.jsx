import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DocumentWorkspace from './DocumentWorkspace';
import { downloadDocument } from '../utils/documentExport';
jest.mock('../utils/documentExport', () => ({ downloadDocument: jest.fn().mockResolvedValue(undefined) }));
test('scan cannot start empty, supports review and export', () => {
  render(<DocumentWorkspace />);
  expect(screen.getByText('Scan pages')).toBeDisabled();
  expect(screen.getByText('Download document')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Review and edit text'), { target: { value: 'Reviewed text' } });
  fireEvent.click(screen.getByText('Download document'));
  expect(downloadDocument).toHaveBeenCalledWith('Reviewed text','docx','scanned-document');
});
test('invalid files are rejected and camera permissions give actionable errors', async () => {
  render(<DocumentWorkspace />);
  fireEvent.change(screen.getByLabelText('Document photos'), { target: { files: [new File(['bad'], 'bad.exe', { type:'application/octet-stream' })] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('unsupported format');
  fireEvent.click(screen.getByText('Open camera'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Camera needs HTTPS');
});
test('PDF extraction has a separate accessible input', () => {
  render(<DocumentWorkspace kind="extract" />);
  expect(screen.getByLabelText('Select PDF')).toBeInTheDocument();
  expect(screen.queryByText('Scan pages')).not.toBeInTheDocument();
});
