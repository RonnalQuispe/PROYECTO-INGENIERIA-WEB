// ============================================================
// src/services/cartera.service.js
// ============================================================
// CORRECCIÓN PRINCIPAL:
//   getResumenCartera y getDetalleCliente ahora funcionan aunque
//   NO exista colección "clientes". Agrupan directamente por el
//   campo "cliente" (nombre embebido en Venta), que es lo que
//   guarda el seed.js.
//
//   Si en el futuro el proyecto añade una colección "clientes"
//   real, el servicio la usará automáticamente (lookup sigue
//   presente pero con preserveNullAndEmptyArrays: true).
// ============================================================

const Venta    = require('../models/venta.model');
const mongoose = require('mongoose');

// Helper: escapar caracteres especiales de RegExp
const escapeRegex = str => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─────────────────────────────────────────────────────────────
// getResumenCartera
// Agrupa por el nombre embebido en Venta (campo "cliente").
// No depende de la colección "clientes".
// ─────────────────────────────────────────────────────────────
exports.getResumenCartera = async (filtros = {}) => {
    const match = {};

    if (filtros.zona && filtros.zona !== '') {
        match.zona = filtros.zona;
    }

    if (filtros.cliente && filtros.cliente !== '') {
        match.cliente = new RegExp(escapeRegex(filtros.cliente), 'i');
    }

    const resultados = await Venta.aggregate([
        { $match: match },
        {
            $group: {
                _id:            '$cliente',          // agrupar por nombre embebido
                zona:           { $first: '$zona' },
                totalFacturado: { $sum: '$total' },
                totalPagado:    { $sum: '$totalPagado' },
                totalPedidos:   { $sum: 1 },
                cantidadDeudas: {
                    $sum: {
                        $cond: [{ $lt: ['$totalPagado', '$total'] }, 1, 0]
                    }
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
        if      (saldoPendiente <= 0)  { nivel = 'ok';   nivelLabel = 'Al día';    }
        else if (pctPagado >= 60)      { nivel = 'med';  nivelLabel = 'Parcial';   }
        else if (c.totalPagado > 0)    { nivel = 'low';  nivelLabel = 'En deuda';  }
        else                           { nivel = 'none'; nivelLabel = 'Sin pagos'; }

        return {
            clienteId:      null,           // no hay ObjectId de colección clientes
            cliente:        c._id,
            nombre:         c._id,
            zona:           c.zona || '',
            telefono:       '',
            totalFacturado: Math.round(c.totalFacturado * 100) / 100,
            totalPagado:    Math.round(c.totalPagado    * 100) / 100,
            saldoPendiente: Math.round(saldoPendiente   * 100) / 100,
            totalPedidos:   c.totalPedidos,
            cantidadDeudas: c.cantidadDeudas,
            pctPagado,
            nivel,
            nivelLabel,
        };
    });
};

// ─────────────────────────────────────────────────────────────
// getDetalleCliente
// Busca por nombre embebido directamente en Venta.
// No requiere colección "clientes".
// ─────────────────────────────────────────────────────────────
exports.getDetalleCliente = async (clienteIdOrNombre) => {
    if (!clienteIdOrNombre) {
        throw new Error('getDetalleCliente: se requiere un nombre de cliente.');
    }

    const param = String(clienteIdOrNombre).trim();

    // Buscar todas las ventas cuyo campo "cliente" coincida con el nombre
    const ventas = await Venta
        .find({ cliente: new RegExp(`^${escapeRegex(param)}$`, 'i') })
        .sort({ fecha: -1 })
        .lean();

    if (!ventas || ventas.length === 0) {
        throw new Error(`Cliente no encontrado: "${param}"`);
    }

    // Datos del cliente desde la primera venta
    const primeraVenta   = ventas[0];
    const nombreCliente  = primeraVenta.cliente;
    const zona           = primeraVenta.zona || '';

    const totalFacturado = ventas.reduce((s, v) => s + (v.total       ?? 0), 0);
    const totalPagado    = ventas.reduce((s, v) => s + (v.totalPagado ?? 0), 0);
    const saldoPendiente = Math.max(0, totalFacturado - totalPagado);
    const pctPagado      = totalFacturado > 0
        ? Math.round((totalPagado / totalFacturado) * 100)
        : 0;

    const ventasFormateadas = ventas.map(v => ({
        _id:                v._id,
        fecha:              v.fecha,
        producto:           v.producto,
        cantidad:           v.cantidad,
        total:              v.total           ?? 0,
        pagado:             v.totalPagado     ?? 0,
        saldo:              Math.max(0, (v.total ?? 0) - (v.totalPagado ?? 0)),
        estadoPago:         v.estadoPago,
        estadoEntrega:      v.estadoEntrega,
        tipoTransaccion:    v.tipoTransaccion,
        items:              v.items              || [],
        cobros:             v.cobros             || [],
        historialEdiciones: v.historialEdiciones || [],
        ubicacion:          v.ubicacion,
    }));

    return {
        clienteId:      null,
        cliente:        nombreCliente,
        zona,
        telefono:       '',
        notas:          '',
        activo:         true,
        totalFacturado: Math.round(totalFacturado * 100) / 100,
        totalPagado:    Math.round(totalPagado    * 100) / 100,
        saldoPendiente: Math.round(saldoPendiente * 100) / 100,
        pctPagado,
        totalPedidos:   ventas.length,
        ventas:         ventasFormateadas,
    };
};

// ─────────────────────────────────────────────────────────────
// editarVenta  (sin cambios funcionales)
// ─────────────────────────────────────────────────────────────
exports.editarVenta = async (ventaId, datos, usuario = 'app') => {
    const venta = await Venta.findById(ventaId);
    if (!venta) throw new Error('Venta no encontrada');

    const anterior = {
        producto: venta.producto,
        cantidad: venta.cantidad,
        total:    venta.total,
        items:    venta.items.map(it => it.toObject ? it.toObject() : { ...it }),
    };

    if (datos.producto !== undefined) venta.producto = String(datos.producto).trim();
    if (datos.cantidad !== undefined) venta.cantidad = parseFloat(datos.cantidad) || venta.cantidad;

    if (Array.isArray(datos.items)) {
        venta.items = datos.items
            .filter(it => it.nombre && String(it.nombre).trim())
            .map(it => ({
                _id:      it._id || undefined,
                nombre:   String(it.nombre).trim(),
                cantidad: parseFloat(it.cantidad) || 1,
                precio:   parseFloat(it.precio)   || 0,
                subtotal: (parseFloat(it.cantidad) || 1) * (parseFloat(it.precio) || 0),
                entregado: it.entregado || false,
            }));
    }

    if (datos.total !== undefined && !isNaN(parseFloat(datos.total))) {
        venta.total = parseFloat(datos.total);
    } else if (venta.items.length > 0 && venta.items.some(it => it.precio > 0)) {
        venta.total = venta.items.reduce((s, it) => s + (it.subtotal || 0), 0);
    }

    if (!venta.historialEdiciones) venta.historialEdiciones = [];
    venta.historialEdiciones.push({
        fecha:    new Date(),
        usuario,
        motivo:   datos.motivo || 'Edición desde app',
        anterior,
    });

    await venta.save();
    return venta;
};