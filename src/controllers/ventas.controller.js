// ============================================================
// src/controllers/ventas.controller.js
// ✅ CORRECCIÓN: Añadido exports.mostrarDetalle para GET /ventas/detalle/:id
// ============================================================

const Venta = require('../models/venta.model');

const zonasValidas = ['Norte', 'Centro', 'Sur'];

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const validarVenta = ({ zona, cliente, producto, precioUnitario, cantidad }) => {
    const errores = [];
    const precio      = Number(precioUnitario);
    const cantidadNum = parseInt(cantidad, 10);

    if (!zona || !zonasValidas.includes(zona))        errores.push('Zona inválida.');
    if (!cliente  || cliente.trim().length  < 2)      errores.push('Nombre de cliente requerido.');
    if (!producto || producto.trim().length < 2)      errores.push('Producto requerido.');
    if (isNaN(precio)      || precio      <= 0)       errores.push('Precio debe ser mayor a 0.');
    if (isNaN(cantidadNum) || cantidadNum <  1)       errores.push('Cantidad mínima es 1.');

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
        if (isNaN(precio) || precio <= 0)
            errores.push(`Producto ${i + 1}: precio debe ser mayor a 0.`);
        if (isNaN(cantidad) || cantidad < 1)
            errores.push(`Producto ${i + 1}: cantidad mínima es 1.`);
    });
    return errores;
};

// ─────────────────────────────────────────────────────────────
// WEB
// ─────────────────────────────────────────────────────────────

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
        return res.render('ventas/crear', {
            usuario: req.session.usuario,
            error: errores.join(' ')
        });
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

// ✅ NUEVO: Mostrar detalle completo de una venta (web)
exports.mostrarDetalle = async (req, res) => {
    try {
        const venta = await Venta.findById(req.params.id).lean();
        if (!venta) return res.redirect('/ventas');

        // Calcular saldo para la vista
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

        // ✅ Redirigir al detalle con mensaje de éxito
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

// ═════════════════════════════════════════════════════════════
// API
// ═════════════════════════════════════════════════════════════

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

exports.guardarAPI = async (req, res) => {
    const {
        zona, entidad, piso, cliente,
        items,
        producto, precioUnitario, cantidad,
        tipoTransaccion, estadoEntrega,
        clientTempId
    } = req.body;

    const erroresComun = [];
    if (!zona || !zonasValidas.includes(zona))   erroresComun.push('Zona inválida.');
    if (!cliente || cliente.trim().length < 2)   erroresComun.push('Nombre de cliente requerido.');
    if (erroresComun.length > 0)
        return res.status(400).json({ success: false, errors: erroresComun });

    if (clientTempId) {
        const existente = await Venta.findOne({ clientTempId });
        if (existente) {
            return res.status(200).json({
                success:   true,
                data:      existente,
                duplicado: true,
                message:   'Registro ya sincronizado anteriormente.'
            });
        }
    }

    try {
        if (Array.isArray(items) && items.length > 0) {
            const erroresItems = validarItems(items);
            if (erroresItems.length > 0)
                return res.status(400).json({ success: false, errors: erroresItems });

            const itemsNorm = items.map(it => ({
                nombre:    String(it.nombre).trim(),
                cantidad:  parseInt(it.cantidad, 10),
                precio:    Number(it.precio),
                subtotal:  Number(it.precio) * parseInt(it.cantidad, 10),
            }));

            const totalGeneral = itemsNorm.reduce((s, it) => s + it.subtotal, 0);
            const primerItem   = itemsNorm[0];

            const nueva = await new Venta({
                zona,
                ubicacion:            { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
                cliente:              cliente.trim(),
                producto:             primerItem.nombre,
                precioUnitario:       primerItem.precio,
                cantidad:             primerItem.cantidad,
                total:                totalGeneral,
                items:                itemsNorm,
                tipoTransaccion:      tipoTransaccion || 'venta',
                estadoEntrega:        estadoEntrega   || 'Inmediata',
                estadoPago:           'pendiente',
                totalPagado:          0,
                cobros:               [],
                clientTempId:         clientTempId || null,
                creadoPorDispositivo: req.headers['x-device-id'] || null
            }).save();

            return res.status(201).json({ success: true, data: nueva });
        }

        const erroresLegacy = validarVenta({ zona, cliente, producto, precioUnitario, cantidad });
        if (erroresLegacy.length > 0)
            return res.status(400).json({ success: false, errors: erroresLegacy });

        const precio      = Number(precioUnitario);
        const cantidadNum = parseInt(cantidad, 10);

        const nueva = await new Venta({
            zona,
            ubicacion:            { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
            cliente:              cliente.trim(),
            producto:             producto.trim(),
            precioUnitario:       precio,
            cantidad:             cantidadNum,
            total:                precio * cantidadNum,
            tipoTransaccion:      tipoTransaccion || 'venta',
            estadoEntrega:        estadoEntrega   || 'Inmediata',
            estadoPago:           'pendiente',
            totalPagado:          0,
            cobros:               [],
            clientTempId:         clientTempId || null,
            creadoPorDispositivo: req.headers['x-device-id'] || null
        }).save();

        return res.status(201).json({ success: true, data: nueva });

    } catch (error) {
        console.error('Error guardarAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.actualizarAPI = async (req, res) => {
    const errores = validarVenta(req.body);
    if (errores.length > 0) {
        return res.status(400).json({ success: false, errors: errores });
    }

    const { zona, entidad, piso, cliente, producto, precioUnitario, cantidad } = req.body;

    try {
        const precio      = Number(precioUnitario);
        const cantidadNum = parseInt(cantidad, 10);

        const actualizada = await Venta.findByIdAndUpdate(
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

        if (!actualizada)
            return res.status(404).json({ success: false, message: 'Venta no encontrada.' });

        res.json({ success: true, data: actualizada });
    } catch (error) {
        console.error('Error actualizarAPI:', error);
        res.status(500).json({ success: false, message: error.message });
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
        const venta = await Venta.findById(id);
        if (!venta)
            return res.status(404).json({ success: false, message: 'Venta no encontrada.' });

        const item = venta.items.id(itemId);
        if (!item)
            return res.status(404).json({ success: false, message: 'Ítem no encontrado.' });

        item.entregado = entregado;

        const todosEntregados = venta.items.length > 0 && venta.items.every(it => it.entregado);
        if (todosEntregados) venta.estadoEntrega = 'Entregado';
        else if (venta.estadoEntrega === 'Entregado') venta.estadoEntrega = 'Pendiente';

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