let exams=[];
let studentSession=null;
const VIEW_IDS=new Set(['inicio','calendario','boletim','lancamento','senha']);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const menuButton=document.querySelector('.menu-toggle');
const menu=document.querySelector('.main-nav');
const navBackdrop=document.querySelector('#nav-backdrop');
const examList=document.querySelector('#exam-list');
const filter=document.querySelector('#discipline-filter');
const reportCard=document.querySelector('#report-card');
const studentEntryPanel=document.querySelector('#student-entry-panel');
const studentEntryForm=document.querySelector('#student-entry-form');
const studentEntryTable=document.querySelector('#student-entry-table');
const studentEntryMessage=document.querySelector('#student-entry-message');
const studentPasswordPanel=document.querySelector('#student-password-panel');
const studentPasswordForm=document.querySelector('#student-password-form');
const newPassword=document.querySelector('#student-new-password');
const confirmPassword=document.querySelector('#student-confirm-password');
const matchIndicator=document.querySelector('#password-match-indicator');
const passwordSubmit=document.querySelector('#student-password-submit');
const showPasswords=document.querySelector('#show-student-passwords');
const gradesGuests=[...document.querySelectorAll('.grades-guest')];
const gradesAutheds=[...document.querySelectorAll('.grades-authed')];
const lancamentoEmpty=document.querySelector('#lancamento-empty');
const homeLoginPanel=document.querySelector('#home-login-panel');
const homeSessionPanel=document.querySelector('#home-session-panel');
const studentLogoutButton=document.querySelector('#student-logout-button');
const views=[...document.querySelectorAll('[data-view]')];

function closeMenu(){
  menu.classList.remove('open');
  menuButton.setAttribute('aria-expanded','false');
  menuButton.setAttribute('aria-label','Abrir menu');
  document.body.classList.remove('nav-open');
  if(navBackdrop)navBackdrop.hidden=true;
}

function openMenu(){
  menu.classList.add('open');
  menuButton.setAttribute('aria-expanded','true');
  menuButton.setAttribute('aria-label','Fechar menu');
  document.body.classList.add('nav-open');
  if(navBackdrop)navBackdrop.hidden=false;
}

function setMenuOpen(open){
  if(open)openMenu();
  else closeMenu();
}

menuButton.addEventListener('click',()=>setMenuOpen(!menu.classList.contains('open')));
if(navBackdrop)navBackdrop.addEventListener('click',closeMenu);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&menu.classList.contains('open'))closeMenu();
});

function syncStudentUi(){
  const loggedIn=Boolean(studentSession);
  gradesGuests.forEach(el=>{el.hidden=loggedIn;});
  gradesAutheds.forEach(el=>{el.hidden=!loggedIn;});
  if(homeLoginPanel)homeLoginPanel.hidden=loggedIn;
  if(homeSessionPanel)homeSessionPanel.hidden=!loggedIn;
  if(studentLogoutButton)studentLogoutButton.hidden=!loggedIn;
  document.body.classList.toggle('student-logged-in',loggedIn);
  if(lancamentoEmpty&&studentEntryPanel){
    const hasSheet=loggedIn&&!studentEntryPanel.hidden;
    lancamentoEmpty.hidden=hasSheet||!loggedIn;
  }
}

const STUDENT_VIEWS=new Set(['boletim','lancamento','senha']);

function showView(id,{updateHash=true}={}){
  const viewId=VIEW_IDS.has(id)?id:'inicio';
  views.forEach(view=>{
    const active=view.dataset.view===viewId;
    view.classList.toggle('is-active',active);
    view.hidden=!active;
  });
  menu.querySelectorAll('[data-nav]').forEach(link=>{
    link.classList.toggle('active',link.dataset.nav===viewId);
  });
  if(STUDENT_VIEWS.has(viewId))syncStudentUi();
  closeMenu();
  window.scrollTo({top:0,behavior:'auto'});
  if(updateHash){
    const nextHash=`#${viewId}`;
    if(location.hash!==nextHash)history.replaceState(null,'',nextHash);
  }
}

function viewFromHash(){
  const raw=(location.hash||'#inicio').slice(1);
  const id=raw==='notas'?'boletim':raw;
  return VIEW_IDS.has(id)?id:'inicio';
}

