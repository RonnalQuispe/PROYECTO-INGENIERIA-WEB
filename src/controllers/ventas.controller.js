// ============================================================
// src/controllers/ventas.controller.js
// REESCRITO: relación cliente gestionada exclusivamente por _id
// - guardarAPI y actualizarAPI exigen clienteId válido
// - NUNCA se crea un cliente nuevo desde este controller
// - NUNCA se busca por nombre si viene un clienteId
// ============================================================

const Venta    = require('../models/venta.model');
const Cliente  = require('../models/cliente.model');
const mongoose = require('mongoose');

const zonasValidas = ['Norte', 'Centro', 'Sur'];
const escapeRegex  = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER PRIVADO: verificarCliente
// Valida el formato del ObjectId, busca en BD con proyección mínima y lean().
// NO modifica nada. NO crea nada.
// Retorna: { ok: true, cliente } | { ok: false, error: string }
// ─────────────────────────────────────────────────────────────────────────────
const verificarCliente = async (clienteId) => {
    if (!clienteId || !mongoose.Types.ObjectId.isValid(clienteId))
        return { ok: false, error: 'clienteId inválido o ausente. Selecciona un cliente de la lista.' };

    // findById usa el índice _id automático — O(log n) a cualquier escala.
    // Proyección mínima: solo los campos que necesitamos para construir la venta.
    // lean() devuelve un POJO en lugar de un documento Mongoose — más rápido y
    // menos memoria RAM en el servidor.
    const cliente = await Cliente
        .findById(clienteId)
        .select('nombre zona telefono activo')
        .lean();

    if (!cliente)        return { ok: false, error: 'El cliente seleccionado no existe.' };
    if (!cliente.activo) return { ok: false, error: 'El cliente seleccionado está inactivo.' };

    return { ok: true, cliente };
};

// ─────────────────────────────────────────────────────────────────────────────
// Validaciones
// ─────────────────────────────────────────────────────────────────────────────
const validarVenta = ({ zona, cliente, producto, precioUnitario, cantidad }) => {
    const errores     = [];
    const precio      = Number(precioUnitario);
    const cantidadNum = parseInt(cantidad, 10);

    if (!zona || !zonasValidas.includes(zona))       errores.push('Zona inválida.');
    if (!cliente  || cliente.trim().length  < 2)     errores.push('Nombre de cliente requerido.');
    if (!producto || producto.trim().length < 2)     errores.push('Producto requerido.');
    if (isNaN(precio)      || precio      <= 0)      errores.push('Precio debe ser mayor a 0.');
    if (isNaN(cantidadNum) || cantidadNum <  1)      errores.push('Cantidad mínima es 1.');

    return errores;
};

const validarItems = (items) => {
    const errores = [];
    if (!Array.isArray(items) || items.length === 0) {
        errores.push('Debe incluir al menos un producto.');
        return errores;
    }
    items.forEach((it, i) => {
        const precio   = Number(it.precio);
        const cantidad = parseInt(it.cantidad, 10);
        if (!it.nombre || String(it.nombre).trim().length < 1)
            errores.push(`Producto ${i + 1}: nombre requerido.`);
        if (isNaN(precio)   || precio   <= 0) errores.push(`Producto ${i + 1}: precio debe ser mayor a 0.`);
        if (isNaN(cantidad) || cantidad <  1) errores.push(`Producto ${i + 1}: cantidad mínima es 1.`);
    });
    return errores;
};

// ─────────────────────────────────────────────────────────────────────────────
// WEB (vistas Pug/EJS — sin cambios funcionales respecto al original)
// ─────────────────────────────────────────────────────────────────────────────

exports.listar = async (req, res) => {
    const { zona, cliente, estadoPago, pagina = 1 } = req.query;
    const limite = 20;
    const skip   = (pagina - 1) * limite;
    const filtro = {};

    try {
        if (zona       && zona       !== '') filtro.zona       = zona;
        if (cliente    && cliente    !== '') filtro.cliente    = new RegExp(escapeRegex(cliente), 'i');
        if (estadoPago && estadoPago !== '') filtro.estadoPago = estadoPago;

        const ventas      = await Venta.find(filtro).sort({ fecha: -1 }).limit(limite).skip(skip).lean();
        const totalVentas = await Venta.countDocuments(filtro);
        const granTotal   = ventas.reduce((sum, v) => sum + (v.total || 0), 0);

        res.render('ventas/lista', {
            usuario: req.session.usuario,
            ventas,
            granTotal,
            paginacion: {
                paginaActual: Number(pagina),
                totalPaginas: Math.ceil(totalVentas / limite)
            },
            filtros: {
                zona:       zona       || '',
                cliente:    cliente    || '',
                estadoPago: estadoPago || ''
            }
        });
    } catch (error) {
        console.error('Error listar ventas:', error);
        res.status(500).render('error', { mensaje: 'Error al obtener ventas.' });
    }
};

