# Resume Tailor Cloud v1.1 update

Changes:
- PDF export now uses an intentional résumé layout with centered name/contact, inline skills, blue rules, indented wrapped bullets, and page-break protection. Text stays selectable.
- Stronger Groq instructions emphasize transferable experience for the target role and minimize irrelevant industry-specific details.
- Recommendations panel renamed to "What We Improved" and asks AI for changes actually made; material factual ambiguities may still be flagged for review.

## Updating the existing GitHub repository
Upload the updated files *inside* `resume-tailor-cloud/` to the matching folder in your existing GitHub repository, replacing the old files. Keep Cloudflare's root directory `resume-tailor-cloud`, build command `npm run build`, and output directory `dist`. Your Cloudflare secret `GROQ_API_KEY` stays unchanged.

Test with your Beauty Advisor to Online Pickup example, compare preview and PDF, and verify facts before applying. The PDF uses matching design rules but is not a literal browser-pixel reproduction; different font metrics can cause small wrapping differences.
