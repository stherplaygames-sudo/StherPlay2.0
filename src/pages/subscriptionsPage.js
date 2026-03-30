const state = window.appState;
const appCache = window.appCache;
const firebaseService = window.firebaseService;
const plataformasService = window.plataformasService;
const accountsService = window.accountsService;
const cuentasSmart = window.cuentasSmart;
const correosService = window.correosService;
const { normalizarFechaISO, setButtonLoading, showToast } = window.appUtils;

function statusClass(status) {
  return {
    ACTIVA: 'status-active',
    POR_VENCER: 'status-warning',
    VENCIDA: 'status-danger',
    SUSPENDIDA: 'status-muted',
  }[status] || 'status-muted';
}

function statusLabel(status) {
  return String(status || '').replace('_', ' ');
}

function formatDays(daysRemaining) {
  if (daysRemaining === undefined || daysRemaining === null) return 'N/A';
  if (daysRemaining < 0) return `${Math.abs(daysRemaining)} dias tarde`;
  return `${daysRemaining} dias`;
}

function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function matchesDateFilter(item, dateFilter) {
  const expireDate = parseLocalDate(item.fechaVencimiento);
  if (!expireDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dateFilter === 'HOY') {
    return isSameDay(expireDate, today);
  }

  if (dateFilter === 'SEMANA') {
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + 6);
    return expireDate >= today && expireDate <= endOfWeek;
  }

  if (dateFilter === 'MES') {
    return (
      expireDate.getFullYear() === today.getFullYear() &&
      expireDate.getMonth() === today.getMonth()
    );
  }

  return true;
}

function buildWhatsAppMessage(tipo, plataforma, nombre) {
  if (tipo === 'VENCIDA') {
    return (
      `Hola ${nombre} 👋 Tu suscripcion de ${plataforma} ya vencio 🎧\n\n` +
      'Aun sigue funcionando 😉\n' +
      'Si quieres, la renovamos para que no tengas interrupciones 🔥\n\n' +
      'Estoy listo para ayudarte 🚀'
    );
  }

  return (
    `Hola ${nombre} 👋 Tu suscripcion de ${plataforma} esta por vencer 🎧\n\n` +
    'Si quieres, podemos renovarla antes de que tengas interrupciones 🔥\n\n' +
    'Estoy listo para ayudarte 🚀'
  );
}

