const state = window.appState;
const plataformasService = window.plataformasService;
const appCache = window.appCache;
const accountsService = window.accountsService;
const alertasUtils = window.alertasUtils;
const autoBuyUtils = window.autoBuyUtils;
const { setButtonLoading, showToast } = window.appUtils || {};

function normalizeText(value) {
  return String(value || '').trim();
}

function getFilteredPlatforms() {
  const query = normalizeText(state.platformsQuery || '').toLowerCase();
  const items = Array.isArray(state.platformSummaries) ? [...state.platformSummaries] : [];

  if (!query) return items;

  return items.filter((item) => {
    return (
      item.nombre.toLowerCase().includes(query) ||
      String(item.precioBase).includes(query) ||
      item.estado.toLowerCase().includes(query)
    );
  });
}

function getOccupancyTone(item) {
  if (item.porcentajeOcupacion >= 100) return 'is-full';
  if (item.porcentajeOcupacion >= 85) return 'is-warning';
  return 'is-healthy';
}

function buildPlatformSummary(plataforma, subscriptions, accounts) {
  const platformName = normalizeText(plataforma.nombre || plataforma.name);
  const key = platformName.toUpperCase();
  const relatedSubscriptions = subscriptions.filter((item) => normalizeText(item.plataforma).toUpperCase() === key);
  const relatedAccounts = accounts.filter((item) => normalizeText(item.plataforma).toUpperCase() === key);

  const totalCapacidad = relatedAccounts.reduce((sum, item) => sum + (Number(item.perfilesMax || 0) || 0), 0);
  const totalUsados = relatedAccounts.reduce((sum, item) => sum + (Number(item.perfilesUsados || 0) || 0), 0);
  const porcentajeOcupacion = totalCapacidad > 0 ? Number(((totalUsados / totalCapacidad) * 100).toFixed(1)) : 0;
  const nivelOcupacion = alertasUtils?.getNivelOcupacion?.(porcentajeOcupacion) || null;
  const alerta = alertasUtils?.getMensajeAlerta?.(platformName, porcentajeOcupacion) || null;
  const autoBuy = autoBuyUtils?.recomendarCompra?.({
    porcentaje: porcentajeOcupacion,
    cuentas: relatedAccounts,
  }) || null;

  return {
    id: plataforma.id,
    nombre: platformName,
    precioBase: Number(plataforma.precioBase || plataforma.costoMensual || 0),
    perfiles: Number(plataforma.perfiles || 0),
    estado: plataforma.activo ? 'ACTIVA' : 'INACTIVA',
    activo: Boolean(plataforma.activo),
    totalSuscripciones: relatedSubscriptions.length,
    activas: relatedSubscriptions.filter((item) => item.normalizedStatus === 'ACTIVA').length,
    porVencer: relatedSubscriptions.filter((item) => item.normalizedStatus === 'POR_VENCER').length,
    vencidas: relatedSubscriptions.filter((item) => item.normalizedStatus === 'VENCIDA').length,
    cuentas: relatedAccounts.length,
    cuentasDisponibles: relatedAccounts.filter((item) => item.cuposDisponibles > 0).length,
    cuentasLlenas: relatedAccounts.filter((item) => item.cuposDisponibles <= 0).length,
    capacidadTotal: totalCapacidad,
    perfilesUsados: totalUsados,
    porcentajeOcupacion,
    nivelOcupacion,
    alerta,
    autoBuy,
  };
}

