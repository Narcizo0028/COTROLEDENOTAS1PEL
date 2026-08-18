const $ = selector => document.querySelector(selector);
const fmt = value => Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

function renderRanking(rows = [], updatedAt = '') {
  const container = $('#coord-ranking-data');
  if (!container) return;
  $('#coord-ranking-updated-at').textContent = updatedAt ? `Última atualização: ${updatedAt}` : 'Ranking calculado com os dados atuais do sistema.';
  if (!rows.length) {
    container.innerHTML = '<p class="empty-state">Nenhum discente cadastrado no ranking.</p>';
    return;
  }
  container.innerHTML = `<div class="admin-table-scroll"><table class="admin-data-table coordination-ranking-table mobile-cards"><thead><tr>
    <th>Posição</th><th>Discente</th><th>Posto/grad.</th><th>Pontos obtidos</th><th>Pontos distribuídos</th><th>Média</th><th>Aproveitamento</th><th>Observação</th>
  </tr></thead><tbody>${rows.map(row => `<tr>
    <td data-label="Posição"><strong>${row.position}º</strong></td>
    <td data-label="Discente"><strong>${esc(row.name)}</strong><small>${esc(row.id)}</small></td>
    <td data-label="Posto/grad.">${esc(row.rank)}</td>
    <td data-label="Pontos obtidos" class="numeric">${fmt(row.points)}</td>
    <td data-label="Pontos distribuídos" class="numeric">${fmt(row.distributed)}</td>
    <td data-label="Média" class="numeric"><strong>${fmt(row.average)}</strong></td>
    <td data-label="Aproveitamento" class="numeric">${fmt(row.percentage)}%</td>
    <td data-label="Observação">${row.observation ? esc(row.observation) : '<span class="coord-empty-note">—</span>'}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

function showDashboard(user) {
  $('#coord-login-panel').hidden = true;
  $('#coord-dashboard').hidden = false;
  $('#coord-identity-name').textContent = user.name;
  $('#coord-identity-rank').textContent = user.rank;
}

async function loadRanking() {
  const data = await api('/api/coordination/ranking');
  renderRanking(data.ranking || [], data.ranking_updated_at || '');
}

async function checkSession() {
  try {
    const user = await api('/api/coordination/session');
    showDashboard(user);
    await loadRanking();
  } catch {
    $('#coord-login-panel').hidden = false;
    $('#coord-dashboard').hidden = true;
  }
}

$('#coord-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const message = $('#coord-login-message');
  message.textContent = '';
  try {
    const user = await api('/api/coordination/login', {
      method: 'POST',
      body: JSON.stringify({ username: $('#coord-user').value.trim(), password: $('#coord-password').value })
    });
    showDashboard(user);
    await loadRanking();
  } catch (error) {
    message.textContent = error.message;
  }
});

$('#coord-logout-button').addEventListener('click', async () => {
  await api('/api/coordination/logout', { method: 'POST', body: '{}' });
  location.reload();
});

$('#coord-refresh-button').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try { await loadRanking(); }
  catch (error) { $('#coord-ranking-updated-at').textContent = error.message; }
  finally { button.disabled = false; }
});

checkSession();
