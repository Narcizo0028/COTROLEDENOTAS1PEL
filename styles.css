let exams=[];
let studentSession=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const menuButton=document.querySelector('.menu-toggle');
const menu=document.querySelector('.main-nav');
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

menuButton.addEventListener('click',()=>{
  const open=menu.classList.toggle('open');
  menuButton.setAttribute('aria-expanded',String(open));
  menuButton.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');
});
menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{
  menu.classList.remove('open');
  menuButton.setAttribute('aria-expanded','false');
}));

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
    filter.innerHTML='<option value="todas">Todas as disciplinas</option>';
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
  let state='empty',text='Aguardando a confirmação da senha.',symbol='•';
  if(password&&password.length<8){state='different';text='A nova senha precisa ter pelo menos 8 caracteres.';symbol='!';}
  else if(confirmation&&password===confirmation){state='identical';text='As senhas estão idênticas.';symbol='✓';}
  else if(confirmation){state='different';text='As senhas estão diferentes.';symbol='×';}
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
new MutationObserver(()=>{studentPasswordPanel.hidden=reportCard.hidden;}).observe(reportCard,{attributes:true,attributeFilter:['hidden']});

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

function renderReport(student){
  const r=student.ranking;
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
    <div class="table-wrap">
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
          ${student.scores.length?student.scores.map(x=>{
            const total=(x.exam1||0)+(x.exam2||0)+(x.work||0);
            const apt=x.grading_mode==='apt';
            return`<tr>
              <td>${esc(x.subject)}<small class="table-sub">${x.hours} h/a${x.grading_mode==='taf'?' • TAF':''}</small></td>
              <td>${apt?'—':x.exam1==null?'—':fmt(x.exam1)}</td>
              <td>${apt?'—':x.exam2==null?'—':fmt(x.exam2)}</td>
              <td>${apt?'—':x.work==null?'—':fmt(x.work)}</td>
              <td><strong>${apt?esc(x.status||'—'):fmt(total)}</strong></td>
            </tr>`;
          }).join(''):'<tr><td colspan="5">Nenhuma nota lançada ainda. Use o formulário abaixo para inserir.</td></tr>'}
        </tbody>
      </table>
    </div>`;
  reportCard.hidden=false;
}

function fieldValue(row,key){
  const value=row[key];
  return value==null||value===''?'':String(value);
}

function renderEntrySheet(sheet){
  if(!sheet?.length){
    studentEntryPanel.hidden=true;
    studentEntryTable.innerHTML='';
    return;
  }
  studentEntryTable.innerHTML=`
    <div class="table-wrap">
      <table class="grade-table student-entry-grid">
        <thead>
          <tr>
            <th>Disciplina</th>
            <th>Prova 1 / TAF 1</th>
            <th>Prova 2 / TAF 2</th>
            <th>Trabalho / TAF 3</th>
          </tr>
        </thead>
        <tbody>
          ${sheet.map(row=>{
            const fields=Object.fromEntries(row.fields.map(field=>[field.key,field]));
            const cell=(key)=>{
              const field=fields[key];
              if(!field)return'<td class="entry-empty">—</td>';
              return`<td>
                <label class="entry-field">
                  <span>${esc(field.label)} <small>máx. ${field.max}</small></span>
                  <input data-subject-id="${row.subject_id}" data-field="${field.key}" type="number" min="0" max="${field.max}" step="0.01" inputmode="decimal" value="${esc(fieldValue(row,field.key))}" aria-label="${esc(field.label)} de ${esc(row.subject)}">
                </label>
              </td>`;
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
          }).join('')}
        </tbody>
      </table>
    </div>`;
  studentEntryPanel.hidden=false;
}

function collectEntryPayload(){
  const bySubject=new Map();
  studentEntryTable.querySelectorAll('[data-subject-id][data-field]').forEach(input=>{
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
  studentPasswordPanel.hidden=true;
  studentPasswordForm.reset();
  updatePasswordMatch();
  document.querySelector('#access-code').value='';
  document.querySelector('#form-message').textContent=messageText;
}

const studentLogoutButton=document.createElement('button');
studentLogoutButton.id='student-logout-button';
studentLogoutButton.type='button';
studentLogoutButton.className='button button-dark student-logout-button';
studentLogoutButton.textContent='Sair da área do aluno';
document.querySelector('.password-panel-head').append(studentLogoutButton);
studentLogoutButton.addEventListener('click',async()=>{
  try{
    await fetch('/api/student/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  }finally{
    clearStudentSessionUi('Sessão encerrada com segurança.');
    document.querySelector('#grade-form').scrollIntoView({behavior:'smooth',block:'center'});
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
  button.disabled=true;
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
    const cleared=Number(data.cleared||0);
    studentEntryMessage.textContent=cleared
      ?`${data.saved} disciplina(s) salva(s) e ${cleared} limpa(s) com sucesso.`
      :`${data.saved} disciplina(s) salva(s) com sucesso.`;
    reportCard.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){
    studentEntryMessage.textContent=error.message;
  }finally{
    button.disabled=false;
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
    studentEntryPanel.scrollIntoView({behavior:'smooth',block:'start'});
  }catch{
    message.textContent='Matrícula ou código de acesso inválido.';
    clearStudentSessionUi('Matrícula ou código de acesso inválido.');
  }
});

const navLinks=[...menu.querySelectorAll("a[href^='#']")];
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(entry.isIntersecting){
    navLinks.forEach(link=>link.classList.toggle('active',link.getAttribute('href')===`#${entry.target.id}`));
  }
}),{rootMargin:'-35% 0px -55%'});
document.querySelectorAll('main section[id]').forEach(s=>observer.observe(s));
document.querySelector('#current-year').textContent=new Date().getFullYear();
