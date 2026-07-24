<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Portal institucional para consulta de calendário de provas e notas finais do CFS — 1º Pelotão.">
  <meta name="theme-color" content="#1d1c18">
  <title>Controle de Notas | CFS — 1º Pelotão</title>
  <link rel="stylesheet" href="styles.css?v=20260724-31">
</head>
<body class="portal-app">
  <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>

  <header class="site-header" id="topo">
    <div class="topbar">CFS / 1º Pelotão</div>
    <div class="nav-wrap container">
      <a class="brand" href="#boletim" data-nav="boletim" aria-label="Página inicial do CFS, 1º Pelotão">
        <img class="brand-crest" src="assets/escudo-efas.png" alt="Escudo da EFAS" width="52" height="58">
        <span><strong>Controle de Notas</strong><small>CFS • 1º Pelotão</small></span>
      </a>
      <div class="header-actions">
        <button id="student-logout-button" class="student-logout-button" type="button" hidden aria-label="Sair da área do aluno">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="menu-principal" aria-label="Abrir menu">
          <span></span><span></span><span></span>
        </button>
      </div>
      <nav id="menu-principal" class="main-nav" aria-label="Navegação principal">
        <a href="#boletim" data-nav="boletim" class="active">Início</a>
        <a href="#calendario" data-nav="calendario">Calendário</a>
        <a href="#lancamento" data-nav="lancamento">Lançar notas</a>
        <a href="#senha" data-nav="senha">Alterar senha</a>
        <a href="admin.html" class="nav-admin">Administração</a>
      </nav>
    </div>
  </header>
  <div id="nav-backdrop" class="nav-backdrop" hidden></div>

  <main id="conteudo" class="app-main">
    <section class="view grade-section is-active" id="boletim" data-view="boletim" aria-labelledby="boletim-title">
      <div class="container">
        <div id="boletim-guest" class="grades-guest">
          <h2 id="boletim-title" class="view-title">Início</h2>
          <div class="form-card home-login-card">
            <h3 class="login-card-title">Entrar</h3>
            <form id="grade-form" novalidate>
              <label for="student-id">Matrícula</label>
              <input id="student-id" name="student-id" inputmode="numeric" autocomplete="username" placeholder="Ex.: 2026001" required>
              <label for="access-code">Código de acesso</label>
              <div class="password-wrap">
                <input id="access-code" name="access-code" type="password" autocomplete="current-password" placeholder="Seu código" required>
                <button id="toggle-password" type="button" aria-label="Mostrar código de acesso">Mostrar</button>
              </div>
              <p id="form-message" class="form-message" role="alert"></p>
              <button class="button button-gold full" type="submit">Entrar</button>
            </form>
          </div>
        </div>
        <div id="boletim-authed" class="grades-authed" hidden>
          <div id="report-card" class="report-card" hidden aria-live="polite"></div>
        </div>
      </div>
    </section>

    <section class="view section" id="calendario" data-view="calendario" aria-labelledby="calendar-title" hidden>
      <div class="container">
        <div class="section-heading">
          <h2 id="calendar-title">Calendário</h2>
          <label class="filter-label">Disciplina
            <select id="discipline-filter"><option value="todas">Todas</option></select>
          </label>
        </div>
        <div id="exam-list" class="exam-list" aria-live="polite"></div>
      </div>
    </section>

    <section class="view grade-section" id="lancamento" data-view="lancamento" aria-labelledby="lancamento-title" hidden>
      <div class="container">
        <div id="lancamento-guest" class="grades-guest">
          <h2 id="lancamento-title" class="view-title">Lançar notas</h2>
          <a class="button button-gold" href="#boletim" data-nav="boletim">Fazer login</a>
        </div>
        <div id="lancamento-authed" class="grades-authed" hidden>
          <h2 class="view-title">Lançar notas</h2>
          <section id="student-entry-panel" class="student-entry-panel" hidden aria-labelledby="student-entry-title">
            <form id="student-entry-form">
              <div id="student-entry-table" class="student-entry-table"></div>
              <div class="student-entry-actions">
                <button id="student-entry-submit" class="button button-gold" type="submit">Salvar</button>
                <p id="student-entry-message" class="form-message" role="status" aria-live="polite"></p>
              </div>
            </form>
          </section>
          <p id="lancamento-empty" class="empty-state" hidden>Nenhuma disciplina liberada para lançamento.</p>
        </div>
      </div>
    </section>

    <section class="view grade-section" id="senha" data-view="senha" aria-labelledby="senha-title" hidden>
      <div class="container">
        <div id="senha-guest" class="grades-guest">
          <h2 id="senha-title" class="view-title">Alterar senha</h2>
          <a class="button button-gold" href="#boletim" data-nav="boletim">Fazer login</a>
        </div>
        <div id="senha-authed" class="grades-authed" hidden>
          <h2 class="view-title">Alterar senha</h2>
          <section id="student-password-panel" class="student-password-panel" aria-labelledby="student-password-title">
            <form id="student-password-form">
              <div class="password-change-grid">
                <label for="student-new-password">Nova senha
                  <input id="student-new-password" name="password" type="password" minlength="8" autocomplete="new-password" required>
                  <small>Mínimo 8 caracteres</small>
                </label>
                <label for="student-confirm-password">Confirmar
                  <input id="student-confirm-password" name="confirmation" type="password" minlength="8" autocomplete="new-password" aria-describedby="password-match-indicator" required>
                </label>
              </div>
              <p id="password-match-indicator" class="password-match" data-state="empty" role="status" aria-live="polite"><span aria-hidden="true">•</span> Confirme a senha.</p>
              <label class="show-passwords"><input id="show-student-passwords" type="checkbox"> Mostrar senhas</label>
              <div class="password-panel-actions">
                <button id="student-password-submit" class="button button-gold" type="submit" disabled>Salvar senha</button>
              </div>
              <p class="form-message" role="status" aria-live="polite"></p>
            </form>
          </section>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer site-footer-compact">
    <div class="container copyright">© <span id="current-year"></span> CFS — 1º Pelotão</div>
  </footer>
  <script src="script.js?v=20260724-31" defer></script>
</body>
</html>
