/**
 * UBICACIÓN: src/services/cartera.service.js
 *
 * FIX 3: getDetalleCliente ahora mapea items[] completos (nombre, cantidad, precio)
 *        en lugar de solo el campo legacy producto/cantidad
 */
const Venta = require('../models/venta.model');

// ── RESUMEN DE CARTERA POR CLIENTE ───────────────────────────────────────────
exports.getResumenCartera = async (filtros = {}) => {
    const match = {};
    if (filtros.zona    && filtros.zona    !== '') match.zona    = filtros.zona;
    if (filtros.cliente && filtros.cliente !== '') match.cliente = new RegExp(filtros.cliente, 'i');

    const resultado = await Venta.aggregate([
        { $match: match },
        {
            $group: {
                _id:            '$cliente',
                zona:           { $first: '$zona' },
                totalPedidos:   { $sum: 1 },
                totalFacturado: { $sum: '$total' },
                totalPagado:    { $sum: { $ifNull: ['$totalPagado', 0] } },
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

    return resultado.map(c => {
        const pct = c.totalFacturado > 0
            ? (c.totalPagado / c.totalFacturado) * 100
            : 0;

        let nivel, nivelLabel;
        if      (pct >= 100) { nivel = 'al-dia';  nivelLabel = 'Al día'; }
        else if (pct >= 60)  { nivel = 'medio';   nivelLabel = 'Deuda media'; }
        else if (pct >= 1)   { nivel = 'alto';    nivelLabel = 'Deuda alta'; }
        else                 { nivel = 'critico'; nivelLabel = 'Sin pagos'; }

        return { ...c, pctPagado: Math.round(pct), nivel, nivelLabel };
    });
};

// ── DETALLE DE UN CLIENTE ────────────────────────────────────────────────────
// FIX 3: mapea items[] con precio, entregado y _id correctamente
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
        const pagado = v.totalPagado || 0;
        const saldo  = Math.max(0, v.total - pagado);
        resumen.totalFacturado += v.total;
        resumen.totalPagado    += pagado;

        // ── FIX 3: mapear items[] completos ──────────────────────────────────
        // Soporte dual: campo nuevo items[] y campo legacy producto/cantidad
        const itemsMapeados = (v.items || []).map(it => ({
            _id:       it._id,
            nombre:    it.nombre || it.producto || '',
            cantidad:  it.cantidad  || 1,
            precio:    it.precio    != null ? it.precio : 0,
            entregado: it.entregado || false,
        }));

        resumen.ventas.push({
            _id:               v._id,
            fecha:             v.fecha,
            // Producto principal (campo legacy)
            producto:          v.producto,
            cantidad:          v.cantidad,
            total:             v.total,
            pagado,
            saldo,
            estadoPago:        v.estadoPago || 'pendiente',
            cobros:            v.cobros || [],
            // FIX 3: todos los ítems con precio
            items:             itemsMapeados,
            // FIX 2: historial de ediciones
            historialEdiciones: v.historialEdiciones || [],
        });
    });

    resumen.saldoPendiente = Math.max(0, resumen.totalFacturado - resumen.totalPagado);
    resumen.pctPagado = resumen.totalFacturado > 0
        ? Math.round((resumen.totalPagado / resumen.totalFacturado) * 100)
        : 0;

    return resumen;
};

// ── EDITAR VENTA (FIX 2) ─────────────────────────────────────────────────────
// Guarda cambios en producto, cantidad e items[], y appends al historialEdiciones[]
exports.editarVenta = async (ventaId, datos, usuario = 'app') => {
    const venta = await Venta.findById(ventaId);
    if (!venta) throw new Error('Venta no encontrada');

    // Snapshot de valores anteriores para el historial
    const snapshot = {
        producto:  venta.producto,
        cantidad:  venta.cantidad,
        total:     venta.total,
        items:     (venta.items || []).map(it => ({
            _id:      it._id,
            nombre:   it.nombre,
            cantidad: it.cantidad,
            precio:   it.precio,
        })),
    };

    // Aplicar cambios
    if (datos.producto !== undefined) venta.producto = datos.producto;
    if (datos.cantidad !== undefined) venta.cantidad = datos.cantidad;
    if (datos.total    !== undefined) venta.total    = datos.total;

    // Actualizar items[]
    if (Array.isArray(datos.items)) {
        venta.items = datos.items.map(it => ({
            // Preservar _id si existe (edición), o dejar que Mongoose genere uno nuevo
            ...(it._id ? { _id: it._id } : {}),
            nombre:    it.nombre,
            cantidad:  it.cantidad,
            precio:    it.precio,
            // Preservar estado de entrega del ítem anterior si existe
            entregado: (venta.items || []).find(
                orig => String(orig._id) === String(it._id)
            )?.entregado || false,
        }));
    }

    // Registrar en historial
    if (!venta.historialEdiciones) venta.historialEdiciones = [];
    venta.historialEdiciones.push({
        fecha:    new Date(),
        usuario,
        motivo:   datos.motivo || 'Edición desde app',
        anterior: snapshot,
    });

    await venta.save();
    return venta;
};