function renderPlatformsCards() {
  const grid = document.getElementById('platformsGrid');
  const empty = document.getElementById('platformsEmptyState');
  if (!grid || !empty) return;

  const items = getFilteredPlatforms();
  empty.classList.toggle('hidden', items.length > 0);

  grid.innerHTML = items
    .map((item) => `
      <article class="list-card platform-module-card">
        <div class="card-top compact-top">
          <div>
            <h3>${item.nombre}</h3>
            <p class="card-meta">Costo mensual: C$ ${item.precioBase}</p>
          </div>
          <div class="status-chip ${item.estado === 'ACTIVA' ? 'status-active' : 'status-muted'}">${item.estado}</div>
        </div>
        <div class="inventory-meta platform-module-meta">
          <span>Perfiles por cuenta: ${item.perfiles}</span>
          <span>Suscripciones: ${item.totalSuscripciones}</span>
          <span>Activas: ${item.activas}</span>
          <span>Por vencer: ${item.porVencer}</span>
          <span>Vencidas: ${item.vencidas}</span>
          <span>Cuentas: ${item.cuentas}</span>
          <span>Disponibles: ${item.cuentasDisponibles}</span>
        </div>
        <div class="platform-occupancy ${getOccupancyTone(item)}">
          <div class="platform-occupancy-head">
            <strong>Ocupacion</strong>
            <span>${item.perfilesUsados}/${item.capacidadTotal || 0} · ${item.porcentajeOcupacion}%</span>
          </div>
          <div class="occupancy-bar">
            <div class="occupancy-progress" style="width:${Math.max(0, Math.min(item.porcentajeOcupacion, 100))}%"></div>
          </div>
        </div>
        ${item.alerta ? `<div class="platform-intel-card alert-${String(item.nivelOcupacion?.nivel || '').toLowerCase()}">${item.alerta}</div>` : ''}
        ${item.autoBuy ? `<div class="platform-intel-card auto-buy-card">${item.autoBuy.mensaje}</div>` : ''}
        <div class="card-actions-row platform-actions-row">
          <button type="button" class="btn-secondary slim-btn" onclick="abrirCuentasPorPlataforma('${item.nombre.replace(/'/g, '')}')">Ver cuentas</button>
          <button type="button" class="btn-edit slim-btn" onclick="abrirEditarPlataforma('${item.id}')">Editar</button>
          <button type="button" class="btn-cancel slim-btn" onclick="abrirEliminarPlataforma('${item.id}')">Eliminar</button>
        </div>
      </article>
    `)
    .join('');
}

async function refreshPlatformsView(force = false) {
  try {
    const [plataformas, data, accounts] = await Promise.all([
      plataformasService.getPlataformas(),
      appCache.ensureData(force),
      accountsService.getAccountsOverview(force),
    ]);

    state.platformSummaries = (plataformas || [])
      .map((item) => buildPlatformSummary(item, data.subscriptions || [], accounts || []))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  } catch (error) {
    console.error('Error loading platforms:', error);
    state.platformSummaries = [];
    showToast?.('No se pudieron cargar las plataformas', 'error');
  }

  renderPlatformsCards();
}

async function importarPlataformasExistentes() {
  const btn = document.getElementById('importPlatformsButton');

  try {
    setButtonLoading(btn, true, 'Importar existentes');
    const data = await appCache.ensureData(false);
    const subscriptions = Array.isArray(data?.subscriptions) ? data.subscriptions : [];
    const result = await plataformasService.importPlataformasFromSubscriptions(5, subscriptions);
    appCache.invalidate();
    await refreshPlatformsView(true);

    if (result.created === 0 && result.totalDetectadas > 0) {
      showToast('No se importo nada porque esas plataformas ya existen en el catalogo', 'error');
      return;
    }

    if (result.totalDetectadas === 0) {
      showToast('No se detectaron plataformas en las suscripciones cargadas', 'error');
      return;
    }

    showToast(`Se importaron ${result.created} plataformas`, 'success');
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'No se pudieron importar las plataformas', 'error');
  } finally {
    setButtonLoading(btn, false, 'Importar existentes');
  }
}

function resetPlataformaForm() {
  document.getElementById('plataformaNombre').value = '';
  document.getElementById('plataformaPerfiles').value = '';
  document.getElementById('plataformaCostoMensual').value = '';
  document.getElementById('plataformaActiva').checked = true;
  state.plataformaEditandoId = null;
}

function abrirVistaPlataformas() {
  window.setActiveView?.('platforms');
  window.toggleSidebar?.(false);
  refreshPlatformsView(false);
}

function abrirAgregarPlataforma() {
  window.toggleSidebar?.(false);
  resetPlataformaForm();
  document.getElementById('modalPlataformaTitulo').textContent = 'Agregar plataforma';
  document.getElementById('modalPlataforma').classList.remove('hidden');
}

