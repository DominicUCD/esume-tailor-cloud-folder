
import './style.css';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';
import {jsPDF} from 'jspdf';
import {Document,Packer,Paragraph,TextRun,HeadingLevel} from 'docx';

pdfjsLib.GlobalWorkerOptions.workerSrc=workerSrc;

const $=id=>document.getElementById(id);
let result=null;
let activeTemplate='modern';
let currentVersionId=null;
let coverLetter='';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

$('app').innerHTML=`<header><div><h1>✦ Resume Tailor Cloud</h1><small>Tailored, truthful résumés. No local AI required.</small></div><span>Free-tier cloud AI</span></header><main class="container"><div class="intro"><h2>Make your experience fit the opportunity.</h2><p>Upload your résumé, paste a job description, and get an editable, ATS-friendly résumé.</p></div><div class="layout"><section class="panel"><h3>1. Your résumé</h3><label for="file">Upload PDF, DOCX or TXT</label><input type="file" id="file" accept=".pdf,.docx,.txt"/><p class="hint">Files are read in your browser. Extracted text is sent to Groq only when you generate.</p><label for="resume">Or paste résumé text</label><textarea id="resume" placeholder="Paste your existing résumé here..."></textarea></section><section class="panel"><h3>2. Target position</h3><label for="url">Job posting URL (optional)</label><input type="url" id="url" placeholder="https://..."/><p class="hint">For reliable results, paste the job description below. Job sites often block automated extraction.</p><label for="job">Job description</label><textarea id="job" placeholder="Paste the full job posting here..."></textarea><div class="actions"><button id="generate">✦ Tailor my résumé</button></div><div id="status" class="status" role="status"></div></section></div><section class="results hidden" id="results"><div class="panel"><h3>3. Review and edit</h3><div class="notice">Check all details before applying. The AI may omit or misinterpret source material. Edit any field below, then download.</div><div class="feature-bar"><div><label for="template">Résumé template</label><select id="template"><option value="modern">Modern (v1.1 original)</option><option value="classic">Classic</option><option value="minimal">Minimalist</option><option value="professional">Professional</option></select></div><div><label for="length">Page preference</label><select id="length"><option value="auto">Automatic</option><option value="one">Compact / aim for one page</option><option value="two">Comfortable / up to two pages</option></select></div></div><div class="actions"><button id="saveVersion" class="secondary">Save résumé version</button><button id="restoreVersion" class="secondary">Load saved version</button><button id="backupVersions" class="secondary">Export saved versions</button><label class="import-label">Import saved versions<input type="file" id="importVersions" accept=".json" hidden></label></div><div id="versions" class="version-list hidden"></div><div id="editor"></div><div class="panel-inner"><h4>Job keyword matching</h4><p class="hint">Local text comparison only. Not an ATS score or proof of qualifications.</p><div id="keywords"></div></div><div class="panel-inner"><h4>AI cover letter (optional)</h4><p class="hint">Only calls Groq when you click Generate cover letter.</p><div class="actions"><button id="coverGenerate" class="secondary">Generate cover letter with AI</button><button id="coverDownload" class="secondary">Download cover letter DOCX</button></div><textarea id="coverText" placeholder="Generate a cover letter or type your own here..."></textarea><div id="coverStatus" class="hint"></div></div><h4 class="subhead">✦ What we improved</h4><div id="notes"></div><div class="actions"><button id="pdf">Download PDF</button><button id="docx">Download DOCX</button><button id="print" class="secondary">Print / save PDF</button></div></div><h3 style="margin-top:24px">Live résumé preview</h3><article id="preview" class="resume"></article></section><p class="footer">Privacy: résumé text is processed by your browser and sent to Groq when you generate. No accounts or database are built into this app. Free API quotas apply.</p></main>`;

function status(msg,error=false){
  $('status').textContent=msg;
  $('status').className='status '+(error?'error':'ok');
}

$('file').addEventListener('change',async e=>{
  const f=e.target.files?.[0];
  if(!f)return;
  status('Reading file...');
  try{
    let txt='';
    if(f.name.toLowerCase().endsWith('.pdf')){
      const pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;
      for(let i=1;i<=pdf.numPages;i++){
        const p=await pdf.getPage(i);
        const content=await p.getTextContent();
        txt+=content.items.map(x=>x.str).join(' ')+'\n';
      }
    }else if(f.name.toLowerCase().endsWith('.docx')){
      txt=(await mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()})).value;
    }else{
      txt=await f.text();
    }
    $('resume').value=txt;
    status(`Loaded ${f.name}. Please check extracted text before generating.`);
  }catch(err){
    status('Unable to read file: '+err.message,true);
  }
});

