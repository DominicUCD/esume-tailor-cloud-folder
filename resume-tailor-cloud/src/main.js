
import './style.css';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';
import { jsPDF } from 'jspdf';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel
} from 'docx';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const $ = id => document.getElementById(id);

let result = null;
let activeTemplate = 'modern';
let currentVersionId = null;
let titleSuggestions = [];
let titleIndex = 0;

const esc = s => String(s ?? '').replace(
  /[&<>"']/g,
  c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c])
);

// Extract the target position from the job posting.
function jobTitleFromPosting(text) {
  const lines = String(text || '')
    .split(/\n/)
    .map(x => x.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 18)) {
    const m = line.match(
      /^(?:job title|position|role|title)\s*[:\-]\s*(.+)$/i
    );

    if (m) {
      return m[1]
        .replace(/\s*[|–—].*$/, '')
        .slice(0, 90)
        .trim();
    }
  }

  const candidate = lines.find(line =>
    line.length >= 3 &&
    line.length <= 75 &&
    !/^(about|description|summary|responsibilities|requirements|qualifications|benefits|location|salary|pay|company|apply|job description)\b/i.test(line)
  );

  return (candidate || '')
    .replace(/\s*[|–—].*$/, '')
    .trim();
}

// Build the compact contact line.
function headerContact() {
  if (!result) return '';

  const parts = [
    result.location,
    result.phone,
    result.email
  ]
    .map(x => String(x || '').trim())
    .filter(Boolean);

  return parts.length
    ? parts.join(' | ')
    : String(result.contact || '').trim();
}

// Convert old contact lines into separate fields.
// Existing saved resumes remain compatible.
function normalizeHeader() {
  if (!result) return;

  const contact = String(result.contact || '');

  const email = contact.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  )?.[0] || '';

  const phone = contact.match(
    /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/
  )?.[0] || '';

  result.email = String(
    result.email || email
  ).trim();

  result.phone = String(
    result.phone || phone
  ).trim();

  const remaining = contact
    .split(/\s*[|•]\s*/)
    .map(x => x.trim())
    .filter(x =>
      x &&
      !x.includes('@') &&
      !/\d{3}.*\d{3}.*\d{4}/.test(x)
    );

  result.location = String(
    result.location ||
    remaining.find(x => /,\s*[A-Z]{2}\b/i.test(x)) ||
    ''
  ).trim();

  // The target job title is the default headline,
  // even when past experience uses different titles.
  result.headline = String(
    result.headline ||
    result.targetTitle ||
    jobTitleFromPosting($('job').value) ||
    ''
  ).trim();
}

// Normalize characters for PDF rendering.
function pdfSafe(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '*');
}

const templateColors = {
  modern: [27, 79, 124],
  classic: [33, 42, 55],
  minimal: [65, 72, 82],
  professional: [19, 65, 90]
};

// =========================================
// APPLICATION INTERFACE
// =========================================

$('app').innerHTML = `
<header>
  <div>
    <h1>✦ Resume Tailor Cloud</h1>
    <small>Tailored, truthful résumés. No local AI required.</small>
  </div>
  <span>Free-tier cloud AI</span>
</header>

<main class="container">

  <div class="intro">
    <h2>Make your experience fit the opportunity.</h2>
    <p>
      Upload your résumé, paste a job description,
      and get an editable, ATS-friendly résumé.
    </p>
  </div>

  <div class="layout">

    <section class="panel">
      <h3>1. Your résumé</h3>

      <label for="file">
        Upload PDF, DOCX or TXT
      </label>

      <input
        type="file"
        id="file"
        accept=".pdf,.docx,.txt"
      />

      <p class="hint">
        Files are read in your browser.
        Extracted text is sent to Groq only
        when you generate.
      </p>

      <label for="resume">
        Or paste résumé text
      </label>

      <textarea
        id="resume"
        placeholder="Paste your existing résumé here..."
      ></textarea>
    </section>

    <section class="panel">
      <h3>2. Target position</h3>

      <label for="url">
        Job posting URL (optional)
      </label>

      <input
        type="url"
        id="url"
        placeholder="https://..."
      />

      <p class="hint">
        For reliable results, paste the job
        description below. Job sites often
        block automated extraction.
      </p>

      <label for="job">
        Job description
      </label>

      <textarea
        id="job"
        placeholder="Paste the full job posting here..."
      ></textarea>

      <div class="actions">
        <button id="generate">
          ✦ Tailor my résumé
        </button>
      </div>

      <div
        id="status"
        class="status"
        role="status"
      ></div>
    </section>

  </div>

  <section
    class="results hidden"
    id="results"
  >

    <div class="panel">
      <h3>3. Review and edit</h3>

      <div class="notice">
        Check all details before applying.
        The AI may omit or misinterpret
        source material. Edit any field
        below, then download.
      </div>

      <div class="feature-bar">

        <div>
          <label for="template">
            Résumé template
          </label>

          <select id="template">
            <option value="modern">
              Modern (v1.1 original)
            </option>

            <option value="classic">
              Classic
            </option>

            <option value="minimal">
              Minimalist
            </option>

            <option value="professional">
              Professional
            </option>
          </select>
        </div>

        <div>
          <label for="length">
            Page preference
          </label>

          <select id="length">
            <option value="auto">
              Automatic
            </option>

            <option value="one">
              Compact / aim for one page
            </option>

            <option value="two">
              Comfortable / up to two pages
            </option>
          </select>
        </div>

      </div>

      <div class="actions">

        <button
          id="saveVersion"
          class="secondary"
        >
          Save résumé version
        </button>

        <button
          id="restoreVersion"
          class="secondary"
        >
          Load saved version
        </button>

        <button
          id="backupVersions"
          class="secondary"
        >
          Export saved versions
        </button>

        <label class="import-label">
          Import saved versions

          <input
            type="file"
            id="importVersions"
            accept=".json"
            hidden
          />
        </label>

      </div>

      <div
        id="versions"
        class="version-list hidden"
      ></div>

      <div id="editor"></div>

      <div
        id="aiEditStatus"
        class="hint"
        role="status"
      ></div>

      <div class="panel-inner">

        <h4>Job keyword matching</h4>

        <p class="hint">
          Local text comparison only.
          Not an ATS score or proof
          of qualifications.
        </p>

        <div id="keywords"></div>

      </div>

      <div class="panel-inner">

        <h4>AI cover letter (optional)</h4>

        <p class="hint">
          Only calls Groq when you click
          Generate cover letter.
          PDF styling automatically matches
          your selected résumé template.
        </p>

        <div class="actions">

          <button
            id="coverGenerate"
            class="secondary"
          >
            Generate cover letter with AI
          </button>

          <button
            id="coverDownload"
            class="secondary"
          >
            Download cover letter DOCX
          </button>

          <button
            id="coverPdf"
            class="secondary"
          >
            Download cover letter PDF
          </button>

        </div>

        <textarea
          id="coverText"
          placeholder="Generate a cover letter or type your own here..."
        ></textarea>

        <div
          id="coverStatus"
          class="hint"
        ></div>

      </div>

      <h4 class="subhead">
        ✦ What we improved
      </h4>

      <div id="notes"></div>

      <div class="actions">

        <button id="pdf">
          Download PDF
        </button>

        <button id="docx">
          Download DOCX
        </button>

        <button
          id="print"
          class="secondary"
        >
          Print / save PDF
        </button>

      </div>

    </div>

    <h3 style="margin-top:24px">
      Live résumé preview
    </h3>

    <article
      id="preview"
      class="resume"
    ></article>

  </section>

  <p class="footer">
    Privacy: résumé text is processed by
    your browser and sent to Groq when
    you generate. No accounts or database
    are built into this app.
    Free API quotas apply.
  </p>

</main>
`;

// =========================================
// STATUS MESSAGES
// =========================================

function status(msg, error = false) {
  $('status').textContent = msg;

  $('status').className =
    'status ' + (error ? 'error' : 'ok');
}

// =========================================
// FILE UPLOAD
// =========================================