function abrirEditarPlataforma(id) {
  const item = (state.platformSummaries || []).find((platform) => platform.id === id);
  if (!item) return;

  state.plataformaEditandoId = id;
  document.getElementById('modalPlataformaTitulo').textContent = 'Editar plataforma';
  document.getElementById('plataformaNombre').value = item.nombre || '';
  document.getElementById('plataformaPerfiles').value = item.perfiles || '';
  document.getElementById('plataformaCostoMensual').value = item.precioBase || '';
  document.getElementById('plataformaActiva').checked = Boolean(item.activo);
  document.getElementById('modalPlataforma').classList.remove('hidden');
}

function cerrarPlataformaModal() {
  document.getElementById('modalPlataforma').classList.add('hidden');
  resetPlataformaForm();
}

async function guardarPlataforma() {
  const btn = document.querySelector('#modalPlataforma .btn-save');
  const payload = {
    nombre: document.getElementById('plataformaNombre').value.trim(),
    perfiles: Number(document.getElementById('plataformaPerfiles').value),
    costoMensual: Number(document.getElementById('plataformaCostoMensual').value),
    activo: document.getElementById('plataformaActiva').checked,
  };

  if (!payload.nombre || !payload.perfiles || Number.isNaN(payload.costoMensual)) {
    showToast('Completa nombre, perfiles y costo mensual', 'error');
    return;
  }

  try {
    setButtonLoading(btn, true);
    if (state.plataformaEditandoId) {
      await plataformasService.updatePlataforma(state.plataformaEditandoId, payload);
      showToast('Plataforma actualizada');
    } else {
      await plataformasService.createPlataforma(payload);
      showToast('Plataforma creada');
    }

    appCache.invalidate();
    cerrarPlataformaModal();
    await refreshPlatformsView(true);
    await window.accountsPage?.refreshAccountsView?.(true);
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'No se pudo guardar la plataforma', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function abrirEliminarPlataforma(id) {
  state.plataformaAEliminar = String(id || '').trim();
  const input = document.getElementById('eliminarPlataformaConfirmacion');
  if (input) input.value = '';
  document.getElementById('modalEliminarPlataforma')?.classList.remove('hidden');
}

function cerrarEliminarPlataforma() {
  document.getElementById('modalEliminarPlataforma')?.classList.add('hidden');
  const input = document.getElementById('eliminarPlataformaConfirmacion');
  if (input) input.value = '';
  state.plataformaAEliminar = null;
}

async function confirmarEliminarPlataforma() {
  const btn = document.querySelector('#modalEliminarPlataforma .btn-delete');
  const confirmacion = String(document.getElementById('eliminarPlataformaConfirmacion')?.value || '').trim().toUpperCase();

  if (!state.plataformaAEliminar) {
    showToast('No hay plataforma seleccionada', 'error');
    return;
  }

  if (confirmacion !== 'ELIMINAR') {
    showToast('Escribe ELIMINAR para confirmar', 'error');
    return;
  }

  try {
    setButtonLoading(btn, true);
    await plataformasService.deletePlataforma(state.plataformaAEliminar);
    appCache.invalidate();
    showToast('Plataforma eliminada');
    cerrarEliminarPlataforma();
    await refreshPlatformsView(true);
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'No se pudo eliminar la plataforma', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function init() {
  const searchInput = document.getElementById('platformsSearchInput');
  state.platformsQuery = state.platformsQuery || '';

  searchInput?.addEventListener('input', (event) => {
    state.platformsQuery = event.target.value;
    renderPlatformsCards();
  });

  refreshPlatformsView(false);
}

window.plataformasPage = {
  init,
  refreshPlatformsView,
  abrirVistaPlataformas,
};
window.abrirVistaPlataformas = abrirVistaPlataformas;
window.abrirAgregarPlataforma = abrirAgregarPlataforma;
window.abrirEditarPlataforma = abrirEditarPlataforma;
window.cerrarPlataformaModal = cerrarPlataformaModal;
window.guardarPlataforma = guardarPlataforma;
window.abrirEliminarPlataforma = abrirEliminarPlataforma;
window.cerrarEliminarPlataforma = cerrarEliminarPlataforma;
window.confirmarEliminarPlataforma = confirmarEliminarPlataforma;
window.importarPlataformasExistentes = importarPlataformasExistentes;