document.addEventListener('click',e=>{
  const link=e.target.closest('a');
  if(!link)return;
  // Administração e links externos: fecha o menu e deixa o navegador seguir.
  if(link.classList.contains('nav-admin')||link.getAttribute('href')==='admin.html'){
    closeMenu();
    return;
  }
  const id=link.dataset.nav;
  if(!id||!VIEW_IDS.has(id))return;
  e.preventDefault();
  showView(id);
});

window.addEventListener('hashchange',()=>showView(viewFromHash(),{updateHash:false}));

function dateParts(iso){
  const d=new Date(`${iso}T12:00:00`);
  return{day:String(d.getDate()).padStart(2,'0'),month:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.','')};
}

function renderExams(subject='todas'){
  const items=subject==='todas'?exams:exams.filter(x=>x.subject===subject);
  examList.innerHTML=items.length?items.map(x=>{
    const d=dateParts(x.date);
    return`<article class="exam-card"><div class="exam-date"><strong>${d.day}</strong><span>${d.month}</span></div><div class="exam-details"><h3>${esc(x.subject)}</h3><p>${esc(x.time)} • ${esc(x.place)}</p></div><span class="exam-type">${esc(x.type)}</span></article>`;
  }).join(''):'<p class="empty-state">Nenhuma prova cadastrada.</p>';
}

async function loadExams(){
  try{
    exams=await(await fetch('/api/exams')).json();
    filter.innerHTML='<option value="todas">Todas</option>';
    [...new Set(exams.map(x=>x.subject))].sort().forEach(s=>{
      const o=document.createElement('option');
      o.value=o.textContent=s;
      filter.append(o);
    });
    renderExams();
  }catch{
    examList.innerHTML='<p class="empty-state">Inicie o servidor para carregar o calendário.</p>';
  }
}
filter.addEventListener('change',e=>renderExams(e.target.value));
loadExams();

document.querySelector('#toggle-password').addEventListener('click',e=>{
  const input=document.querySelector('#access-code');
  const show=input.type==='password';
  input.type=show?'text':'password';
  e.currentTarget.textContent=show?'Ocultar':'Mostrar';
});

function updatePasswordMatch(){
  const password=newPassword.value,confirmation=confirmPassword.value;
  let state='empty',text='Confirme a senha.',symbol='•';
  if(password&&password.length<8){state='different';text='Mínimo de 8 caracteres.';symbol='!';}
  else if(confirmation&&password===confirmation){state='identical';text='Senhas iguais.';symbol='✓';}
  else if(confirmation){state='different';text='Senhas diferentes.';symbol='×';}
  matchIndicator.dataset.state=state;
  matchIndicator.innerHTML=`<span aria-hidden="true">${symbol}</span> ${text}`;
  passwordSubmit.disabled=state!=='identical';
}
newPassword.addEventListener('input',updatePasswordMatch);
confirmPassword.addEventListener('input',updatePasswordMatch);
showPasswords.addEventListener('change',()=>{
  const type=showPasswords.checked?'text':'password';
  newPassword.type=confirmPassword.type=type;
});

studentPasswordForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const message=studentPasswordForm.querySelector('.form-message');
  const password=newPassword.value,confirmation=confirmPassword.value;
  if(password!==confirmation){updatePasswordMatch();return;}
  try{
    const response=await fetch('/api/student/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,confirmation})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Não foi possível alterar a senha.');
    message.textContent='Senha alterada com sucesso.';
    studentPasswordForm.reset();
    showPasswords.checked=false;
    newPassword.type=confirmPassword.type='password';
    updatePasswordMatch();
  }catch(error){
    message.textContent=error.message;
  }
});

function scoreCell(apt,value){
  if(apt)return'—';
  return value==null?'—':fmt(value);
}