$('file').addEventListener('change', async e => {
  const f = e.target.files?.[0];

  if (!f) return;

  status('Reading file...');

  try {
    let txt = '';

    if (f.name.toLowerCase().endsWith('.pdf')) {
      const pdf = await pdfjsLib.getDocument({
        data: await f.arrayBuffer()
      }).promise;

      for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i);
        const content = await p.getTextContent();

        txt += content.items
          .map(x => x.str)
          .join(' ') + '\n';
      }

    } else if (
      f.name.toLowerCase().endsWith('.docx')
    ) {
      txt = (
        await mammoth.extractRawText({
          arrayBuffer: await f.arrayBuffer()
        })
      ).value;

    } else {
      txt = await f.text();
    }

    $('resume').value = txt;

    status(
      `Loaded ${f.name}. Please check extracted text before generating.`
    );

  } catch (err) {
    status(
      'Unable to read file: ' + err.message,
      true
    );
  }
});

// =========================================
// AI RESUME GENERATION
// =========================================

$('generate').onclick = async () => {
  const resume = $('resume').value.trim();
  const job = $('job').value.trim();

  if (resume.length < 80 || job.length < 60) {
    return status(
      'Please paste a full résumé and a job description (at least 80 / 60 characters).',
      true
    );
  }

  $('generate').disabled = true;

  status(
    'Sending résumé to cloud AI. This may take 15–60 seconds...'
  );

  try {
    const r = await fetch('/api/tailor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        resume,
        job
      })
    });

    const payload = await r.json();

    if (!r.ok) {
      throw Error(
        payload.error ||
        `Request failed (${r.status})`
      );
    }

    result = payload.result;

    // Initialize the new header fields.
    normalizeHeader();

    currentVersionId = null;

    $('coverText').value = '';
    $('results').classList.remove('hidden');

    renderEditor();

    status(
      'Draft generated. Review and edit before downloading.'
    );

    $('results').scrollIntoView({
      behavior: 'smooth'
    });

  } catch (e) {
    status(e.message, true);

  } finally {
    $('generate').disabled = false;
  }
};

/* =========================================
   PART 2: RESUME EDITOR
   ========================================= */

function field(label, value, key, rows = 0) {
  return `
    <div class="field">
      <label>${esc(label)}</label>
      ${
        rows
          ? `<textarea data-key="${esc(key)}">${esc(value)}</textarea>`
          : `<input type="text" data-key="${esc(key)}" value="${esc(value)}"/>`
      }
    </div>
  `;
}

function updateResultField(path, value) {
  if (!result) return;

  const parts = path.split('.');
  let target = result;

  for (let i = 0; i < parts.length - 1; i++) {
    if (target == null) return;
    target = target[parts[i]];
  }

  if (target == null) return;

  const key = parts.at(-1);

  target[key] = [
    'skills',
    'bullets',
    'education',
    'additional'
  ].includes(key)
    ? value
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, key === 'bullets' ? 6 : 100)
    : value;

  renderPreview();
  renderKeywords();
}

