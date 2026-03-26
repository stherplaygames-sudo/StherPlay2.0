function sugerirCuenta(cuentas) {
  const disponibles = (Array.isArray(cuentas) ? cuentas : [])
    .filter((cuenta) => Number(cuenta?.perfilesUsados ?? 0) < Number(cuenta?.perfilesMax ?? 0));

  if (!disponibles.length) return null;

  disponibles.sort((a, b) => {
    const ocupacionA = Number(a?.perfilesUsados ?? 0) / Math.max(Number(a?.perfilesMax ?? 0), 1);
    const ocupacionB = Number(b?.perfilesUsados ?? 0) / Math.max(Number(b?.perfilesMax ?? 0), 1);

    if (ocupacionA !== ocupacionB) {
      return ocupacionA - ocupacionB;
    }

    return Number(a?.perfilesUsados ?? 0) - Number(b?.perfilesUsados ?? 0);
  });

  return disponibles[0];
}

window.cuentasSmart = {
  sugerirCuenta,
};

export { sugerirCuenta };
