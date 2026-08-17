/* Painel administrativo: navegação, indicadores, filtros e componentes visuais.
   As rotinas de autenticação e gravação continuam em admin.js. */
const dashboardTableStates = new Map();
const dashboardTableConfigs = new Map();
const dashboardViewTitles = {
  overview: 'Visão geral', students: 'Discentes', subjects: 'Disciplinas',
  grades: 'Lançamento de notas', authorizations: 'Autorizações', 'pdf-import': 'Importação por PDF',
  calendar: 'Calendário de avaliações', ranking: 'Ranking', reports: 'Relatórios', settings: 'Configurações'
};
let dashboardMetrics = null;
let dashboardCalendarMode = 'month';
let dashboardAuthorizationDraft = null;

function dashboardDateTime(exam) {
  const match = String(exam.time || '').match(/(\d{1,2})(?:\s*(?:h|:))\s*(\d{1,2})?/i);
  const hour = match ? Number(match[1]) : 23;
  const minute = match ? Number(match[2] || 0) : 59;
  const date = new Date(`${exam.date}T00:00:00`);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function dashboardSubjectFields(subject) {
  if (subject.grading_mode === 'apt') return [{ key: 'status', label: 'Resultado' }];
  if (subject.grading_mode === 'taf') return [{ key: 'exam1', label: '1º TAF', max: 3 }, { key: 'exam2', label: '2º TAF', max: 3 }, { key: 'work', label: '3º TAF', max: 4 }];
  if (Number(subject.exam_count) === 1) return [{ key: 'exam2', label: 'AVF', max: 7 }, { key: 'work', label: 'Trabalho', max: 3 }];
  return [{ key: 'exam1', label: 'AVC', max: 3 }, { key: 'exam2', label: 'AVF', max: 4 }, { key: 'work', label: 'Trabalho', max: 3 }];
}

function dashboardScoreComplete(score, subject) {
  if (!score || !subject) return false;
  return dashboardSubjectFields(subject).every(field => field.key === 'status' ? Boolean(score.status) : score[field.key] !== null && score[field.key] !== undefined && score[field.key] !== '');
}

function dashboardScoreErrors(score, subject) {
  if (!score || !subject) return [];
  const errors = [];
  dashboardSubjectFields(subject).forEach(field => {
    const value = score[field.key];
    if (field.key === 'status') {
      if (value && !['Apto', 'Inapto'].includes(value)) errors.push('Resultado qualitativo inválido');
    } else if (value !== null && value !== undefined && value !== '' && (Number(value) < 0 || Number(value) > field.max)) {
      errors.push(`${field.label} acima do máximo`);
    }
  });
  return errors;
}

function dashboardBuildMetrics() {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 86400000);
  const subjectsById = new Map(cache.subjects.map(subject => [String(subject.id), subject]));
  const studentsById = new Map(cache.students.map(student => [String(student.id), student]));
  const scoresByPair = new Map();
  const duplicatePairs = [];
  let launchedComponents = 0;
  let invalidScores = 0;
  let completeScores = 0;
  cache.scores.forEach(score => {
    const key = `${score.student_id}:${score.subject_id}`;
    if (scoresByPair.has(key)) duplicatePairs.push(key);
    scoresByPair.set(key, score);
    const subject = subjectsById.get(String(score.subject_id));
    const fields = dashboardSubjectFields(subject || score);
    launchedComponents += fields.filter(field => field.key === 'status' ? Boolean(score.status) : score[field.key] !== null && score[field.key] !== undefined && score[field.key] !== '').length;
    invalidScores += dashboardScoreErrors(score, subject).length;
    if (dashboardScoreComplete(score, subject)) completeScores += 1;
  });
  const expectedComponents = cache.students.length * cache.subjects.reduce((total, subject) => total + dashboardSubjectFields(subject).length, 0);
  const subjectProgress = cache.subjects.map(subject => {
    const rows = cache.students.map(student => scoresByPair.get(`${student.id}:${subject.id}`)).filter(Boolean);
    const complete = rows.filter(row => dashboardScoreComplete(row, subject)).length;
    return { subject, launched: rows.length, complete, pending: Math.max(0, cache.students.length - complete) };
  });
  const studentProgress = cache.students.map(student => {
    const rows = cache.scores.filter(score => String(score.student_id) === String(student.id));
    const complete = rows.filter(row => dashboardScoreComplete(row, subjectsById.get(String(row.subject_id)))).length;
    return { student, launched: rows.length, complete, pending: Math.max(0, cache.subjects.length - complete) };
  });
  const realized = cache.exams.filter(exam => dashboardDateTime(exam) < now);
  const upcoming = cache.exams.filter(exam => { const date = dashboardDateTime(exam); return date >= now; });
  const upcomingSeven = upcoming.filter(exam => dashboardDateTime(exam) <= nextWeek);
  const releasedSubjects = cache.student_entry_enabled ? (cache.student_subject_restriction?.enabled ? 1 : cache.subjects.length) : 0;
  const incompleteExamSubjects = new Set(cache.exams.filter(exam => {
    const subject = cache.subjects.find(item => item.name === exam.subject);
    if (!subject || dashboardDateTime(exam) > now) return false;
    return subjectProgress.find(item => String(item.subject.id) === String(subject.id))?.pending > 0;
  }).map(exam => exam.subject));
  return {
    now, subjectsById, studentsById, scoresByPair, subjectProgress, studentProgress,
    expectedComponents, launchedComponents, pendingComponents: Math.max(0, expectedComponents - launchedComponents),
    completeScores, invalidScores, duplicatePairs, realized, upcoming, upcomingSeven,
    releasedSubjects, incompleteExamSubjects,
    subjectsWithoutScores: subjectProgress.filter(item => item.launched === 0),
    studentsWithoutScores: studentProgress.filter(item => item.launched === 0),
    divergenceCount: invalidScores + duplicatePairs.length
  };
}

