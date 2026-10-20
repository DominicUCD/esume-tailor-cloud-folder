# Resume Tailor Cloud

A free-tier, cloud-powered résumé tailoring web app. Cloudflare Pages hosts the UI and its Pages Function securely calls Groq. No local model, Python server, or paid subscription is required to start (subject to provider free-tier limits).

## Features
- PDF, DOCX, TXT upload or paste résumé text; paste job description
- Groq model rewrites truthful job-relevant experience, targets 4–5 bullets per job, max 6
- Edit all fields and review a live preview
- Export blue-accent PDF and DOCX; print to PDF
- No persistent database; API key remains server-side

## Deploy (Cloudflare Pages)
1. Create a **free** Cloudflare account and a **free** GroqCloud account.
2. In GroqCloud, create an API key (do not paste it into the browser or GitHub).
3. Upload this folder to a **private or public GitHub repository** (do not include any personal résumé or `.env` file).
4. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git. Choose your repository.
5. Set build command `npm run build` and output directory `dist`. Cloudflare will detect `functions/api/tailor.js` as a Pages Function.
6. Under Pages project → Settings → Variables and Secrets, create **encrypted secret** `GROQ_API_KEY` with your key. Redeploy if needed.
7. Open your `*.pages.dev` website, paste résumé and job description, click Tailor.

Local development: `npm install`, `npm run dev` for UI only. For API development use Cloudflare Wrangler Pages dev with the built output and a local `.dev.vars` file containing `GROQ_API_KEY=...` (never commit it).

## Important limitations
- **Free tier is not unlimited**. Groq quotas, model names, pricing and terms can change. Default model is `openai/gpt-oss-20b`; verify its availability in your Groq dashboard.
- This version accepts **pasted job descriptions**, not automatic URL scraping. A URL input is informational only. Some job sites block scraping; pasting is reliable.
- Text extraction from complex or scanned PDFs may be imperfect. Review the extracted text.
- AI can omit or alter facts. Compare the output with the original and review every bullet before submitting.
- API processing sends résumé and job posting to Groq. Check provider data policies before using personal data.
- No user login, rate limiting per user, or persistent storage. Avoid publishing a shared open endpoint without adding authentication and abuse protection. Cloudflare free request quotas also apply.
- PDF layout is newly generated, not an edit to the original PDF.

## Security
Cloudflare Pages Functions stores the Groq key as an encrypted server-side secret. The browser never sees it. This project does not store uploaded résumés in a database. Do not upload sensitive information you are not comfortable sharing with your cloud AI provider.