$('generate').onclick=async()=>{
  const resume=$('resume').value.trim();
  const job=$('job').value.trim();
  if(resume.length<80||job.length<60){
    return status('Please paste a full résumé and a job description (at least 80 / 60 characters).',true);
  }
  $('generate').disabled=true;
  status('Sending résumé to cloud AI. This may take 15–60 seconds...');
  try{
    const r=await fetch('/api/tailor',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({resume,job})
    });
    const payload=await r.json();
    if(!r.ok)throw Error(payload.error||`Request failed (${r.status})`);
    result=payload.result;
    renderEditor();
    $('results').classList.remove('hidden');
    currentVersionId=null;
    coverLetter='';
    $('coverText').value='';
    status('Draft generated. Review and edit before downloading.');
    $('results').scrollIntoView({behavior:'smooth'});
  }catch(e){
    status(e.message,true);
  }finally{
    $('generate').disabled=false;
  }
};

function field(label,value,key,rows=0){
  return `<div class="field"><label>${esc(label)}</label>${
    rows
      ? `<textarea data-key="${key}">${esc(value)}</textarea>`
      : `<input type="text" data-key="${key}" value="${esc(value)}"/>`
  }</div>`;
}

// v1.2: Edit, add and remove entire work experiences.
// All changes happen locally without another AI request.
function renderEditor(){
  if(!result)return;

  if(!Array.isArray(result.experience)){
    result.experience=[];
  }

  let html=
    '<div class="editor-grid">'+
    field('Name',result.name,'name')+
    field('Contact line',result.contact,'contact')+
    '</div>'+
    field('Professional summary',result.summary,'summary',4)+
    field('Skills (one per line)',(result.skills||[]).join('\n'),'skills',4);

  html+=`
    <div class="actions">
      <button type="button" id="addExperience">
        + Add Job Experience
      </button>
    </div>
  `;

  result.experience.forEach((x,i)=>{
    if(!Array.isArray(x.bullets))x.bullets=[];

    html+=`
      <div class="experience-section">
        <h4 class="subhead">Experience ${i+1}</h4>
        <div class="editor-grid">
          ${field('Job title',x.title,`experience.${i}.title`)}
          ${field('Employer',x.employer,`experience.${i}.employer`)}
          ${field('Dates',x.dates,`experience.${i}.dates`)}
          ${field('Location',x.location,`experience.${i}.location`)}
        </div>
        ${field(
          'Bullets (one per line; maximum 6)',
          x.bullets.join('\n'),
          `experience.${i}.bullets`,
          6
        )}
        <div class="actions">
          <button type="button" class="secondary"
            data-addbullet="${i}">+ Add bullet</button>
          <button type="button" class="secondary"
            data-removebullet="${i}">Remove last bullet</button>
          <button type="button" class="secondary"
            data-removejob="${i}">Remove Job</button>
        </div>
      </div>
    `;
  });

  html+=
    field('Education (one per line)',(result.education||[]).join('\n'),'education',3)+
    field('Additional sections (one per line)',(result.additional||[]).join('\n'),'additional',3);

  $('editor').innerHTML=html;

  $('editor').querySelectorAll('[data-key]').forEach(el=>{
    el.addEventListener('input',()=>{
      const parts=el.dataset.key.split('.');
      let target=result;

      for(let i=0;i<parts.length-1;i++){
        target=target[parts[i]];
      }

      const key=parts.at(-1);

      target[key]=['skills','bullets','education','additional'].includes(key)
        ? el.value.split('\n')
            .map(s=>s.trim())
            .filter(Boolean)
            .slice(0,key==='bullets'?6:100)
        : el.value;

      renderPreview();
      renderKeywords();
    });
  });

  $('addExperience').onclick=()=>{
    result.experience.push({
      title:'',
      employer:'',
      dates:'',
      location:'',
      bullets:[]
    });
    renderEditor();

    const fields=$('editor').querySelectorAll('[data-key]');
    const newJobIndex=result.experience.length-1;
    const newTitle=[...fields].find(
      el=>el.dataset.key===`experience.${newJobIndex}.title`
    );
    if(newTitle){
      newTitle.scrollIntoView({behavior:'smooth',block:'center'});
      newTitle.focus({preventScroll:true});
    }
  };

  $('editor').querySelectorAll('[data-addbullet]').forEach(b=>{
    b.onclick=()=>{
      const i=Number(b.dataset.addbullet);
      if(result.experience[i].bullets.length>=6){
        return alert('Maximum six bullets per role.');
      }
      result.experience[i].bullets.push('New bullet — edit this text');
      renderEditor();
    };
  });

  $('editor').querySelectorAll('[data-removebullet]').forEach(b=>{
    b.onclick=()=>{
      const i=Number(b.dataset.removebullet);
      result.experience[i].bullets.pop();
      renderEditor();
    };
  });

  $('editor').querySelectorAll('[data-removejob]').forEach(b=>{
    b.onclick=()=>{
      const i=Number(b.dataset.removejob);
      const x=result.experience[i];
      const description=[x.title,x.employer].filter(Boolean).join(' at ');

      if(!confirm(
        `Remove ${description||'this job'} from the résumé?`
      ))return;

      result.experience.splice(i,1);
      renderEditor();
    };
  });

  $('notes').innerHTML=[
    ...(result.changes||[]).map(s=>`<p>✓ ${esc(s)}</p>`),
    ...(result.warnings||[]).map(s=>`<p class="hint">Review: ${esc(s)}</p>`)
  ].join('')||'<p>No notes returned.</p>';

  renderPreview();
  renderKeywords();
}