function renderReport(student){
  const r=student.ranking;
  const rows=student.scores.length?student.scores.map(x=>{
    const total=(x.exam1||0)+(x.exam2||0)+(x.work||0);
    const apt=x.grading_mode==='apt';
    const totalLabel=apt?esc(x.status||'—'):fmt(total);
    return{
      subject:x.subject,
      meta:`${x.hours} h/a${x.grading_mode==='taf'?' • TAF':''}`,
      exam1:scoreCell(apt,x.exam1),
      exam2:scoreCell(apt,x.exam2),
      work:scoreCell(apt,x.work),
      total:totalLabel,
    };
  }):null;

  reportCard.innerHTML=`
    <div class="report-header">
      <div>
        <h3>${esc(student.name)}</h3>
        <p>${esc(student.rank)} • Matrícula ${esc(student.id)}</p>
      </div>
      <div class="ranking-summary">
        <div><span>Colocação</span><strong>${r.position}º</strong></div>
        <div><span>Pontos</span><strong>${fmt(r.points)} / ${fmt(r.distributed)}</strong></div>
        <div><span>Média</span><strong>${fmt(r.average)}</strong></div>
      </div>
    </div>
    ${student.observation?`<div class="student-observation"><strong>Observação da administração</strong><p>${esc(student.observation)}</p></div>`:''}
    <div class="table-wrap report-table-desktop">
      <table class="grade-table">
        <thead>
          <tr>
            <th>Disciplina</th>
            <th>Prova 1 / TAF 1</th>
            <th>Prova 2 / TAF 2</th>
            <th>Trabalho / TAF 3</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows?rows.map(x=>`<tr>
              <td>${esc(x.subject)}<small class="table-sub">${esc(x.meta)}</small></td>
              <td>${x.exam1}</td>
              <td>${x.exam2}</td>
              <td>${x.work}</td>
              <td><strong>${x.total}</strong></td>
            </tr>`).join(''):'<tr><td colspan="5">Nenhuma nota lançada ainda. Use o formulário abaixo para inserir.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="report-cards-mobile" aria-label="Boletim por disciplina">
      ${rows?rows.map(x=>`<article class="score-card">
          <header>
            <h4>${esc(x.subject)}</h4>
            <small>${esc(x.meta)}</small>
          </header>
          <dl>
            <div><dt>Prova 1 / TAF 1</dt><dd>${x.exam1}</dd></div>
            <div><dt>Prova 2 / TAF 2</dt><dd>${x.exam2}</dd></div>
            <div><dt>Trabalho / TAF 3</dt><dd>${x.work}</dd></div>
            <div class="score-card-total"><dt>Total</dt><dd>${x.total}</dd></div>
          </dl>
        </article>`).join(''):'<p class="empty-state">Nenhuma nota lançada ainda. Use o formulário abaixo para inserir.</p>'}
    </div>`;
  reportCard.hidden=false;
}

function fieldValue(row,key){
  const value=row[key];
  return value==null||value===''?'':String(value);
}

function entryFieldMarkup(row,field){
  return`<label class="entry-field">
    <span>${esc(field.label)} <small>máx. ${field.max}</small></span>
    <input data-subject-id="${row.subject_id}" data-field="${field.key}" type="number" min="0" max="${field.max}" step="0.01" inputmode="decimal" value="${esc(fieldValue(row,field.key))}" aria-label="${esc(field.label)} de ${esc(row.subject)}">
  </label>`;
}

function renderEntrySheet(sheet){
  if(!sheet?.length){
    studentEntryPanel.hidden=true;
    studentEntryTable.innerHTML='';
    syncStudentUi();
    return;
  }
  const desktopRows=sheet.map(row=>{
    const fields=Object.fromEntries(row.fields.map(field=>[field.key,field]));
    const cell=key=>{
      const field=fields[key];
      if(!field)return'<td class="entry-empty">—</td>';
      return`<td>${entryFieldMarkup(row,field)}</td>`;
    };
    const title=row.grading_mode==='taf'
      ?`TAF <small class="table-sub">${esc(row.subject)} • 3 avaliações</small>`
      :`${esc(row.subject)} <small class="table-sub">2 provas + trabalho</small>`;
    return`<tr data-subject-id="${row.subject_id}">
      <td><strong>${title}</strong></td>
      ${cell('exam1')}
      ${cell('exam2')}
      ${cell('work')}
    </tr>`;
  }).join('');

  const mobileCards=sheet.map(row=>{
    const title=row.grading_mode==='taf'
      ?`TAF • ${esc(row.subject)}`
      :esc(row.subject);
    const subtitle=row.grading_mode==='taf'?'3 avaliações':'2 provas + trabalho';
    return`<article class="entry-card" data-subject-id="${row.subject_id}">
      <header>
        <h4>${title}</h4>
        <small>${subtitle}</small>
      </header>
      <div class="entry-card-fields">
        ${row.fields.map(field=>entryFieldMarkup(row,field)).join('')}
      </div>
    </article>`;
  }).join('');

  studentEntryTable.innerHTML=`
    <div class="table-wrap entry-table-desktop">
      <table class="grade-table student-entry-grid">
        <thead>
          <tr>
            <th>Disciplina</th>
            <th>Prova 1 / TAF 1</th>
            <th>Prova 2 / TAF 2</th>
            <th>Trabalho / TAF 3</th>
          </tr>
        </thead>
        <tbody>${desktopRows}</tbody>
      </table>
    </div>
    <div class="entry-cards-mobile">${mobileCards}</div>`;
  studentEntryPanel.hidden=false;
  syncStudentUi();
}

