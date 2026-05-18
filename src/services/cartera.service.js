// ============================================================
// src/services/cartera.service.js  —  AUDITADO
// ============================================================
// HALLAZGOS y correcciones (SIN cambios de funcionalidad):
//
// [FIX-1] getResumenCartera: filtros.cliente se pasaba a .replace()
//         sin verificar que fuera string. Si el query param llegaba
//         como objeto (e.g. ?cliente[$gt]= tras un intento de NoSQL
//         injection), .replace() lanzaba TypeError no controlado.
//         Corrección: String() cast defensivo antes del .replace().
//         Comportamiento para inputs válidos: idéntico.
//
// [FIX-2] getDetalleCliente: clienteIdOrNombre.replace() en la rama
//         de búsqueda por nombre sin verificar que sea string.
//         Si se llamaba con null/undefined (error del caller),
//         lanzaba TypeError en lugar de un mensaje controlado.
//         Corrección: guard de tipo al inicio de la función.
//         Comportamiento para inputs válidos: idéntico.
//
// [FIX-3] editarVenta: anterior.items = venta.items guardaba una
//         REFERENCIA al subdocumento Mongoose, no una copia.
//         Cuando venta.items se reemplazaba en la línea siguiente,
//         el historial quedaba apuntando al array nuevo (estado
//         POST-edición) en lugar del anterior (estado PRE-edición).
//         Esto es un bug real: el historial de auditoría era incorrecto.
//         Corrección: .map(it => it.toObject()) para hacer copia profunda.
//         Comportamiento observable: el historial ahora guarda el estado
//         REAL anterior. No rompe ninguna interfaz existente.
// ============================================================

const Venta    = require('../models/venta.model');
const Cliente  = require('../models/cliente.model');
const mongoose = require('mongoose');

// ── Helper interno: escapar caracteres especiales de RegExp ──────────────────
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─────────────────────────────────────────────────────────────────────────────
// Resumen de cartera agrupado por cliente
// ─────────────────────────────────────────────────────────────────────────────
exports.getResumenCartera = async (filtros = {}) => {
    const match = {};
    if (filtros.zona && filtros.zona !== '') match.zona = filtros.zona;

    if (filtros.clienteId && mongoose.Types.ObjectId.isValid(filtros.clienteId)) {
        match.clienteRef = new mongoose.Types.ObjectId(filtros.clienteId);
    } else if (filtros.cliente && filtros.cliente !== '') {
        // [FIX-1] Cast defensivo a String antes de llamar a .replace().
        // Si filtros.cliente es un objeto (intento de NoSQL injection como
        // ?cliente[$gt]=), String() lo convierte en "[object Object]" en
        // lugar de lanzar TypeError. El escapeRegex lo neutraliza como
        // texto literal, devolviendo [] (ningún cliente coincide) — respuesta
        // segura y sin crash.
        const nombreBuscado = escapeRegex(String(filtros.cliente));
        const clienteDoc = await Cliente
            .findOne({ nombre: new RegExp(nombreBuscado, 'i') })
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
    // [FIX-2] Guard de tipo: si el caller pasa null/undefined/número,
    // se lanza un error controlado con mensaje claro en lugar de dejar
    // que .replace() (más abajo) lance un TypeError críptico con stack trace.
    if (clienteIdOrNombre === null || clienteIdOrNombre === undefined) {
        throw new Error('getDetalleCliente: se requiere un ID o nombre de cliente.');
    }
    // Cast a string para que mongoose.Types.ObjectId.isValid() funcione
    // correctamente con ObjectIds enviados como strings desde la app.
    const param = String(clienteIdOrNombre).trim();

    let clienteDoc;

    if (mongoose.Types.ObjectId.isValid(param)) {
        // Llamada con ObjectId (web, nuevo flujo)
        clienteDoc = await Cliente
            .findById(param)
            .select('nombre zona telefono notas activo')
            .lean();
    } else {
        // Llamada con nombre (app móvil — flujo legacy)
        // Regex anclado ^ ... $ para match exacto insensible a mayúsculas.
        // escapeRegex evita que nombres con caracteres especiales (e.g. "S.A.")
        // sean interpretados como patrones de regex.
        clienteDoc = await Cliente
            .findOne({ nombre: new RegExp(`^${escapeRegex(param)}$`, 'i') })
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
        items:              v.items               || [],
        cobros:             v.cobros              || [],
        historialEdiciones: v.historialEdiciones  || [],
        ubicacion:          v.ubicacion,
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

    // [FIX-3] ANTES: anterior.items = venta.items guardaba una REFERENCIA
    // al subdocumento Mongoose. Cuando venta.items se reemplazaba en el
    // bloque Array.isArray(datos.items) de abajo, `anterior` quedaba
    // apuntando al array YA MODIFICADO, almacenando el estado POST-edición
    // en el historial en lugar del PRE-edición. Bug real de auditoría.
    //
    // AHORA: .map(it => it.toObject()) crea objetos planos independientes
    // (copia profunda de cada subdocumento Mongoose). Esto garantiza que
    // `anterior` siempre refleje el estado real antes de la edición.
    //
    // Funcionalidad: idéntica para el caller. El campo `anterior` del
    // historial ahora contiene lo que siempre debió contener.
    const anterior = {
        producto: venta.producto,
        cantidad: venta.cantidad,
        total:    venta.total,
        items:    venta.items.map(it => it.toObject()),
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