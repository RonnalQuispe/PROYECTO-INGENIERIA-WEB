/**
 * UBICACIÓN: src/services/reportes.service.js
 * Toda la lógica de analytics y aggregations vive aquí.
 * Los controllers solo llaman estos métodos.
 */
const Venta = require('../models/venta.model');

// ── HELPERS ─────────────────────────────────────────────────────────────────

function buildRangoMes(mes, anio) {
    const hoy    = new Date();
    const m      = parseInt(mes)  || hoy.getMonth() + 1;
    const a      = parseInt(anio) || hoy.getFullYear();
    const inicio = new Date(a, m - 1, 1, 0, 0, 0);
    const fin    = new Date(a, m, 0, 23, 59, 59);
    return { inicio, fin, mes: m, anio: a };
}

function buildFiltroFecha({ fechaDesde, fechaHasta, mes, anio } = {}) {
    if (fechaDesde && fechaHasta) {
        return {
            $gte: new Date(fechaDesde + 'T00:00:00'),
            $lte: new Date(fechaHasta + 'T23:59:59')
        };
    }
    if (mes && anio) {
        const { inicio, fin } = buildRangoMes(mes, anio);
        return { $gte: inicio, $lte: fin };
    }
    if (anio && !mes) {
        return {
            $gte: new Date(parseInt(anio), 0, 1),
            $lte: new Date(parseInt(anio), 11, 31, 23, 59, 59)
        };
    }
    const { inicio, fin } = buildRangoMes();
    return { $gte: inicio, $lte: fin };
}

function buildFiltroZona(zona) {
    return zona && zona !== '' ? { zona } : {};
}

// ── 1. KPIs PRINCIPALES ──────────────────────────────────────────────────────

exports.getKPIs = async () => {
    const hoy = new Date();
    const inicioMes    = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const finMes       = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
    const inicioMesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const finMesAnt    = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59);
    const inicioHoy    = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const finHoy       = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);
    const inicioAnio   = new Date(hoy.getFullYear(), 0, 1);

    const [resMes, resMesAnt, resHoy, resAnio, pedidosMes] = await Promise.all([
        Venta.aggregate([
            { $match: { fecha: { $gte: inicioMes, $lte: finMes } } },
            { $group: { _id: null, total: { $sum: '$total' }, pedidos: { $sum: 1 }, ticket: { $avg: '$total' } } }
        ]),
        Venta.aggregate([
            { $match: { fecha: { $gte: inicioMesAnt, $lte: finMesAnt } } },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]),
        Venta.aggregate([
            { $match: { fecha: { $gte: inicioHoy, $lte: finHoy } } },
            { $group: { _id: null, total: { $sum: '$total' }, pedidos: { $sum: 1 } } }
        ]),
        Venta.aggregate([
            { $match: { fecha: { $gte: inicioAnio } } },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]),
        Venta.countDocuments({ fecha: { $gte: inicioMes, $lte: finMes } })
    ]);

    const totalMes    = resMes[0]?.total    || 0;
    const totalMesAnt = resMesAnt[0]?.total || 0;
    const crecimiento = totalMesAnt > 0
        ? (((totalMes - totalMesAnt) / totalMesAnt) * 100).toFixed(1)
        : totalMes > 0 ? 100 : 0;

    return {
        totalHoy:       resHoy[0]?.total   || 0,
        pedidosHoy:     resHoy[0]?.pedidos || 0,
        totalMes,
        pedidosMes,
        ticketPromedio: resMes[0]?.ticket  || 0,
        totalAnio:      resAnio[0]?.total  || 0,
        crecimientoMes: parseFloat(crecimiento),
        tendencia:      parseFloat(crecimiento) >= 0 ? 'up' : 'down'
    };
};

// ── 2. VENTAS POR MES — últimos 12 meses ────────────────────────────────────

exports.getVentasPorMes = async () => {
    const hace12 = new Date();
    hace12.setMonth(hace12.getMonth() - 11);
    hace12.setDate(1);
    const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    const res = await Venta.aggregate([
        { $match: { fecha: { $gte: hace12 } } },
        {
            $group: {
                _id: { anio: { $year: '$fecha' }, mes: { $month: '$fecha' } },
                total:    { $sum: '$total' },
                pedidos:  { $sum: 1 },
                unidades: { $sum: '$cantidad' }
            }
        },
        { $sort: { '_id.anio': 1, '_id.mes': 1 } }
    ]);

    return res.map(r => ({
        etiqueta: `${MESES[r._id.mes - 1]} ${r._id.anio}`,
        total:    Math.round(r.total * 100) / 100,
        pedidos:  r.pedidos,
        unidades: r.unidades
    }));
};

// ── 3. TOP PRODUCTOS ─────────────────────────────────────────────────────────

exports.getTopProductos = async (filtros = {}) => {
    const match = { fecha: buildFiltroFecha(filtros), ...buildFiltroZona(filtros.zona) };

    return Venta.aggregate([
        { $match: match },
        {
            $group: {
                _id:      '$producto',
                unidades: { $sum: '$cantidad' },
                ingresos: { $sum: '$total' },
                pedidos:  { $sum: 1 }
            }
        },
        { $sort: { unidades: -1 } },
        { $limit: 10 },
        { $project: { producto: '$_id', unidades: 1, ingresos: { $round: ['$ingresos', 2] }, pedidos: 1, _id: 0 } }
    ]);
};