function collectEntryPayload(){
  const bySubject=new Map();
  const mobileRoot=studentEntryTable.querySelector('.entry-cards-mobile');
  const desktopRoot=studentEntryTable.querySelector('.entry-table-desktop');
  const useMobile=mobileRoot&&getComputedStyle(mobileRoot).display!=='none';
  const root=useMobile?mobileRoot:(desktopRoot||studentEntryTable);
  root.querySelectorAll('[data-subject-id][data-field]').forEach(input=>{
    const subjectId=input.dataset.subjectId;
    if(!bySubject.has(subjectId))bySubject.set(subjectId,{subject_id:subjectId});
    bySubject.get(subjectId)[input.dataset.field]=input.value;
  });
  return[...bySubject.values()];
}

function clearStudentSessionUi(messageText=''){
  studentSession=null;
  reportCard.innerHTML='';
  reportCard.hidden=true;
  studentEntryPanel.hidden=true;
  studentEntryTable.innerHTML='';
  studentEntryMessage.textContent='';
  studentPasswordForm.reset();
  updatePasswordMatch();
  document.querySelector('#access-code').value='';
  document.querySelector('#form-message').textContent=messageText;
  syncStudentUi();
}

studentLogoutButton.addEventListener('click',async()=>{
  try{
    await fetch('/api/student/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  }finally{
    clearStudentSessionUi('Sessão encerrada com segurança.');
    showView('inicio');
  }
});

studentEntryForm.addEventListener('submit',async e=>{
  e.preventDefault();
  const button=document.querySelector('#student-entry-submit');
  const entries=collectEntryPayload();
  if(!entries.length){
    studentEntryMessage.textContent='Nenhuma disciplina disponível para lançamento.';
    return;
  }
  const originalLabel=button.textContent;
  const controls=[...studentEntryForm.querySelectorAll('input,button')];
  controls.forEach(control=>control.disabled=true);
  studentEntryForm.setAttribute('aria-busy','true');
  studentEntryPanel.classList.add('is-saving');
  button.textContent='Salvando...';
  studentEntryMessage.textContent='Salvando suas notas...';
  try{
    const response=await fetch('/api/student/scores',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({entries}),
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Não foi possível salvar suas notas.');
    if(studentSession){
      studentSession.scores=data.scores||[];
      studentSession.entry_sheet=data.entry_sheet||[];
      if(data.ranking)studentSession.ranking=data.ranking;
      renderReport(studentSession);
    }
    renderEntrySheet(data.entry_sheet);
    studentEntryMessage.classList.remove('is-error');
    studentEntryMessage.textContent=`Salvo (${data.saved} disciplina(s)).`;
  }catch(error){
    studentEntryMessage.classList.add('is-error');
    studentEntryMessage.textContent=error.message;
  }finally{
    controls.forEach(control=>control.disabled=false);
    studentEntryForm.removeAttribute('aria-busy');
    studentEntryPanel.classList.remove('is-saving');
    button.textContent=originalLabel;
  }
});

document.querySelector('#grade-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const id=document.querySelector('#student-id').value.trim();
  const code=document.querySelector('#access-code').value;
  const message=document.querySelector('#form-message');
  try{
    const response=await fetch('/api/grades',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id,code}),
    });
    if(!response.ok)throw 0;
    const student=await response.json();
    studentSession=student;
    message.textContent='';
    renderReport(student);
    renderEntrySheet(student.entry_sheet||[]);
    studentEntryMessage.textContent='';
    syncStudentUi();
    showView(student.must_change_password?'senha':'boletim');
  }catch{
    message.textContent='Matrícula ou código de acesso inválido.';
    clearStudentSessionUi('Matrícula ou código de acesso inválido.');
  }
});

document.querySelector('#current-year').textContent=new Date().getFullYear();
showView(viewFromHash(),{updateHash:false});
syncStudentUi();
