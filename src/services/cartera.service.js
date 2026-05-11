/**
 * UBICACIÓN: src/services/cartera.service.js
 */
const Venta = require('../models/venta.model');

// ── RESUMEN DE CARTERA POR CLIENTE ───────────────────────────────────────────
// Devuelve un array con un objeto por cliente que resume su situación financiera
exports.getResumenCartera = async (filtros = {}) => {
    const match = {};
    if (filtros.zona && filtros.zona !== '') match.zona = filtros.zona;
    if (filtros.cliente && filtros.cliente !== '') match.cliente = new RegExp(filtros.cliente, 'i');

    const resultado = await Venta.aggregate([
        { $match: match },
        {
            $group: {
                _id:           '$cliente',
                zona:          { $first: '$zona' },
                totalPedidos:  { $sum: 1 },
                totalFacturado:{ $sum: '$total' },
                totalPagado:   { $sum: { $ifNull: ['$totalPagado', 0] } },
                // Ventas pendientes o parciales (deuda activa)
                ventasPendientes: {
                    $push: {
                        $cond: [
                            { $in: ['$estadoPago', ['pendiente', 'parcial']] },
                            {
                                _id:         '$_id',
                                producto:    '$producto',
                                total:       '$total',
                                totalPagado: { $ifNull: ['$totalPagado', 0] },
                                estadoPago:  '$estadoPago',
                                fecha:       '$fecha'
                            },
                            '$$REMOVE'
                        ]
                    }
                }
            }
        },
        {
            $addFields: {
                saldoPendiente: { $subtract: ['$totalFacturado', '$totalPagado'] },
                cantidadDeudas: { $size: '$ventasPendientes' }
            }
        },
        { $sort: { saldoPendiente: -1 } }
    ]);

    // Clasificar nivel de riesgo por cliente
    return resultado.map(c => {
        const pct = c.totalFacturado > 0
            ? (c.totalPagado / c.totalFacturado) * 100
            : 0;

        let nivel, nivelLabel;
        if (pct >= 100)     { nivel = 'al-dia';  nivelLabel = 'Al día'; }
        else if (pct >= 60) { nivel = 'medio';   nivelLabel = 'Deuda media'; }
        else if (pct >= 1)  { nivel = 'alto';    nivelLabel = 'Deuda alta'; }
        else                { nivel = 'critico'; nivelLabel = 'Sin pagos'; }

        return { ...c, pctPagado: Math.round(pct), nivel, nivelLabel };
    });
};

// ── DETALLE DE UN CLIENTE ────────────────────────────────────────────────────
exports.getDetalleCliente = async (nombreCliente) => {
    const ventas = await Venta.find({ cliente: nombreCliente }).sort({ fecha: -1 });

    const resumen = {
        cliente:        nombreCliente,
        totalFacturado: 0,
        totalPagado:    0,
        totalPedidos:   ventas.length,
        zona:           ventas[0]?.zona || '—',
        ventas:         []
    };

    ventas.forEach(v => {
        const pagado  = v.totalPagado || 0;
        const saldo   = Math.max(0, v.total - pagado);
        resumen.totalFacturado += v.total;
        resumen.totalPagado    += pagado;
        resumen.ventas.push({
            _id:        v._id,
            fecha:      v.fecha,
            producto:   v.producto,
            cantidad:   v.cantidad,
            total:      v.total,
            pagado,
            saldo,
            estadoPago: v.estadoPago || 'pendiente',
            cobros:     v.cobros || []
        });
    });

    resumen.saldoPendiente = Math.max(0, resumen.totalFacturado - resumen.totalPagado);
    resumen.pctPagado = resumen.totalFacturado > 0
        ? Math.round((resumen.totalPagado / resumen.totalFacturado) * 100)
        : 0;

    return resumen;
};