function dashboardActivateView(view, focusSelector = '') {
  const target = dashboardViewTitles[view] ? view : 'overview';
  document.querySelectorAll('.admin-nav-item[data-admin-view]').forEach(button => button.classList.toggle('active', button.dataset.adminView === target));
  document.querySelectorAll('.admin-view').forEach(section => {
    const sectionView = section.dataset.view;
    const active = sectionView === target || (target === 'grades' && ['authorizations', 'pdf-import'].includes(sectionView));
    section.hidden = !active;
    section.classList.toggle('active', active);
  });
  $('#admin-page-title').textContent = dashboardViewTitles[target];
  history.replaceState(null, '', `#${target}`);
  localStorage.setItem('efas-admin-view', target);
  dashboardCloseMobileMenu();
  if (target === 'calendar') dashboardRenderCalendar();
  if (target === 'grades') dashboardRenderAuthorization();
  if (focusSelector) requestAnimationFrame(() => document.querySelector(focusSelector)?.focus());
  window.scrollTo({ top: 0, behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth' });
}

function dashboardCloseMobileMenu() {
  $('#dashboard').classList.remove('mobile-menu-open');
  $('#admin-mobile-overlay').hidden = true;
  $('#admin-menu-toggle').setAttribute('aria-expanded', window.innerWidth > 960 ? String(!$('#dashboard').classList.contains('sidebar-collapsed')) : 'false');
}

function dashboardToggleMenu() {
  if (window.innerWidth <= 960) {
    const open = !$('#dashboard').classList.contains('mobile-menu-open');
    $('#dashboard').classList.toggle('mobile-menu-open', open);
    $('#admin-mobile-overlay').hidden = !open;
    $('#admin-menu-toggle').setAttribute('aria-expanded', String(open));
    return;
  }
  const collapsed = !$('#dashboard').classList.contains('sidebar-collapsed');
  $('#dashboard').classList.toggle('sidebar-collapsed', collapsed);
  $('#admin-menu-toggle').setAttribute('aria-expanded', String(!collapsed));
  localStorage.setItem('efas-admin-sidebar-collapsed', String(collapsed));
}

function dashboardTableText(value) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = String(value ?? '');
  return wrapper.textContent.trim();
}

function dashboardCsvDownload(filename, rows, columns) {
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const content = [columns.map(column => quote(column.label)).join(';'), ...rows.map(row => columns.map(column => quote(column.export ? column.export(row) : column.value ? column.value(row) : dashboardTableText(column.render ? column.render(row) : row[column.key]))).join(';'))].join('\r\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dashboardRenderTable(config) {
  const container = typeof config.container === 'string' ? $(config.container) : config.container;
  if (!container) return;
  dashboardTableConfigs.set(config.id, config);
  const state = dashboardTableStates.get(config.id) || { search: '', filters: {}, sortKey: config.defaultSort || '', sortDirection: 'asc', page: 1, pageSize: config.pageSize || 10 };
  dashboardTableStates.set(config.id, state);
  const search = state.search.toLocaleLowerCase('pt-BR');
  let rows = [...config.rows].filter(row => {
    const haystack = (config.searchFields || config.columns.map(column => column.key)).map(field => typeof field === 'function' ? field(row) : row[field]).join(' ').toLocaleLowerCase('pt-BR');
    if (search && !haystack.includes(search)) return false;
    return (config.filters || []).every(filter => !state.filters[filter.key] || String(filter.value ? filter.value(row) : row[filter.key]) === String(state.filters[filter.key]));
  });
  const sortColumn = config.columns.find(column => column.key === state.sortKey);
  if (sortColumn) {
    rows.sort((a, b) => {
      const left = sortColumn.value ? sortColumn.value(a) : a[sortColumn.key];
      const right = sortColumn.value ? sortColumn.value(b) : b[sortColumn.key];
      const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left ?? '').localeCompare(String(right ?? ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
      return state.sortDirection === 'desc' ? -result : result;
    });
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const pageRows = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
  const filterOptions = (config.filters || []).map(filter => {
    const source = filter.options || [...new Set(config.rows.map(row => filter.value ? filter.value(row) : row[filter.key]).filter(value => value !== null && value !== undefined && value !== ''))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));
    return `<label class="table-filter"><span class="sr-only">${esc(filter.label)}</span><select data-table-filter="${esc(filter.key)}"><option value="">${esc(filter.label)}: todos</option>${source.map(option => { const value = typeof option === 'object' ? option.value : option; const label = typeof option === 'object' ? option.label : option; return `<option value="${esc(value)}"${String(state.filters[filter.key] || '') === String(value) ? ' selected' : ''}>${esc(label)}</option>`; }).join('')}</select></label>`;
  }).join('');
  const tags = Object.entries(state.filters).filter(([, value]) => value).map(([key, value]) => { const filter = (config.filters || []).find(item => item.key === key); return `<span class="filter-tag">${esc(filter?.label || key)}: ${esc(value)}<button type="button" data-remove-filter="${esc(key)}" aria-label="Remover filtro ${esc(filter?.label || key)}">×</button></span>`; }).join('');
  const empty = `<div class="empty-state"><div><strong>Nenhum registro encontrado</strong><p>Ajuste a pesquisa ou limpe os filtros aplicados.</p></div></div>`;
  container.innerHTML = `<div class="data-table-component" data-table-id="${esc(config.id)}"><div class="table-toolbar"><label class="table-search"><span class="sr-only">Pesquisar nesta tabela</span><input type="search" data-table-search placeholder="${esc(config.searchPlaceholder || 'Pesquisar registros')}" value="${esc(state.search)}"></label><div class="table-toolbar-group">${filterOptions}<button class="button button-outline-dark button-compact" type="button" data-clear-filters>Limpar filtros</button>${config.exportable === false ? '' : '<button class="button button-dark button-compact" type="button" data-export-table>Exportar CSV</button>'}</div></div><div class="filter-tags">${tags}</div>${pageRows.length ? `<div class="admin-table-scroll"><table class="admin-data-table mobile-cards"><thead><tr>${config.columns.map(column => `<th class="${column.numeric ? 'numeric' : ''}">${column.sortable === false ? esc(column.label) : `<button type="button" data-sort-key="${esc(column.key)}">${esc(column.label)}${state.sortKey === column.key ? (state.sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}</button>`}</th>`).join('')}</tr></thead><tbody>${pageRows.map(row => `<tr>${config.columns.map(column => { const output = column.render ? column.render(row) : esc(row[column.key] ?? '—'); return `<td data-label="${esc(column.label)}" class="${column.numeric ? 'numeric' : ''}">${output}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>` : empty}<div class="table-pagination"><span>${rows.length ? `${(state.page - 1) * state.pageSize + 1}–${Math.min(state.page * state.pageSize, rows.length)} de ${rows.length}` : '0 registros'}</span><div class="pagination-controls"><button type="button" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button>${Array.from({ length: totalPages }, (_, index) => index + 1).filter(page => totalPages <= 7 || page === 1 || page === totalPages || Math.abs(page - state.page) <= 1).map(page => `<button type="button" data-page="${page}" class="${page === state.page ? 'active' : ''}">${page}</button>`).join('')}<button type="button" data-page="${state.page + 1}" ${state.page === totalPages ? 'disabled' : ''} aria-label="Próxima página">›</button></div><label class="page-size-control">Exibir<select data-page-size>${[10, 20, 50, 100].map(size => `<option value="${size}"${state.pageSize === size ? ' selected' : ''}>${size}</option>`).join('')}</select></label></div></div>`;
  const root = container.querySelector('[data-table-id]');
  root.querySelector('[data-table-search]')?.addEventListener('input', event => { state.search = event.target.value; state.page = 1; dashboardRenderTable(config); requestAnimationFrame(() => container.querySelector('[data-table-search]')?.focus()); });
  root.querySelectorAll('[data-table-filter]').forEach(select => select.addEventListener('change', event => { state.filters[event.target.dataset.tableFilter] = event.target.value; state.page = 1; dashboardRenderTable(config); }));
  root.querySelectorAll('[data-remove-filter]').forEach(button => button.addEventListener('click', () => { state.filters[button.dataset.removeFilter] = ''; state.page = 1; dashboardRenderTable(config); }));
  root.querySelector('[data-clear-filters]')?.addEventListener('click', () => { state.search = ''; state.filters = {}; state.page = 1; dashboardRenderTable(config); });
  root.querySelectorAll('[data-sort-key]').forEach(button => button.addEventListener('click', () => { const key = button.dataset.sortKey; state.sortDirection = state.sortKey === key && state.sortDirection === 'asc' ? 'desc' : 'asc'; state.sortKey = key; dashboardRenderTable(config); }));
  root.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => { if (!button.disabled) { state.page = Number(button.dataset.page); dashboardRenderTable(config); } }));
  root.querySelector('[data-page-size]')?.addEventListener('change', event => { state.pageSize = Number(event.target.value); state.page = 1; dashboardRenderTable(config); });
  root.querySelector('[data-export-table]')?.addEventListener('click', () => dashboardCsvDownload(`${config.id}-${new Date().toISOString().slice(0, 10)}.csv`, rows, config.columns.filter(column => column.export !== false)));
}

function dashboardRenderOverview() {
  dashboardMetrics = dashboardBuildMetrics();
  const cards = [
    ['students', 'Total de discentes', cache.students.length, 'Cadastros ativos no pelotão', '♙', 'students', ''],
    ['subjects', 'Total de disciplinas', cache.subjects.length, 'Componentes curriculares', '◇', 'subjects', ''],
    ['exams', 'Avaliações cadastradas', cache.exams.length, `${dashboardMetrics.realized.length} realizadas`, '◷', 'calendar', ''],
    ['realized', 'Avaliações realizadas', dashboardMetrics.realized.length, 'Com data e horário encerrados', '✓', 'calendar', 'success'],
    ['launched', 'Notas lançadas', dashboardMetrics.launchedComponents, `${dashboardMetrics.completeScores} resultados completos`, '✎', 'grades', 'success'],
    ['pending', 'Lançamentos pendentes', dashboardMetrics.pendingComponents, 'Componentes ainda não preenchidos', '!', 'grades', dashboardMetrics.pendingComponents ? 'warning' : 'success'],
    ['released', 'Disciplinas liberadas', dashboardMetrics.releasedSubjects, cache.student_entry_enabled ? 'Lançamento pelo discente disponível' : 'Lançamento pelo discente bloqueado', '✓', 'grades', cache.student_entry_enabled ? 'success' : 'danger'],
    ['upcoming', 'Próximos sete dias', dashboardMetrics.upcomingSeven.length, 'Avaliações previstas', '◷', 'calendar', dashboardMetrics.upcomingSeven.length ? 'warning' : ''],
    ['divergences', 'Divergências encontradas', dashboardMetrics.divergenceCount, 'Valores inválidos ou duplicidades', '!', 'grades', dashboardMetrics.divergenceCount ? 'danger' : 'success']
  ];
  $('#overview-cards').innerHTML = cards.map(([, label, value, detail, icon, view, tone]) => `<button class="overview-card" type="button" data-admin-view-target="${view}" data-tone="${tone}"><span class="overview-card-top"><span class="overview-card-label">${esc(label)}</span><span class="overview-card-icon" aria-hidden="true">${icon}</span></span><strong class="overview-card-value">${fmt(value).replace(',00', '')}</strong><span class="overview-card-detail">${esc(detail)}</span></button>`).join('');
  const actions = [
    ['♙', 'Cadastrar discente', 'students', '#student-form input[name=student_id]'], ['◇', 'Cadastrar disciplina', 'subjects', '#subject-form input[name=name]'],
    ['▦', 'Lançar por disciplina', 'grades', '#collective-subject'], ['✎', 'Lançar por discente', 'grades', '#score-student'],
    ['✓', 'Liberar disciplina', 'grades', '#student-subject-restriction-enabled'], ['◷', 'Cadastrar avaliação', 'calendar', '#exam-form input[name=date]'],
    ['⇩', 'Importar notas por PDF', 'grades', '#pdf-score-student'], ['⇩', 'Importar calendário por PDF', 'calendar', '#calendar-pdf'],
    ['▤', 'Gerar relatório administrativo', 'reports', ''], ['#', 'Consultar ranking', 'ranking', '']
  ];
  $('#quick-actions').innerHTML = actions.map(([icon, label, view, focus]) => `<button class="quick-action" type="button" data-admin-view-target="${view}" data-focus-target="${esc(focus)}"><span aria-hidden="true">${icon}</span><strong>${esc(label)}</strong></button>`).join('');
  const pending = [
    [dashboardMetrics.subjectsWithoutScores.length, 'Disciplinas sem notas lançadas', 'Nenhum resultado cadastrado', 'Ver disciplina', 'subjects', 'warning'],
    [dashboardMetrics.studentsWithoutScores.length, 'Discentes sem nota', 'Nenhum lançamento encontrado', 'Ver discente', 'students', 'warning'],
    [dashboardMetrics.incompleteExamSubjects.size, 'Avaliações com lançamento incompleto', 'Avaliações realizadas com pendências', 'Completar lançamento', 'grades', 'warning'],
    [dashboardMetrics.invalidScores, 'Notas acima do valor máximo', 'Registros que precisam ser corrigidos', 'Corrigir', 'grades', 'danger'],
    [dashboardMetrics.duplicatePairs.length, 'Possíveis duplicidades', 'Matrícula e disciplina repetidas', 'Conferir', 'grades', 'danger'],
    [dashboardMetrics.releasedSubjects, 'Disciplinas liberadas para lançamento', cache.student_entry_enabled ? 'Autorização ativa' : 'Nenhuma autorização ativa', cache.student_entry_enabled ? 'Revogar autorização' : 'Configurar', 'grades', cache.student_entry_enabled ? 'warning' : ''],
    [dashboardMetrics.upcomingSeven.length, 'Avaliações próximas', 'Previstas nos próximos sete dias', 'Ver calendário', 'calendar', '']
  ].filter(([count]) => count > 0);
  $('#pending-list').innerHTML = pending.length ? pending.map(([count, title, detail, action, view, tone]) => `<article class="pending-item" data-tone="${tone}"><span class="pending-marker" aria-hidden="true"></span><div><strong>${count} — ${esc(title)}</strong><small>${esc(detail)}</small></div><button class="button button-outline-dark button-compact" type="button" data-admin-view-target="${view}">${esc(action)}</button></article>`).join('') : '<div class="empty-state"><div><strong>Nenhuma pendência crítica</strong><p>Os dados atuais não apresentam valores inválidos ou duplicidades.</p></div></div>';
  dashboardRenderNotifications(pending);
}

function dashboardRenderNotifications(pending) {
  const count = pending.length;
  $('#admin-notification-count').hidden = count === 0;
  $('#admin-notification-count').textContent = String(count);
  $('#admin-notifications-panel').innerHTML = `<div class="section-heading"><div><h3>Notificações</h3><p>${count ? `${count} grupo(s) requerem atenção` : 'Nenhuma pendência crítica'}</p></div></div>${pending.length ? pending.map(item => `<button class="search-result-item" type="button" data-admin-view-target="${item[4]}"><strong>${item[0]} — ${esc(item[1])}</strong><small>${esc(item[2])}</small></button>`).join('') : '<div class="empty-state"><div><strong>Tudo conferido</strong><p>Não há notificações novas.</p></div></div>'}`;
}

function dashboardRenderStudents() {
  const rankings = new Map((cache.ranking || []).map(item => [String(item.id), item]));
  const rows = cache.students.map((student, index) => { const rank = rankings.get(String(student.id)) || {}; const progress = dashboardMetrics.studentProgress.find(item => String(item.student.id) === String(student.id)); return { ...student, number: index + 1, points: Number(rank.points || 0), distributed: Number(rank.distributed || 0), position: Number(rank.position || 0), complete: progress?.complete || 0, pending: progress?.pending || cache.subjects.length }; });
  if ($('#students-summary')) $('#students-summary').innerHTML = `<div class="section-heading"><div><h3>Resumo dos cadastros</h3><p>Dados atuais do pelotão</p></div></div><div class="summary-stat-list"><div class="summary-stat"><span>Total cadastrado</span><strong>${rows.length}</strong></div><div class="summary-stat"><span>Com alguma nota</span><strong>${rows.filter(row => row.distributed > 0).length}</strong></div><div class="summary-stat"><span>Sem nota</span><strong>${rows.filter(row => row.distributed === 0).length}</strong></div><div class="summary-stat"><span>Com observação</span><strong>${rows.filter(row => row.observation).length}</strong></div></div>`;
  dashboardRenderTable({ id: 'discentes', container: '#students-table', rows, defaultSort: 'name', searchPlaceholder: 'Pesquisar nome ou matrícula', searchFields: ['name', 'id', 'rank'], filters: [{ key: 'rank', label: 'Posto/graduação' }, { key: 'status', label: 'Situação', value: row => row.distributed > 0 ? 'Com notas' : 'Sem notas', options: ['Com notas', 'Sem notas'] }], columns: [
    { key: 'number', label: 'Nº', value: row => row.number, numeric: true },
    { key: 'name', label: 'Discente', value: row => row.name, render: row => `<button class="student-name-button" type="button" data-student-details="${esc(row.id)}">${esc(row.name)}</button><small>${esc(row.rank)}</small>` },
    { key: 'id', label: 'Matrícula', value: row => row.id },
    { key: 'complete', label: 'Disciplinas completas', value: row => row.complete, numeric: true },
    { key: 'points', label: 'Pontos', value: row => row.points, render: row => fmt(row.points), numeric: true },
    { key: 'status', label: 'Situação', value: row => row.distributed > 0 ? 'Com notas' : 'Sem notas', render: row => `<span class="status-badge ${row.distributed > 0 ? 'success' : 'warning'}">${row.distributed > 0 ? 'Com notas' : 'Sem notas'}</span>` },
    { key: 'actions', label: 'Ações', sortable: false, export: false, render: row => `<div class="table-actions"><button class="table-action-button" type="button" data-student-details="${esc(row.id)}" aria-label="Ver detalhes de ${esc(row.name)}">•••</button></div>` }
  ] });
}

function dashboardSubjectMode(subject) {
  if (subject.grading_mode === 'apt') return 'Apto ou Inapto';
  if (subject.grading_mode === 'taf') return 'TAF 3 + 3 + 4';
  return Number(subject.exam_count) === 1 ? 'AVF 7 + Trabalho 3' : 'AVC 3 + AVF 4 + Trabalho 3';
}

function dashboardRenderSubjects() {
  const rows = [...cache.subjects].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((subject, index) => { const progress = dashboardMetrics.subjectProgress.find(item => String(item.subject.id) === String(subject.id)); return { ...subject, number: index + 1, mode: dashboardSubjectMode(subject), launched: progress?.launched || 0, complete: progress?.complete || 0, pending: progress?.pending || cache.students.length }; });
  dashboardRenderTable({ id: 'disciplinas', container: '#subjects-table', rows, defaultSort: 'name', searchPlaceholder: 'Pesquisar disciplina', searchFields: ['name', 'mode'], filters: [{ key: 'mode', label: 'Modelo' }, { key: 'status', label: 'Lançamento', value: row => row.launched ? (row.pending ? 'Incompleto' : 'Completo') : 'Sem notas', options: ['Completo', 'Incompleto', 'Sem notas'] }], columns: [
    { key: 'number', label: 'Nº', value: row => row.number, numeric: true },
    { key: 'name', label: 'Disciplina', value: row => row.name, render: row => `<strong>${esc(row.name)}</strong>` },
    { key: 'hours', label: 'Carga horária', value: row => Number(row.hours), render: row => `${row.hours} h/a`, numeric: true },
    { key: 'mode', label: 'Regra de avaliação', value: row => row.mode },
    { key: 'complete', label: 'Completos', value: row => row.complete, numeric: true },
    { key: 'pending', label: 'Pendências', value: row => row.pending, numeric: true },
    { key: 'status', label: 'Situação', value: row => row.launched ? (row.pending ? 'Incompleto' : 'Completo') : 'Sem notas', render: row => `<span class="status-badge ${row.launched && !row.pending ? 'success' : row.launched ? 'warning' : 'neutral'}">${row.launched ? (row.pending ? 'Incompleto' : 'Completo') : 'Sem notas'}</span>` },
    { key: 'actions', label: 'Ações', sortable: false, export: false, render: row => `<button class="table-action-button" type="button" data-open-subject="${row.id}" aria-label="Lançar notas de ${esc(row.name)}">•••</button>` }
  ] });
}

function dashboardScoreRows() {
  const students = new Map(cache.students.map(student => [String(student.id), student]));
  return cache.scores.map(score => { const subject = dashboardMetrics.subjectsById.get(String(score.subject_id)); const fields = dashboardSubjectFields(subject || score); const total = fields.filter(field => field.key !== 'status').reduce((sum, field) => sum + Number(score[field.key] || 0), 0); const errors = dashboardScoreErrors(score, subject); const exam = [...cache.exams].reverse().find(item => item.subject === score.subject); return { ...score, student: students.get(String(score.student_id))?.name || score.student_id, mode: dashboardSubjectMode(subject || score), complete: dashboardScoreComplete(score, subject), errors, total, exam_date: exam?.date || '' }; });
}

function dashboardReportFilterValues() {
  return {
    student: $('#report-filter-student')?.value || '', subject: $('#report-filter-subject')?.value || '',
    type: $('#report-filter-type')?.value || '', status: $('#report-filter-status')?.value || '',
    start: $('#report-filter-start')?.value || '', end: $('#report-filter-end')?.value || ''
  };
}

function dashboardFilteredScoreRows() {
  const filters = dashboardReportFilterValues();
  return dashboardScoreRows().filter(row => {
    if (filters.student && String(row.student_id) !== filters.student) return false;
    if (filters.subject && String(row.subject_id) !== filters.subject) return false;
    if (filters.type && (row[filters.type] === null || row[filters.type] === undefined || row[filters.type] === '')) return false;
    if (filters.status === 'complete' && !row.complete) return false;
    if (filters.status === 'incomplete' && row.complete) return false;
    if (filters.start && (!row.exam_date || row.exam_date < filters.start)) return false;
    if (filters.end && (!row.exam_date || row.exam_date > filters.end)) return false;
    return true;
  });
}

function dashboardRenderScores() {
  const rows = dashboardFilteredScoreRows();
  dashboardRenderTable({ id: 'notas-lancadas', container: '#scores-data', rows, pageSize: 20, defaultSort: 'subject', searchPlaceholder: 'Pesquisar discente, matrícula ou disciplina', searchFields: ['student', 'student_id', 'subject'], filters: [{ key: 'student', label: 'Discente' }, { key: 'subject', label: 'Disciplina' }, { key: 'statusLabel', label: 'Situação', value: row => row.errors.length ? 'Divergência' : row.complete ? 'Completo' : 'Incompleto', options: ['Completo', 'Incompleto', 'Divergência'] }], columns: [
    { key: 'student', label: 'Discente', value: row => row.student, render: row => `<button class="student-name-button" type="button" data-student-details="${esc(row.student_id)}">${esc(row.student)}</button><small>${esc(row.student_id)}</small>` },
    { key: 'subject', label: 'Disciplina', value: row => row.subject },
    { key: 'exam1', label: 'AVC / 1º TAF', value: row => row.exam1 ?? '', render: row => row.grading_mode === 'apt' || row.exam1 == null ? '—' : fmt(row.exam1), numeric: true },
    { key: 'exam2', label: 'AVF / 2º TAF', value: row => row.exam2 ?? '', render: row => row.grading_mode === 'apt' || row.exam2 == null ? '—' : fmt(row.exam2), numeric: true },
    { key: 'work', label: 'Trabalho / 3º TAF', value: row => row.work ?? '', render: row => row.grading_mode === 'apt' || row.work == null ? '—' : fmt(row.work), numeric: true },
    { key: 'total', label: 'Total ou resultado', value: row => row.grading_mode === 'apt' ? row.status : row.total, render: row => `<strong>${row.grading_mode === 'apt' ? esc(row.status || '—') : fmt(row.total)}</strong>`, numeric: true },
    { key: 'statusLabel', label: 'Situação', value: row => row.errors.length ? 'Divergência' : row.complete ? 'Completo' : 'Incompleto', render: row => `<span class="status-badge ${row.errors.length ? 'danger' : row.complete ? 'success' : 'warning'}">${row.errors.length ? 'Divergência' : row.complete ? 'Completo' : 'Incompleto'}</span>` }
  ] });
}

function dashboardRenderRanking() {
  const rows = (cache.ranking || []).map(item => { const progress = dashboardMetrics.studentProgress.find(entry => String(entry.student.id) === String(item.id)); const percentage = Number(item.distributed) ? Number(item.points) / Number(item.distributed) * 100 : 0; const relatedErrors = cache.scores.filter(score => String(score.student_id) === String(item.id)).reduce((count, score) => count + dashboardScoreErrors(score, dashboardMetrics.subjectsById.get(String(score.subject_id))).length, 0); return { ...item, percentage, considered: progress?.launched || 0, divergences: relatedErrors }; });
  $('#ranking-updated-at').textContent = `Última atualização: ${cache.ranking_updated_at || 'aguardando atualização'}`;
  dashboardRenderTable({ id: 'ranking', container: '#ranking-data', rows, pageSize: 30, defaultSort: 'position', searchPlaceholder: 'Pesquisar discente ou matrícula', searchFields: ['name', 'id'], filters: [{ key: 'status', label: 'Conferência', value: row => row.divergences ? 'Com divergência' : 'Conferido', options: ['Conferido', 'Com divergência'] }], columns: [
    { key: 'position', label: 'Posição', value: row => Number(row.position), render: row => `<strong>${row.position}º</strong>`, numeric: true },
    { key: 'name', label: 'Discente', value: row => row.name, render: row => `<button class="student-name-button" type="button" data-student-details="${esc(row.id)}">${esc(row.name)}</button><small>${esc(row.id)}</small>` },
    { key: 'points', label: 'Pontos obtidos', value: row => Number(row.points), render: row => fmt(row.points), numeric: true },
    { key: 'distributed', label: 'Pontos distribuídos', value: row => Number(row.distributed), render: row => fmt(row.distributed), numeric: true },
    { key: 'percentage', label: 'Percentual', value: row => row.percentage, render: row => `${fmt(row.percentage)}%`, numeric: true },
    { key: 'considered', label: 'Disciplinas consideradas', value: row => row.considered, numeric: true },
    { key: 'divergences', label: 'Divergências', value: row => row.divergences, render: row => `<span class="status-badge ${row.divergences ? 'danger' : 'success'}">${row.divergences || 'Nenhuma'}</span>` },
    { key: 'actions', label: 'Composição', sortable: false, export: false, render: row => `<button class="button button-outline-dark button-compact" type="button" data-student-details="${esc(row.id)}">Visualizar</button>` }
  ] });
}

function dashboardGradeContext() {
  const subjectId = $('#collective-score-form').hidden ? $('#score-subject').value : $('#collective-subject').value;
  const subject = cache.subjects.find(item => String(item.id) === String(subjectId));
  if (!subject) { $('#grade-context-summary').hidden = true; return; }
  const exam = [...cache.exams].reverse().find(item => item.subject === subject.name);
  const progress = dashboardMetrics.subjectProgress.find(item => String(item.subject.id) === String(subject.id));
  const fields = dashboardSubjectFields(subject);
  const maximum = fields.filter(field => field.max).reduce((sum, field) => sum + field.max, 0);
  const items = [['Disciplina', subject.name], ['Tipo', dashboardSubjectMode(subject)], ['Valor máximo', subject.grading_mode === 'apt' ? 'Apto/Inapto' : `${maximum} pontos`], ['Data', exam?.date ? new Date(`${exam.date}T12:00:00`).toLocaleDateString('pt-BR') : 'Não cadastrada'], ['Discentes', cache.students.length], ['Situação', `${progress?.complete || 0} completos • ${progress?.pending || cache.students.length} pendentes`]];
  $('#grade-context-summary').innerHTML = items.map(([label, value]) => `<div class="grade-context-item"><span>${esc(label)}</span><strong title="${esc(value)}">${esc(value)}</strong></div>`).join('');
  $('#grade-context-summary').hidden = false;
}

function dashboardUpdateSaveSummaries() {
  const subject = cache.subjects.find(item => String(item.id) === String($('#score-subject').value));
  const studentId = $('#score-student').value;
  const existing = cache.scores.find(score => String(score.student_id) === String(studentId) && String(score.subject_id) === String(subject?.id));
  const form = $('#score-form');
  if (subject && studentId) {
    const fields = dashboardSubjectFields(subject);
    const values = fields.map(field => form.elements[field.key]?.value || '');
    const included = values.filter(Boolean).length;
    const altered = fields.filter(field => String(existing?.[field.key] ?? '') !== String(form.elements[field.key]?.value || '') && form.elements[field.key]?.value !== '').length;
    const blank = fields.length - included;
    $('#individual-save-summary').innerHTML = [['Incluídas', included], ['Alteradas', altered], ['Em branco', blank], ['Possíveis erros', 0], ['Disciplina', subject.name]].map(([label, value]) => `<div class="save-summary-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    $('#individual-save-summary').hidden = false;
  } else $('#individual-save-summary').hidden = true;
  if (!$('#collective-score-form').hidden) {
    const rows = [...$('#collective-score-table').querySelectorAll('tbody tr')];
    const inputs = rows.flatMap(row => [...row.querySelectorAll('[data-field]')]);
    const included = inputs.filter(input => input.value !== '').length;
    const altered = inputs.filter(input => input.value !== input.defaultValue).length;
    const blank = inputs.length - included;
    const errors = inputs.filter(input => input.value && input.max && Number(input.value) > Number(input.max)).length;
    $('#collective-save-summary').innerHTML = [['Incluídas', included], ['Alteradas', altered], ['Em branco', blank], ['Possíveis erros', errors], ['Disciplina', subject?.name || 'Selecione']].map(([label, value]) => `<div class="save-summary-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    $('#collective-save-summary').hidden = !subject;
  }
}

function dashboardRenderAuthorization() {
  const config = cache.student_entry_authorization || {};
  if (dashboardAuthorizationDraft === null) dashboardAuthorizationDraft = new Set((config.student_ids || []).map(String));
  const selected = dashboardAuthorizationDraft;
  const term = ($('#authorization-student-search')?.value || '').toLocaleLowerCase('pt-BR');
  const students = cache.students.filter(student => `${student.name} ${student.id}`.toLocaleLowerCase('pt-BR').includes(term));
  $('#authorization-students').innerHTML = students.length ? students.map(student => `<label class="authorization-student-option"><input type="checkbox" value="${esc(student.id)}"${selected.has(String(student.id)) ? ' checked' : ''}><span>${esc(student.name)} — ${esc(student.id)}</span></label>`).join('') : '<div class="empty-state"><div><strong>Nenhum discente encontrado</strong></div></div>';
  $('#authorization-students').querySelectorAll('input[type="checkbox"]').forEach(input => input.addEventListener('change', () => {
    if (input.checked) dashboardAuthorizationDraft.add(String(input.value));
    else dashboardAuthorizationDraft.delete(String(input.value));
  }));
  if (!$('#authorization-start').dataset.touched) $('#authorization-start').value = config.start_at || '';
  if (!$('#authorization-end').dataset.touched) $('#authorization-end').value = config.end_at || '';
  const status = !cache.student_entry_enabled ? ['Bloqueado', 'danger'] : config.active ? ['Ativo', 'success'] : ['Sem prazo específico', 'neutral'];
  $('#authorization-state-badge').textContent = status[0];
  $('#authorization-state-badge').className = `status-badge ${status[1]}`;
  const subject = cache.student_subject_restriction?.subject_name || 'Todas as disciplinas';
  const authorized = config.student_ids?.length || cache.students.length;
  const completed = cache.student_subject_restriction?.subject_id ? cache.students.filter(student => dashboardMetrics.scoresByPair.has(`${student.id}:${cache.student_subject_restriction.subject_id}`)).length : 0;
  $('#authorization-summary').innerHTML = [['Disciplina', subject], ['Autorizados', authorized], ['Lançamentos realizados', completed], ['Pendências', Math.max(0, authorized - completed)], ['Situação', status[0]]].map(([label, value]) => `<div class="authorization-summary-card"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  const history = cache.authorization_history || [];
  $('#authorization-history').innerHTML = `<div class="section-heading"><div><h3>Histórico de alterações</h3><p>Últimas configurações registradas</p></div></div>${history.length ? `<ul class="history-list">${history.map(item => `<li class="history-item"><time>${esc(item.at || '')}</time><span>${esc(item.message || item.action || '')}</span></li>`).join('')}</ul>` : '<div class="empty-state"><div><strong>Nenhuma alteração registrada</strong><p>O histórico aparecerá após a primeira configuração.</p></div></div>'}`;
}

function dashboardFilteredExams() {
  const month = $('#calendar-filter-month').value;
  const subject = $('#calendar-filter-subject').value;
  const type = $('#calendar-filter-type').value;
  const status = $('#calendar-filter-status').value;
  return cache.exams.filter(exam => {
    const date = dashboardDateTime(exam);
    if (month && !String(exam.date).startsWith(month)) return false;
    if (subject && exam.subject !== subject) return false;
    if (type && exam.type !== type) return false;
    if (status === 'upcoming' && date < dashboardMetrics.now) return false;
    if (status === 'completed' && date >= dashboardMetrics.now) return false;
    return true;
  }).sort((a, b) => dashboardDateTime(a) - dashboardDateTime(b));
}

function dashboardRenderCalendar() {
  if (!cache.exams) return;
  const subjectSelect = $('#calendar-filter-subject');
  const typeSelect = $('#calendar-filter-type');
  if (subjectSelect.options.length <= 1) subjectSelect.innerHTML = '<option value="">Todas</option>' + [...new Set(cache.exams.map(exam => exam.subject))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(value => `<option>${esc(value)}</option>`).join('');
  if (typeSelect.options.length <= 1) typeSelect.innerHTML = '<option value="">Todos</option>' + [...new Set(cache.exams.map(exam => exam.type))].sort().map(value => `<option>${esc(value)}</option>`).join('');
  if (!$('#calendar-filter-month').value) $('#calendar-filter-month').value = new Date().toISOString().slice(0, 7);
  const exams = dashboardFilteredExams();
  const selectedMonth = $('#calendar-filter-month').value || new Date().toISOString().slice(0, 7);
  const [year, month] = selectedMonth.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const start = new Date(year, month - 1, 1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  $('#calendar-month-view').innerHTML = `<div class="calendar-month-header">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => `<span>${day}</span>`).join('')}</div><div class="calendar-month-grid">${days.map(day => { const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`; const events = exams.filter(exam => exam.date === iso); const outside = day.getMonth() !== month - 1; return `<div class="calendar-day ${outside ? 'outside' : ''}"><span class="calendar-day-number">${day.getDate()}</span>${events.map(exam => `<button class="calendar-event ${dashboardDateTime(exam) < dashboardMetrics.now ? 'completed' : ''}" type="button" title="${esc(exam.subject)} — ${esc(exam.time)}">${esc(exam.time)} · ${esc(exam.subject)}</button>`).join('')}</div>`; }).join('')}</div>`;
  $('#calendar-list-view').innerHTML = exams.length ? `<div class="calendar-list">${exams.map(exam => { const date = dashboardDateTime(exam); const upcoming = date >= dashboardMetrics.now; return `<article class="calendar-list-item"><div class="calendar-list-date">${date.toLocaleDateString('pt-BR')}<small>${esc(exam.time)}</small></div><div><strong>${esc(exam.subject)}</strong><small>${esc(exam.type)} · ${esc(exam.place)}</small></div><span class="status-badge ${upcoming ? 'info' : 'neutral'}">${upcoming ? 'Próxima' : 'Realizada'}</span></article>`; }).join('')}</div>` : '<div class="empty-state"><div><strong>Nenhuma avaliação encontrada</strong><p>Ajuste os filtros ou cadastre uma avaliação.</p></div></div>';
  $('#calendar-month-view').hidden = dashboardCalendarMode !== 'month';
  $('#calendar-list-view').hidden = dashboardCalendarMode !== 'list';
  const tags = [['Mês', $('#calendar-filter-month').value], ['Disciplina', $('#calendar-filter-subject').value], ['Tipo', $('#calendar-filter-type').value], ['Situação', $('#calendar-filter-status').value]].filter(([, value]) => value);
  $('#calendar-filter-tags').innerHTML = tags.map(([label, value]) => `<span class="filter-tag">${esc(label)}: ${esc(value)}</span>`).join('');
}

function dashboardEnhanceCalendarActions() {
  const exams = dashboardFilteredExams();
  $('#calendar-list-view').querySelectorAll('.calendar-list-item').forEach((item, index) => {
    const exam = exams[index];
    if (!exam) return;
    const actions = document.createElement('div');
    actions.className = 'calendar-item-actions';
    actions.innerHTML = `<button class="button button-outline-dark button-compact" type="button" data-edit-exam="${exam.id}">Editar</button><button class="button button-danger button-compact" type="button" data-delete-exam="${exam.id}">Excluir</button>`;
    item.append(actions);
  });
}

function dashboardRenderReports() {
  const student = $('#report-filter-student'), subject = $('#report-filter-subject');
  if (student && subject) {
    const currentStudent = student.value, currentSubject = subject.value;
    student.innerHTML = '<option value="">Todos</option>' + cache.students.map(item => `<option value="${esc(item.id)}">${esc(item.name)} — ${esc(item.id)}</option>`).join('');
    subject.innerHTML = '<option value="">Todas</option>' + cache.subjects.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join('');
    student.value = currentStudent; subject.value = currentSubject;
    const values = dashboardReportFilterValues();
    const labels = [['Discente', cache.students.find(item => String(item.id) === values.student)?.name], ['Disciplina', cache.subjects.find(item => String(item.id) === values.subject)?.name], ['Tipo', values.type], ['Situação', values.status], ['Início', values.start], ['Fim', values.end]].filter(([, value]) => value);
    $('#report-filter-tags').innerHTML = labels.map(([label, value]) => `<span class="filter-tag">${esc(label)}: ${esc(value)}</span>`).join('');
  }
  const reports = [
    ['general', '▤', 'Relatório geral', 'Todas as notas encontradas pelos filtros aplicados.', 'CSV'],
    ['individual', '♙', 'Relatório individual', 'Relação de desempenho por discente.', 'CSV'],
    ['subject', '◇', 'Relatório por disciplina', 'Lançamentos agrupados por disciplina.', 'CSV'],
    ['pending', '!', 'Relatório de pendências', 'Discentes e disciplinas com lançamento incompleto.', 'CSV'],
    ['divergence', '!', 'Relatório de divergências', 'Valores acima do limite e possíveis duplicidades.', 'CSV'],
    ['ranking', '#', 'Relatório do ranking', 'Posição, pontuação, distribuição e percentual.', 'CSV'],
    ['history', '◷', 'Histórico de alterações de notas', 'Lançamentos manuais, coletivos, importados e realizados pelos discentes.', 'CSV']
  ];
  $('#report-cards').innerHTML = reports.map(([type, icon, title, description, format]) => `<article class="report-card"><span class="report-card-icon" aria-hidden="true">${icon}</span><h3>${esc(title)}</h3><p>${esc(description)}</p><button class="button button-outline-dark" type="button" data-report-type="${type}">Gerar ${format}</button></article>`).join('');
}

function dashboardRenderImports() {
  const history = cache.import_history || [];
  $('#import-history').innerHTML = history.length ? history.map(item => `<div class="import-history-row"><time>${esc(item.at || '')}</time><div><strong>${esc(item.type || 'Importação')}</strong><small>${esc(item.message || '')}</small></div><span class="status-badge ${item.status === 'success' ? 'success' : item.status === 'error' ? 'danger' : 'info'}">${esc(item.status || 'info')}</span></div>`).join('') : '<div class="empty-state"><div><strong>Nenhuma importação registrada</strong><p>O histórico será exibido após uma confirmação de notas ou calendário.</p></div></div>';
}

function dashboardRenderScoreHistory() {
  const scoreHistory = cache.score_history || [];
  $('#score-history').innerHTML = scoreHistory.length ? scoreHistory.map(item => `<div class="import-history-row"><time>${esc(item.at || '')}</time><div><strong>${esc(item.actor || 'Administrador')}</strong><small>${esc(item.message || '')}</small></div><span class="status-badge info">${esc(item.action || 'alteração')}</span></div>`).join('') : '<div class="empty-state"><div><strong>Nenhuma alteração registrada</strong><p>Os próximos lançamentos e alterações serão registrados aqui.</p></div></div>';
}

function dashboardGlobalSearch(query) {
  const value = query.trim().toLocaleLowerCase('pt-BR');
  const results = $('#admin-search-results');
  if (value.length < 2) { results.hidden = true; results.innerHTML = ''; return; }
  const items = [
    ...cache.students.filter(student => `${student.name} ${student.id} ${student.rank}`.toLocaleLowerCase('pt-BR').includes(value)).slice(0, 6).map(student => ({ title: student.name, detail: `Discente · ${student.id}`, view: 'students', studentId: student.id })),
    ...cache.subjects.filter(subject => subject.name.toLocaleLowerCase('pt-BR').includes(value)).slice(0, 6).map(subject => ({ title: subject.name, detail: 'Disciplina', view: 'subjects', subjectId: subject.id })),
    ...cache.exams.filter(exam => `${exam.subject} ${exam.type} ${exam.date}`.toLocaleLowerCase('pt-BR').includes(value)).slice(0, 6).map(exam => ({ title: exam.subject, detail: `Avaliação · ${exam.date} · ${exam.type}`, view: 'calendar' }))
  ].slice(0, 12);
  results.innerHTML = items.length ? items.map(item => `<button class="search-result-item" type="button" data-search-view="${item.view}" ${item.studentId ? `data-search-student="${esc(item.studentId)}"` : ''} ${item.subjectId ? `data-search-subject="${esc(item.subjectId)}"` : ''}><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></button>`).join('') : '<div class="empty-state"><div><strong>Nenhum resultado</strong><p>Pesquise por outro termo.</p></div></div>';
  results.hidden = false;
}

function dashboardRenderAll() {
  dashboardMetrics = dashboardBuildMetrics();
  dashboardRenderOverview();
  dashboardRenderStudents();
  dashboardRenderSubjects();
  dashboardRenderScores();
  dashboardRenderRanking();
  dashboardRenderAuthorization();
  dashboardRenderCalendar();
  dashboardEnhanceCalendarActions();
  dashboardRenderReports();
  dashboardRenderImports();
  dashboardRenderScoreHistory();
  dashboardGradeContext();
  dashboardUpdateSaveSummaries();
}

async function dashboardSaveAuthorization(action) {
  const message = $('#authorization-message');
  const subjectId = $('#student-subject-restriction-select').value;
  const studentIds = [...(dashboardAuthorizationDraft || new Set())];
  if (action === 'save' && !subjectId) { message.textContent = 'Selecione uma disciplina antes de salvar a autorização.'; $('#student-subject-restriction-select').focus(); return; }
  const confirmations = {
    save: 'Confirmar a disciplina, o prazo e os discentes autorizados?',
    block: 'Bloquear imediatamente novos lançamentos realizados pelos discentes?',
    revoke: 'Revogar a autorização atual? Os discentes não poderão realizar novos lançamentos.'
  };
  if (!window.confirm(confirmations[action])) return;
  const button = action === 'save' ? $('#authorization-save-button') : action === 'block' ? $('#authorization-block-button') : $('#authorization-revoke-button');
  button.disabled = true;
  message.textContent = 'Salvando configuração...';
  try {
    const result = await api('/api/admin/student-entry-authorization', { method: 'POST', body: JSON.stringify({ action, subject_id: subjectId || null, student_ids: studentIds, start_at: $('#authorization-start').value, end_at: $('#authorization-end').value }) });
    cache.student_entry_enabled = result.student_entry_enabled;
    cache.student_subject_restriction = result.student_subject_restriction;
    cache.student_entry_authorization = result.student_entry_authorization;
    cache.authorization_history = result.authorization_history || [];
    updateStudentEntryToggle(cache.student_entry_enabled);
    renderStudentSubjectRestriction(cache.student_subject_restriction);
    $('#authorization-start').dataset.touched = '';
    $('#authorization-end').dataset.touched = '';
    dashboardAuthorizationDraft = null;
    dashboardRenderAll();
    message.textContent = action === 'save' ? 'Autorização salva com sucesso.' : action === 'block' ? 'Novos lançamentos foram bloqueados.' : 'Autorização revogada com sucesso.';
  } catch (error) { message.textContent = error.message; } finally { button.disabled = false; }
}

function dashboardGenerateReport(type) {
  const message = $('#reports-message');
  if (type === 'general') { $('#pdf-report-button').click(); dashboardActivateView('ranking'); return; }
  let rows = [], columns = [], name = type;
  if (type === 'individual') { rows = cache.ranking || []; columns = [{ key: 'name', label: 'Discente' }, { key: 'id', label: 'Matrícula' }, { key: 'position', label: 'Posição' }, { key: 'points', label: 'Pontos' }, { key: 'distributed', label: 'Distribuídos' }, { key: 'average', label: 'Média' }]; }
  if (type === 'subject') { rows = cache.scores; columns = [{ key: 'subject', label: 'Disciplina' }, { key: 'student_id', label: 'Matrícula' }, { key: 'exam1', label: 'AVC/1º TAF' }, { key: 'exam2', label: 'AVF/2º TAF' }, { key: 'work', label: 'Trabalho/3º TAF' }, { key: 'status', label: 'Resultado' }]; }
  if (type === 'pending') { rows = dashboardMetrics.studentProgress.filter(item => item.pending).map(item => ({ name: item.student.name, id: item.student.id, pending: item.pending, complete: item.complete })); columns = [{ key: 'name', label: 'Discente' }, { key: 'id', label: 'Matrícula' }, { key: 'complete', label: 'Disciplinas completas' }, { key: 'pending', label: 'Pendências' }]; }
  if (type === 'divergence') { rows = cache.scores.flatMap(score => dashboardScoreErrors(score, dashboardMetrics.subjectsById.get(String(score.subject_id))).map(error => ({ student_id: score.student_id, subject: score.subject, error }))); columns = [{ key: 'student_id', label: 'Matrícula' }, { key: 'subject', label: 'Disciplina' }, { key: 'error', label: 'Divergência' }]; }
  if (type === 'ranking') { rows = cache.ranking || []; columns = [{ key: 'position', label: 'Posição' }, { key: 'name', label: 'Discente' }, { key: 'points', label: 'Pontos obtidos' }, { key: 'distributed', label: 'Pontos distribuídos' }, { key: 'average', label: 'Média' }]; }
  if (type === 'history') { rows = [...(cache.authorization_history || []).map(item => ({ ...item, category: 'Autorização' })), ...(cache.import_history || []).map(item => ({ ...item, category: 'Importação' }))]; columns = [{ key: 'at', label: 'Data' }, { key: 'category', label: 'Categoria' }, { key: 'message', label: 'Descrição' }]; }
  dashboardCsvDownload(`relatorio-${name}-${new Date().toISOString().slice(0, 10)}.csv`, rows, columns);
  message.textContent = `Relatório gerado com ${rows.length} registro(s).`;
}

/* Conecta o novo painel ao carregamento de dados já utilizado pelo sistema. */
dashboardGenerateReport = function filteredDashboardReport(type) {
  const message = $('#reports-message');
  const filteredScores = dashboardFilteredScoreRows();
  const filters = dashboardReportFilterValues();
  let rows = [], columns = [], name = type;
  const scoreColumns = [{ key: 'student', label: 'Discente' }, { key: 'student_id', label: 'Matrícula' }, { key: 'subject', label: 'Disciplina' }, { key: 'exam1', label: 'AVC/1º TAF' }, { key: 'exam2', label: 'AVF/2º TAF' }, { key: 'work', label: 'Trabalho/3º TAF' }, { key: 'status', label: 'Resultado' }, { key: 'total', label: 'Total' }];
  if (type === 'general' || type === 'subject') { rows = filteredScores; columns = scoreColumns; }
  if (type === 'individual') { rows = (cache.ranking || []).filter(item => !filters.student || String(item.id) === filters.student); columns = [{ key: 'name', label: 'Discente' }, { key: 'id', label: 'Matrícula' }, { key: 'position', label: 'Posição' }, { key: 'points', label: 'Pontos' }, { key: 'distributed', label: 'Distribuídos' }, { key: 'percentage', label: 'Percentual' }]; }
  if (type === 'pending') { rows = filteredScores.filter(item => !item.complete); columns = scoreColumns; }
  if (type === 'divergence') { rows = filteredScores.flatMap(score => score.errors.map(error => ({ student_id: score.student_id, subject: score.subject, error }))); columns = [{ key: 'student_id', label: 'Matrícula' }, { key: 'subject', label: 'Disciplina' }, { key: 'error', label: 'Divergência' }]; }
  if (type === 'ranking') { rows = (cache.ranking || []).filter(item => !filters.student || String(item.id) === filters.student); columns = [{ key: 'position', label: 'Posição' }, { key: 'name', label: 'Discente' }, { key: 'points', label: 'Pontos obtidos' }, { key: 'distributed', label: 'Pontos distribuídos' }, { key: 'percentage', label: 'Percentual' }]; }
  if (type === 'history') { rows = cache.score_history || []; columns = [{ key: 'at', label: 'Data' }, { key: 'actor', label: 'Responsável' }, { key: 'action', label: 'Ação' }, { key: 'message', label: 'Descrição' }]; }
  dashboardCsvDownload(`relatorio-${name}-${new Date().toISOString().slice(0, 10)}.csv`, rows, columns);
  message.textContent = `Relatório gerado com ${rows.length} registro(s) conforme os filtros aplicados.`;
};

const dashboardBaseLoadData = loadData;
loadData = async function enhancedLoadData() {
  const result = await dashboardBaseLoadData();
  dashboardAuthorizationDraft = null;
  dashboardRenderAll();
  return result;
};

document.querySelectorAll('.admin-nav-item[data-admin-view]').forEach(button => button.addEventListener('click', () => dashboardActivateView(button.dataset.adminView)));
document.addEventListener('click', event => {
  const target = event.target.closest('[data-admin-view-target]');
  if (target) dashboardActivateView(target.dataset.adminViewTarget, target.dataset.focusTarget || '');
  const subjectButton = event.target.closest('[data-open-subject]');
  if (subjectButton) { dashboardActivateView('grades'); setScoreMode('collective'); $('#collective-subject').value = subjectButton.dataset.openSubject; renderCollectiveScores(); dashboardGradeContext(); }
  const searchItem = event.target.closest('[data-search-view]');
  if (searchItem) { dashboardActivateView(searchItem.dataset.searchView); $('#admin-search-results').hidden = true; if (searchItem.dataset.searchStudent) openStudentDetails(searchItem.dataset.searchStudent); if (searchItem.dataset.searchSubject) { const state = dashboardTableStates.get('disciplinas'); if (state) { state.search = cache.subjects.find(item => String(item.id) === searchItem.dataset.searchSubject)?.name || ''; dashboardRenderTable(dashboardTableConfigs.get('disciplinas')); } } }
  if (!event.target.closest('.admin-global-search')) $('#admin-search-results').hidden = true;
  if (!event.target.closest('.notification-button') && !event.target.closest('.admin-notifications-panel')) { $('#admin-notifications-panel').hidden = true; $('#admin-notifications-button').setAttribute('aria-expanded', 'false'); }
});
$('#admin-menu-toggle').addEventListener('click', dashboardToggleMenu);
$('#admin-mobile-overlay').addEventListener('click', dashboardCloseMobileMenu);
$('#sidebar-logout-button').addEventListener('click', () => $('#logout-button').click());
$('#admin-notifications-button').addEventListener('click', event => { event.stopPropagation(); const panel = $('#admin-notifications-panel'); panel.hidden = !panel.hidden; event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden)); });
$('#admin-global-search').addEventListener('input', event => dashboardGlobalSearch(event.target.value));
$('#admin-global-search').addEventListener('keydown', event => { if (event.key === 'Escape') { $('#admin-search-results').hidden = true; event.currentTarget.blur(); } });
document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#admin-global-search').focus(); } if (event.key === 'Escape') dashboardCloseMobileMenu(); });
window.addEventListener('resize', () => { if (window.innerWidth > 960) dashboardCloseMobileMenu(); });

$('#subject-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, message = form.querySelector('.panel-message'), button = form.querySelector('button');
  button.disabled = true; message.textContent = 'Salvando disciplina...';
  try { await api('/api/admin/subject', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); message.textContent = 'Disciplina salva com sucesso.'; form.reset(); await loadData(); }
  catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});

['score-subject', 'score-student', 'collective-subject'].forEach(id => $(`#${id}`).addEventListener('change', () => { dashboardGradeContext(); requestAnimationFrame(dashboardUpdateSaveSummaries); }));
$('#score-form').addEventListener('input', dashboardUpdateSaveSummaries);
$('#collective-score-table').addEventListener('input', event => { if (event.target.matches('[data-field]')) { event.target.closest('td')?.classList.toggle('score-cell-changed', event.target.value !== event.target.defaultValue); dashboardUpdateSaveSummaries(); } });
$('#score-form').addEventListener('submit', event => { const subject = cache.subjects.find(item => String(item.id) === String($('#score-subject').value)); const existing = cache.scores.find(item => String(item.student_id) === String($('#score-student').value) && String(item.subject_id) === String(subject?.id)); if (existing && !window.confirm('Este discente já possui lançamento nesta disciplina. Confirmar a alteração dos campos preenchidos?')) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
$('#collective-score-form').addEventListener('submit', event => { const changed = [...$('#collective-score-table').querySelectorAll('[data-field]')].some(input => input.value !== input.defaultValue); if (changed && !window.confirm('Confirmar as inclusões e alterações apresentadas no resumo do lançamento coletivo?')) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);

$('#authorization-student-search').addEventListener('input', dashboardRenderAuthorization);
$('#authorization-start').addEventListener('input', event => { event.currentTarget.dataset.touched = '1'; });
$('#authorization-end').addEventListener('input', event => { event.currentTarget.dataset.touched = '1'; });
$('#authorization-select-all').addEventListener('click', () => { dashboardAuthorizationDraft = new Set(cache.students.map(student => String(student.id))); dashboardRenderAuthorization(); });
$('#authorization-clear-all').addEventListener('click', () => { dashboardAuthorizationDraft = new Set(); dashboardRenderAuthorization(); });
$('#authorization-save-button').addEventListener('click', () => dashboardSaveAuthorization('save'));
$('#authorization-block-button').addEventListener('click', () => dashboardSaveAuthorization('block'));
$('#authorization-revoke-button').addEventListener('click', () => dashboardSaveAuthorization('revoke'));

document.querySelectorAll('[data-calendar-mode]').forEach(button => button.addEventListener('click', () => { dashboardCalendarMode = button.dataset.calendarMode; document.querySelectorAll('[data-calendar-mode]').forEach(item => item.classList.toggle('active', item === button)); dashboardRenderCalendar(); dashboardEnhanceCalendarActions(); }));
['calendar-filter-month', 'calendar-filter-subject', 'calendar-filter-type', 'calendar-filter-status'].forEach(id => $(`#${id}`).addEventListener('change', () => { dashboardRenderCalendar(); dashboardEnhanceCalendarActions(); }));
['report-filter-student', 'report-filter-subject', 'report-filter-type', 'report-filter-status', 'report-filter-start', 'report-filter-end'].forEach(id => $(`#${id}`).addEventListener('change', () => { dashboardRenderReports(); dashboardRenderScores(); }));
$('#report-clear-filters').addEventListener('click', () => { ['report-filter-student', 'report-filter-subject', 'report-filter-type', 'report-filter-status', 'report-filter-start', 'report-filter-end'].forEach(id => { $(`#${id}`).value = ''; }); const state = dashboardTableStates.get('notas-lancadas'); if (state) { state.search = ''; state.filters = {}; state.page = 1; } dashboardRenderReports(); dashboardRenderScores(); });
$('#report-cards').addEventListener('click', event => { const button = event.target.closest('[data-report-type]'); if (button) dashboardGenerateReport(button.dataset.reportType); });
$('#ranking-refresh-button').addEventListener('click', async event => {
  const button = event.currentTarget, message = $('#ranking-updated-at');
  button.disabled = true; button.textContent = 'Atualizando...'; message.textContent = 'Recalculando o ranking com os dados atuais...';
  try {
    const result = await api('/api/admin/ranking/refresh', { method: 'POST', body: '{}' });
    cache.ranking = result.ranking || [];
    cache.ranking_updated_at = result.ranking_updated_at;
    dashboardMetrics = dashboardBuildMetrics();
    dashboardRenderRanking();
    message.textContent = `Ranking atualizado com sucesso em ${result.ranking_updated_at}.`;
  } catch (error) { message.textContent = `Erro ao atualizar o ranking: ${error.message}`; }
  finally { button.disabled = false; button.textContent = 'Atualizar ranking'; }
});

$('#compact-tables-preference').checked = localStorage.getItem('efas-admin-compact-tables') === '1';
$('#reduce-motion-preference').checked = localStorage.getItem('efas-admin-reduce-motion') === '1';
document.body.classList.toggle('compact-tables', $('#compact-tables-preference').checked);
document.body.classList.toggle('reduce-motion', $('#reduce-motion-preference').checked);
$('#compact-tables-preference').addEventListener('change', event => { document.body.classList.toggle('compact-tables', event.target.checked); localStorage.setItem('efas-admin-compact-tables', event.target.checked ? '1' : '0'); });
$('#reduce-motion-preference').addEventListener('change', event => { document.body.classList.toggle('reduce-motion', event.target.checked); localStorage.setItem('efas-admin-reduce-motion', event.target.checked ? '1' : '0'); });

if (localStorage.getItem('efas-admin-sidebar-collapsed') === 'true' && window.innerWidth > 960) $('#dashboard').classList.add('sidebar-collapsed');
dashboardActivateView(location.hash.slice(1) || localStorage.getItem('efas-admin-view') || 'overview');