function renderEditor() {
  if (!result) return;

  normalizeHeader();

  if (!Array.isArray(result.experience)) {
    result.experience = [];
  }

  if (!Array.isArray(result.skills)) {
    result.skills = [];
  }

  if (!Array.isArray(result.education)) {
    result.education = [];
  }

  if (!Array.isArray(result.additional)) {
    result.additional = [];
  }

  let html = `
    <h4 class="subhead">Applicant information</h4>

    <div class="editor-grid">
      ${field('Full name', result.name, 'name')}
      ${field('Email address', result.email, 'email')}
      ${field('Phone number', result.phone, 'phone')}
      ${field('City, state and optional ZIP', result.location, 'location')}
    </div>

    <div class="panel-inner">
      <h4>Professional headline</h4>

      <p class="hint">
        Defaults to the position you're applying for,
        even when your previous job titles differ.
        This headline describes your target role,
        not a previous position you've held.
      </p>

      ${field(
        'Target job title',
        result.headline,
        'headline'
      )}

      <div class="actions">
        <button
          type="button"
          class="secondary"
          id="regenerateTitle"
        >
          ✦ Regenerate title
        </button>
      </div>

      <p
        id="titleStatus"
        class="hint"
        role="status"
      ></p>
    </div>

    ${field(
      'Professional summary',
      result.summary,
      'summary',
      4
    )}

    ${field(
      'Skills (one per line)',
      result.skills.join('\n'),
      'skills',
      4
    )}

    <div class="actions">
      <button
        type="button"
        id="addExperience"
      >
        + Add Job Experience
      </button>
    </div>
  `;

  result.experience.forEach((x, i) => {
    if (!Array.isArray(x.bullets)) {
      x.bullets = [];
    }

    html += `
      <div class="experience-section">

        <h4 class="subhead">
          Experience ${i + 1}
        </h4>
<div class="actions">
  <button
    type="button"
    class="secondary"
    data-movejob="${i}"
    data-direction="-1"
    ${i === 0 ? 'disabled' : ''}
  >
    ↑ Move Up
  </button>

  <button
    type="button"
    class="secondary"
    data-movejob="${i}"
    data-direction="1"
    ${i === result.experience.length - 1 ? 'disabled' : ''}
  >
    ↓ Move Down
  </button>
</div>
        <div class="editor-grid">
          ${field(
            'Job title',
            x.title,
            `experience.${i}.title`
          )}

          ${field(
            'Employer',
            x.employer,
            `experience.${i}.employer`
          )}

          ${field(
            'Dates',
            x.dates,
            `experience.${i}.dates`
          )}

          ${field(
            'Job location',
            x.location,
            `experience.${i}.location`
          )}
        </div>

        ${field(
          'Bullets (one per line; maximum 6)',
          x.bullets.join('\n'),
          `experience.${i}.bullets`,
          6
        )}

        <div class="actions">
          <button
            type="button"
            class="secondary"
            data-addbullet="${i}"
          >
            + Add bullet
          </button>

          <button
            type="button"
            class="secondary"
            data-removebullet="${i}"
          >
            Remove last bullet
          </button>

          <button
            type="button"
            class="secondary"
            data-removejob="${i}"
          >
            Remove Job
          </button>
        </div>

        <div class="panel-inner">
          <h4>✦ AI writing assistant</h4>

          <p class="hint">
            Select a bullet to improve.
            Suggestions are optional and
            won't replace your wording
            unless you accept them.
          </p>

          <label for="bulletSelect${i}">
            Choose experience bullet
          </label>

          <select
            id="bulletSelect${i}"
            class="bullet-select"
            data-bulletselect="${i}"
          >
            ${
              x.bullets.length
                ? x.bullets.map((b, j) => `
                    <option value="${j}">
                      ${esc(
                        `${j + 1}. ${b.slice(0, 90)}`
                      )}
                    </option>
                  `).join('')
                : '<option value="">No bullets yet</option>'
            }
          </select>

          <div class="actions">
            <button
              type="button"
              class="secondary"
              data-ai-action="improve"
              data-ai-job="${i}"
            >
              Improve wording
            </button>

            <button
              type="button"
              class="secondary"
              data-ai-action="keywords"
              data-ai-job="${i}"
            >
              Match job keywords
            </button>

            <button
              type="button"
              class="secondary"
              data-ai-action="concise"
              data-ai-job="${i}"
            >
              Make concise
            </button>
          </div>

          <div
            class="ai-suggestion hidden"
            id="suggestion${i}"
          ></div>
        </div>

      </div>
    `;
  });

  html += field(
    'Education (one per line)',
    result.education.join('\n'),
    'education',
    3
  );

  html += field(
    'Additional sections (one per line)',
    result.additional.join('\n'),
    'additional',
    3
  );

  $('editor').innerHTML = html;

  /* -------------------------------------
     LIVE FIELD EDITING
     ------------------------------------- */

  $('editor')
    .querySelectorAll('[data-key]')
    .forEach(el => {
      el.addEventListener('input', () => {
        updateResultField(
          el.dataset.key,
          el.value
        );
      });
    });

  /* -------------------------------------
     ADD JOB EXPERIENCE
     ------------------------------------- */

  $('addExperience').onclick = () => {
    result.experience.push({
      title: '',
      employer: '',
      dates: '',
      location: '',
      bullets: []
    });

    renderEditor();

    const index = result.experience.length - 1;

    const input = [
      ...$('editor').querySelectorAll('[data-key]')
    ].find(
      el => el.dataset.key ===
        `experience.${index}.title`
    );

    if (input) {
      input.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      input.focus({
        preventScroll: true
      });
    }
  };

  /* -------------------------------------
     ADD EXPERIENCE BULLET
     ------------------------------------- */

  $('editor')
    .querySelectorAll('[data-addbullet]')
    .forEach(button => {
      button.onclick = () => {
        const i = Number(
          button.dataset.addbullet
        );

        const bullets =
          result.experience[i].bullets;

        if (bullets.length >= 6) {
          return alert(
            'Maximum six bullets per role.'
          );
        }

        bullets.push(
          'New bullet - edit this text'
        );

        renderEditor();
      };
    });

  /* -------------------------------------
     REMOVE EXPERIENCE BULLET
     ------------------------------------- */

  $('editor')
    .querySelectorAll('[data-removebullet]')
    .forEach(button => {
      button.onclick = () => {
        const i = Number(
          button.dataset.removebullet
        );

        result.experience[i].bullets.pop();

        renderEditor();
      };
    });
 $('editor')
    .querySelectorAll('[data-movejob]')
    .forEach(button => {
      button.onclick = () => {
        const from = Number(
          button.dataset.movejob
        );

        const direction = Number(
          button.dataset.direction
        );

        const to = from + direction;

        if (
          !result ||
          from < 0 ||
          to < 0 ||
          from >= result.experience.length ||
          to >= result.experience.length
        ) {
          return;
        }

        const jobs = result.experience;

        [jobs[from], jobs[to]] = [
          jobs[to],
          jobs[from]
        ];

        renderEditor();

        const movedSection = $('editor')
          .querySelectorAll('.experience-section')[to];

        movedSection?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      };
    });
  /* -------------------------------------
     REMOVE JOB EXPERIENCE
     ------------------------------------- */

  $('editor')
    .querySelectorAll('[data-removejob]')
    .forEach(button => {
      button.onclick = () => {
        const i = Number(
          button.dataset.removejob
        );

        const x = result.experience[i];

        const description = [
          x.title,
          x.employer
        ]
          .filter(Boolean)
          .join(' at ');

        if (!confirm(
          `Remove ${
            description || 'this job'
          } from the résumé?`
        )) {
          return;
        }

        result.experience.splice(i, 1);

        renderEditor();
      };
    });

  /* -------------------------------------
     REGENERATE TARGET JOB TITLE
     ------------------------------------- */

  $('regenerateTitle').onclick = async () => {
    const button = $('regenerateTitle');
    const message = $('titleStatus');

    button.disabled = true;
    message.textContent =
      'Generating another job title suggestion...';

    try {
      const response = await fetch(
        '/api/suggest',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'title',
            job: $('job').value,
            resume: result
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw Error(
          data.error ||
          'Unable to generate title.'
        );
      }

      const suggestion = String(
        data.suggestion || ''
      ).trim();

      if (!suggestion) {
        throw Error(
          'No title suggestion returned.'
        );
      }

      result.headline = suggestion;

      renderEditor();

      $('titleStatus').textContent =
        'New title suggested. You can edit it.';

    } catch (error) {
      message.textContent =
        'Error: ' + error.message;

    } finally {
      button.disabled = false;
    }
  };

  /* -------------------------------------
     AI EXPERIENCE BULLET SUGGESTIONS
     ------------------------------------- */

  $('editor')
    .querySelectorAll('[data-ai-action]')
    .forEach(button => {
      button.onclick = async () => {
        const i = Number(
          button.dataset.aiJob
        );

        const action =
          button.dataset.aiAction;

        const select = $(
          `bulletSelect${i}`
        );

        const bulletIndex = Number(
          select?.value
        );

        const experience =
          result.experience[i];

        const original =
          experience?.bullets?.[bulletIndex];

        const panel = $(
          `suggestion${i}`
        );

        if (!original) {
          alert(
            'Add an experience bullet first.'
          );
          return;
        }

        button.disabled = true;

        panel.classList.remove('hidden');

        panel.innerHTML = `
          <p class="hint">
            Generating suggestion...
          </p>
        `;

        try {
          const response = await fetch(
            '/api/suggest',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json'
              },
              body: JSON.stringify({
                action,
                text: original,
                job: $('job').value,
                resume: result,
                experienceIndex: i
              })
            }
          );

          const data =
            await response.json();

          if (!response.ok) {
            throw Error(
              data.error ||
              'AI suggestion failed.'
            );
          }

          const suggestion = String(
            data.suggestion || ''
          ).trim();

          if (!suggestion) {
            throw Error(
              'No suggestion returned.'
            );
          }

          panel.innerHTML = `
            <h4>Suggested improvement</h4>

            <p>${esc(suggestion)}</p>

            <div class="actions">
              <button
                type="button"
                data-accept
              >
                Accept suggestion
              </button>

              <button
                type="button"
                class="secondary"
                data-dismiss
              >
                Dismiss
              </button>
            </div>
          `;

          panel.querySelector(
            '[data-accept]'
          ).onclick = () => {
            // Do not overwrite the bullet if
            // it changed while AI was working.
            if (
              result.experience[i] !==
                experience ||
              experience.bullets[
                bulletIndex
              ] !== original
            ) {
              alert(
                'This bullet changed. Request a new suggestion.'
              );

              return;
            }

            experience.bullets[
              bulletIndex
            ] = suggestion;

            renderEditor();
          };

          panel.querySelector(
            '[data-dismiss]'
          ).onclick = () => {
            panel.classList.add(
              'hidden'
            );

            panel.innerHTML = '';
          };

        } catch (error) {
          panel.innerHTML = `
            <p class="error">
              ${esc(error.message)}
            </p>
          `;

        } finally {
          if (button.isConnected) {
            button.disabled = false;
          }
        }
      };
    });

  /* -------------------------------------
     WHAT WE IMPROVED
     ------------------------------------- */

  $('notes').innerHTML = [
    ...(result.changes || []).map(
      s => `<p>✓ ${esc(s)}</p>`
    ),

    ...(result.warnings || []).map(
      s => `
        <p class="hint">
          Review: ${esc(s)}
        </p>
      `
    )
  ].join('') || '<p>No notes returned.</p>';

  renderPreview();
  renderKeywords();
}

/* =========================================
   PART 2: LIVE RESUME PREVIEW
   ========================================= */

function renderPreview() {
  if (!result) return;

  const contact = headerContact();

  let html = `
    <h1>${esc(result.name)}</h1>

    ${
      result.headline
        ? `
          <div class="resume-headline">
            ${esc(result.headline)}
          </div>
        `
        : ''
    }

    <div class="contact">
      ${esc(contact)}
    </div>

    <h2>PROFESSIONAL SUMMARY</h2>

    <p>${esc(result.summary)}</p>

    <h2>CORE SKILLS & COMPETENCIES</h2>

    <p>
      ${(result.skills || [])
        .map(esc)
        .join(' • ')}
    </p>

    <h2>PROFESSIONAL EXPERIENCE</h2>
  `;

  for (const x of result.experience || []) {
    html += `
      <div class="job-title">
        ${esc(x.title)} - ${esc(x.employer)}
      </div>

      <div class="job-meta">
        ${esc(x.dates)}
        ${esc(x.location)}
      </div>

      <ul>
        ${(x.bullets || [])
          .map(
            b => `<li>${esc(b)}</li>`
          )
          .join('')}
      </ul>
    `;
  }

  if (result.education?.length) {
    html += `
      <h2>EDUCATION</h2>

      ${result.education
        .map(
          s => `<p>${esc(s)}</p>`
        )
        .join('')}
    `;
  }

  if (result.additional?.length) {
    html += `
      <h2>ADDITIONAL INFORMATION</h2>

      ${result.additional
        .map(
          s => `<p>${esc(s)}</p>`
        )
        .join('')}
    `;
  }

  $('preview').innerHTML = html;

  $('preview').className =
    'resume template-' +
    activeTemplate +
    ' length-' +
    $('length').value;
}

