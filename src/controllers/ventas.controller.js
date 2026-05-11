// ============================================================
// src/controllers/ventas.controller.js
// ============================================================
// MÉTODOS WEB (sin ningún cambio):
//   listar, mostrarCrear, guardar, mostrarEditar, actualizar,
//   eliminar, registrarCobro
//
// MÉTODOS API (nuevos al final):
//   listarAPI, guardarAPI, actualizarAPI, eliminarAPI,
//   registrarCobroAPI
// ============================================================

const Venta = require('../models/venta.model');

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const zonasValidas = ['Norte', 'Centro', 'Sur'];

const escapeRegex = (text) => {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const validarVenta = ({
    zona,
    cliente,
    producto,
    precioUnitario,
    cantidad
}) => {
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

// ─────────────────────────────────────────────────────────────
// WEB — LISTAR VENTAS
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

// ─────────────────────────────────────────────────────────────
// WEB — MOSTRAR FORMULARIO CREAR
// ─────────────────────────────────────────────────────────────

exports.mostrarCrear = (req, res) => {
    res.render('ventas/crear', { usuario: req.session.usuario, error: null });
};

// ─────────────────────────────────────────────────────────────
// WEB — GUARDAR VENTA
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// WEB — MOSTRAR FORMULARIO EDITAR
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// WEB — ACTUALIZAR VENTA
// ─────────────────────────────────────────────────────────────

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
                ubicacion: { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
                cliente:   cliente.trim(),
                producto:  producto.trim(),
                precioUnitario: precio,
                cantidad:       cantidadNum,
                total:          precio * cantidadNum
            },
            { new: true, runValidators: true }
        );

        res.redirect('/ventas');
    } catch (error) {
        console.error('Error actualizar venta:', error);
        res.redirect('/ventas');
    }
};

// ─────────────────────────────────────────────────────────────
// WEB — ELIMINAR VENTA
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// WEB — REGISTRAR COBRO (ya retornaba JSON, sin cambios)
// ─────────────────────────────────────────────────────────────

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
            // En web usa la sesión; en API usa req.usuario (JWT)
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
// API — MÉTODOS JSON PARA LA APP MÓVIL
// Todas las rutas se montan en /api/v1/ventas (ver api.routes.js)
// ═════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// API — GET /api/v1/ventas
// Query params: zona, cliente, estadoPago, pagina
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// API — POST /api/v1/ventas
// Body JSON: { zona, entidad, piso, cliente, producto,
//              precioUnitario, cantidad, clientTempId? }
//
// clientTempId: ID generado en el móvil antes de tener red.
// Si llega, el servidor busca duplicados antes de insertar
// (idempotencia: reintentos no crean registros dobles).
// ─────────────────────────────────────────────────────────────

exports.guardarAPI = async (req, res) => {
    const errores = validarVenta(req.body);
    if (errores.length > 0) {
        return res.status(400).json({ success: false, errors: errores });
    }

    const {
        zona, entidad, piso, cliente, producto,
        precioUnitario, cantidad,
        clientTempId // ← viene del móvil cuando estaba offline
    } = req.body;

    try {
        // Deduplicación: el móvil puede reintentar si el primer intento se cortó
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

        const precio      = Number(precioUnitario);
        const cantidadNum = parseInt(cantidad, 10);

        const nueva = await new Venta({
            zona,
            ubicacion:           { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
            cliente:             cliente.trim(),
            producto:            producto.trim(),
            precioUnitario:      precio,
            cantidad:            cantidadNum,
            total:               precio * cantidadNum,
            estadoPago:          'pendiente',
            totalPagado:         0,
            cobros:              [],
            clientTempId:        clientTempId || null,
            creadoPorDispositivo: req.headers['x-device-id'] || null
        }).save();

        res.status(201).json({ success: true, data: nueva });
    } catch (error) {
        console.error('Error guardarAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// API — PUT /api/v1/ventas/:id
// ─────────────────────────────────────────────────────────────

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

        if (!actualizada) {
            return res.status(404).json({ success: false, message: 'Venta no encontrada.' });
        }

        res.json({ success: true, data: actualizada });
    } catch (error) {
        console.error('Error actualizarAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// API — DELETE /api/v1/ventas/:id
// ─────────────────────────────────────────────────────────────

exports.eliminarAPI = async (req, res) => {
    try {
        const eliminada = await Venta.findByIdAndDelete(req.params.id);
        if (!eliminada) {
            return res.status(404).json({ success: false, message: 'Venta no encontrada.' });
        }
        res.json({ success: true, message: 'Venta eliminada correctamente.' });
    } catch (error) {
        console.error('Error eliminarAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────
// API — POST /api/v1/ventas/:id/cobros
// Delega en registrarCobro: ya retorna JSON y es compatible.
// El único ajuste fue en cobradoPor (usa req.usuario del JWT).
// ─────────────────────────────────────────────────────────────

exports.registrarCobroAPI = (req, res) => {
    return exports.registrarCobro(req, res);
};
