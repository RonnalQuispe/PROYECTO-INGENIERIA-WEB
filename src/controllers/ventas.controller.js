const Venta = require('../models/venta.model');

// ── LISTAR ventas (con filtros opcionales) ───────────────────────────────────
exports.listar = async (req, res) => {
    const { zona, cliente } = req.query;

    // Construir filtro dinámico
    const filtro = {};
    if (zona    && zona !== '')    filtro.zona    = zona;
    if (cliente && cliente !== '') filtro.cliente = new RegExp(cliente, 'i'); // búsqueda parcial

    try {
        const ventas = await Venta.find(filtro).sort({ fecha: -1 });

        // Calcular gran total de la consulta actual
        const granTotal = ventas.reduce((sum, v) => sum + v.total, 0);

        res.render('ventas/lista', {
            usuario: req.session.usuario,
            ventas,
            granTotal,
            filtros: { zona: zona || '', cliente: cliente || '' }
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

    // El total también llega del formulario (calculado en el browser)
    const total = parseFloat(precioUnitario) * parseInt(cantidad);

    try {
        const nuevaVenta = new Venta({
            zona,
            ubicacion: { entidad, piso },
            cliente,
            producto,
            precioUnitario: parseFloat(precioUnitario),
            cantidad:       parseInt(cantidad),
            total
        });

        await nuevaVenta.save();
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
    } catch (error) {
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
    } catch (error) {
        res.redirect('/ventas');
    }
};
