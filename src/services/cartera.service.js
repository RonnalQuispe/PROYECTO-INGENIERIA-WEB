// ============================================================
// src/services/cartera.service.js
// ✅ FIX: getDetalleCliente ahora incluye telefono, notas y activo
//    haciendo lookup al modelo Cliente por nombre.
// ============================================================

const Venta   = require('../models/venta.model');
const Cliente = require('../models/cliente.model');

// ─────────────────────────────────────────────────────────────────────────────
// Resumen de cartera agrupado por cliente
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');

// Resumen agrupado por clienteRef (ObjectId) — ya no por string de nombre
exports.getResumenCartera = async (filtros = {}) => {
    const match = {};
    if (filtros.zona && filtros.zona !== '') match.zona = filtros.zona;

    // Si filtran por nombre de cliente, resolvemos el ID primero
    if (filtros.clienteId && mongoose.Types.ObjectId.isValid(filtros.clienteId)) {
        match.clienteRef = new mongoose.Types.ObjectId(filtros.clienteId);
    } else if (filtros.cliente && filtros.cliente !== '') {
        // Búsqueda legacy por nombre — solo para el buscador web
        const clienteDoc = await Cliente
            .findOne({ nombre: new RegExp(filtros.cliente.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
            .select('_id')
            .lean();
        if (clienteDoc) match.clienteRef = clienteDoc._id;
        else return []; // No existe — devolver vacío sin scan completo
    }

    const resultados = await Venta.aggregate([
        { $match: match },
        {
            $group: {
                _id:            '$clienteRef',    // ← agrupar por ObjectId, no por string
                zona:           { $first: '$zona' },
                totalFacturado: { $sum: '$total' },
                totalPagado:    { $sum: '$totalPagado' },
                totalPedidos:   { $sum: 1 },
                cantidadDeudas: {
                    $sum: { $cond: [{ $lt: ['$totalPagado', '$total'] }, 1, 0] }
                }
            }
        },
        // Lookup para obtener nombre y teléfono del cliente
        {
            $lookup: {
                from:         'clientes',
                localField:   '_id',
                foreignField: '_id',
                as:           'clienteDoc',
                // Pipeline para proyección mínima dentro del lookup
                pipeline: [{ $project: { nombre: 1, zona: 1, telefono: 1 } }]
            }
        },
        { $unwind: { path: '$clienteDoc', preserveNullAndEmpty: true } },
        { $sort: { 'clienteDoc.nombre': 1 } }
    ]);

    return resultados.map(c => {
        const saldoPendiente = Math.max(0, c.totalFacturado - c.totalPagado);
        const pctPagado      = c.totalFacturado > 0
            ? Math.round((c.totalPagado / c.totalFacturado) * 100) : 0;

        let nivel, nivelLabel;
        if (saldoPendiente <= 0)    { nivel = 'ok';   nivelLabel = 'Al día';    }
        else if (pctPagado >= 60)   { nivel = 'med';  nivelLabel = 'Parcial';   }
        else if (c.totalPagado > 0) { nivel = 'low';  nivelLabel = 'En deuda';  }
        else                        { nivel = 'none'; nivelLabel = 'Sin pagos'; }

        return {
            clienteId:      c._id,
            nombre:         c.clienteDoc?.nombre || '(sin nombre)',
            zona:           c.clienteDoc?.zona   || c.zona || '',
            telefono:       c.clienteDoc?.telefono || '',
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

// Detalle por clienteId (ObjectId) — reemplaza la búsqueda por nombre
exports.getDetalleCliente = async (clienteId) => {
    if (!mongoose.Types.ObjectId.isValid(clienteId))
        throw new Error('clienteId inválido');

    const objectId = new mongoose.Types.ObjectId(clienteId);

    // Proyección mínima en el cliente
    const clienteDoc = await Cliente
        .findById(objectId)
        .select('nombre zona telefono notas activo')
        .lean();

    if (!clienteDoc) throw new Error('Cliente no encontrado');

    // Ventas por clienteRef — usa el índice { clienteRef: 1, fecha: -1 }
    const ventas = await Venta
        .find({ clienteRef: objectId })
        .sort({ fecha: -1 })
        .lean();

    const totalFacturado = ventas.reduce((s, v) => s + v.total,       0);
    const totalPagado    = ventas.reduce((s, v) => s + v.totalPagado, 0);
    const saldoPendiente = Math.max(0, totalFacturado - totalPagado);
    const pctPagado      = totalFacturado > 0
        ? Math.round((totalPagado / totalFacturado) * 100) : 0;

    const ventasFormateadas = ventas.map(v => ({
        _id:             v._id,
        fecha:           v.fecha,
        producto:        v.producto,
        cantidad:        v.cantidad,
        total:           v.total,
        pagado:          v.totalPagado,
        saldo:           Math.max(0, v.total - v.totalPagado),
        estadoPago:      v.estadoPago,
        estadoEntrega:   v.estadoEntrega,
        tipoTransaccion: v.tipoTransaccion,
        items:           v.items    || [],
        cobros:          v.cobros   || [],
        historialEdiciones: v.historialEdiciones || [],
        ubicacion:       v.ubicacion,
    }));

    return {
        clienteId:      clienteDoc._id,
        cliente:        clienteDoc.nombre,
        zona:           clienteDoc.zona,
        telefono:       clienteDoc.telefono,
        notas:          clienteDoc.notas,
        activo:         clienteDoc.activo,
        totalFacturado,
        totalPagado,
        saldoPendiente,
        pctPagado,
        totalPedidos:   ventas.length,
        ventas:         ventasFormateadas,
    };
};
// ─────────────────────────────────────────────────────────────────────────────
// editarVenta — sin cambios
// ─────────────────────────────────────────────────────────────────────────────
exports.editarVenta = async (ventaId, datos, usuario = 'app') => {
    const venta = await Venta.findById(ventaId);
    if (!venta) throw new Error('Venta no encontrada');

    const anterior = {
        producto: venta.producto,
        cantidad: venta.cantidad,
        total:    venta.total,
        items:    venta.items,
    };

    if (datos.producto !== undefined) venta.producto = String(datos.producto).trim();
    if (datos.cantidad !== undefined) venta.cantidad = parseFloat(datos.cantidad) || venta.cantidad;

    if (Array.isArray(datos.items)) {
        venta.items = datos.items
            .filter(it => it.nombre && String(it.nombre).trim())
            .map(it => ({
                _id:       it._id || undefined,
                nombre:    String(it.nombre).trim(),
                cantidad:  parseFloat(it.cantidad)  || 1,
                precio:    parseFloat(it.precio)    || 0,
                subtotal:  (parseFloat(it.cantidad) || 1) * (parseFloat(it.precio) || 0),
                entregado: it.entregado || false,
            }));
    }

    if (datos.total !== undefined && !isNaN(parseFloat(datos.total))) {
        venta.total = parseFloat(datos.total);
    } else if (venta.items.length > 0 && venta.items.some(it => it.precio > 0)) {
        venta.total = venta.items.reduce((s, it) => s + (it.subtotal || 0), 0);
    }

    venta.historialEdiciones.push({
        fecha:    new Date(),
        usuario,
        motivo:   datos.motivo || 'Edición desde app',
        anterior,
    });

    await venta.save();
    return venta;
};