/* =========================================
   PART 3: PDF HELPERS
   ========================================= */

function makePdf() {
  const d = new jsPDF({
    unit: 'pt',
    format: 'letter',
    compress: true
  });

  d.setCharSpace(0);

  return d;
}

function setPdfFont(
  d,
  size,
  bold = false,
  color = [32, 43, 58]
) {
  d.setFont(
    'helvetica',
    bold ? 'bold' : 'normal'
  );

  d.setFontSize(size);
  d.setTextColor(...color);
  d.setCharSpace(0);
}

function pdfWrappedLines(d, text, width) {
  const safe = pdfSafe(text);

  const paragraphs = safe.split(/\r?\n/);
  const lines = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }

    const wrapped = d.splitTextToSize(
      paragraph,
      width
    );

    for (const line of wrapped) {
      lines.push(line);
    }
  }

  return lines.length ? lines : [''];
}

// Prevent text from exceeding its available width.
// This is an additional safeguard for PDF exports.
function fitPdfLine(d, line, maxWidth) {
  const safe = pdfSafe(line);

  if (!safe) return '';

  if (d.getTextWidth(safe) <= maxWidth) {
    return safe;
  }

  let output = '';

  for (const char of safe) {
    if (
      d.getTextWidth(output + char) >
      maxWidth
    ) {
      break;
    }

    output += char;
  }

  return output;
}

/* =========================================
   PART 3: RESUME PDF EXPORT
   ========================================= */

$('pdf').onclick = () => {
  if (!result) return;

  const d = makePdf();

  const W = 612;
  const H = 792;

  const compact =
    $('length').value === 'one';

  const L = compact ? 39 : 48;
  const R = L;

  const usable = W - L - R;
  const bottom = compact ? 36 : 49;

  let y = compact ? 35 : 43;

  const accent =
    templateColors[activeTemplate] ||
    templateColors.modern;

  const ink = [32, 43, 58];
  const muted = [76, 93, 112];

  function pageCheck(height) {
    if (y + height > H - bottom) {
      d.addPage();
      y = 46;
      d.setCharSpace(0);
    }
  }

  function paragraph(
    text,
    {
      size = 9.5,
      bold = false,
      color = ink,
      indent = 0,
      after = 7,
      leading = 13,
      center = false
    } = {}
  ) {
    setPdfFont(d, size, bold, color);

    const width = usable - indent;

    const wrapped = pdfWrappedLines(
      d,
      text,
      width
    );

    for (const originalLine of wrapped) {
      pageCheck(leading);

      setPdfFont(
        d,
        size,
        bold,
        color
      );

      const line = fitPdfLine(
        d,
        originalLine,
        width
      );

      const x = center
        ? (W - d.getTextWidth(line)) / 2
        : L + indent;

      if (line) {
        d.text(line, x, y, {
          charSpace: 0
        });
      }

      y += leading;
    }

    y += after;
  }

  function heading(title) {
    pageCheck(34);

    y += 8;

    setPdfFont(
      d,
      10.2,
      true,
      accent
    );

    d.text(
      pdfSafe(title),
      L,
      y,
      { charSpace: 0 }
    );

    y += 5;

    d.setDrawColor(...accent);
    d.setLineWidth(0.8);

    d.line(
      L,
      y,
      W - R,
      y
    );

    y += 14;
  }

  function bullet(text) {
    const size = 9.4;
    const leading = 12.7;
    const indent = 17;

    setPdfFont(
      d,
      size,
      false,
      ink
    );

    const wrapped = pdfWrappedLines(
      d,
      text,
      usable - indent - 2
    );

    for (let i = 0; i < wrapped.length; i++) {
      pageCheck(leading + 3);

      setPdfFont(
        d,
        size,
        false,
        ink
      );

      if (i === 0) {
        d.setFillColor(...ink);

        d.circle(
          L + 4,
          y - 3,
          1.45,
          'F'
        );
      }

      const line = fitPdfLine(
        d,
        wrapped[i],
        usable - indent - 2
      );

      if (line) {
        d.text(
          line,
          L + indent,
          y,
          { charSpace: 0 }
        );
      }

      y += leading;
    }

    y += 4;
  }

  /* -------------------------------------
     APPLICANT HEADER
     ------------------------------------- */

  paragraph(result.name, {
    size: 19,
    bold: true,
    color: accent,
    center: true,
    after: 1,
    leading: 23
  });

  if (result.headline) {
    paragraph(result.headline, {
      size: 10.5,
      bold: true,
      color: ink,
      center: true,
      after: 2,
      leading: 13
    });
  }

  const contact = headerContact();

  if (contact) {
    paragraph(contact, {
      size: 8.8,
      color: muted,
      center: true,
      after: 5,
      leading: 11
    });
  }

  /* -------------------------------------
     PROFESSIONAL SUMMARY
     ------------------------------------- */

  heading('PROFESSIONAL SUMMARY');

  paragraph(result.summary, {
    after: 2
  });

  /* -------------------------------------
     SKILLS
     ------------------------------------- */

  heading('CORE SKILLS & COMPETENCIES');

  paragraph(
    (result.skills || []).join('  |  '),
    {
      after: 1
    }
  );

  /* -------------------------------------
     WORK EXPERIENCE
     ------------------------------------- */

  heading('PROFESSIONAL EXPERIENCE');

  for (const x of result.experience || []) {
    const title = [
      x.title,
      x.employer
    ]
      .filter(Boolean)
      .join(' - ');

    pageCheck(45);

    paragraph(title, {
      size: 10.2,
      bold: true,
      after: 3,
      leading: 13
    });

    paragraph(
      [
        x.dates,
        x.location
      ]
        .filter(Boolean)
        .join('  |  '),
      {
        size: 8.7,
        color: muted,
        after: 6,
        leading: 11
      }
    );

    for (const b of x.bullets || []) {
      bullet(b);
    }

    y += 5;
  }

  /* -------------------------------------
     EDUCATION
     ------------------------------------- */

  if (result.education?.length) {
    heading('EDUCATION');

    for (const e of result.education) {
      paragraph(e, {
        after: 4
      });
    }
  }

  /* -------------------------------------
     ADDITIONAL INFORMATION
     ------------------------------------- */

  if (result.additional?.length) {
    heading('ADDITIONAL INFORMATION');

    for (const e of result.additional) {
      paragraph(e, {
        after: 4
      });
    }
  }

  d.save(
    'tailored-resume-' +
    activeTemplate +
    '.pdf'
  );
};

/* =========================================
   PART 3: DOCX RESUME EXPORT
   ========================================= */

function resumeDocxLines() {
  const contact = headerContact();

  const lines = [
    {
      t: result.name || '',
      type: 'name'
    }
  ];

  if (result.headline) {
    lines.push({
      t: result.headline,
      type: 'headline'
    });
  }

  if (contact) {
    lines.push({
      t: contact,
      type: 'contact'
    });
  }

  lines.push(
    {
      t: 'PROFESSIONAL SUMMARY',
      type: 'head'
    },
    {
      t: result.summary || '',
      type: 'body'
    },
    {
      t: 'CORE SKILLS & COMPETENCIES',
      type: 'head'
    },
    ...(result.skills || []).map(t => ({
      t: '• ' + t,
      type: 'body'
    })),
    {
      t: 'PROFESSIONAL EXPERIENCE',
      type: 'head'
    }
  );

  for (const x of result.experience || []) {
    lines.push({
      t: [
        x.title,
        x.employer
      ]
        .filter(Boolean)
        .join(' - '),
      type: 'job'
    });

    lines.push({
      t: [
        x.dates,
        x.location
      ]
        .filter(Boolean)
        .join(' | '),
      type: 'meta'
    });

    for (const b of x.bullets || []) {
      lines.push({
        t: '• ' + b,
        type: 'body'
      });
    }
  }

  if (result.education?.length) {
    lines.push({
      t: 'EDUCATION',
      type: 'head'
    });

    for (const e of result.education) {
      lines.push({
        t: e,
        type: 'body'
      });
    }
  }

  if (result.additional?.length) {
    lines.push({
      t: 'ADDITIONAL INFORMATION',
      type: 'head'
    });

    for (const e of result.additional) {
      lines.push({
        t: e,
        type: 'body'
      });
    }
  }

  return lines;
}

