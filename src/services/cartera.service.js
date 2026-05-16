// ============================================================
// src/services/cartera.service.js
// ============================================================

const Venta   = require('../models/venta.model');
const Cliente = require('../models/cliente.model');
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// Resumen de cartera agrupado por cliente
// ─────────────────────────────────────────────────────────────────────────────
exports.getResumenCartera = async (filtros = {}) => {
    const match = {};
    if (filtros.zona && filtros.zona !== '') match.zona = filtros.zona;

    if (filtros.clienteId && mongoose.Types.ObjectId.isValid(filtros.clienteId)) {
        match.clienteRef = new mongoose.Types.ObjectId(filtros.clienteId);
    } else if (filtros.cliente && filtros.cliente !== '') {
        const clienteDoc = await Cliente
            .findOne({ nombre: new RegExp(filtros.cliente.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
            .select('_id')
            .lean();
        if (clienteDoc) match.clienteRef = clienteDoc._id;
        else return [];
    }

    const resultados = await Venta.aggregate([
        { $match: match },
        {
            $group: {
                _id:            '$clienteRef',
                zona:           { $first: '$zona' },
                totalFacturado: { $sum: '$total' },
                totalPagado:    { $sum: '$totalPagado' },
                totalPedidos:   { $sum: 1 },
                cantidadDeudas: {
                    $sum: { $cond: [{ $lt: ['$totalPagado', '$total'] }, 1, 0] }
                }
            }
        },
        {
            $lookup: {
                from:         'clientes',
                localField:   '_id',
                foreignField: '_id',
                as:           'clienteDoc',
                pipeline: [{ $project: { nombre: 1, zona: 1, telefono: 1 } }]
            }
        },
        // FIX: preserveNullAndEmptyArrays (no preserveNullAndEmpty)
        { $unwind: { path: '$clienteDoc', preserveNullAndEmptyArrays: true } },
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
            // FIX: la app móvil usa c.cliente para mostrar el nombre — incluir ambos campos
            clienteId:      c._id,
            cliente:        c.clienteDoc?.nombre || '(sin nombre)',
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

// ─────────────────────────────────────────────────────────────────────────────
// Detalle por clienteId (ObjectId) o por nombre (string) — app usa nombre
// ─────────────────────────────────────────────────────────────────────────────
exports.getDetalleCliente = async (clienteIdOrNombre) => {
    let clienteDoc;

    if (mongoose.Types.ObjectId.isValid(clienteIdOrNombre)) {
        // Llamada con ObjectId (web, nuevo flujo)
        clienteDoc = await Cliente
            .findById(clienteIdOrNombre)
            .select('nombre zona telefono notas activo')
            .lean();
    } else {
        // FIX: llamada con nombre (app móvil — flujo legacy)
        clienteDoc = await Cliente
            .findOne({ nombre: new RegExp(`^${clienteIdOrNombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
            .select('nombre zona telefono notas activo')
            .lean();
    }

    if (!clienteDoc) throw new Error('Cliente no encontrado');

    const ventas = await Venta
        .find({ clienteRef: clienteDoc._id })
        .sort({ fecha: -1 })
        .lean();

    const totalFacturado = ventas.reduce((s, v) => s + (v.total       ?? 0), 0);
    const totalPagado    = ventas.reduce((s, v) => s + (v.totalPagado ?? 0), 0);
    const saldoPendiente = Math.max(0, totalFacturado - totalPagado);
    const pctPagado      = totalFacturado > 0
        ? Math.round((totalPagado / totalFacturado) * 100) : 0;

    const ventasFormateadas = ventas.map(v => ({
        _id:             v._id,
        fecha:           v.fecha,
        producto:        v.producto,
        cantidad:        v.cantidad,
        total:           v.total           ?? 0,
        pagado:          v.totalPagado     ?? 0,
        saldo:           Math.max(0, (v.total ?? 0) - (v.totalPagado ?? 0)),
        estadoPago:      v.estadoPago,
        estadoEntrega:   v.estadoEntrega,
        tipoTransaccion: v.tipoTransaccion,
        items:           v.items               || [],
        cobros:          v.cobros              || [],
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
// editarVenta
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