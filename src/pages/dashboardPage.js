import Chart from 'chart.js/auto';

const state = window.appState;
const accountsService = window.accountsService;

function getSubscriptions() {
  return Array.isArray(state.subscriptionRecords) ? state.subscriptionRecords : [];
}

function buildStats(subscriptions) {
  const active = subscriptions.filter((item) => item.normalizedStatus === 'ACTIVA').length;
  const expiring = subscriptions.filter((item) => item.normalizedStatus === 'POR_VENCER').length;
  const expired = subscriptions.filter((item) => item.normalizedStatus === 'VENCIDA').length;
  return { active, expiring, expired };
}

function buildPlatformStats(subscriptions) {
  const grouped = {};

  subscriptions.forEach((item) => {
    const key = item.plataforma || 'Sin plataforma';
    if (!grouped[key]) {
      grouped[key] = {
        platform: key,
        active: 0,
        expiring: 0,
        expired: 0,
        total: 0,
      };
    }

    grouped[key].total += 1;

    if (item.normalizedStatus === 'ACTIVA') grouped[key].active += 1;
    if (item.normalizedStatus === 'POR_VENCER') grouped[key].expiring += 1;
    if (item.normalizedStatus === 'VENCIDA') grouped[key].expired += 1;
  });

  return Object.values(grouped).sort((a, b) => b.total - a.total || a.platform.localeCompare(b.platform));
}

function getPlatformBrandKey(platform) {
  const key = String(platform || '').trim().toUpperCase();

  if (key.includes('NETFLIX')) return 'netflix';
  if (key.includes('SPOTIFY')) return 'spotify';
  if (key.includes('DISNEY')) return 'disney';
  if (key.includes('HBO')) return 'hbo';
  if (key.includes('PRIME')) return 'prime';
  if (key.includes('YOUTUBE')) return 'youtube';
  if (key.includes('PARAMOUNT')) return 'paramount';
  if (key.includes('CRUNCHY')) return 'crunchyroll';
  if (key.includes('MAX')) return 'hbo';

  return 'default';
}

function getPlatformLogoMarkup(platform) {
  const brand = getPlatformBrandKey(platform);
  const fallback = String(platform || '').trim().slice(0, 2).toUpperCase() || 'AP';
  const label = String(platform || 'Plataforma');

  const brandMarks = {
    netflix: 'N',
    spotify: 'S',
    disney: 'D',
    hbo: 'H',
    prime: 'P',
    youtube: 'Y',
    paramount: 'P',
    crunchyroll: 'C',
    default: fallback,
  };

  return `<div class="platform-icon platform-logo is-${brand}" aria-label="${label}" title="${label}">${brandMarks[brand] || fallback}</div>`;
}

function buildAlerts(subscriptions, accounts) {
  const today = subscriptions.filter((item) => item.daysRemaining === 0).length;
  const tomorrow = subscriptions.filter((item) => item.daysRemaining === 1).length;
  const nextThreeDays = subscriptions.filter((item) => item.daysRemaining > 1 && item.daysRemaining <= 3).length;
  const renewSoon = accounts.filter((item) => item.renewalStatus === 'POR_VENCER').length;
  const renewExpired = accounts.filter((item) => item.renewalStatus === 'VENCIDA').length;

  return [
    { label: 'Vencen hoy', value: today, tone: 'danger' },
    { label: 'Vencen mañana', value: tomorrow, tone: 'warning' },
    { label: 'Dentro de 3 días', value: nextThreeDays, tone: 'info' },
    { label: 'Cuentas por renovar', value: renewSoon, tone: 'warning' },
    { label: 'Cuentas vencidas', value: renewExpired, tone: 'danger' },
  ];
}

function renderStatusChart(stats) {
  const canvas = document.getElementById('statusChart');
  const legend = document.getElementById('statusLegend');
  if (!canvas || !legend) return;

  const data = [stats.active, stats.expiring, stats.expired];
  const labels = ['Activas', 'Por vencer', 'Vencidas'];
  const colors = ['#22c55e', '#f59e0b', '#ef4444'];

  if (state.statusChart) {
    state.statusChart.data.datasets[0].data = data;
    state.statusChart.update();
  } else {
    state.statusChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors,
            borderWidth: 0,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                return `${context.label}: ${context.raw}`;
              },
            },
          },
        },
      },
    });
  }

  legend.innerHTML = labels
    .map((label, index) => `
      <div class="legend-pill">
        <span class="legend-dot" style="background:${colors[index]}"></span>
        <span>${label}</span>
        <strong>${data[index]}</strong>
      </div>
    `)
    .join('');
}

function renderAlerts(alerts) {
  const container = document.getElementById('dashboardAlerts');
  if (!container) return;

  container.innerHTML = alerts
    .map((item) => `
      <article class="alert-item ${item.tone}">
        <div>
          <span class="alert-label">${item.label}</span>
          <strong>${item.value}</strong>
        </div>
      </article>
    `)
    .join('');
}

function renderPlatformStats(platformStats) {
  const container = document.getElementById('platformStatsList');
  if (!container) return;

  if (!platformStats.length) {
    container.innerHTML = '<div class="empty-state">No hay datos de plataformas todavía.</div>';
    return;
  }

  container.innerHTML = platformStats
    .map((item) => `
      <article class="platform-row">
        <div class="platform-main">
          ${getPlatformLogoMarkup(item.platform)}
          <div>
            <h4>${item.platform}</h4>
            <p>${item.total} suscripciones</p>
          </div>
        </div>
        <div class="platform-stats">
          <span class="mini-stat active">🟢 ${item.active}</span>
          <span class="mini-stat warning">🟠 ${item.expiring}</span>
          <span class="mini-stat danger">🔴 ${item.expired}</span>
          <button type="button" class="view-accounts-btn" onclick="abrirCuentasPorPlataforma('${item.platform.replace(/'/g, '')}')">Ver cuentas</button>
        </div>
      </article>
    `)
    .join('');
}

function renderAccountMetrics(accounts) {
  const renewCounter = document.getElementById('metricRenewAccounts');
  const expiredCounter = document.getElementById('metricExpiredAccounts');
  if (!renewCounter || !expiredCounter) return;

  renewCounter.textContent = String(accounts.filter((item) => item.renewalStatus === 'POR_VENCER').length);
  expiredCounter.textContent = String(accounts.filter((item) => item.renewalStatus === 'VENCIDA').length);
}

async function refreshDashboard() {
  const subscriptions = getSubscriptions();
  let accounts = Array.isArray(state.accountSummaries) ? state.accountSummaries : [];

  if (!accounts.length) {
    try {
      accounts = await accountsService.getAccountsOverview(false);
      state.accountSummaries = accounts;
    } catch (error) {
      console.error('No se pudieron cargar alertas de cuentas:', error);
      accounts = [];
    }
  }

  const stats = buildStats(subscriptions);
  const platformStats = buildPlatformStats(subscriptions);
  const alerts = buildAlerts(subscriptions, accounts);

  renderStatusChart(stats);
  renderAlerts(alerts);
  renderPlatformStats(platformStats);
  renderAccountMetrics(accounts);
}

function init() {
  refreshDashboard();
}

window.dashboardPage = {
  init,
  refreshDashboard,
};
