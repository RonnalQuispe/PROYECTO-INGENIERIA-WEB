

const Venta    = require('../models/venta.model');
const Cliente  = require('../models/cliente.model');
const mongoose = require('mongoose');

const zonasValidas = ['Norte', 'Centro', 'Sur'];
const escapeRegex  = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: verificarCliente
// ─────────────────────────────────────────────────────────────────────────────
const verificarCliente = async (clienteId) => {
    if (!clienteId || !mongoose.Types.ObjectId.isValid(clienteId))
        return { ok: false, error: 'clienteId inválido o ausente. Selecciona un cliente de la lista.' };

    const cliente = await Cliente
        .findById(clienteId)
        .select('nombre zona telefono activo')
        .lean();

    if (!cliente)        return { ok: false, error: 'El cliente seleccionado no existe.' };
    if (!cliente.activo) return { ok: false, error: 'El cliente seleccionado está inactivo.' };

    return { ok: true, cliente };
};

const resolverClienteRef = async (clienteId, nombreCliente, zona = '') => {
    // Caso 1: el formulario envió un ID válido → verificar que existe
    if (clienteId && mongoose.Types.ObjectId.isValid(clienteId)) {
        const cliente = await Cliente
            .findById(clienteId)
            .select('_id nombre activo')
            .lean();

        if (cliente && cliente.activo)
            return { ok: true, clienteRef: cliente._id, nombreCliente: cliente.nombre, creado: false };
    }

    // Caso 2: buscar por nombre exacto
    if (!nombreCliente || nombreCliente.trim().length < 2)
        return { ok: false, error: 'El nombre del cliente debe tener al menos 2 caracteres.' };

    const nombre = nombreCliente.trim();

    const existente = await Cliente
        .findOne({ nombre })
        .select('_id nombre activo')
        .lean();

    if (existente && existente.activo)
        return { ok: true, clienteRef: existente._id, nombreCliente: existente.nombre, creado: false };

    // Caso 3: no existe → crear cliente nuevo automáticamente
    const nuevo = await Cliente.create({ nombre, zona: zona || '', telefono: '' });
    console.info(`[ventas.controller] Cliente creado automáticamente: "${nombre}" (${nuevo._id})`);

    return { ok: true, clienteRef: nuevo._id, nombreCliente: nuevo.nombre, creado: true };
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
// WEB
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
            filtros: { zona: zona || '', cliente: cliente || '', estadoPago: estadoPago || '' }
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
    const { zona, entidad, piso, cliente, clienteId, producto, precioUnitario, cantidad } = req.body;
    const errores = validarVenta({ zona, cliente, producto, precioUnitario, cantidad });

    if (errores.length > 0)
        return res.render('ventas/crear', { usuario: req.session.usuario, error: errores.join(' ') });

    try {
       
        const resolucion = await resolverClienteRef(clienteId, cliente, zona);

        if (!resolucion.ok)
            return res.render('ventas/crear', {
                usuario: req.session.usuario,
                error: resolucion.error
            });

        const precio      = Number(precioUnitario);
        const cantidadNum = parseInt(cantidad, 10);

        await new Venta({
            zona,
            ubicacion:      { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
            clienteRef:     resolucion.clienteRef,       // ✅ incluido
            cliente:        resolucion.nombreCliente,    // ✅ nombre canónico del modelo
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
    const { zona, entidad, piso, cliente, clienteId, producto, precioUnitario, cantidad } = req.body;
    const errores = validarVenta({ zona, cliente, producto, precioUnitario, cantidad });

    if (errores.length > 0) {
        return res.render('ventas/editar', {
            usuario: req.session.usuario,
            venta:   { _id: req.params.id, ...req.body },
            error:   errores.join(' ')
        });
    }

    try {
        const resolucion = await resolverClienteRef(clienteId, cliente, zona);

        if (!resolucion.ok)
            return res.render('ventas/editar', {
                usuario: req.session.usuario,
                venta:   { _id: req.params.id, ...req.body },
                error:   resolucion.error
            });

        const precio      = Number(precioUnitario);
        const cantidadNum = parseInt(cantidad, 10);

        await Venta.findByIdAndUpdate(
            req.params.id,
            {
                zona,
                ubicacion:      { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
                clienteRef:     resolucion.clienteRef,    // ✅ incluido
                cliente:        resolucion.nombreCliente, // ✅ nombre canónico
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
        const eliminada = await Venta.findByIdAndDelete(req.params.id);
        if (!eliminada) return res.redirect('/ventas');
        res.redirect('/ventas');
    } catch (error) {
        console.error('Error eliminar venta:', error);
        res.redirect('/ventas');
    }
};

exports.registrarCobro = async (req, res) => {
    const { monto, metodo, referencia } = req.body;
    const { id } = req.params;

    try {
        const venta = await Venta
            .findById(id)
            .select('total totalPagado estadoPago')
            .lean();

        if (!venta) return res.status(404).json({ error: 'Venta no encontrada.' });

        const montoNum       = Number(monto);
        const saldoPendiente = Math.max(0, venta.total - (venta.totalPagado || 0));

        if (isNaN(montoNum) || montoNum <= 0)
            return res.status(400).json({ error: 'Monto inválido.' });
        if (montoNum > saldoPendiente + 0.001)
            return res.status(400).json({ error: 'El monto supera el saldo pendiente.' });
        if (venta.estadoPago === 'pagado')
            return res.status(400).json({ error: 'La venta ya está pagada.' });

        const nuevoTotalPagado = Math.min(venta.total, (venta.totalPagado || 0) + montoNum);
        const nuevoEstadoPago  =
            nuevoTotalPagado >= venta.total ? 'pagado'  :
            nuevoTotalPagado  > 0           ? 'parcial' : 'pendiente';

        await Venta.updateOne(
            { _id: id },
            {
                $push: {
                    cobros: {
                        monto:      montoNum,
                        metodo:     metodo?.trim()     || 'efectivo',
                        referencia: referencia?.trim() || '',
                        fecha:      new Date(),
                        cobradoPor: req.session?.usuario || req.usuario || 'Sistema'
                    }
                },
                $set: {
                    totalPagado: nuevoTotalPagado,
                    estadoPago:  nuevoEstadoPago
                }
            }
        );

        res.json({
            ok:             true,
            estadoPago:     nuevoEstadoPago,
            totalPagado:    nuevoTotalPagado,
            saldoPendiente: Math.max(0, venta.total - nuevoTotalPagado)
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
    const { zona, clienteId, estadoPago, pagina = 1, limite = 20 } = req.query;
    const limiteNum = Math.min(Number(limite), 100);
    const skip      = (Number(pagina) - 1) * limiteNum;

    try {
        const filtro = {};
        if (zona       && zona       !== '') filtro.zona       = zona;
        if (estadoPago && estadoPago !== '') filtro.estadoPago = estadoPago;

        if (clienteId && mongoose.Types.ObjectId.isValid(clienteId))
            filtro.clienteRef = new mongoose.Types.ObjectId(clienteId);

        const proyeccion = {
            zona: 1, cliente: 1, clienteRef: 1,
            producto: 1, total: 1, totalPagado: 1,
            estadoPago: 1, estadoEntrega: 1,
            tipoTransaccion: 1, fecha: 1,
            'ubicacion.entidad': 1,
            'items.nombre': 1, 'items.cantidad': 1, 'items.entregado': 1
        };

        const [ventas, total] = await Promise.all([
            Venta
                .find(filtro, proyeccion)
                .sort({ fecha: -1 })
                .skip(skip)
                .limit(limiteNum)
                .lean(),
            Venta.countDocuments(filtro)
        ]);

        res.json({
            success: true,
            data:    ventas,
            paginacion: {
                paginaActual: Number(pagina),
                totalPaginas: Math.ceil(total / limiteNum),
                total
            }
        });
    } catch (error) {
        console.error('Error listarAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.guardarAPI = async (req, res) => {
    const {
        zona, entidad, piso,
        clienteId,
        esClienteNuevo,
        cliente: clienteNombre,
        telefono,
        items,
        producto, precioUnitario, cantidad,
        tipoTransaccion, estadoEntrega,
        clientTempId
    } = req.body;

    if (!zona || !zonasValidas.includes(zona))
        return res.status(400).json({ success: false, errors: ['Zona inválida.'] });

    if (clientTempId) {
        const existente = await Venta.findOne({ clientTempId }).select('_id').lean();
        if (existente)
            return res.status(200).json({
                success:   true,
                data:      existente,
                duplicado: true,
                message:   'Registro ya sincronizado anteriormente.'
            });
    }

    let clienteResuelto;

    if (esClienteNuevo === true || esClienteNuevo === 'true') {
        const nombreTrimmed = (clienteNombre || '').trim();
        if (nombreTrimmed.length < 2)
            return res.status(400).json({ success: false, errors: ['Nombre de cliente requerido.'] });

        let existente = await Cliente
            .findOne({ nombre: nombreTrimmed })
            .select('_id nombre activo')
            .lean();

        clienteResuelto = existente || await Cliente.create({
            nombre:   nombreTrimmed,
            zona:     zona || '',
            telefono: (telefono || '').trim(),
        });
    } else {
        const { ok, cliente, error } = await verificarCliente(clienteId);
        if (!ok) return res.status(400).json({ success: false, errors: [error] });
        clienteResuelto = cliente;
    }

    const cliente = clienteResuelto;

    try {
        if (Array.isArray(items) && items.length > 0) {
            const erroresItems = validarItems(items);
            if (erroresItems.length > 0)
                return res.status(400).json({ success: false, errors: erroresItems });

            const itemsNorm    = items.map(it => ({
                nombre:   String(it.nombre).trim(),
                cantidad: parseInt(it.cantidad, 10),
                precio:   Number(it.precio),
                subtotal: Number(it.precio) * parseInt(it.cantidad, 10),
            }));
            const totalGeneral = itemsNorm.reduce((s, it) => s + it.subtotal, 0);
            const primerItem   = itemsNorm[0];

            const nueva = await Venta.create({
                zona,
                ubicacion:        { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
                clienteRef:       cliente._id,
                cliente:          cliente.nombre,
                producto:         primerItem.nombre,
                precioUnitario:   primerItem.precio,
                cantidad:         primerItem.cantidad,
                total:            totalGeneral,
                items:            itemsNorm,
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

        const erroresLegacy = validarVenta({ zona, cliente: cliente.nombre, producto, precioUnitario, cantidad });
        if (erroresLegacy.length > 0)
            return res.status(400).json({ success: false, errors: erroresLegacy });

        const precio      = Number(precioUnitario);
        const cantidadNum = parseInt(cantidad, 10);

        const nueva = await Venta.create({
            zona,
            ubicacion:        { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
            clienteRef:       cliente._id,
            cliente:          cliente.nombre,
            producto:         producto.trim(),
            precioUnitario:   precio,
            cantidad:         cantidadNum,
            total:            precio * cantidadNum,
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

exports.actualizarAPI = async (req, res) => {
    const { zona, entidad, piso, clienteId, producto, precioUnitario, cantidad } = req.body;

    const errores = [];
    if (!zona || !zonasValidas.includes(zona))    errores.push('Zona inválida.');
    if (!producto || producto.trim().length < 2)  errores.push('Producto requerido.');
    const precio      = Number(precioUnitario);
    const cantidadNum = parseInt(cantidad, 10);
    if (isNaN(precio)      || precio      <= 0)   errores.push('Precio debe ser mayor a 0.');
    if (isNaN(cantidadNum) || cantidadNum <  1)   errores.push('Cantidad mínima es 1.');
    if (errores.length > 0)
        return res.status(400).json({ success: false, errors: errores });

    let clienteData = null;
    if (clienteId) {
        const { ok, cliente, error } = await verificarCliente(clienteId);
        if (!ok) return res.status(400).json({ success: false, errors: [error] });
        clienteData = cliente;
    }

    try {
        const camposUpdate = {
            zona,
            ubicacion:      { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
            producto:       producto.trim(),
            precioUnitario: precio,
            cantidad:       cantidadNum,
            total:          precio * cantidadNum,
        };

        if (clienteData) {
            camposUpdate.clienteRef = clienteData._id;
            camposUpdate.cliente    = clienteData.nombre;
        }

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

exports.registrarCobroAPI = (req, res) => {
    return exports.registrarCobro(req, res);
};

exports.actualizarEntregaItemAPI = async (req, res) => {
    const { id, itemId } = req.params;
    const { entregado }  = req.body;

    if (typeof entregado !== 'boolean')
        return res.status(400).json({ success: false, message: 'El campo entregado debe ser boolean.' });

    try {
        const result = await Venta.updateOne(
            {
                _id:         new mongoose.Types.ObjectId(id),
                'items._id': new mongoose.Types.ObjectId(itemId)
            },
            {
                $set: { 'items.$.entregado': entregado }
            }
        );

        if (result.matchedCount === 0)
            return res.status(404).json({ success: false, message: 'Venta o ítem no encontrado.' });

        await Venta.updateOne(
            { _id: new mongoose.Types.ObjectId(id) },
            [
                {
                    $set: {
                        estadoEntrega: {
                            $cond: {
                                if: {
                                    $and: [
                                        { $gt: [{ $size: '$items' }, 0] },
                                        {
                                            $allElementsTrue: {
                                                $map: {
                                                    input: '$items',
                                                    as:    'it',
                                                    in:    '$$it.entregado'
                                                }
                                            }
                                        }
                                    ]
                                },
                                then: 'Entregado',
                                else: 'Pendiente'
                            }
                        }
                    }
                }
            ]
        );

        res.json({
            success:   true,
            entregado,
            message:   'Estado de entrega actualizado.'
        });

    } catch (error) {
        console.error('Error actualizarEntregaItemAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.editarVentaAPI = async (req, res) => {
    const { producto, cantidad, items, total, motivo } = req.body;
    const usuario = req.session?.usuario || req.usuario || 'app';

    try {
        const venta = await Venta.findById(req.params.id);
        if (!venta)
            return res.status(404).json({ success: false, message: 'Venta no encontrada.' });

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