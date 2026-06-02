const media = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
const desv  = (arr, m) => arr.length < 2 ? 0 : Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length);
const dias  = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const round = n => Math.round(n * 100) / 100;

function calcularRitmo(ventas) {
    const ord = [...ventas].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    if (ord.length < 2) return { periodoDominante: 14, volatilidad: 0 };
    const deltas = [], pesos = [];
    for (let i = 1; i < ord.length; i++) {
        const d = dias(ord[i - 1].fecha, ord[i].fecha);
        if (d > 0) { deltas.push(d); pesos.push((ord[i - 1].total + ord[i].total) / 2); }
    }
    if (!deltas.length) return { periodoDominante: 14, volatilidad: 0 };
    const sp = pesos.reduce((s, p) => s + p, 0);
    const p  = Math.max(7, Math.min(60, Math.round(deltas.reduce((s, d, i) => s + d * pesos[i], 0) / sp)));
    return { periodoDominante: p, volatilidad: Math.round(desv(deltas, media(deltas))) };
}

function calcularMorosidad(ventas) {
    const lags = ventas.flatMap(v => {
        if (!v.cobros?.length) return [];
        const sorted = [...v.cobros].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        const lag = dias(v.fecha, sorted[0].fecha);
        return lag >= 0 ? [lag] : [];
    });
    if (!lags.length) return { indiceMorosidad: 1, lagPromedio: 0, ultimoLag: 0 };
    const m = media(lags), d = desv(lags, m);
    const z = d === 0 ? 0 : (lags[lags.length - 1] - m) / d;
    return { indiceMorosidad: round(1 / (1 + Math.exp(-0.5 * z))), lagPromedio: Math.round(m), ultimoLag: lags[lags.length - 1] };
}

function proyectar(clientes, umbral) {
    const hoy    = new Date();
    const semanas = Array.from({ length: 8 }, (_, i) => ({
        semana:              i + 1,
        fechaInicio:         new Date(hoy.getTime() + i * 7 * 86400000),
        fechaFin:            new Date(hoy.getTime() + (i + 1) * 7 * 86400000),
        recaudacionEsperada: 0,
        clientesEsperados:   []
    }));

    for (const c of clientes) {
        if (!c.saldoPendiente || c.saldoPendiente <= 0 || !c.ultimaCompra || !c.periodoCompra) continue;
        const { periodoCompra: periodo, indiceMorosidad, saldoPendiente, ultimaCompra } = c;
        const confBase     = Math.exp(-1.5 * indiceMorosidad);
        const diasDesde    = dias(ultimaCompra, hoy);
        const mod          = diasDesde % periodo;
        const offset0      = mod === 0 ? periodo : periodo - mod;
        const ciclosEnH    = Math.max(1, Math.floor(56 / periodo));
        const montoCiclo   = saldoPendiente / ciclosEnH;

        for (let k = 0, offset = offset0; offset <= 56 && k < 100; k++, offset += periodo) {
            const monto = round(montoCiclo * confBase * Math.exp(-0.08 * k));
            const idx   = Math.floor(offset / 7);
            if (monto > 0.01 && idx >= 0 && idx < 8) {
                semanas[idx].recaudacionEsperada += monto;
                if (!semanas[idx].clientesEsperados.includes(c.nombre))
                    semanas[idx].clientesEsperados.push(c.nombre);
            }
        }
    }

    semanas.forEach(s => s.recaudacionEsperada = round(s.recaudacionEsperada));
    const runway = semanas.find(s => s.recaudacionEsperada < umbral);
    return {
        curva:       semanas,
        runwayFecha: runway ? runway.fechaInicio : null,
        runwayDias:  runway ? dias(hoy, runway.fechaInicio) : -1
    };
}

function analizarCartera(ventas, umbral = 200) {
    const grupos = {};
    ventas.forEach(v => { (grupos[v.cliente] ??= []).push(v); });

    const clientes = Object.entries(grupos).map(([nombre, vs]) => {
        const ritmo = calcularRitmo(vs);
        const moros = calcularMorosidad(vs);
        const saldo = round(vs.reduce((s, v) => s + Math.max(0, v.total - (v.totalPagado || 0)), 0));
        const ultima = new Date(Math.max(...vs.map(v => new Date(v.fecha)))).toISOString();
        return {
            nombre,
            totalVentas:      vs.length,
            saldoPendiente:   saldo,
            ultimaCompra:     ultima,
            periodoDominante: ritmo.periodoDominante,
            periodoCompra:    ritmo.periodoDominante,
            volatilidad:      ritmo.volatilidad,
            indiceMorosidad:  moros.indiceMorosidad,
            lagPromedio:      moros.lagPromedio,
            ultimoLag:        moros.ultimoLag,
            riesgoPonderado:  round(saldo * moros.indiceMorosidad)
        };
    });

    const calor = [0, 0, 0, 0, 0, 0, 0];
    ventas.forEach(v => v.cobros?.forEach(c => { calor[new Date(c.fecha).getDay()] += (c.monto || 0); }));

    return {
        clientes,
        proyeccion:       proyectar(clientes, umbral),
        rankingRiesgo:    clientes.filter(c => c.saldoPendiente > 0).sort((a, b) => b.riesgoPonderado - a.riesgoPonderado).slice(0, 10),
        mapaCalorSemanal: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((dia, i) => ({ dia, monto: round(calor[i]) }))
    };
}

module.exports = { analizarCartera };