function abrirWhatsAppSuscripcion(telefono, tipo, plataforma, nombre) {
  const phone = String(telefono || '').replace(/\D/g, '');

  if (phone.length < 8) {
    showToast('Cliente sin telefono valido', 'error');
    return;
  }

  const mensaje = buildWhatsAppMessage(tipo, plataforma, nombre);
  const url = `https://wa.me/505${phone}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
}

function renderWhatsAppButton(item) {
  if (item.normalizedStatus !== 'VENCIDA') {
    return '';
  }

  const phone = String(item.clientPhone || item.telefono || '').replace(/\D/g, '');
  if (phone.length < 8) {
    return '<button class="btn-whatsapp slim-btn" disabled title="Cliente sin telefono registrado">WH</button>';
  }

  const safePhone = phone.replace(/'/g, '');
  const safePlatform = String(item.plataforma || '').replace(/'/g, '');
  const safeName = String(item.clientName || '').replace(/'/g, '');

  return `<button class="btn-whatsapp slim-btn" onclick="abrirWhatsAppSuscripcion('${safePhone}','VENCIDA','${safePlatform}','${safeName}')">WH</button>`;
}

function renderDeleteButton(item) {
  return `<button type="button" class="delete-icon-btn" onclick="abrirEliminarSuscripcion('${item.idSuscripcion}')" title="Eliminar suscripción">🗑</button>`;
}

function renderSuggestedAccount(account, platformName, summary = null) {
  const box = document.getElementById('cuentaSugeridaBox');
  const emailInput = document.getElementById('subCorreo');
  if (!box || !emailInput) return;

  if (!account && !summary) {
    box.classList.add('hidden');
    box.innerHTML = '';
    emailInput.dataset.cuentaId = '';
    return;
  }

  const occupancy = Number(summary?.porcentajeOcupacion ?? 0);
  const occupancyClass = occupancy >= 100 ? 'status-danger' : occupancy >= 85 ? 'status-warning' : 'status-active';

  if (!account) {
    emailInput.dataset.cuentaId = '';
    box.innerHTML = `
      <article class="suggested-account-card no-suggestion-card">
        <div>
          <span class="view-kicker">Capacidad de plataforma</span>
          <h4>${platformName}</h4>
          <p>No hay cuentas disponibles ahora mismo. Ocupacion ${summary?.totalUsados || 0}/${summary?.totalCapacidad || 0}.</p>
        </div>
        <div class="status-chip ${occupancyClass}">${occupancy}%</div>
      </article>
    `;
    box.classList.remove('hidden');
    return;
  }

  emailInput.dataset.cuentaId = account.id;
  if (!emailInput.value.trim()) {
    emailInput.value = account.correo || '';
  }

  box.innerHTML = `
    <article class="suggested-account-card">
      <div>
        <span class="view-kicker">Sugerencia inteligente</span>
        <h4>${account.correo}</h4>
        <p>${platformName || account.plataforma} · ${account.perfilesUsados}/${account.perfilesMax} perfiles usados</p>
        <p class="suggested-account-subline">Ocupacion de plataforma: ${summary?.totalUsados || account.perfilesUsados}/${summary?.totalCapacidad || account.perfilesMax}</p>
      </div>
      <div class="suggested-account-side">
        <div class="status-chip ${account.cuposDisponibles <= 1 ? 'status-warning' : 'status-active'}">
          ${account.cuposDisponibles} disponibles
        </div>
        <div class="status-chip ${occupancyClass}">${occupancy}%</div>
      </div>
    </article>
  `;
  box.classList.remove('hidden');
}

async function updateSuggestedAccount() {
  const select = document.getElementById('subPlataforma');
  const platformName = String(select?.value || '').trim();

  if (!platformName) {
    renderSuggestedAccount(null, '', null);
    return;
  }

  try {
    const summary = await accountsService.getPlatformOperationalSummary(platformName, false);
    const sugerida = cuentasSmart.sugerirCuenta(summary.cuentas || []);
    renderSuggestedAccount(sugerida, platformName, summary);
  } catch (error) {
    console.error('No se pudo sugerir cuenta:', error);
    renderSuggestedAccount(null, platformName, null);
  }
}

async function loadSubscriptionRecords(force = false) {
  const data = await appCache.ensureData(force);
  return data.subscriptions;
}

async function renderSuscripciones(idCliente, target = null) {
  if (!Array.isArray(state.subscriptionRecords)) {
    await appCache.ensureData(false);
  }

  const container = target || document.getElementById('clienteDetallesContent');
  if (!container) return;

  const items = appCache.getSubscriptionsByClientId(idCliente);
  if (!items.length) {
    container.innerHTML += '<p><em>No subscriptions</em></p>';
    return;
  }

  const grouped = {
    ACTIVA: [],
    POR_VENCER: [],
    VENCIDA: [],
    SUSPENDIDA: [],
  };

  items.forEach((item) => {
    grouped[item.normalizedStatus].push(item);
  });

  const content = Object.entries(grouped)
    .filter(([, list]) => list.length > 0)
    .map(([status, list]) => `
      <section class="details-group">
        <h4>${statusLabel(status)}</h4>
        ${list
          .map(
            (item) => `
              <article class="sub-card ${item.normalizedStatus.toLowerCase()}">
                <div class="sub-title">${item.plataforma}</div>
                Status: ${statusLabel(item.normalizedStatus)}<br>
                Start: ${item.fechaInicio || 'N/A'}<br>
                Expiration: ${item.fechaVencimiento || 'N/A'}<br>
                Price: C$ ${item.precioFinal || item.precio || item.price || 0}
                <div style="margin-top:0.5rem;font-size:0.82rem;">
                  <strong>Account</strong><br>
                  Email: ${item.correo || 'Not assigned'}<br>
                  Profile: ${item.perfil || 'Not assigned'}<br>
                  Password: ${item.contrasena || 'Not assigned'}
                </div>
                <div class="card-actions-row">
                  <button class="btn-renew slim-btn" onclick="abrirRenovar('${item.idSuscripcion}')">Renew</button>
                  <button class="btn-edit slim-btn" onclick="abrirEditarSuscripcion('${item.idSuscripcion}')">Edit</button>
                  <button class="btn-cancel slim-btn" onclick="abrirDarDeBaja('${item.idSuscripcion}')">Suspend</button>
                  ${renderWhatsAppButton(item)}
                </div>
              </article>
            `
          )
          .join('')}
      </section>
    `)
    .join('');

  container.innerHTML += `<div class="details-subscriptions">${content}</div>`;
}

function getFilteredSubscriptions() {
  const query = String(state.subscriptionsQuery || '').trim().toLowerCase();
  const filter = state.subscriptionsFilter || 'TODAS';
  const dateFilter = state.subscriptionsDateFilter || 'HOY';

  return [...(state.subscriptionRecords || [])].filter((item) => {
    const matchesQuery = !query || (
      item.clientName.toLowerCase().includes(query) ||
      item.plataforma.toLowerCase().includes(query) ||
      String(item.clientId).toLowerCase().includes(query)
    );

    const matchesFilter =
      filter === 'TODAS' ||
      (filter === 'POR_FECHA' ? matchesDateFilter(item, dateFilter) : item.normalizedStatus === filter);

    return matchesQuery && matchesFilter;
  });
}

function renderSubscriptionCards() {
  const grid = document.getElementById('subscriptionsGrid');
  const empty = document.getElementById('subscriptionsEmptyState');
  if (!grid || !empty) return;

  const records = getFilteredSubscriptions();

  empty.textContent = state.loadError || 'No se encontraron suscripciones.';
  empty.classList.toggle('hidden', records.length > 0);
  grid.innerHTML = records
    .map(
      (item) => `
        <article class="list-card subscription-card inventory-card">
          <div class="inventory-card-main">
            <div class="inventory-avatar">🎬</div>
            <div class="inventory-copy">
              <div class="card-top compact-top">
                <div>
                  <h3>${item.clientName}</h3>
                  <p class="card-meta">${item.plataforma}</p>
                </div>
              </div>
              <p class="inventory-line">📅 ${item.fechaInicio || 'N/A'} → ${item.fechaVencimiento || 'N/A'}</p>
              <div class="status-chip ${statusClass(item.normalizedStatus)}">${statusLabel(item.normalizedStatus)}</div>
              <div class="inventory-meta">
                <span>⏱ ${formatDays(item.daysRemaining)}</span>
                <span>👤 ${item.clientName}</span>
              </div>
            </div>
          </div>
          <div class="inventory-side inventory-side-actions">
            <div class="inventory-price-tag">C$ ${item.precioFinal || item.precio || item.price || 0}</div>
            ${renderDeleteButton(item)}
          </div>
          <div class="card-actions-row inventory-actions has-delete">
            <button class="btn-renew slim-btn" onclick="abrirRenovar('${item.idSuscripcion}')">Renovar</button>
            <button class="btn-edit slim-btn" onclick="abrirEditarSuscripcion('${item.idSuscripcion}')">Editar</button>
            <button class="btn-cancel slim-btn" onclick="abrirDarDeBaja('${item.idSuscripcion}')">Suspender</button>
            ${renderWhatsAppButton(item)}
          </div>
        </article>
      `
    )
    .join('');
}

async function refreshSubscriptionsView(force = false) {
  try {
    await loadSubscriptionRecords(force);
  } catch (error) {
    console.error('Error refreshing subscriptions:', error);
    showToast(state.loadError || 'Could not load subscriptions', 'error', 4000);
  }

  renderSubscriptionCards();
}

function abrirVistaSuscripciones() {
  window.setActiveView?.('subscriptions');
  window.toggleSidebar?.(false);
  refreshSubscriptionsView(false);
}

function abrirRenovar(idSuscripcion) {
  if (!idSuscripcion) {
    showToast('ID invalido', 'error');
    return;
  }

  state.suscripcionARenovar = String(idSuscripcion).trim();
  document.getElementById('renovarMeses').value = 1;
  document.getElementById('modalRenovar').classList.remove('hidden');
}

function cerrarRenovar() {
  document.getElementById('modalRenovar').classList.add('hidden');
  document.getElementById('renovarMeses').value = '';
  state.suscripcionARenovar = null;
}

async function confirmarRenovar() {
  const btn = document.querySelector('#modalRenovar .btn-save');
  const input = document.getElementById('renovarMeses');
  const meses = parseInt(input.value, 10);

  if (Number.isNaN(meses) || meses <= 0 || !state.suscripcionARenovar) {
    showToast('Ingresa meses validos', 'error');
    return;
  }

  try {
    setButtonLoading(btn, true);
    await firebaseService.renewSubscription(state.suscripcionARenovar, meses);
    appCache.invalidate();
    showToast('Suscripcion renovada con exito');
    cerrarRenovar();
    await Promise.all([
      window.searchPage?.refreshClientsView?.(true),
      refreshSubscriptionsView(true),
    ]);
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Error al renovar', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function cargarClientesSelect() {
  await appCache.ensureData(false);
}

function initClienteAutocomplete() {
  const inputCliente = document.getElementById('subClienteInput');
  const listaClientes = document.getElementById('clienteList');

  if (!inputCliente || !listaClientes || inputCliente.dataset.bound === 'true') {
    return;
  }

  inputCliente.dataset.bound = 'true';
  inputCliente.addEventListener('input', () => {
    const texto = inputCliente.value.toLowerCase().trim();
    listaClientes.innerHTML = '';
    state.clienteSeleccionadoId = null;

    if (!texto) {
      listaClientes.classList.add('hidden');
      return;
    }

    const filtrados = state.clientesCache.filter((cliente) =>
      cliente.nombre.toLowerCase().includes(texto)
    );

    filtrados.forEach((cliente) => {
      const item = document.createElement('div');
      item.textContent = cliente.nombre;
      item.onclick = () => {
        inputCliente.value = cliente.nombre;
        state.clienteSeleccionadoId = cliente.id;
        listaClientes.classList.add('hidden');
      };
      listaClientes.appendChild(item);
    });

    listaClientes.classList.toggle('hidden', filtrados.length === 0);
  });
}

async function initPlataformaDropdown() {
  const select = document.getElementById('subPlataforma');
  const precioBaseInput = document.getElementById('subPrecioBase');
  if (!select || !precioBaseInput) return;

  try {
    const data = await plataformasService.getPlataformas();
    const uniquePlatforms = Array.from(
      new Map(
        (data || [])
          .filter((item) => item?.activo && item?.nombre)
          .map((item) => [item.nombre.toUpperCase(), item])
      ).values()
    ).sort((a, b) => a.nombre.localeCompare(b.nombre));

    select.innerHTML = '<option value="">Selecciona plataforma</option>';
    uniquePlatforms.forEach((plataforma) => {
      const option = document.createElement('option');
      option.value = plataforma.nombre;
      option.textContent = plataforma.nombre;
      option.dataset.precio = String(plataforma.precioBase || 0);
      option.dataset.perfiles = String(plataforma.perfiles || 0);
      select.appendChild(option);
    });

    select.onchange = async () => {
      precioBaseInput.value = select.selectedOptions[0]?.dataset?.precio || '';
      await updateSuggestedAccount();
      updateProfileSuggestions();
    };
  } catch (error) {
    console.error(error);
    select.innerHTML = '<option value="">Sin plataformas</option>';
    precioBaseInput.value = '';
    showToast('No se pudieron cargar las plataformas', 'error');
  }
}

function hideCorreoSuggestions() {
  const list = document.getElementById('correosList');
  if (list) {
    list.classList.add('hidden');
  }
}

function renderCorreoSuggestions() {
  const input = document.getElementById('subCorreo');
  const passwordInput = document.getElementById('subContrasena');
  const list = document.getElementById('correosList');
  const items = Array.isArray(state.correosCatalog) ? state.correosCatalog : [];
  if (!input || !list) return;

  const value = String(input.value || '').trim().toLowerCase();
  const selected = items.find((item) => String(item.email || '').toLowerCase() === value);
  const filtered = value
    ? items.filter((item) => String(item.email || '').toLowerCase().includes(value)).slice(0, 6)
    : [];

  input.dataset.correoId = selected?.id || '';
  if (selected && !String(passwordInput?.value || '').trim() && selected.password) {
    passwordInput.value = selected.password;
  }

  list.innerHTML = filtered
    .map((item) => `<div data-correo-id="${item.id}">${item.email}</div>`)
    .join('');

  list.querySelectorAll('[data-correo-id]').forEach((node) => {
    node.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const picked = items.find((item) => item.id === node.dataset.correoId);
      input.value = picked?.email || '';
      input.dataset.correoId = picked?.id || '';
      if (picked && !String(passwordInput?.value || '').trim() && picked.password) {
        passwordInput.value = picked.password;
      }
      hideCorreoSuggestions();
      updateProfileSuggestions();
    });
  });

  list.classList.toggle('hidden', filtered.length === 0);
}

function bindCorreoSelection() {
  const input = document.getElementById('subCorreo');
  if (!input || input.dataset.bound === 'true') return;

  input.dataset.bound = 'true';
  input.addEventListener('input', () => {
    hideProfileSuggestions();
    renderCorreoSuggestions();
  });
  input.addEventListener('focus', () => {
    renderCorreoSuggestions();
  });
  input.addEventListener('blur', () => {
    window.setTimeout(() => {
      hideCorreoSuggestions();
    }, 120);
  });
}

async function initCorreosCatalog() {
  const input = document.getElementById('subCorreo');
  const list = document.getElementById('correosList');
  bindCorreoSelection();
  if (!list) return;

  try {
    const correos = await correosService.getCorreosCatalog();
    state.correosCatalog = correos;
    if (String(input?.value || '').trim()) {
      renderCorreoSuggestions();
    } else {
      hideCorreoSuggestions();
    }
  } catch (error) {
    console.error(error);
    list.innerHTML = '';
  }
}

function hideProfileSuggestions() {
  const list = document.getElementById('perfilesList');
  if (list) {
    list.classList.add('hidden');
  }
}

async function updateProfileSuggestions() {
  const input = document.getElementById('subPerfil');
  const list = document.getElementById('perfilesList');
  const correoInput = document.getElementById('subCorreo');
  const platformSelect = document.getElementById('subPlataforma');
  if (!input || !list || !correoInput || !platformSelect) return;

  const correo = String(correoInput.value || '').trim().toLowerCase();
  const plataforma = String(platformSelect.value || '').trim().toUpperCase();
  const maxProfiles = Number(platformSelect.selectedOptions[0]?.dataset?.perfiles || 0) || 0;

  const data = await appCache.ensureData(false);
  const existingProfiles = [...new Set(
    (data?.subscriptions || [])
      .filter((item) => {
        const sameCorreo = String(item.correo || item.email || '').trim().toLowerCase() === correo;
        const samePlatform = String(item.plataforma || '').trim().toUpperCase() === plataforma;
        return sameCorreo && samePlatform && String(item.perfil || '').trim();
      })
      .map((item) => String(item.perfil || '').trim())
  )];

  const genericProfiles = Array.from(
    { length: Math.max(maxProfiles, existingProfiles.length, 5) },
    (_, index) => `Perfil ${index + 1}`
  );

  state.profileSuggestions = [...new Set([...existingProfiles, ...genericProfiles])];
  const query = String(input?.value || '').trim().toLowerCase();
  const filtered = (query
    ? state.profileSuggestions.filter((item) => item.toLowerCase().includes(query))
    : state.profileSuggestions
  ).slice(0, 8);

  list.innerHTML = filtered.map((item) => `<div data-profile="${item}">${item}</div>`).join('');
  list.querySelectorAll('[data-profile]').forEach((node) => {
    node.addEventListener('mousedown', (event) => {
      event.preventDefault();
      if (input) input.value = node.dataset.profile || '';
      hideProfileSuggestions();
    });
  });
  const shouldOpen = document.activeElement === input && filtered.length > 0;
  list.classList.toggle('hidden', !shouldOpen);
}


function generarContrasenaSub() {
  const passwordInput = document.getElementById('subContrasena');
  if (!passwordInput) return;

  const pin = String(Math.floor(1000 + Math.random() * 9000));
  passwordInput.value = pin;
}

function abrirCrearSub() {
  window.toggleSidebar?.(false);
  document.getElementById('modalCrearSub').classList.remove('hidden');
  renderSuggestedAccount(null);
  cargarClientesSelect();
  initClienteAutocomplete();
  initPlataformaDropdown();
  initCorreosCatalog();
  hideCorreoSuggestions();
  hideProfileSuggestions();

  const profileInput = document.getElementById('subPerfil');
  if (profileInput && profileInput.dataset.bound !== 'true') {
    profileInput.dataset.bound = 'true';
    profileInput.addEventListener('input', () => {
      updateProfileSuggestions();
    });
    profileInput.addEventListener('focus', () => {
      updateProfileSuggestions();
    });
    profileInput.addEventListener('blur', () => {
      window.setTimeout(() => {
        hideProfileSuggestions();
      }, 120);
    });
  }
}

async function initEditPlataformaDropdown(selectedValue = '') {
  const select = document.getElementById('editPlataforma');
  const precioFinalInput = document.getElementById('editPrecioFinal');
  if (!select) return;

  try {
    const data = await plataformasService.getPlataformas();
    const uniquePlatforms = Array.from(
      new Map(
        (data || [])
          .filter((item) => item?.activo && item?.nombre)
          .map((item) => [item.nombre.toUpperCase(), item])
      ).values()
    ).sort((a, b) => a.nombre.localeCompare(b.nombre));

    select.innerHTML = '<option value="">Selecciona plataforma</option>';
    uniquePlatforms.forEach((plataforma) => {
      const option = document.createElement('option');
      option.value = plataforma.nombre;
      option.textContent = plataforma.nombre;
      option.dataset.precio = String(plataforma.precioBase || 0);
      select.appendChild(option);
    });

    const fallbackValue = String(selectedValue || '').trim();
    if (fallbackValue && !uniquePlatforms.some((item) => item.nombre === fallbackValue)) {
      const option = document.createElement('option');
      option.value = fallbackValue;
      option.textContent = `${fallbackValue} (actual)`;
      option.dataset.precio = '';
      select.appendChild(option);
    }

    select.value = fallbackValue;
    select.onchange = () => {
      const suggestedPrice = select.selectedOptions[0]?.dataset?.precio || '';
      if (!precioFinalInput) return;
      if (!String(precioFinalInput.value || '').trim() && suggestedPrice) {
        precioFinalInput.value = suggestedPrice;
      }
    };
  } catch (error) {
    console.error(error);
    select.innerHTML = '<option value="">Sin plataformas</option>';
    showToast('No se pudieron cargar las plataformas', 'error');
  }
}

async function guardarSuscripcion() {
  const btn = document.querySelector('#modalCrearSub .btn-save');
  const payload = {
    cliente: state.clienteSeleccionadoId,
    plataforma: document.getElementById('subPlataforma').value,
    fechaInicio: normalizarFechaISO(document.getElementById('subFechaInicio').value),
    meses: document.getElementById('subMeses').value,
    precioBase: document.getElementById('subPrecioBase').value,
    correo: document.getElementById('subCorreo').value.trim(),
    correoId: document.getElementById('subCorreo').dataset.correoId || '',
    perfil: document.getElementById('subPerfil').value.trim(),
    contrasena: document.getElementById('subContrasena').value.trim(),
  };

  const precioFinal = document.getElementById('subPrecioFinal').value.trim();
  if (precioFinal) payload.precioFinal = precioFinal;

  if (!payload.cliente || !payload.plataforma || !payload.fechaInicio || !payload.meses || !payload.correo) {
    showToast('Completa los campos obligatorios', 'error');
    return;
  }

  try {
    setButtonLoading(btn, true);
    await firebaseService.createSubscription(payload);
    appCache.invalidate();
    showToast('Suscripcion creada correctamente');
    cerrarCrearSub();
    await Promise.all([
      window.searchPage?.refreshClientsView?.(true),
      refreshSubscriptionsView(true),
    ]);
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Error al crear', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function limpiarCrearSub() {
  [
    'subClienteInput',
    'subPlataforma',
    'subPrecioBase',
    'subPrecioFinal',
    'subFechaInicio',
    'subMeses',
    'subCorreo',
    'subPerfil',
    'subContrasena',
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.value = '';
  });
  const correoInput = document.getElementById('subCorreo');
  if (correoInput) {
    correoInput.dataset.cuentaId = '';
    correoInput.dataset.correoId = '';
  }
  hideCorreoSuggestions();
  hideProfileSuggestions();
  renderSuggestedAccount(null);
  state.clienteSeleccionadoId = null;
}

function cerrarCrearSub() {
  document.getElementById('modalCrearSub').classList.add('hidden');
  limpiarCrearSub();
}

async function abrirEditarSuscripcion(id) {
  state.suscripcionEditando = id;

  try {
    const item = await firebaseService.getSubscriptionById(id);
    await initEditPlataformaDropdown(item.plataforma);
    document.getElementById('editInicio').value = item.inicio;
    document.getElementById('editVencimiento').value = item.vencimiento;
    document.getElementById('editEstado').value = item.estado;
    document.getElementById('editPrecioFinal').value = item.precioFinal || '';
    document.getElementById('editCorreoSub').value = item.correo || '';
    document.getElementById('editPerfilSub').value = item.perfil || '';
    document.getElementById('editPinSub').value = item.pin || '';
    document.getElementById('modalEditarSub').classList.remove('hidden');
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'No se pudo cargar la suscripcion', 'error');
  }
}

async function confirmarEditarSub() {
  const btn = document.querySelector('#modalEditarSub .btn-save');
  const payload = {
    idSuscripcion: state.suscripcionEditando,
    plataforma: document.getElementById('editPlataforma').value,
    inicio: document.getElementById('editInicio').value,
    vencimiento: document.getElementById('editVencimiento').value,
    estado: document.getElementById('editEstado').value,
    precioFinal: document.getElementById('editPrecioFinal').value,
    correo: document.getElementById('editCorreoSub').value.trim(),
    perfil: document.getElementById('editPerfilSub').value.trim(),
    pin: document.getElementById('editPinSub').value.trim(),
  };

  if (!payload.plataforma) {
    showToast('Selecciona una plataforma', 'error');
    return;
  }

  try {
    setButtonLoading(btn, true);
    await firebaseService.updateSubscription(payload);
    appCache.invalidate();
    showToast('Suscripcion actualizada');
    cerrarEditarSub();
    await Promise.all([
      window.searchPage?.refreshClientsView?.(true),
      refreshSubscriptionsView(true),
    ]);
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Error al guardar', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function generarPinEditarSub() {
  const input = document.getElementById('editPinSub');
  if (!input) return;
  input.value = String(Math.floor(1000 + Math.random() * 9000));
}

function cerrarEditarSub() {
  document.getElementById('modalEditarSub').classList.add('hidden');
  state.suscripcionEditando = null;
}

async function abrirEditarCuenta(idSuscripcion) {
  state.cuentaEditando = idSuscripcion;

  try {
    const cuenta = await firebaseService.getAccountBySubscriptionId(idSuscripcion);
    document.getElementById('editCorreo').value = cuenta.correo;
    document.getElementById('editPerfil').value = cuenta.perfil;
    document.getElementById('editPerfil').disabled = false;
    document.getElementById('editPerfil').placeholder = 'Profile 1';
    document.getElementById('editContrasena').value = cuenta.contrasena;
    document.getElementById('editRenewalDate').value = cuenta.renewalDate || '';
    document.getElementById('editRenewalPrice').value = cuenta.renewalPrice || '';
    document.getElementById('editAutoRenew').checked = Boolean(cuenta.autoRenew);
    document.getElementById('editAccountNotes').value = cuenta.notes || '';
    state.cuentaEditandoEsGeneral = false;
    document.getElementById('modalEditarCuenta').classList.remove('hidden');
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'No se pudo cargar la cuenta', 'error');
  }
}

async function confirmarEditarCuenta() {
  if (state.cuentaEditandoEsGeneral) {
    return window.confirmarEditarCuentaGeneral?.();
  }

  const btn = document.querySelector('#modalEditarCuenta .btn-save');
  const payload = {
    idSuscripcion: state.cuentaEditando,
    correo: document.getElementById('editCorreo').value,
    perfil: document.getElementById('editPerfil').value,
    contrasena: document.getElementById('editContrasena').value,
    renewalDate: document.getElementById('editRenewalDate').value,
    renewalPrice: document.getElementById('editRenewalPrice').value,
    autoRenew: document.getElementById('editAutoRenew').checked,
    notes: document.getElementById('editAccountNotes').value.trim(),
  };

  try {
    setButtonLoading(btn, true);
    await firebaseService.updateAccount(payload);
    appCache.invalidate();
    showToast('Cuenta actualizada');
    cerrarEditarCuenta();
    await Promise.all([
      window.searchPage?.refreshClientsView?.(true),
      refreshSubscriptionsView(true),
      window.accountsPage?.refreshAccountsView?.(true),
      window.plataformasPage?.refreshPlatformsView?.(true),
      window.correosPage?.refreshCorreosView?.(true),
    ]);
    window.dashboardPage?.refreshDashboard?.();
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Error al guardar la cuenta', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function cerrarEditarCuenta() {
  document.getElementById('modalEditarCuenta').classList.add('hidden');
  const perfilInput = document.getElementById('editPerfil');
  if (perfilInput) {
    perfilInput.disabled = false;
    perfilInput.placeholder = 'Profile 1';
  }
  state.cuentaEditando = null;
  state.cuentaEditandoEsGeneral = false;
}

function abrirDarDeBaja(idSuscripcion) {
  state.suscripcionABaja = idSuscripcion;
  document.getElementById('modalBaja').classList.remove('hidden');
}

function cerrarDarDeBaja() {
  document.getElementById('modalBaja').classList.add('hidden');
  state.suscripcionABaja = null;
}

async function confirmarDarDeBaja() {
  const btn = document.querySelector('#modalBaja .btn-save');
  if (!state.suscripcionABaja) {
    showToast('No hay suscripcion seleccionada', 'error');
    return;
  }

  try {
    setButtonLoading(btn, true);
    await firebaseService.suspendSubscription(state.suscripcionABaja);
    appCache.invalidate();
    showToast('Suscripcion suspendida');
    cerrarDarDeBaja();
    await Promise.all([
      window.searchPage?.refreshClientsView?.(true),
      refreshSubscriptionsView(true),
    ]);
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Error al suspender', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function abrirEliminarSuscripcion(idSuscripcion) {
  state.suscripcionAEliminar = String(idSuscripcion || '').trim();
  const input = document.getElementById('eliminarSuscripcionConfirmacion');
  if (input) input.value = '';
  document.getElementById('modalEliminarSuscripcion')?.classList.remove('hidden');
}

function cerrarEliminarSuscripcion() {
  document.getElementById('modalEliminarSuscripcion')?.classList.add('hidden');
  const input = document.getElementById('eliminarSuscripcionConfirmacion');
  if (input) input.value = '';
  state.suscripcionAEliminar = null;
}

async function confirmarEliminarSuscripcion() {
  const btn = document.querySelector('#modalEliminarSuscripcion .btn-delete');
  const input = document.getElementById('eliminarSuscripcionConfirmacion');
  const confirmacion = String(input?.value || '').trim().toUpperCase();

  if (!state.suscripcionAEliminar) {
    showToast('No hay suscripcion seleccionada', 'error');
    return;
  }

  if (confirmacion !== 'ELIMINAR') {
    showToast('Escribe ELIMINAR para confirmar', 'error');
    input?.focus();
    return;
  }

  try {
    setButtonLoading(btn, true);
    await firebaseService.deleteSubscriptionCascade(state.suscripcionAEliminar);
    appCache.invalidate();
    showToast('Suscripcion eliminada');
    cerrarEliminarSuscripcion();
    await Promise.all([
      window.searchPage?.refreshClientsView?.(true),
      refreshSubscriptionsView(true),
    ]);
  } catch (error) {
    console.error(error);
    showToast('No se pudo eliminar la suscripcion', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

function init() {
  const searchInput = document.getElementById('subscriptionsSearchInput');
  const filterSelect = document.getElementById('subscriptionsFilterSelect');
  const dateFilterSelect = document.getElementById('subscriptionsDateFilterSelect');
  const filterToggle = document.getElementById('subscriptionsFilterToggle');
  const filterPanel = document.getElementById('subscriptionsFilterPanel');

  state.subscriptionsQuery = '';
  state.subscriptionsFilter = 'TODAS';
  state.subscriptionsDateFilter = 'HOY';
  state.subscriptionsFilterOpen = false;

  const syncFilterPanel = () => {
    filterPanel?.classList.toggle('hidden', !state.subscriptionsFilterOpen);
    dateFilterSelect?.classList.toggle('hidden', state.subscriptionsFilter !== 'POR_FECHA');
    filterToggle?.setAttribute('aria-expanded', String(state.subscriptionsFilterOpen));
  };

  searchInput?.addEventListener('input', (event) => {
    state.subscriptionsQuery = event.target.value;
    renderSubscriptionCards();
  });

  filterToggle?.addEventListener('click', () => {
    state.subscriptionsFilterOpen = !state.subscriptionsFilterOpen;
    syncFilterPanel();

    if (state.subscriptionsFilterOpen) {
      (state.subscriptionsFilter === 'POR_FECHA' ? dateFilterSelect : filterSelect)?.focus();
    }
  });

  filterSelect?.addEventListener('change', (event) => {
    state.subscriptionsFilter = event.target.value;
    if (state.subscriptionsFilter !== 'POR_FECHA') {
      state.subscriptionsFilterOpen = false;
    }
    syncFilterPanel();
    renderSubscriptionCards();
  });

  dateFilterSelect?.addEventListener('change', (event) => {
    state.subscriptionsDateFilter = event.target.value;
    state.subscriptionsFilterOpen = false;
    syncFilterPanel();
    renderSubscriptionCards();
  });

  document.addEventListener('click', (event) => {
    if (!state.subscriptionsFilterOpen) return;

    const clickedInsideFilter =
      filterPanel?.contains(event.target) ||
      filterToggle?.contains(event.target);

    if (!clickedInsideFilter) {
      state.subscriptionsFilterOpen = false;
      syncFilterPanel();
    }
  });

  syncFilterPanel();
  refreshSubscriptionsView(false);
}

window.subscriptionsPage = {
  init,
  loadSubscriptionRecords,
  refreshSubscriptionsView,
  renderSubscriptionCards,
  renderSuscripciones,
};
window.abrirVistaSuscripciones = abrirVistaSuscripciones;
window.abrirCrearSub = abrirCrearSub;
window.cerrarCrearSub = cerrarCrearSub;
window.guardarSuscripcion = guardarSuscripcion;
window.abrirRenovar = abrirRenovar;
window.cerrarRenovar = cerrarRenovar;
window.confirmarRenovar = confirmarRenovar;
window.abrirEditarSuscripcion = abrirEditarSuscripcion;
window.confirmarEditarSub = confirmarEditarSub;
window.cerrarEditarSub = cerrarEditarSub;
window.abrirEditarCuenta = abrirEditarCuenta;
window.confirmarEditarCuenta = confirmarEditarCuenta;
window.cerrarEditarCuenta = cerrarEditarCuenta;
window.abrirDarDeBaja = abrirDarDeBaja;
window.cerrarDarDeBaja = cerrarDarDeBaja;
window.confirmarDarDeBaja = confirmarDarDeBaja;
window.abrirEliminarSuscripcion = abrirEliminarSuscripcion;
window.cerrarEliminarSuscripcion = cerrarEliminarSuscripcion;
window.confirmarEliminarSuscripcion = confirmarEliminarSuscripcion;
window.abrirWhatsAppSuscripcion = abrirWhatsAppSuscripcion;
window.generarContrasenaSub = generarContrasenaSub;
window.generarPinEditarSub = generarPinEditarSub;






