# FYP report source

Builds `../SmartSplit_FYP_Report.docx` and `.pdf`. All report text and tables live in `content.mjs`.

```sh
cd docs/fyp-report/source        # scripts use paths relative to this folder
npm i
node build.mjs report.docx       # content.mjs -> DOCX (docx package)
node pdf.mjs report.pdf          # content.mjs -> HTML -> Chrome print -> page numbers (pdf-lib)
cp report.docx ../SmartSplit_FYP_Report.docx
cp report.pdf  ../SmartSplit_FYP_Report.pdf
```

`pdf.mjs` needs `pdfinfo` and `pdftotext` (poppler-utils) and Playwright's Chromium (`npx playwright install chromium` if it is missing).

- `fig/*.png` are rendered from `diagrams.html` by `node render-diagrams.mjs`.
- `shots_c/*.png` are cropped app screenshots. They were taken from a seeded demo database and are kept here as files.
- `node preview.mjs report.docx preview` renders the DOCX to page PNGs so you can check it.
