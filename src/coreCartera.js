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

const DIAS_MORA    = 30;   
const RECARGO_MORA = 0.10; 

function analizarMorosidadVenta(venta) {
    const saldoPendiente = Math.max(0, venta.total - (venta.totalPagado || 0));

    
    if (saldoPendiente <= 0) {
        return {
            diasSinPago:     0,
            esMoroso:        false,
            recargoPct:      0,
            recargoMonto:    0,
            totalConRecargo: round(venta.total)
        };
    }
    const hoy          = new Date();
    const fechaVenta   = new Date(venta.fecha);
    const diasSinPago  = Math.max(0, Math.floor((hoy - fechaVenta) / 86400000));
    const esMoroso     = diasSinPago > DIAS_MORA;
    const recargoMonto = esMoroso ? round(saldoPendiente * RECARGO_MORA) : 0;
    const totalConRecargo = round(saldoPendiente + recargoMonto);

    return {
        diasSinPago,
        esMoroso,
        recargoPct:      esMoroso ? RECARGO_MORA * 100 : 0,
        recargoMonto,
        saldoBase:       round(saldoPendiente),
        totalConRecargo
    };
}

console.log(analizarMorosidadVenta({
    fecha: '2024-01-01',
    total: 1000,
    totalPagado: 500,
    cobros: [
        { fecha: '2024-02-01', monto: 500 }
    ]
}));    
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

module.exports = { analizarCartera, analizarMorosidadVenta };