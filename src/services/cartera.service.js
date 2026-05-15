// ============================================================
// src/services/cartera.service.js
// ✅ CORRECCIÓN: Añadido método editarVenta() — era llamado desde
//    cartera.controller.js pero no existía en este archivo,
//    causando el error "No se pudo guardar la edición"
// ============================================================

const Venta = require('../models/venta.model');

// ─────────────────────────────────────────────────────────────────────────────
// Resumen de cartera agrupado por cliente
// ─────────────────────────────────────────────────────────────────────────────
exports.getResumenCartera = async (filtros = {}) => {
    const match = {};
    if (filtros.zona    && filtros.zona    !== '') match.zona    = filtros.zona;
    if (filtros.cliente && filtros.cliente !== '') {
        match.cliente = new RegExp(filtros.cliente.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    const resultados = await Venta.aggregate([
        { $match: match },
        {
            $group: {
                _id:            '$cliente',
                zona:           { $first: '$zona' },
                totalFacturado: { $sum: '$total' },
                totalPagado:    { $sum: '$totalPagado' },
                totalPedidos:   { $sum: 1 },
                cantidadDeudas: {
                    $sum: { $cond: [{ $lt: ['$totalPagado', '$total'] }, 1, 0] }
                }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    return resultados.map(c => {
        const saldoPendiente = Math.max(0, c.totalFacturado - c.totalPagado);
        const pctPagado      = c.totalFacturado > 0
            ? Math.round((c.totalPagado / c.totalFacturado) * 100)
            : 0;

        let nivel, nivelLabel;
        if (saldoPendiente <= 0)         { nivel = 'ok';      nivelLabel = 'Al día'; }
        else if (pctPagado >= 60)        { nivel = 'med';     nivelLabel = 'Parcial'; }
        else if (c.totalPagado > 0)      { nivel = 'low';     nivelLabel = 'En deuda'; }
        else                              { nivel = 'none';    nivelLabel = 'Sin pagos'; }

        return {
            _id:            c._id,
            zona:           c.zona || '',
            totalFacturado: c.totalFacturado,
            totalPagado:    c.totalPagado,
            saldoPendiente,
            totalPedidos:   c.totalPedidos,
            cantidadDeudas: c.cantidadDeudas,
            pctPagado,
            nivel,
            nivelLabel,
        };
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// Detalle completo de un cliente (ventas + cobros + saldos)
// ─────────────────────────────────────────────────────────────────────────────
exports.getDetalleCliente = async (nombreCliente) => {
    const ventas = await Venta.find({ cliente: nombreCliente })
        .sort({ fecha: -1 })
        .lean();

    const totalFacturado = ventas.reduce((s, v) => s + v.total,        0);
    const totalPagado    = ventas.reduce((s, v) => s + v.totalPagado,  0);
    const saldoPendiente = Math.max(0, totalFacturado - totalPagado);
    const pctPagado      = totalFacturado > 0
        ? Math.round((totalPagado / totalFacturado) * 100)
        : 0;
    const zona = ventas[0]?.zona || '';

    const ventasFormateadas = ventas.map(v => ({
        _id:               v._id,
        fecha:             v.fecha,
        producto:          v.producto,
        cantidad:          v.cantidad,
        total:             v.total,
        pagado:            v.totalPagado,
        saldo:             Math.max(0, v.total - v.totalPagado),
        estadoPago:        v.estadoPago,
        estadoEntrega:     v.estadoEntrega,
        tipoTransaccion:   v.tipoTransaccion,
        items:             v.items || [],
        cobros:            v.cobros || [],
        historialEdiciones: v.historialEdiciones || [],
        ubicacion:         v.ubicacion,
    }));

    return {
        cliente:        nombreCliente,
        zona,
        totalFacturado,
        totalPagado,
        saldoPendiente,
        pctPagado,
        totalPedidos:   ventas.length,
        ventas:         ventasFormateadas,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ CORRECCIÓN PRINCIPAL: editarVenta
// Actualiza un pedido y guarda historialEdiciones[] para trazabilidad.
// Era llamado desde cartera.controller → editarVentaAPI pero no existía,
// lo que causaba: "TypeError: carteraService.editarVenta is not a function"
// y el mensaje "ERROR - no se pudo guardar la edición" en la app.
// ─────────────────────────────────────────────────────────────────────────────
exports.editarVenta = async (ventaId, datos, usuario = 'app') => {
    const venta = await Venta.findById(ventaId);
    if (!venta) throw new Error('Venta no encontrada');

    // Guardar snapshot del estado anterior para el historial
    const anterior = {
        producto:  venta.producto,
        cantidad:  venta.cantidad,
        total:     venta.total,
        items:     venta.items,
    };

    // Actualizar producto/cantidad legacy si vienen
    if (datos.producto !== undefined) venta.producto = String(datos.producto).trim();
    if (datos.cantidad !== undefined) venta.cantidad = parseFloat(datos.cantidad) || venta.cantidad;

    // Actualizar ítems multi-producto si vienen
    if (Array.isArray(datos.items)) {
        venta.items = datos.items
            .filter(it => it.nombre && String(it.nombre).trim())
            .map(it => ({
                _id:      it._id || undefined,
                nombre:   String(it.nombre).trim(),
                cantidad: parseFloat(it.cantidad)  || 1,
                precio:   parseFloat(it.precio)    || 0,
                subtotal: (parseFloat(it.cantidad) || 1) * (parseFloat(it.precio) || 0),
                entregado: it.entregado || false,
            }));
    }

    // Recalcular total:
    // Si llega total explícito → usar ese valor
    // Si hay ítems con precio → sumar subtotales
    // Si no → mantener el original
    if (datos.total !== undefined && !isNaN(parseFloat(datos.total))) {
        venta.total = parseFloat(datos.total);
    } else if (venta.items.length > 0 && venta.items.some(it => it.precio > 0)) {
        venta.total = venta.items.reduce((s, it) => s + (it.subtotal || 0), 0);
    }

    // Agregar entrada al historial de ediciones
    venta.historialEdiciones.push({
        fecha:    new Date(),
        usuario,
        motivo:   datos.motivo || 'Edición desde app',
        anterior,
    });

    await venta.save();
    return venta;
};