function renderPreview(){
  if(!result)return;
  let html=`<h1>${esc(result.name)}</h1><div class="contact">${esc(result.contact)}</div><h2>PROFESSIONAL SUMMARY</h2><p>${esc(result.summary)}</p><h2>CORE SKILLS & COMPETENCIES</h2><p>${(result.skills||[]).map(esc).join(' • ')}</p><h2>PROFESSIONAL EXPERIENCE</h2>`;
  for(const x of result.experience||[]){
    html+=`<div class="job-title">${esc(x.title)} — ${esc(x.employer)}</div><div class="job-meta">${esc(x.dates)} ${esc(x.location)}</div><ul>${(x.bullets||[]).map(b=>`<li>${esc(b)}</li>`).join('')}</ul>`;
  }
  if(result.education?.length){
    html+='<h2>EDUCATION</h2>'+result.education.map(s=>`<p>${esc(s)}</p>`).join('');
  }
  if(result.additional?.length){
    html+='<h2>ADDITIONAL INFORMATION</h2>'+result.additional.map(s=>`<p>${esc(s)}</p>`).join('');
  }
  $('preview').innerHTML=html;
  $('preview').className='resume template-'+activeTemplate+' length-'+$('length').value;
}

const lines=()=>{
  const a=[
    {t:result.name,type:'name'},
    {t:result.contact,type:'contact'},
    {t:'PROFESSIONAL SUMMARY',type:'head'},
    {t:result.summary,type:'body'},
    {t:'CORE SKILLS & COMPETENCIES',type:'head'},
    ...(result.skills||[]).map(t=>({t:'• '+t,type:'body'})),
    {t:'PROFESSIONAL EXPERIENCE',type:'head'}
  ];
  for(const x of result.experience||[]){
    a.push(
      {t:`${x.title} — ${x.employer}`,type:'job'},
      {t:`${x.dates} ${x.location}`,type:'contact'}
    );
    for(const b of x.bullets||[]){
      a.push({t:'• '+b,type:'body'});
    }
  }
  if(result.education?.length){
    a.push(
      {t:'EDUCATION',type:'head'},
      ...result.education.map(t=>({t,type:'body'}))
    );
  }
  if(result.additional?.length){
    a.push(
      {t:'ADDITIONAL INFORMATION',type:'head'},
      ...result.additional.map(t=>({t,type:'body'}))
    );
  }
  return a;
};