exports.mostrarCrear = (req, res) => {
    res.render('ventas/crear', { usuario: req.session.usuario, error: null });
};

exports.guardar = async (req, res) => {
    const { zona, entidad, piso, cliente, producto, precioUnitario, cantidad } = req.body;
    const errores = validarVenta({ zona, cliente, producto, precioUnitario, cantidad });

    if (errores.length > 0) {
        return res.render('ventas/crear', { usuario: req.session.usuario, error: errores.join(' ') });
    }

    try {
        const precio      = Number(precioUnitario);
        const cantidadNum = parseInt(cantidad, 10);

        await new Venta({
            zona,
            ubicacion:      { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
            cliente:        cliente.trim(),
            producto:       producto.trim(),
            precioUnitario: precio,
            cantidad:       cantidadNum,
            total:          precio * cantidadNum,
            estadoPago:     'pendiente',
            totalPagado:    0,
            cobros:         []
        }).save();

        res.redirect('/ventas');
    } catch (error) {
        console.error('Error guardar venta:', error);
        res.status(500).render('ventas/crear', {
            usuario: req.session.usuario,
            error: 'Error interno al guardar la venta.'
        });
    }
};

exports.mostrarDetalle = async (req, res) => {
    try {
        const venta = await Venta.findById(req.params.id).lean();
        if (!venta) return res.redirect('/ventas');

        venta.saldo = Math.max(0, venta.total - (venta.totalPagado || 0));

        res.render('ventas/detalle', {
            usuario: req.session.usuario,
            titulo:  `Venta · ${venta.cliente}`,
            venta,
            mensaje: req.query.ok  ? 'Venta actualizada correctamente.' : null,
            error:   req.query.err ? 'Error al actualizar la venta.'     : null,
        });
    } catch (error) {
        console.error('Error mostrar detalle venta:', error);
        res.redirect('/ventas');
    }
};

exports.mostrarEditar = async (req, res) => {
    try {
        const venta = await Venta.findById(req.params.id).lean();
        if (!venta) return res.redirect('/ventas');
        res.render('ventas/editar', { usuario: req.session.usuario, venta, error: null });
    } catch (error) {
        console.error('Error mostrar editar:', error);
        res.redirect('/ventas');
    }
};

exports.actualizar = async (req, res) => {
    const { zona, entidad, piso, cliente, producto, precioUnitario, cantidad } = req.body;
    const errores = validarVenta({ zona, cliente, producto, precioUnitario, cantidad });

    if (errores.length > 0) {
        return res.render('ventas/editar', {
            usuario: req.session.usuario,
            venta:   { _id: req.params.id, ...req.body },
            error:   errores.join(' ')
        });
    }

    try {
        const precio      = Number(precioUnitario);
        const cantidadNum = parseInt(cantidad, 10);

        await Venta.findByIdAndUpdate(
            req.params.id,
            {
                zona,
                ubicacion:      { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
                cliente:        cliente.trim(),
                producto:       producto.trim(),
                precioUnitario: precio,
                cantidad:       cantidadNum,
                total:          precio * cantidadNum
            },
            { new: true, runValidators: true }
        );

        res.redirect(`/ventas/detalle/${req.params.id}?ok=1`);
    } catch (error) {
        console.error('Error actualizar venta:', error);
        res.redirect(`/ventas/detalle/${req.params.id}?err=1`);
    }
};

exports.eliminar = async (req, res) => {
    try {
        const venta = await Venta.findById(req.params.id);
        if (!venta) return res.redirect('/ventas');
        await Venta.findByIdAndDelete(req.params.id);
        res.redirect('/ventas');
    } catch (error) {
        console.error('Error eliminar venta:', error);
        res.redirect('/ventas');
    }
};

exports.registrarCobro = async (req, res) => {
    const { monto, metodo, referencia } = req.body;

    try {
        const venta = await Venta.findById(req.params.id);
        if (!venta) return res.status(404).json({ error: 'Venta no encontrada.' });

        const montoNum       = Number(monto);
        const saldoPendiente = Math.max(0, venta.total - (venta.totalPagado || 0));

        if (isNaN(montoNum) || montoNum <= 0)
            return res.status(400).json({ error: 'Monto inválido.' });
        if (montoNum > saldoPendiente + 0.001)
            return res.status(400).json({ error: 'El monto supera el saldo pendiente.' });
        if (venta.estadoPago === 'pagado')
            return res.status(400).json({ error: 'La venta ya está pagada.' });

        venta.cobros.push({
            monto:      montoNum,
            metodo:     metodo?.trim()     || 'efectivo',
            referencia: referencia?.trim() || '',
            fecha:      new Date(),
            cobradoPor: req.session?.usuario || req.usuario || 'Sistema'
        });

        venta.totalPagado = (venta.totalPagado || 0) + montoNum;

        if      (venta.totalPagado >= venta.total) venta.estadoPago = 'pagado';
        else if (venta.totalPagado  > 0)           venta.estadoPago = 'parcial';

        await venta.save();

        res.json({
            ok:             true,
            estadoPago:     venta.estadoPago,
            totalPagado:    venta.totalPagado,
            saldoPendiente: venta.total - venta.totalPagado
        });
    } catch (error) {
        console.error('Error registrarCobro:', error);
        res.status(500).json({ error: 'Error interno al registrar el cobro.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
// API
// ═════════════════════════════════════════════════════════════════════════════

exports.listarAPI = async (req, res) => {
    const { zona, cliente, estadoPago, pagina = 1 } = req.query;
    const limite = 20;
    const filtro = {};

    if (zona       && zona       !== '') filtro.zona       = zona;
    if (cliente    && cliente    !== '') filtro.cliente    = new RegExp(escapeRegex(cliente), 'i');
    if (estadoPago && estadoPago !== '') filtro.estadoPago = estadoPago;

    try {
        const [ventas, total] = await Promise.all([
            Venta.find(filtro)
                 .sort({ fecha: -1 })
                 .limit(limite)
                 .skip((pagina - 1) * limite)
                 .lean(),
            Venta.countDocuments(filtro)
        ]);

        res.json({
            success: true,
            data:    ventas,
            paginacion: {
                paginaActual: Number(pagina),
                totalPaginas: Math.ceil(total / limite),
                total
            }
        });
    } catch (error) {
        console.error('Error listarAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
// guardarAPI — POST /api/v1/ventas
//
// CONTRATO DEL FRONTEND (obligatorio):
//   { clienteId: "<ObjectId>", zona, items: [...] | producto+precioUnitario+cantidad }
//
// REGLAS ESTRICTAS:
//   1. clienteId DEBE venir siempre y ser un ObjectId válido en la colección Cliente.
//   2. Si clienteId no es válido o no existe → 400, sin crear nada.
//   3. NUNCA se crea un cliente nuevo aquí. Para eso existe POST /api/v1/clientes.
//   4. El campo "cliente" (display) se toma de la BD, no del frontend.
// ═════════════════════════════════════════════════════════════════════════════
exports.guardarAPI = async (req, res) => {
    const {
        zona, entidad, piso,
        clienteId,           // ← ÚNICO campo de identificación de cliente aceptado
        items,               // array multi-producto (opcional)
        producto, precioUnitario, cantidad,  // campos legacy un solo producto
        tipoTransaccion, estadoEntrega,
        clientTempId
    } = req.body;

    // ── 1. Validar zona ───────────────────────────────────────────────────────
    if (!zona || !zonasValidas.includes(zona))
        return res.status(400).json({ success: false, errors: ['Zona inválida.'] });

    // ── 2. Idempotencia offline — antes de cualquier consulta pesada ──────────
    if (clientTempId) {
        const existente = await Venta.findOne({ clientTempId }).lean();
        if (existente)
            return res.status(200).json({
                success:   true,
                data:      existente,
                duplicado: true,
                message:   'Registro ya sincronizado anteriormente.'
            });
    }

    // ── 3. Verificar cliente por ID — ÚNICA fuente de verdad ─────────────────
    // verificarCliente: findById + proyección mínima + lean()
    // Usa el índice _id automático de MongoDB. Instantáneo a cualquier volumen.
    const { ok, cliente, error } = await verificarCliente(clienteId);
    if (!ok) return res.status(400).json({ success: false, errors: [error] });

    try {
        // ── 4a. Multi-producto ────────────────────────────────────────────────
        if (Array.isArray(items) && items.length > 0) {
            const erroresItems = validarItems(items);
            if (erroresItems.length > 0)
                return res.status(400).json({ success: false, errors: erroresItems });

            const itemsNorm = items.map(it => ({
                nombre:   String(it.nombre).trim(),
                cantidad: parseInt(it.cantidad, 10),
                precio:   Number(it.precio),
                subtotal: Number(it.precio) * parseInt(it.cantidad, 10),
            }));

            const totalGeneral = itemsNorm.reduce((s, it) => s + it.subtotal, 0);
            const primerItem   = itemsNorm[0];

            const nueva = await Venta.create({
                zona,
                ubicacion:    { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
                clienteRef:   cliente._id,     // ObjectId real — fuente de verdad
                cliente:      cliente.nombre,  // campo display sincronizado con BD
                producto:     primerItem.nombre,
                precioUnitario: primerItem.precio,
                cantidad:     primerItem.cantidad,
                total:        totalGeneral,
                items:        itemsNorm,
                tipoTransaccion:  tipoTransaccion || 'venta',
                estadoEntrega:    estadoEntrega   || 'Inmediata',
                estadoPago:       'pendiente',
                totalPagado:      0,
                cobros:           [],
                clientTempId:     clientTempId || null,
                creadoPorDispositivo: req.headers['x-device-id'] || null
            });

            return res.status(201).json({ success: true, data: nueva });
        }

        // ── 4b. Venta legacy (un solo producto) ───────────────────────────────
        // Validamos con el nombre de BD para no depender del nombre que venga del frontend
        const erroresLegacy = validarVenta({
            zona,
            cliente: cliente.nombre,
            producto,
            precioUnitario,
            cantidad
        });
        if (erroresLegacy.length > 0)
            return res.status(400).json({ success: false, errors: erroresLegacy });

        const precio      = Number(precioUnitario);
        const cantidadNum = parseInt(cantidad, 10);

        const nueva = await Venta.create({
            zona,
            ubicacion:    { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
            clienteRef:   cliente._id,     // ObjectId real
            cliente:      cliente.nombre,  // display desde BD
            producto:     producto.trim(),
            precioUnitario: precio,
            cantidad:     cantidadNum,
            total:        precio * cantidadNum,
            tipoTransaccion:  tipoTransaccion || 'venta',
            estadoEntrega:    estadoEntrega   || 'Inmediata',
            estadoPago:       'pendiente',
            totalPagado:      0,
            cobros:           [],
            clientTempId:     clientTempId || null,
            creadoPorDispositivo: req.headers['x-device-id'] || null
        });

        return res.status(201).json({ success: true, data: nueva });

    } catch (error) {
        console.error('Error guardarAPI:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
// actualizarAPI — PUT /api/v1/ventas/:id
//
// Si el cliente cambia → enviar el nuevo clienteId en el body.
// Si el cliente NO cambia → omitir clienteId (se conserva el existente).
// NUNCA se actualiza el cliente buscando por nombre.
// ═════════════════════════════════════════════════════════════════════════════
exports.actualizarAPI = async (req, res) => {
    const { zona, entidad, piso, clienteId, producto, precioUnitario, cantidad } = req.body;

    // Validaciones de campos de venta
    const errores = [];
    if (!zona || !zonasValidas.includes(zona))    errores.push('Zona inválida.');
    if (!producto || producto.trim().length < 2)  errores.push('Producto requerido.');
    const precio      = Number(precioUnitario);
    const cantidadNum = parseInt(cantidad, 10);
    if (isNaN(precio)      || precio      <= 0)   errores.push('Precio debe ser mayor a 0.');
    if (isNaN(cantidadNum) || cantidadNum <  1)   errores.push('Cantidad mínima es 1.');
    if (errores.length > 0)
        return res.status(400).json({ success: false, errors: errores });

    // Si viene clienteId → verificar antes de tocar la BD de ventas
    let clienteData = null;
    if (clienteId) {
        const { ok, cliente, error } = await verificarCliente(clienteId);
        if (!ok) return res.status(400).json({ success: false, errors: [error] });
        clienteData = cliente;
    }

    try {
        // Construir update dinámicamente — solo los campos que cambian
        const camposUpdate = {
            zona,
            ubicacion:      { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
            producto:       producto.trim(),
            precioUnitario: precio,
            cantidad:       cantidadNum,
            total:          precio * cantidadNum,
        };

        // Solo pisar clienteRef y cliente (display) si vino un nuevo clienteId validado
        if (clienteData) {
            camposUpdate.clienteRef = clienteData._id;
            camposUpdate.cliente    = clienteData.nombre;
        }

        // updateOne es más eficiente que findByIdAndUpdate cuando no necesitamos
        // devolver el documento completo: evita un round-trip extra a MongoDB.
        const result = await Venta.updateOne(
            { _id: req.params.id },
            { $set: camposUpdate },
            { runValidators: true }
        );

        if (result.matchedCount === 0)
            return res.status(404).json({ success: false, message: 'Venta no encontrada.' });

        return res.json({ success: true, message: 'Venta actualizada correctamente.' });

    } catch (error) {
        console.error('Error actualizarAPI:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
// eliminarAPI — DELETE /api/v1/ventas/:id
// ═════════════════════════════════════════════════════════════════════════════
exports.eliminarAPI = async (req, res) => {
    try {
        const eliminada = await Venta.findByIdAndDelete(req.params.id);
        if (!eliminada)
            return res.status(404).json({ success: false, message: 'Venta no encontrada.' });
        res.json({ success: true, message: 'Venta eliminada correctamente.' });
    } catch (error) {
        console.error('Error eliminarAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
// registrarCobroAPI — POST /api/v1/ventas/:id/cobros
// ═════════════════════════════════════════════════════════════════════════════
exports.registrarCobroAPI = (req, res) => {
    return exports.registrarCobro(req, res);
};

// ═════════════════════════════════════════════════════════════════════════════
// actualizarEntregaItemAPI — PATCH /api/v1/ventas/:id/items/:itemId/entrega
// ═════════════════════════════════════════════════════════════════════════════
exports.actualizarEntregaItemAPI = async (req, res) => {
    const { id, itemId } = req.params;
    const { entregado }  = req.body;

    if (typeof entregado !== 'boolean')
        return res.status(400).json({ success: false, message: 'El campo entregado debe ser boolean.' });

    try {
        const venta = await Venta.findById(id);
        if (!venta)
            return res.status(404).json({ success: false, message: 'Venta no encontrada.' });

        const item = venta.items.id(itemId);
        if (!item)
            return res.status(404).json({ success: false, message: 'Ítem no encontrado.' });

        item.entregado = entregado;

        const todosEntregados = venta.items.length > 0 && venta.items.every(it => it.entregado);
        if (todosEntregados)                              venta.estadoEntrega = 'Entregado';
        else if (venta.estadoEntrega === 'Entregado')     venta.estadoEntrega = 'Pendiente';

        await venta.save();

        res.json({
            success:        true,
            entregado:      item.entregado,
            estadoEntrega:  venta.estadoEntrega,
            todosEntregados
        });
    } catch (error) {
        console.error('Error actualizarEntregaItemAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
// editarVentaAPI — PUT /api/v1/cartera/:ventaId/editar
// Edita ítems/totales de una venta existente y guarda historial de cambios.
// No cambia el cliente asociado (usar actualizarAPI para eso).
// ═════════════════════════════════════════════════════════════════════════════
exports.editarVentaAPI = async (req, res) => {
    const { producto, cantidad, items, total, motivo } = req.body;
    const usuario = req.session?.usuario || req.usuario || 'app';

    try {
        const venta = await Venta.findById(req.params.id);
        if (!venta)
            return res.status(404).json({ success: false, message: 'Venta no encontrada.' });

        // Snapshot para historial antes de modificar
        const anterior = {
            producto:       venta.producto,
            cantidad:       venta.cantidad,
            precioUnitario: venta.precioUnitario,
            total:          venta.total,
            items:          venta.items.map(it => ({ ...it.toObject() })),
        };

        if (producto) venta.producto = producto.trim();
        if (cantidad) venta.cantidad = parseFloat(cantidad);

        if (Array.isArray(items)) {
            venta.items = items
                .filter(it => it.nombre?.trim())
                .map(it => ({
                    _id:       it._id || undefined,
                    nombre:    String(it.nombre).trim(),
                    cantidad:  parseFloat(it.cantidad) || 1,
                    precio:    parseFloat(it.precio)   || 0,
                    subtotal:  (parseFloat(it.cantidad) || 1) * (parseFloat(it.precio) || 0),
                    entregado: it.entregado || false,
                }));
        }

        if (total !== undefined) venta.total = parseFloat(total);

        venta.historialEdiciones.push({
            fecha:    new Date(),
            usuario,
            motivo:   motivo || 'Edición',
            anterior,
        });

        await venta.save();
        res.json({ success: true, data: venta });

    } catch (error) {
        console.error('Error editarVentaAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};