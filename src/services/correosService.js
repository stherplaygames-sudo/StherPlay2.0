const appCache = () => window.appCache;
const accountsService = () => window.accountsService;
const firebaseService = () => window.firebaseService;
const plataformasMetrics = () => window.plataformasMetrics;

function normalizeText(value) {
  return String(value || '').trim();
}

async function getCorreosOverview(force = false) {
  const [accounts, data] = await Promise.all([
    accountsService().getAccountsOverview(force),
    appCache().ensureData(force),
  ]);

  const subscriptions = Array.isArray(data?.subscriptions) ? data.subscriptions : [];
  const groups = new Map();

  (accounts || []).forEach((account) => {
    const email = normalizeText(account?.correo || 'Sin correo');
    const correoId = normalizeText(account?.correoId || account?.emailId) || firebaseService().buildCorreoKey(email);

    if (!groups.has(correoId)) {
      groups.set(correoId, {
        id: correoId,
        correo: email,
        cuentas: [],
        clientesSet: new Set(),
      });
    }

    const group = groups.get(correoId);
    group.cuentas.push(account);
    (account.clientes || []).forEach((cliente) => {
      if (cliente?.cliente) group.clientesSet.add(cliente.cliente);
    });
  });

  return [...groups.values()].map((group) => {
    const metrics = plataformasMetrics().calcularOcupacion(group.cuentas);
    const ingresos = subscriptions.reduce((acc, item) => {
      const correo = normalizeText(item?.correo || item?.email);
      if (correo !== group.correo) return acc;
      return acc + (Number(item?.precioFinal ?? item?.precio ?? item?.price ?? 0) || 0);
    }, 0);

    return {
      id: group.id,
      correo: group.correo,
      totalCuentas: group.cuentas.length,
      totalClientes: group.clientesSet.size,
      totalCapacidad: metrics.total,
      totalUsados: metrics.usados,
      porcentajeOcupacion: metrics.porcentaje,
      ingresos,
      cuentas: group.cuentas.sort((a, b) => String(a.plataforma || '').localeCompare(String(b.plataforma || ''))),
    };
  }).sort((a, b) => a.correo.localeCompare(b.correo));
}

window.correosService = {
  getCorreosOverview,
};

export { getCorreosOverview };