// PDF layout mirrors the preview's typographic hierarchy while keeping text selectable for ATS.
$('pdf').onclick=()=>{
  if(!result)return;
  const d=new jsPDF({unit:'pt',format:'letter',compress:true});
  const W=612,H=792,L=$('length').value==='one'?39:48,R=L,usable=W-L-R,bottom=$('length').value==='one'?36:49;
  let y=$('length').value==='one'?36:45;
  const palette={
    modern:[27,79,124],
    classic:[33,42,55],
    minimal:[65,72,82],
    professional:[19,65,90]
  };
  const blue=palette[activeTemplate],ink=[32,43,58],muted=[76,93,112];

  function pageCheck(height){
    if(y+height>H-bottom){
      d.addPage();
      y=47;
    }
  }
  function font(size,bold=false,color=ink){
    d.setFont('helvetica',bold?'bold':'normal');
    d.setFontSize(size);
    d.setTextColor(...color);
  }
  function paragraph(text,{size=9.5,bold=false,color=ink,indent=0,after=7,leading=13,center=false}={}){
    font(size,bold,color);
    const textWidth=usable-indent;
    const wrapped=d.splitTextToSize(String(text||' '),textWidth);
    const needed=wrapped.length*leading+after;
    pageCheck(needed);
    wrapped.forEach((line,i)=>{
      const x=center?(W-d.getTextWidth(line))/2:L+indent;
      d.text(line,x,y+i*leading);
    });
    y+=needed;
  }
  function heading(title){
    pageCheck(33);
    y+=9;
    font(10.2,true,blue);
    d.text(title,L,y);
    y+=5;
    d.setDrawColor(...blue);
    d.setLineWidth(0.8);
    d.line(L,y,W-R,y);
    y+=14;
  }
  function bullet(text){
    font(9.4,false,ink);
    const wrapped=d.splitTextToSize(String(text||''),usable-19);
    pageCheck(wrapped.length*12.7+4);
    d.setFillColor(...ink);
    d.circle(L+4,y-3,1.45,'F');
    wrapped.forEach((line,i)=>d.text(line,L+16,y+i*12.7));
    y+=wrapped.length*12.7+4;
  }

  font(19,true,blue);
  const name=String(result.name||'');
  d.text(name,W/2,y,{align:'center'});
  y+=19;
  paragraph(result.contact,{size:9,color:muted,center:true,after:8,leading:11});
  heading('PROFESSIONAL SUMMARY');
  paragraph(result.summary,{after:2});
  heading('CORE SKILLS & COMPETENCIES');
  paragraph((result.skills||[]).join('  •  '),{after:1});
  heading('PROFESSIONAL EXPERIENCE');

  for(const x of result.experience||[]){
    const title=[x.title,x.employer].filter(Boolean).join(' — ');
    pageCheck(45);
    paragraph(title,{size:10.2,bold:true,after:3,leading:13});
    paragraph([x.dates,x.location].filter(Boolean).join('  '),{
      size:8.7,color:muted,after:6,leading:11
    });
    for(const b of x.bullets||[])bullet(b);
    y+=5;
  }

  if(result.education?.length){
    heading('EDUCATION');
    for(const e of result.education)paragraph(e,{after:4});
  }
  if(result.additional?.length){
    heading('ADDITIONAL INFORMATION');
    for(const e of result.additional)paragraph(e,{after:4});
  }
  d.save('tailored-resume-'+activeTemplate+'.pdf');
};

$('docx').onclick=async()=>{
  if(!result)return;
  const children=lines().map(l=>new Paragraph({
    heading:l.type==='head'?HeadingLevel.HEADING_2:undefined,
    spacing:{after:l.type==='head'?110:65},
    children:[new TextRun({
      text:l.t||' ',
      bold:['name','head','job'].includes(l.type),
      size:l.type==='name'?32:l.type==='head'?21:20,
      color:['name','head'].includes(l.type)?'194E7A':'253040'
    })]
  }));
  const doc=new Document({sections:[{properties:{},children}]});
  const blob=await Packer.toBlob(doc);
  download(blob,'tailored-resume.docx');
};

function download(blob,name){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}

// Optional, browser-only tools. None of these actions contact Groq.
$('template').onchange=e=>{
  activeTemplate=e.target.value;
  renderPreview();
};
$('length').onchange=()=>renderPreview();

function keywords(text){
  const stop=new Set('the and for with from this that your you will are our have has can must should work job role team plus able using about into through when while they them their than other all not but any per day who how what where including required preferred experience skills responsibilities qualifications candidate position ability strong excellent good effective high level knowledge understanding support ensure maintain manage perform provide services service company customer customers tasks duties years year minimum maximum'.split(' '));
  const counts=new Map();
  (text.toLowerCase().match(/[a-z][a-z0-9+#-]{2,}/g)||[]).forEach(w=>{
    if(!stop.has(w))counts.set(w,(counts.get(w)||0)+1);
  });
  return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,22).map(x=>x[0]);
}

function renderKeywords(){
  if(!result)return;
  const job=$('job').value;
  const resume=[
    result.summary,
    ...(result.skills||[]),
    ...(result.experience||[]).flatMap(x=>[x.title,...(x.bullets||[])]),
    ...(result.education||[])
  ].join(' ').toLowerCase();

  $('keywords').innerHTML=keywords(job).map(w=>
    `<span class="keyword ${
      new RegExp('\\b'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(resume)
        ? 'matched'
        : 'unmatched'
    }">${esc(w)} ${resume.includes(w)?'✓':'·'}</span>`
  ).join('')||'<p class="hint">Paste a job description to see keywords.</p>';
}

const storageKey='resume-tailor-cloud-v12-versions';

