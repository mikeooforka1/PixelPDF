# PixelPDF

A responsive Create React App PDF toolkit with three browser-side workflows:

- **Text to PDF** — searchable PDFs with configurable text color, font size and page padding.
- **Image to PDF** — drag/drop PNG, JPG and JPEG images, reorder by upload sequence, and export one multi-page PDF.
- **PDF Editor** — preview an existing PDF, add text overlays/watermarks with position, size, color, opacity and rotation, then export with `pdf-lib`.

## Requirements

- Node.js 18+ recommended
- npm 9+

## Run locally

```bash
npm install
npm start
```

## Production build

```bash
npm run build
```

The production files are emitted to `build/`.

## Notes

- PDF creation and editing happen client-side; source files are not uploaded by PixelPDF.
- The PDF editor uses PDF.js for visual rendering and `pdf-lib` for export.
- PDF.js worker is loaded from cdnjs at runtime. For a fully self-hosted deployment, copy the matching PDF.js worker into `public/` and point `GlobalWorkerOptions.workerSrc` to that local asset.
- The included `public/logo.svg` is a fallback PixelPDF brand asset. Replace it with the supplied brand logo when that source file is available to the project workspace.
