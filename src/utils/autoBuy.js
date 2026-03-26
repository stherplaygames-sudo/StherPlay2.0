function recomendarCompra({ porcentaje, cuentas }) {
  const occupancy = Number(porcentaje || 0);
  const items = Array.isArray(cuentas) ? cuentas : [];

  if (occupancy < 95) return null;

  const casiLlenas = items.filter((cuenta) => {
    const usados = Number(cuenta?.perfilesUsados || 0);
    const max = Number(cuenta?.perfilesMax || 0);
    if (max <= 0) return false;
    return usados / max >= 0.9;
  }).length;

  const recomendadas = casiLlenas > 3 ? 2 : 1;

  return {
    recomendadas,
    razon: 'Alta ocupacion',
    mensaje: `Recomendado: comprar ${recomendadas} cuenta(s) nueva(s)`,
  };
}

window.autoBuyUtils = {
  recomendarCompra,
};

export { recomendarCompra };
