const round = n => Math.round(n * 100) / 100;

function calcularMorosidad(ventas) {
    // Recopila cuántos días tardó en pagar en cada venta
    const lags = [];
    for (const v of ventas) {
        if (!v.cobros?.length) continue;
        const primerCobro = v.cobros.sort((a, b) => new Date(a.fecha) - new Date(b.fecha))[0];
        const diasTardados = Math.round((new Date(primerCobro.fecha) - new Date(v.fecha)) / 86400000);
        if (diasTardados >= 0) lags.push(diasTardados);
    }

    if (!lags.length) return { indiceMorosidad: 0.5, lagPromedio: 0 };

    const promedio = lags.reduce((s, d) => s + d, 0) / lags.length;

    // Entre más días tarda en pagar, más alto el índice (0 = paga rápido, 1 = paga muy tarde)
    // 30 días como referencia: si tarda 30 días el índice es 0.5
    const indice = round(Math.min(promedio / 60, 1));

    return {
        indiceMorosidad: indice,
        lagPromedio: Math.round(promedio)
    };
}

function analizarCartera(ventas) {
    // Agrupa las ventas por cliente
    const grupos = {};
    for (const v of ventas) {
        if (!grupos[v.cliente]) grupos[v.cliente] = [];
        grupos[v.cliente].push(v);
    }

    // Por cada cliente calcula su saldo y su morosidad
    const clientes = Object.entries(grupos).map(([nombre, vs]) => {
        const saldo = round(vs.reduce((s, v) => s + Math.max(0, v.total - (v.totalPagado || 0)), 0));
        const { indiceMorosidad, lagPromedio } = calcularMorosidad(vs);

        return {
            nombre,
            saldoPendiente:  saldo,
            indiceMorosidad,
            lagPromedio,
            // Riesgo = cuánto debe × qué tan mal paga
            riesgoPonderado: round(saldo * indiceMorosidad)
        };
    });

    // Devuelve top 10: solo los que deben algo, ordenados de mayor a menor riesgo
    return {
        rankingRiesgo: clientes
            .filter(c => c.saldoPendiente > 0)
            .sort((a, b) => b.riesgoPonderado - a.riesgoPonderado)
            .slice(0, 10)
    };
}

module.exports = { analizarCartera };