function saved(){
  try{
    const x=JSON.parse(localStorage.getItem(storageKey)||'[]');
    return Array.isArray(x)?x:[];
  }catch{
    return [];
  }
}

function store(v){
  try{
    localStorage.setItem(storageKey,JSON.stringify(v));
    return true;
  }catch{
    alert('Browser storage is full or disabled. Export your versions as a backup.');
    return false;
  }
}

$('saveVersion').onclick=()=>{
  if(!result)return;
  const name=prompt(
    'Name this version (for example: Grocery Pickup — Target):',
    result.experience?.[0]?.title||'Tailored résumé'
  );
  if(!name)return;

  let v=saved();
  const id=currentVersionId||String(Date.now());
  v=v.filter(x=>x.id!==id);
  v.unshift({
    id,
    name:name.slice(0,120),
    savedAt:new Date().toISOString(),
    result:structuredClone(result),
    job:$('job').value,
    template:activeTemplate,
    cover:$('coverText').value
  });

  if(store(v.slice(0,30))){
    currentVersionId=id;
    alert('Saved in this browser. Export a backup to protect against browser data loss.');
  }
};

$('restoreVersion').onclick=()=>{
  const pane=$('versions');
  pane.classList.toggle('hidden');
  pane.innerHTML=saved().map(x=>`
    <div class="version-item">
      <div>
        <strong>${esc(x.name)}</strong>
        <small>${esc(new Date(x.savedAt).toLocaleString())}</small>
      </div>
      <button class="secondary" data-load="${esc(x.id)}">Load</button>
      <button class="secondary" data-delete="${esc(x.id)}">Delete</button>
    </div>
  `).join('')||'<p>No saved versions yet.</p>';

  pane.querySelectorAll('[data-load]').forEach(b=>{
    b.onclick=()=>{
      const x=saved().find(v=>v.id===b.dataset.load);
      if(!x)return;
      result=structuredClone(x.result);
      currentVersionId=x.id;
      $('job').value=x.job||'';
      activeTemplate=x.template||'modern';
      $('template').value=activeTemplate;
      $('coverText').value=x.cover||'';
      $('results').classList.remove('hidden');
      renderEditor();
      pane.classList.add('hidden');
    };
  });

  pane.querySelectorAll('[data-delete]').forEach(b=>{
    b.onclick=()=>{
      if(confirm('Delete this saved version?')){
        store(saved().filter(v=>v.id!==b.dataset.delete));
        pane.classList.add('hidden');
        $('restoreVersion').click();
      }
    };
  });
};

$('backupVersions').onclick=()=>download(
  new Blob([
    JSON.stringify({
      format:'resume-tailor-cloud-v1.2',
      versions:saved()
    },null,2)
  ],{type:'application/json'}),
  'resume-tailor-backup.json'
);

$('importVersions').onchange=async e=>{
  const f=e.target.files?.[0];
  if(!f)return;
  try{
    const obj=JSON.parse(await f.text());
    if(!Array.isArray(obj.versions)||obj.format!=='resume-tailor-cloud-v1.2'){
      throw Error('Not a valid v1.2 backup');
    }
    const valid=obj.versions.filter(
      x=>x&&typeof x.name==='string'&&x.result&&Array.isArray(x.result.experience)
    );
    if(store(
      [...valid,...saved()]
        .filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i)
        .slice(0,30)
    )){
      alert('Imported '+valid.length+' versions.');
    }
  }catch(err){
    alert('Import failed: '+err.message);
  }
  e.target.value='';
};

$('coverGenerate').onclick=async()=>{
  if(!result)return;
  const b=$('coverGenerate');
  b.disabled=true;
  $('coverStatus').textContent='Generating cover letter…';
  try{
    const r=await fetch('/api/cover-letter',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        resume:result,
        job:$('job').value
      })
    });
    const data=await r.json();
    if(!r.ok)throw Error(data.error||'Request failed');
    $('coverText').value=data.letter;
    $('coverStatus').textContent='Generated. Review and edit before using.';
  }catch(e){
    $('coverStatus').textContent='Error: '+e.message;
  }finally{
    b.disabled=false;
  }
};

$('coverDownload').onclick=async()=>{
  const txt=$('coverText').value.trim();
  if(!txt)return alert('Write or generate a cover letter first.');
  const paragraphs=txt.split(/\n+/).map(x=>new Paragraph({
    spacing:{after:180},
    children:[new TextRun({text:x,size:22})]
  }));
  const doc=new Document({
    sections:[{properties:{},children:paragraphs}]
  });
  download(await Packer.toBlob(doc),'cover-letter.docx');
};

$('print').onclick=()=>window.print();
