const Venta = require('../models/venta.model');

// ── LISTAR ventas (con filtros opcionales) ───────────────────────────────────
exports.listar = async (req, res) => {
    const { zona, cliente, estadoPago } = req.query;

    const filtro = {};
    if (zona       && zona !== '')       filtro.zona       = zona;
    if (cliente    && cliente !== '')    filtro.cliente    = new RegExp(cliente, 'i');
    if (estadoPago && estadoPago !== '') filtro.estadoPago = estadoPago;

    try {
        const ventas    = await Venta.find(filtro).sort({ fecha: -1 });
        const granTotal = ventas.reduce((sum, v) => sum + v.total, 0);

        res.render('ventas/lista', {
            usuario: req.session.usuario,
            ventas,
            granTotal,
            filtros: {
                zona:       zona       || '',
                cliente:    cliente    || '',
                estadoPago: estadoPago || ''
            }
        });
    } catch (error) {
        console.error(error);
        res.send('Error al obtener ventas');
    }
};

// ── MOSTRAR formulario de CREAR ──────────────────────────────────────────────
exports.mostrarCrear = (req, res) => {
    res.render('ventas/crear', {
        usuario: req.session.usuario,
        error: null
    });
};

// ── GUARDAR nueva venta ──────────────────────────────────────────────────────
exports.guardar = async (req, res) => {
    const { zona, entidad, piso, cliente, producto, precioUnitario, cantidad } = req.body;
    const total = parseFloat(precioUnitario) * parseInt(cantidad);

    try {
        await new Venta({
            zona,
            ubicacion: { entidad, piso },
            cliente,
            producto,
            precioUnitario: parseFloat(precioUnitario),
            cantidad:       parseInt(cantidad),
            total,
            estadoPago:  'pendiente',
            totalPagado: 0,
            cobros:      []
        }).save();

        res.redirect('/ventas');
    } catch (error) {
        console.error(error);
        res.render('ventas/crear', {
            usuario: req.session.usuario,
            error: 'Error al guardar. Revisa los campos.'
        });
    }
};

// ── MOSTRAR formulario de EDITAR ─────────────────────────────────────────────
exports.mostrarEditar = async (req, res) => {
    try {
        const venta = await Venta.findById(req.params.id);
        if (!venta) return res.redirect('/ventas');
        res.render('ventas/editar', {
            usuario: req.session.usuario,
            venta,
            error: null
        });
    } catch {
        res.redirect('/ventas');
    }
};

// ── ACTUALIZAR venta ─────────────────────────────────────────────────────────
exports.actualizar = async (req, res) => {
    const { zona, entidad, piso, cliente, producto, precioUnitario, cantidad } = req.body;
    const total = parseFloat(precioUnitario) * parseInt(cantidad);

    try {
        await Venta.findByIdAndUpdate(req.params.id, {
            zona,
            ubicacion: { entidad, piso },
            cliente,
            producto,
            precioUnitario: parseFloat(precioUnitario),
            cantidad:       parseInt(cantidad),
            total
        });
        res.redirect('/ventas');
    } catch (error) {
        console.error(error);
        res.redirect('/ventas');
    }
};

// ── ELIMINAR venta ───────────────────────────────────────────────────────────
exports.eliminar = async (req, res) => {
    try {
        await Venta.findByIdAndDelete(req.params.id);
        res.redirect('/ventas');
    } catch {
        res.redirect('/ventas');
    }
};

// ── REGISTRAR COBRO ──────────────────────────────────────────────────────────
exports.registrarCobro = async (req, res) => {
    const { monto, metodo, referencia } = req.body;

    try {
        const venta = await Venta.findById(req.params.id);
        if (!venta) return res.status(404).json({ error: 'Venta no encontrada.' });

        const montoNum = parseFloat(monto);
        const saldo    = Math.max(0, venta.total - (venta.totalPagado || 0));

        // Validaciones
        if (!montoNum || montoNum <= 0)    return res.status(400).json({ error: 'Monto inválido.' });
        if (montoNum > saldo + 0.001)      return res.status(400).json({ error: 'El monto supera el saldo pendiente.' });
        if (venta.estadoPago === 'pagado') return res.status(400).json({ error: 'Esta venta ya está pagada.' });

        // Agregar el cobro al historial
        venta.cobros.push({
            monto:      montoNum,
            metodo:     metodo || 'efectivo',
            referencia: referencia || '',
            fecha:      new Date(),
            cobradoPor: req.session.usuario || ''
        });

        // Actualizar acumulado (el pre-save hook recalcula estadoPago)
        venta.totalPagado = (venta.totalPagado || 0) + montoNum;

        await venta.save();

        res.json({ ok: true, estadoPago: venta.estadoPago, totalPagado: venta.totalPagado });

    } catch (error) {
        console.error('Error registrarCobro:', error);
        res.status(500).json({ error: 'Error interno al registrar el cobro.' });
    }
};