$('docx').onclick = async () => {
  if (!result) return;

  const accent =
    templateColors[activeTemplate] ||
    templateColors.modern;

  const accentHex = accent
    .map(n =>
      n.toString(16).padStart(2, '0')
    )
    .join('')
    .toUpperCase();

  const children = resumeDocxLines().map(
    line => {
      const isHeader = [
        'name',
        'headline',
        'contact'
      ].includes(line.type);

      let size = 20;

      if (line.type === 'name') {
        size = 36;
      } else if (
        line.type === 'headline'
      ) {
        size = 23;
      } else if (
        line.type === 'contact'
      ) {
        size = 18;
      } else if (
        line.type === 'head'
      ) {
        size = 21;
      } else if (
        line.type === 'meta'
      ) {
        size = 18;
      }

      let after = 65;

      if (line.type === 'name') {
        after = 15;
      } else if (
        line.type === 'headline'
      ) {
        after = 30;
      } else if (
        line.type === 'contact'
      ) {
        after = 145;
      } else if (
        line.type === 'head'
      ) {
        after = 110;
      }

      return new Paragraph({
        heading:
          line.type === 'head'
            ? HeadingLevel.HEADING_2
            : undefined,

        alignment: isHeader
          ? 'center'
          : 'left',

        spacing: {
          after
        },

        children: [
          new TextRun({
            text: line.t || ' ',

            bold: [
              'name',
              'headline',
              'head',
              'job'
            ].includes(line.type),

            size,

            font:
              activeTemplate === 'classic'
                ? 'Georgia'
                : 'Arial',

            color: [
              'name',
              'head'
            ].includes(line.type)
              ? accentHex
              : '253040'
          })
        ]
      });
    }
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children
      }
    ]
  });

  download(
    await Packer.toBlob(doc),
    'tailored-resume-' +
      activeTemplate +
      '.docx'
  );
};

/* =========================================
   PART 3: DOWNLOAD HELPER
   ========================================= */

function download(blob, name) {
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');

  a.href = url;
  a.download = name;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(
    () => URL.revokeObjectURL(url),
    2000
  );
}

/* =========================================
   PART 3: TEMPLATE CONTROLS
   ========================================= */

$('template').onchange = e => {
  activeTemplate = e.target.value;
  renderPreview();
};

$('length').onchange = () => {
  renderPreview();
};

/* =========================================
   PART 4: KEYWORD MATCHING
   ========================================= */

function keywords(text) {
  const stop = new Set(
    'the and for with from this that your you will are our have has can must should work job role team plus able using about into through when while they them their than other all not but any per day who how what where including required preferred experience skills responsibilities qualifications candidate position ability strong excellent good effective high level knowledge understanding support ensure maintain manage perform provide services service company customer customers tasks duties years year minimum maximum'.split(' ')
  );

  const counts = new Map();

  (
    text.toLowerCase().match(
      /[a-z][a-z0-9+#-]{2,}/g
    ) || []
  ).forEach(word => {
    if (!stop.has(word)) {
      counts.set(
        word,
        (counts.get(word) || 0) + 1
      );
    }
  });

  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 22)
    .map(x => x[0]);
}

function renderKeywords() {
  if (!result) return;

  const job = $('job').value;

  const resume = [
    result.headline,
    result.summary,
    ...(result.skills || []),
    ...(result.experience || []).flatMap(
      x => [
        x.title,
        ...(x.bullets || [])
      ]
    ),
    ...(result.education || [])
  ]
    .join(' ')
    .toLowerCase();

  $('keywords').innerHTML = keywords(job)
    .map(word => {
      const matched = resume.includes(word);

      return `
        <span class="keyword ${
          matched ? 'matched' : 'unmatched'
        }">
          ${esc(word)}
          ${matched ? '✓' : '·'}
        </span>
      `;
    })
    .join('') || `
      <p class="hint">
        Paste a job description to see keywords.
      </p>
    `;
}

/* =========================================
   PART 4: SAVED RESUME VERSIONS
   ========================================= */

const storageKey =
  'resume-tailor-cloud-v12-versions';

function saved() {
  try {
    const data = JSON.parse(
      localStorage.getItem(storageKey) || '[]'
    );

    return Array.isArray(data) ? data : [];

  } catch {
    return [];
  }
}

function store(versions) {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify(versions)
    );

    return true;

  } catch {
    alert(
      'Browser storage is full or disabled. Export your versions as a backup.'
    );

    return false;
  }
}

$('saveVersion').onclick = () => {
  if (!result) return;

  const name = prompt(
    'Name this version (for example: Grocery Pickup - Target):',
    result.headline ||
      result.experience?.[0]?.title ||
      'Tailored résumé'
  );

  if (!name) return;

  let versions = saved();

  const id =
    currentVersionId || String(Date.now());

  versions = versions.filter(
    x => x.id !== id
  );

  versions.unshift({
    id,
    name: name.slice(0, 120),
    savedAt: new Date().toISOString(),
    result: structuredClone(result),
    job: $('job').value,
    template: activeTemplate,
    length: $('length').value,
    cover: $('coverText').value
  });

  if (store(versions.slice(0, 30))) {
    currentVersionId = id;

    alert(
      'Saved in this browser. Export a backup to protect against browser data loss.'
    );
  }
};

$('restoreVersion').onclick = () => {
  const pane = $('versions');

  pane.classList.toggle('hidden');

  pane.innerHTML = saved()
    .map(x => `
      <div class="version-item">
        <div>
          <strong>${esc(x.name)}</strong>
          <small>
            ${esc(
              new Date(x.savedAt).toLocaleString()
            )}
          </small>
        </div>

        <button
          class="secondary"
          data-load="${esc(x.id)}"
        >
          Load
        </button>

        <button
          class="secondary"
          data-delete="${esc(x.id)}"
        >
          Delete
        </button>
      </div>
    `)
    .join('') || '<p>No saved versions yet.</p>';

  pane.querySelectorAll('[data-load]')
    .forEach(button => {
      button.onclick = () => {
        const version = saved().find(
          x => x.id === button.dataset.load
        );

        if (!version) return;

        result = structuredClone(
          version.result
        );

        currentVersionId = version.id;

        $('job').value =
          version.job || '';

        activeTemplate =
          version.template || 'modern';

        $('template').value =
          activeTemplate;

        $('length').value =
          version.length || 'auto';

        $('coverText').value =
          version.cover || '';

        normalizeHeader();

        $('results').classList.remove(
          'hidden'
        );

        renderEditor();

        pane.classList.add('hidden');
      };
    });

  pane.querySelectorAll('[data-delete]')
    .forEach(button => {
      button.onclick = () => {
        if (
          confirm(
            'Delete this saved version?'
          )
        ) {
          store(
            saved().filter(
              x => x.id !==
                button.dataset.delete
            )
          );

          pane.classList.add('hidden');

          $('restoreVersion').click();
        }
      };
    });
};

/* =========================================
   PART 4: BACKUP SAVED VERSIONS
   ========================================= */

$('backupVersions').onclick = () => {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          format:
            'resume-tailor-cloud-v1.2',
          versions: saved()
        },
        null,
        2
      )
    ],
    {
      type: 'application/json'
    }
  );

  download(
    blob,
    'resume-tailor-backup.json'
  );
};