// ── 4. PRODUCTOS MENOS VENDIDOS ──────────────────────────────────────────────

exports.getProductosMenosVendidos = async (filtros = {}) => {
    const match = { fecha: buildFiltroFecha(filtros), ...buildFiltroZona(filtros.zona) };

    return Venta.aggregate([
        { $match: match },
        { $group: { _id: '$producto', unidades: { $sum: '$cantidad' }, ingresos: { $sum: '$total' } } },
        { $sort: { unidades: 1 } },
        { $limit: 5 },
        { $project: { producto: '$_id', unidades: 1, ingresos: { $round: ['$ingresos', 2] }, _id: 0 } }
    ]);
};

// ── 5. VENTAS POR ZONA ───────────────────────────────────────────────────────

exports.getVentasPorZona = async (filtros = {}) => {
    const match = { fecha: buildFiltroFecha(filtros) };

    return Venta.aggregate([
        { $match: match },
        {
            $group: {
                _id:      '$zona',
                total:    { $sum: '$total' },
                pedidos:  { $sum: 1 },
                unidades: { $sum: '$cantidad' }
            }
        },
        { $sort: { total: -1 } },
        { $project: { zona: '$_id', total: { $round: ['$total', 2] }, pedidos: 1, unidades: 1, _id: 0 } }
    ]);
};

// ── 6. CLIENTES FRECUENTES ───────────────────────────────────────────────────

exports.getClientesFrecuentes = async (filtros = {}) => {
    const match = { fecha: buildFiltroFecha(filtros), ...buildFiltroZona(filtros.zona) };

    return Venta.aggregate([
        { $match: match },
        {
            $group: {
                _id:     '$cliente',
                pedidos: { $sum: 1 },
                total:   { $sum: '$total' },
                zona:    { $first: '$zona' }
            }
        },
        { $sort: { pedidos: -1 } },
        { $limit: 10 },
        { $project: { cliente: '$_id', pedidos: 1, total: { $round: ['$total', 2] }, zona: 1, _id: 0 } }
    ]);
};

// ── 7. TOP PRODUCTOS POR MES — HISTÓRICO ANUAL ──────────────────────────────

exports.getTopProductosPorMesHistorico = async (anio) => {
    const a = parseInt(anio) || new Date().getFullYear();
    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    const res = await Venta.aggregate([
        {
            $match: {
                fecha: {
                    $gte: new Date(a, 0, 1),
                    $lte: new Date(a, 11, 31, 23, 59, 59)
                }
            }
        },
        {
            $group: {
                _id: { mes: { $month: '$fecha' }, producto: '$producto' },
                unidades: { $sum: '$cantidad' },
                ingresos: { $sum: '$total' }
            }
        },
        { $sort: { '_id.mes': 1, unidades: -1 } }
    ]);

    const porMes = {};
    res.forEach(r => {
        const mesNombre = MESES[r._id.mes - 1];
        if (!porMes[mesNombre]) porMes[mesNombre] = [];
        if (porMes[mesNombre].length < 5) {
            porMes[mesNombre].push({
                producto: r._id.producto,
                unidades: r.unidades,
                ingresos: Math.round(r.ingresos * 100) / 100
            });
        }
    });

    return porMes;
};

// ── 8. PROYECCIÓN DE ABASTECIMIENTO ─────────────────────────────────────────

exports.getProyeccionAbastecimiento = async () => {
    const hoy    = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);

    const res = await Venta.aggregate([
        { $match: { fecha: { $gte: inicio } } },
        {
            $group: {
                _id:      '$producto',
                totalUnd: { $sum: '$cantidad' },
                mesesSet: { $addToSet: { $month: '$fecha' } }
            }
        },
        {
            $project: {
                producto:  '$_id',
                totalUnd:  1,
                numMeses:  { $size: '$mesesSet' },
                _id: 0
            }
        },
        {
            $project: {
                producto:            1,
                totalUnd:            1,
                promedioPorMes:      { $divide: ['$totalUnd', '$numMeses'] },
                proyeccionConMargen: { $ceil: { $multiply: [{ $divide: ['$totalUnd', '$numMeses'] }, 1.1] } }
            }
        },
        { $sort: { promedioPorMes: -1 } },
        { $limit: 15 }
    ]);

    return res.map(r => ({ ...r, promedioPorMes: Math.round(r.promedioPorMes) }));
};

// ── 9. VENTAS POR DÍA DEL MES ────────────────────────────────────────────────

exports.getVentasPorDia = async (filtros = {}) => {
    const { inicio, fin } = buildRangoMes(filtros.mes, filtros.anio);

    return Venta.aggregate([
        { $match: { fecha: { $gte: inicio, $lte: fin } } },
        {
            $group: {
                _id:     { $dayOfMonth: '$fecha' },
                total:   { $sum: '$total' },
                pedidos: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } },
        { $project: { dia: '$_id', total: { $round: ['$total', 2] }, pedidos: 1, _id: 0 } }
    ]);
};