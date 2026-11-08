const fs = require("fs");
const path = require("path");

const packagePath = require.resolve("pdfjs-dist/package.json");

const packageDir = path.dirname(packagePath);

const source = path.join(
  packageDir,
  "build",
  "pdf.worker.min.js"
);

const destinationDir = path.join(
  process.cwd(),
  "public",
  "pdfjs"
);

fs.mkdirSync(destinationDir, {
  recursive: true,
});

fs.copyFileSync(
  source,
  path.join(destinationDir, "pdf.worker.min.js")
);

console.log("PDF.js worker copied successfully.");