$('importVersions').onchange = async e => {
  const file = e.target.files?.[0];

  if (!file) return;

  try {
    const obj = JSON.parse(
      await file.text()
    );

    if (
      !Array.isArray(obj.versions) ||
      obj.format !==
        'resume-tailor-cloud-v1.2'
    ) {
      throw Error(
        'Not a valid v1.2 backup'
      );
    }

    const valid = obj.versions.filter(
      x =>
        x &&
        typeof x.name === 'string' &&
        x.result &&
        Array.isArray(
          x.result.experience
        )
    );

    const merged = [
      ...valid,
      ...saved()
    ]
      .filter(
        (x, i, all) =>
          all.findIndex(
            y => y.id === x.id
          ) === i
      )
      .slice(0, 30);

    if (store(merged)) {
      alert(
        'Imported ' +
          valid.length +
          ' versions.'
      );
    }

  } catch (error) {
    alert(
      'Import failed: ' +
        error.message
    );
  }

  e.target.value = '';
};

/* =========================================
   PART 4: AI COVER LETTER GENERATION
   ========================================= */

$('coverGenerate').onclick = async () => {
  if (!result) return;

  const button = $('coverGenerate');

  button.disabled = true;

  $('coverStatus').textContent =
    'Generating cover letter...';

  try {
    const response = await fetch(
      '/api/cover-letter',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json'
        },
        body: JSON.stringify({
          resume: result,
          job: $('job').value
        })
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      throw Error(
        data.error ||
        'Request failed'
      );
    }

    $('coverText').value =
      data.letter;

    $('coverStatus').textContent =
      'Generated. Review and edit before using.';

  } catch (error) {
    $('coverStatus').textContent =
      'Error: ' + error.message;

  } finally {
    button.disabled = false;
  }
};

/* =========================================
   PART 4: COVER LETTER DOCX EXPORT
   ========================================= */

$('coverDownload').onclick = async () => {
  const raw =
    $('coverText').value.trim();

  if (!raw) {
    return alert(
      'Write or generate a cover letter first.'
    );
  }

  const accent =
    templateColors[activeTemplate] ||
    templateColors.modern;

  const accentHex = accent
    .map(n =>
      n.toString(16).padStart(2, '0')
    )
    .join('')
    .toUpperCase();

  const children = [];

  if (result?.name) {
    children.push(
      new Paragraph({
        alignment: 'center',
        spacing: {
          after: 20
        },
        children: [
          new TextRun({
            text: result.name,
            bold: true,
            size: 34,
            font:
              activeTemplate === 'classic'
                ? 'Georgia'
                : 'Arial',
            color: accentHex
          })
        ]
      })
    );
  }

  if (result?.headline) {
    children.push(
      new Paragraph({
        alignment: 'center',
        spacing: {
          after: 25
        },
        children: [
          new TextRun({
            text: result.headline,
            bold: true,
            size: 22,
            font:
              activeTemplate === 'classic'
                ? 'Georgia'
                : 'Arial'
          })
        ]
      })
    );
  }

  const contact = headerContact();

  if (contact) {
    children.push(
      new Paragraph({
        alignment: 'center',
        spacing: {
          after: 210
        },
        children: [
          new TextRun({
            text: contact,
            size: 18,
            font:
              activeTemplate === 'classic'
                ? 'Georgia'
                : 'Arial'
          })
        ]
      })
    );
  }

  const paragraphs = raw
    .split(/\n\s*\n/)
    .map(p =>
      p.replace(
        /\s*\n\s*/g,
        ' '
      ).trim()
    )
    .filter(Boolean);

  for (const text of paragraphs) {
    children.push(
      new Paragraph({
        spacing: {
          after: 180
        },
        children: [
          new TextRun({
            text,
            size: 22,
            font:
              activeTemplate === 'classic'
                ? 'Georgia'
                : 'Arial'
          })
        ]
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children
      }
    ]
  });

  download(
    await Packer.toBlob(doc),
    'cover-letter-' +
      activeTemplate +
      '.docx'
  );
};

/* =========================================
   PART 4: COVER LETTER PDF EXPORT
   ========================================= */

$('coverPdf').onclick = () => {
  const raw =
    $('coverText').value.trim();

  if (!raw) {
    return alert(
      'Write or generate a cover letter first.'
    );
  }

  const d = makePdf();

  const accent =
    templateColors[activeTemplate] ||
    templateColors.modern;

  const ink = [32, 43, 58];
  const muted = [76, 93, 112];

  const W = 612;
  const H = 792;

  const left = 58;
  const right = 58;
  const bottom = 58;

  const usable =
    W - left - right;

  let y = 57;

  function pageCheck(height) {
    if (
      y + height >
      H - bottom
    ) {
      d.addPage();
      y = 58;
      d.setCharSpace(0);
    }
  }

  function writeParagraph(
    value,
    {
      size = 10.5,
      leading = 16,
      after = 13,
      bold = false,
      color = ink,
      center = false
    } = {}
  ) {
    setPdfFont(
      d,
      size,
      bold,
      color
    );

    const wrapped = pdfWrappedLines(
      d,
      value,
      usable
    );

    for (const originalLine of wrapped) {
      pageCheck(leading);

      setPdfFont(
        d,
        size,
        bold,
        color
      );

      const line = fitPdfLine(
        d,
        originalLine,
        usable
      );

      const x = center
        ? (
            W -
            d.getTextWidth(line)
          ) / 2
        : left;

      if (line) {
        d.text(
          line,
          x,
          y,
          {
            charSpace: 0,
            align: 'left'
          }
        );
      }

      y += leading;
    }

    y += after;
  }

  /* -------------------------------------
     MATCHING APPLICANT HEADER
     ------------------------------------- */

  if (result?.name) {
    writeParagraph(
      result.name,
      {
        size: 17,
        leading: 21,
        after: 1,
        bold: true,
        color: accent,
        center: true
      }
    );
  }

  if (result?.headline) {
    writeParagraph(
      result.headline,
      {
        size: 10.5,
        leading: 13,
        after: 2,
        bold: true,
        color: ink,
        center: true
      }
    );
  }

  const contact = headerContact();

  if (contact) {
    writeParagraph(
      contact,
      {
        size: 9,
        leading: 12,
        after: 8,
        color: muted,
        center: true
      }
    );
  }

  y += 5;

  d.setDrawColor(...accent);

  d.setLineWidth(
    activeTemplate === 'minimal'
      ? 0.5
      : 1
  );

  d.line(
    left,
    y,
    W - right,
    y
  );

  y += 27;

  /* -------------------------------------
     COVER LETTER BODY
     ------------------------------------- */

  const paragraphs = raw
    .split(/\n\s*\n/)
    .map(p =>
      p.replace(
        /\s*\n\s*/g,
        ' '
      ).trim()
    )
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    writeParagraph(
      paragraph,
      {
        size: 10.5,
        leading: 16,
        after: 13,
        color: ink
      }
    );
  }

  d.save(
    'cover-letter-' +
    activeTemplate +
    '.pdf'
  );
};

/* =========================================
   PART 4: PRINT / SAVE PDF
   ========================================= */

$('print').onclick = () => {
  window.print();
};

/* =========================================
   V1.2 PDF TEXT RENDERING REPAIR
   Overrides the two older PDF exporters.
   ========================================= */

function createRepairedPdf() {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
    compress: true
  });

  pdf.setR2L(false);
  pdf.setCharSpace(0);

  return pdf;
}

function repairedPdfFont(
  pdf,
  size = 10,
  bold = false,
  color = [32, 43, 58]
) {
  pdf.setFont(
    'helvetica',
    bold ? 'bold' : 'normal'
  );

  pdf.setFontSize(size);
  pdf.setTextColor(...color);
  pdf.setCharSpace(0);
}

