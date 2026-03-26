function calcularRentabilidadCuenta(cuenta, subs) {
  const account = cuenta || {};
  const accountIds = Array.isArray(account.cuentaIds) ? account.cuentaIds : [];
  const subscriptions = Array.isArray(subs) ? subs : [];

  const subsCuenta = subscriptions.filter((item) => {
    const subscriptionId = String(item?.idSuscripcion || item?.id || '').trim();
    const cuentaId = String(item?.cuentaId || item?.accountId || '').trim();

    return (
      (account.id && cuentaId === account.id) ||
      accountIds.includes(subscriptionId)
    );
  });

  const ingresos = subsCuenta.reduce((acc, item) => {
    return acc + (Number(item?.precioFinal ?? item?.precio ?? item?.price ?? 0) || 0);
  }, 0);

  const costo =
    Number(
      account?.costoMensual ??
      account?.precioBase ??
      account?.platformCost ??
      0
    ) || 0;

  const ganancia = ingresos - costo;
  const margen = ingresos === 0 ? 0 : (ganancia / ingresos) * 100;

  return {
    ingresos,
    costo,
    ganancia,
    margen: Number(margen.toFixed(1)),
  };
}

window.rentabilidadUtils = {
  calcularRentabilidadCuenta,
};

export { calcularRentabilidadCuenta };
