const round = n => Math.round(n * 100) / 100;

// ── Morosidad ─────────────────────────────────────────────────────────────────

function lagDePago(venta) {
    if (!venta.cobros?.length) return null;

    let primerFecha = new Date(venta.cobros[0].fecha);
    for (const c of venta.cobros) {
        const f = new Date(c.fecha);
        if (f < primerFecha) primerFecha = f;
    }

    const dias = Math.round((primerFecha - new Date(venta.fecha)) / 86400000);
    return dias >= 0 ? dias : null;
}

function calcularMorosidad(ventas) {
    const lags = [];
    for (const v of ventas) {
        const lag = lagDePago(v);
        if (lag !== null) lags.push(lag);
    }

    if (!lags.length) return { indiceMorosidad: 0.5, lagPromedio: 0 };

    let suma = 0;
    for (const d of lags) suma += d;
    const promedio = suma / lags.length;

    return {
        indiceMorosidad: round(Math.min(promedio / 60, 1)),
        lagPromedio:     Math.round(promedio)
    };
}

// ── Cartera ───────────────────────────────────────────────────────────────────

function saldoCliente(ventas) {
    let total = 0;
    for (const v of ventas) {
        const pendiente = v.total - (v.totalPagado || 0);
        if (pendiente > 0) total += pendiente;
    }
    return round(total);
}

function agruparPorCliente(ventas) {
    const grupos = {};
    for (const v of ventas) {
        if (!grupos[v.cliente]) grupos[v.cliente] = [];
        grupos[v.cliente].push(v);
    }
    return grupos;
}

function analizarCartera(ventas) {
    const grupos  = agruparPorCliente(ventas);
    const ranking = [];

    for (const nombre in grupos) {
        const vs    = grupos[nombre];
        const saldo = saldoCliente(vs);
        if (saldo <= 0) continue;

        const { indiceMorosidad, lagPromedio } = calcularMorosidad(vs);

        ranking.push({
            nombre,
            saldoPendiente:  saldo,
            indiceMorosidad,
            lagPromedio,
            riesgoPonderado: round(saldo * indiceMorosidad)
        });
    }

    ranking.sort((a, b) => b.riesgoPonderado - a.riesgoPonderado);

    return { rankingRiesgo: ranking.slice(0, 10) };
}

module.exports = { analizarCartera };