function repairedPdfWrap(pdf, value, maxWidth) {
  const text = pdfSafe(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ');

  const output = [];

  function addParagraph(paragraph) {
    const words = paragraph.trim().split(/\s+/);

    if (!paragraph.trim()) {
      output.push('');
      return;
    }

    let line = '';

    for (const word of words) {
      const candidate = line
        ? line + ' ' + word
        : word;

      if (pdf.getTextWidth(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line) {
        output.push(line);
        line = '';
      }

      if (pdf.getTextWidth(word) <= maxWidth) {
        line = word;
        continue;
      }

      // Split exceptionally long words without
      // deleting any characters.
      let chunk = '';

      for (const character of word) {
        if (
          chunk &&
          pdf.getTextWidth(chunk + character) > maxWidth
        ) {
          output.push(chunk);
          chunk = '';
        }

        chunk += character;
      }

      line = chunk;
    }

    if (line) {
      output.push(line);
    }
  }

  for (const paragraph of text.split('\n')) {
    addParagraph(paragraph);
  }

  return output.length ? output : [''];
}

function repairedPdfWriter(pdf, options = {}) {
  const pageWidth = 612;
  const pageHeight = 792;

  const left = options.left ?? 52;
  const right = options.right ?? 52;
  const bottom = options.bottom ?? 50;

  const usableWidth = pageWidth - left - right;

  let y = options.top ?? 48;

  const accent =
    templateColors[activeTemplate] ||
    templateColors.modern;

  const ink = [32, 43, 58];
  const muted = [76, 93, 112];

  function ensureSpace(height) {
    if (y + height > pageHeight - bottom) {
      pdf.addPage();
      pdf.setCharSpace(0);
      y = options.top ?? 48;
    }
  }

  function drawLine(
    text,
    x,
    baseline,
    size,
    bold,
    color
  ) {
    repairedPdfFont(
      pdf,
      size,
      bold,
      color
    );

    // Important: draw a plain string with no
    // justification or character-spacing options.
    pdf.setCharSpace(0);
    pdf.text(String(text), x, baseline);
  }

  function paragraph(
    value,
    {
      size = 10,
      bold = false,
      color = ink,
      leading = 15,
      after = 10,
      indent = 0,
      center = false
    } = {}
  ) {
    repairedPdfFont(pdf, size, bold, color);

    const width = usableWidth - indent;

    const lines = repairedPdfWrap(
      pdf,
      value,
      width
    );

    for (const line of lines) {
      ensureSpace(leading);

      repairedPdfFont(pdf, size, bold, color);

      const x = center
        ? (pageWidth - pdf.getTextWidth(line)) / 2
        : left + indent;

      if (line) {
        drawLine(
          line,
          x,
          y,
          size,
          bold,
          color
        );
      }

      y += leading;
    }

    y += after;
  }

  function heading(title) {
    ensureSpace(38);
    y += 6;

    drawLine(
      pdfSafe(title),
      left,
      y,
      10.3,
      true,
      accent
    );

    y += 5;

    pdf.setDrawColor(...accent);
    pdf.setLineWidth(0.8);
    pdf.line(left, y, pageWidth - right, y);

    y += 15;
  }

  function bullet(value, compact = false) {
    const size = compact ? 9.1 : 9.5;
    const leading = compact ? 12 : 13.5;
    const indent = 17;

    repairedPdfFont(pdf, size, false, ink);

    const lines = repairedPdfWrap(
      pdf,
      value,
      usableWidth - indent - 4
    );

    lines.forEach((line, index) => {
      ensureSpace(leading + 2);

      if (index === 0) {
        pdf.setFillColor(...ink);
        pdf.circle(left + 4, y - 3, 1.4, 'F');
      }

      drawLine(
        line,
        left + indent,
        y,
        size,
        false,
        ink
      );

      y += leading;
    });

    y += compact ? 2 : 4;
  }

  function header() {
    if (result?.name) {
      paragraph(result.name, {
        size: 18,
        bold: true,
        color: accent,
        leading: 22,
        after: 1,
        center: true
      });
    }

    if (result?.headline) {
      paragraph(result.headline, {
        size: 10.5,
        bold: true,
        color: ink,
        leading: 13,
        after: 2,
        center: true
      });
    }

    const contact = headerContact();

    if (contact) {
      paragraph(contact, {
        size: 8.8,
        color: muted,
        leading: 12,
        after: 7,
        center: true
      });
    }
  }

  function rule() {
    ensureSpace(18);

    pdf.setDrawColor(...accent);
    pdf.setLineWidth(0.8);

    pdf.line(
      left,
      y,
      pageWidth - right,
      y
    );

    y += 23;
  }

  function space(points) {
    ensureSpace(points);
    y += points;
  }

  return {
    paragraph,
    heading,
    bullet,
    header,
    rule,
    space,
    ensureSpace,
    ink,
    muted
  };
}

/* =========================================
   REPAIRED RESUME PDF EXPORT
   ========================================= */

$('pdf').onclick = () => {
  if (!result) return;

  const pdf = createRepairedPdf();

  const compact = $('length').value === 'one';

  const writer = repairedPdfWriter(pdf, {
    left: compact ? 39 : 48,
    right: compact ? 39 : 48,
    top: compact ? 35 : 43,
    bottom: compact ? 36 : 49
  });

  const bodySize = compact ? 9.1 : 9.5;
  const leading = compact ? 12.5 : 13.5;

  writer.header();

  writer.heading('PROFESSIONAL SUMMARY');

  writer.paragraph(result.summary || '', {
    size: bodySize,
    leading,
    after: 3
  });

  writer.heading('CORE SKILLS & COMPETENCIES');

  writer.paragraph(
    (result.skills || []).join(' | '),
    {
      size: bodySize,
      leading,
      after: 3
    }
  );

  writer.heading('PROFESSIONAL EXPERIENCE');

  for (const job of result.experience || []) {
    writer.ensureSpace(55);

    writer.paragraph(
      [job.title, job.employer]
        .filter(Boolean)
        .join(' - '),
      {
        size: 10.2,
        bold: true,
        leading: 13,
        after: 3
      }
    );

    writer.paragraph(
      [job.dates, job.location]
        .filter(Boolean)
        .join(' | '),
      {
        size: 8.7,
        color: writer.muted,
        leading: 11,
        after: 6
      }
    );

    for (const item of job.bullets || []) {
      writer.bullet(item, compact);
    }

    writer.space(compact ? 3 : 5);
  }

  if (result.education?.length) {
    writer.heading('EDUCATION');

    for (const item of result.education) {
      writer.paragraph(item, {
        size: bodySize,
        leading,
        after: 5
      });
    }
  }

  if (result.additional?.length) {
    writer.heading('ADDITIONAL INFORMATION');

    for (const item of result.additional) {
      writer.paragraph(item, {
        size: bodySize,
        leading,
        after: 5
      });
    }
  }

  pdf.save(
    'tailored-resume-' +
    activeTemplate +
    '.pdf'
  );
};

/* =========================================
   REPAIRED COVER LETTER PDF EXPORT
   ========================================= */

$('coverPdf').onclick = () => {
  const raw = $('coverText').value.trim();

  if (!raw) {
    alert('Write or generate a cover letter first.');
    return;
  }

  const pdf = createRepairedPdf();

  const writer = repairedPdfWriter(pdf, {
    left: 58,
    right: 58,
    top: 57,
    bottom: 58
  });

  writer.header();
  writer.space(5);
  writer.rule();

  const paragraphs = raw
    .split(/\n\s*\n/)
    .map(text =>
      text.replace(/\s*\n\s*/g, ' ').trim()
    )
    .filter(Boolean);

  for (const text of paragraphs) {
    writer.paragraph(text, {
      size: 10.5,
      leading: 16,
      after: 13
    });
  }

  pdf.save(
    'cover-letter-' +
    activeTemplate +
    '.pdf'
  );
};

/* =========================================
   PDF-LIB EXPORT ENGINE
   Resume Tailor Cloud v1.2
   ========================================= */

function pdfLibText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E\n\r\t\u00A1-\u00FF]/g, '');
}

function pdfLibColor(values) {
  return rgb(
    values[0] / 255,
    values[1] / 255,
    values[2] / 255
  );
}

