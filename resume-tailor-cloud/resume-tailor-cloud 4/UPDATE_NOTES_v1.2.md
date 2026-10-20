# Resume Tailor Cloud v1.2 — TEST BUILD

Based on the v1.1 project. Preserve your existing v1.1 deployment as a rollback option.

## Added
- Four selectable preview templates (Modern retains v1.1 styling; Classic, Minimalist, Professional).
- PDF export uses template-specific heading colors; PDF layout is a clean selectable-text document, not pixel-identical to browser preview. DOCX remains the original export style.
- Page density preference for PDF and preview (compact/automatic/comfortable). Not a guaranteed one-page/two-page pagination constraint.
- Cover letter generator on demand via `/api/cover-letter`, using the existing `GROQ_API_KEY`; editable letter and DOCX download.
- Keyword comparison computed locally from the job posting and the current edited résumé; this is not an ATS score.
- Local-browser saved résumé versions, load/delete, JSON export/import. Not synced between devices; clearing browser data may delete versions.
- Add/remove experience bullets in the editor; all existing text fields remain editable.

## Groq calls
- Existing Tailor button: `/api/tailor` (unchanged from v1.1).
- New Generate cover letter button: `/api/cover-letter`.
- All other new actions: no AI request.

## Installation
The ZIP contains the full `resume-tailor-cloud/` project folder. Replace the contents of the existing matching GitHub folder, preserving its path (do not create an extra nested folder). Cloudflare Pages settings remain: root `resume-tailor-cloud`, command `npm run build`, output `dist`. Keep `GROQ_API_KEY` in Cloudflare secrets, never GitHub.

## Verification
JavaScript syntax checked. Live browser/Cloudflare and end-to-end Groq tests NOT performed. Test PDF, DOCX, saved versions and cover letter before considering it production-ready.