function pdfLibWrap(text, font, size, maxWidth) {
  const output = [];

  const paragraphs = pdfLibText(text)
    .replace(/\r\n?/g, '\n')
    .split('\n');

  const widthOf = value =>
    font.widthOfTextAtSize(value, size);

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      output.push('');
      continue;
    }

    const words = paragraph.trim().split(/\s+/);
    let line = '';

    for (const word of words) {
      const candidate = line
        ? line + ' ' + word
        : word;

      if (widthOf(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line) {
        output.push(line);
        line = '';
      }

      if (widthOf(word) <= maxWidth) {
        line = word;
        continue;
      }

      let chunk = '';

      for (const character of word) {
        if (
          chunk &&
          widthOf(chunk + character) > maxWidth
        ) {
          output.push(chunk);
          chunk = '';
        }

        chunk += character;
      }

      line = chunk;
    }

    if (line) {
      output.push(line);
    }
  }

  return output.length ? output : [''];
}

async function createPdfLibWriter(options = {}) {
  const document = await PDFDocument.create();

  const regular = await document.embedFont(
    StandardFonts.Helvetica
  );

  const bold = await document.embedFont(
    StandardFonts.HelveticaBold
  );

  const pageWidth = 612;
  const pageHeight = 792;

  const left = options.left ?? 50;
  const right = options.right ?? 50;
  const top = options.top ?? 48;
  const bottom = options.bottom ?? 48;

  const usableWidth = pageWidth - left - right;

  const accent = pdfLibColor(
    templateColors[activeTemplate] ||
    templateColors.modern
  );

  const ink = rgb(32 / 255, 43 / 255, 58 / 255);
  const muted = rgb(76 / 255, 93 / 255, 112 / 255);

  let page = document.addPage([
    pageWidth,
    pageHeight
  ]);

  let y = pageHeight - top;

  function ensureSpace(height) {
    if (y - height < bottom) {
      page = document.addPage([
        pageWidth,
        pageHeight
      ]);

      y = pageHeight - top;
    }
  }

  function paragraph(
    value,
    {
      size = 10,
      isBold = false,
      color = ink,
      leading = 15,
      after = 9,
      indent = 0,
      center = false
    } = {}
  ) {
    const font = isBold ? bold : regular;
    const width = usableWidth - indent;

    const lines = pdfLibWrap(
      value,
      font,
      size,
      width
    );

    for (const line of lines) {
      ensureSpace(leading);

      const measuredWidth =
        font.widthOfTextAtSize(line, size);

      const x = center
        ? (pageWidth - measuredWidth) / 2
        : left + indent;

      if (line) {
        page.drawText(line, {
          x,
          y,
          size,
          font,
          color
        });
      }

      y -= leading;
    }

    y -= after;
  }

  function heading(text) {
    ensureSpace(38);
    y -= 8;

    page.drawText(pdfLibText(text), {
      x: left,
      y,
      size: 10.2,
      font: bold,
      color: accent
    });

    y -= 6;

    page.drawLine({
      start: { x: left, y },
      end: { x: pageWidth - right, y },
      thickness: 0.8,
      color: accent
    });

    y -= 15;
  }

  function bullet(value, compact = false) {
    const size = compact ? 9.1 : 9.5;
    const leading = compact ? 12.5 : 13.5;
    const indent = 17;

    const lines = pdfLibWrap(
      value,
      regular,
      size,
      usableWidth - indent - 3
    );

    lines.forEach((line, index) => {
      ensureSpace(leading + 2);

      if (index === 0) {
        page.drawCircle({
          x: left + 4,
          y: y + 3,
          size: 1.5,
          color: ink
        });
      }

      if (line) {
        page.drawText(line, {
          x: left + indent,
          y,
          size,
          font: regular,
          color: ink
        });
      }

      y -= leading;
    });

    y -= compact ? 2 : 4;
  }

  function header() {
    if (result?.name) {
      paragraph(result.name, {
        size: 18,
        isBold: true,
        color: accent,
        leading: 22,
        after: 1,
        center: true
      });
    }

    if (result?.headline) {
      paragraph(result.headline, {
        size: 10.5,
        isBold: true,
        leading: 13,
        after: 2,
        center: true
      });
    }

    const contact = headerContact();

    if (contact) {
      paragraph(contact, {
        size: 8.8,
        color: muted,
        leading: 12,
        after: 7,
        center: true
      });
    }
  }

  function rule() {
    ensureSpace(20);

    page.drawLine({
      start: { x: left, y },
      end: { x: pageWidth - right, y },
      thickness: 0.8,
      color: accent
    });

    y -= 24;
  }

  function space(amount) {
    ensureSpace(amount);
    y -= amount;
  }

  async function save(filename) {
    const bytes = await document.save();

    download(
      new Blob([bytes], {
        type: 'application/pdf'
      }),
      filename
    );
  }

  return {
    paragraph,
    heading,
    bullet,
    header,
    rule,
    space,
    ensureSpace,
    save,
    ink,
    muted
  };
}

/* =========================================
   PDF-LIB RESUME EXPORT
   ========================================= */

$('pdf').onclick = async () => {
  if (!result) return;

  const button = $('pdf');
  button.disabled = true;

  try {
    const compact = $('length').value === 'one';

    const writer = await createPdfLibWriter({
      left: compact ? 39 : 48,
      right: compact ? 39 : 48,
      top: compact ? 35 : 43,
      bottom: compact ? 36 : 49
    });

    const size = compact ? 9.1 : 9.5;
    const leading = compact ? 12.5 : 13.5;

    writer.header();

    writer.heading('PROFESSIONAL SUMMARY');

    writer.paragraph(result.summary || '', {
      size,
      leading,
      after: 3
    });

    writer.heading('CORE SKILLS & COMPETENCIES');

    writer.paragraph(
      (result.skills || []).join(' | '),
      {
        size,
        leading,
        after: 3
      }
    );

    writer.heading('PROFESSIONAL EXPERIENCE');

    for (const job of result.experience || []) {
      writer.ensureSpace(55);

      writer.paragraph(
        [job.title, job.employer]
          .filter(Boolean)
          .join(' - '),
        {
          size: 10.2,
          isBold: true,
          leading: 13,
          after: 3
        }
      );

      writer.paragraph(
        [job.dates, job.location]
          .filter(Boolean)
          .join(' | '),
        {
          size: 8.7,
          color: writer.muted,
          leading: 11,
          after: 6
        }
      );

      for (const item of job.bullets || []) {
        writer.bullet(item, compact);
      }

      writer.space(compact ? 3 : 5);
    }

    if (result.education?.length) {
      writer.heading('EDUCATION');

      for (const item of result.education) {
        writer.paragraph(item, {
          size,
          leading,
          after: 5
        });
      }
    }

    if (result.additional?.length) {
      writer.heading('ADDITIONAL INFORMATION');

      for (const item of result.additional) {
        writer.paragraph(item, {
          size,
          leading,
          after: 5
        });
      }
    }

    await writer.save(
      'tailored-resume-' +
      activeTemplate +
      '.pdf'
    );

  } catch (error) {
    console.error(error);

    alert(
      'PDF export failed: ' + error.message
    );

  } finally {
    button.disabled = false;
  }
};

/* =========================================
   PDF-LIB COVER LETTER EXPORT
   ========================================= */

$('coverPdf').onclick = async () => {
  const raw = $('coverText').value.trim();

  if (!raw) {
    alert('Write or generate a cover letter first.');
    return;
  }

  const button = $('coverPdf');
  button.disabled = true;

  try {
    const writer = await createPdfLibWriter({
      left: 58,
      right: 58,
      top: 57,
      bottom: 58
    });

    writer.header();
    writer.space(5);
    writer.rule();

    const paragraphs = raw
      .split(/\n\s*\n/)
      .map(text =>
        text.replace(/\s*\n\s*/g, ' ').trim()
      )
      .filter(Boolean);

    for (const text of paragraphs) {
      writer.paragraph(text, {
        size: 10.5,
        leading: 16,
        after: 13
      });
    }

    await writer.save(
      'cover-letter-' +
      activeTemplate +
      '.pdf'
    );

  } catch (error) {
    console.error(error);

    alert(
      'Cover letter PDF failed: ' +
      error.message
    );

  } finally {
    button.disabled = false;
  }
};

