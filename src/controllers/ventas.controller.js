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

    const precio = Number(precioUnitario);
    const cantidadNum = parseInt(cantidad, 10);

    if (!zona || !zonasValidas.includes(zona)) {
        errores.push('Zona inválida.');
    }

    if (!cliente || cliente.trim().length < 2) {
        errores.push('Nombre de cliente requerido.');
    }

    if (!producto || producto.trim().length < 2) {
        errores.push('Producto requerido.');
    }

    if (isNaN(precio) || precio <= 0) {
        errores.push('Precio debe ser mayor a 0.');
    }

    if (isNaN(cantidadNum) || cantidadNum < 1) {
        errores.push('Cantidad mínima es 1.');
    }

    return errores;
};

// ─────────────────────────────────────────────────────────────
// LISTAR VENTAS
// ─────────────────────────────────────────────────────────────

exports.listar = async (req, res) => {

    const {
        zona,
        cliente,
        estadoPago,
        pagina = 1
    } = req.query;

    const limite = 20;
    const skip = (pagina - 1) * limite;

    const filtro = {};

    try {

        if (zona && zona !== '') {
            filtro.zona = zona;
        }

        if (cliente && cliente !== '') {
            filtro.cliente = new RegExp(
                escapeRegex(cliente),
                'i'
            );
        }

        if (estadoPago && estadoPago !== '') {
            filtro.estadoPago = estadoPago;
        }

        const ventas = await Venta
            .find(filtro)
            .sort({ fecha: -1 })
            .limit(limite)
            .skip(skip)
            .lean();

        const totalVentas = await Venta.countDocuments(filtro);

        const granTotal = ventas.reduce(
            (sum, venta) => sum + (venta.total || 0),
            0
        );

        res.render('ventas/lista', {
            usuario: req.session.usuario,
            ventas,
            granTotal,

            paginacion: {
                paginaActual: Number(pagina),
                totalPaginas: Math.ceil(totalVentas / limite)
            },

            filtros: {
                zona: zona || '',
                cliente: cliente || '',
                estadoPago: estadoPago || ''
            }
        });

    } catch (error) {

        console.error('Error listar ventas:', error);

        res.status(500).render('error', {
            mensaje: 'Error al obtener ventas.'
        });
    }
};

// ─────────────────────────────────────────────────────────────
// MOSTRAR FORMULARIO CREAR
// ─────────────────────────────────────────────────────────────

exports.mostrarCrear = (req, res) => {

    res.render('ventas/crear', {
        usuario: req.session.usuario,
        error: null
    });
};

// ─────────────────────────────────────────────────────────────
// GUARDAR VENTA
// ─────────────────────────────────────────────────────────────

exports.guardar = async (req, res) => {

    const {
        zona,
        entidad,
        piso,
        cliente,
        producto,
        precioUnitario,
        cantidad
    } = req.body;

    const errores = validarVenta({
        zona,
        cliente,
        producto,
        precioUnitario,
        cantidad
    });

    if (errores.length > 0) {

        return res.render('ventas/crear', {
            usuario: req.session.usuario,
            error: errores.join(' ')
        });
    }

    try {

        const precio = Number(precioUnitario);
        const cantidadNum = parseInt(cantidad, 10);

        const total = precio * cantidadNum;

        await new Venta({

            zona,

            ubicacion: {
                entidad: entidad?.trim() || '',
                piso: piso?.trim() || ''
            },

            cliente: cliente.trim(),
            producto: producto.trim(),

            precioUnitario: precio,
            cantidad: cantidadNum,

            total,

            estadoPago: 'pendiente',

            totalPagado: 0,

            cobros: []

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
// MOSTRAR FORMULARIO EDITAR
// ─────────────────────────────────────────────────────────────

exports.mostrarEditar = async (req, res) => {

    try {

        const venta = await Venta
            .findById(req.params.id)
            .lean();

        if (!venta) {
            return res.redirect('/ventas');
        }

        res.render('ventas/editar', {
            usuario: req.session.usuario,
            venta,
            error: null
        });

    } catch (error) {

        console.error('Error mostrar editar:', error);

        res.redirect('/ventas');
    }
};

// ─────────────────────────────────────────────────────────────
// ACTUALIZAR VENTA
// ─────────────────────────────────────────────────────────────

exports.actualizar = async (req, res) => {

    const {
        zona,
        entidad,
        piso,
        cliente,
        producto,
        precioUnitario,
        cantidad
    } = req.body;

    const errores = validarVenta({
        zona,
        cliente,
        producto,
        precioUnitario,
        cantidad
    });

    if (errores.length > 0) {

        return res.render('ventas/editar', {
            usuario: req.session.usuario,
            venta: {
                _id: req.params.id,
                ...req.body
            },
            error: errores.join(' ')
        });
    }

    try {

        const precio = Number(precioUnitario);
        const cantidadNum = parseInt(cantidad, 10);

        const total = precio * cantidadNum;

        await Venta.findByIdAndUpdate(
            req.params.id,
            {

                zona,

                ubicacion: {
                    entidad: entidad?.trim() || '',
                    piso: piso?.trim() || ''
                },

                cliente: cliente.trim(),

                producto: producto.trim(),

                precioUnitario: precio,

                cantidad: cantidadNum,

                total
            },
            {
                new: true,
                runValidators: true
            }
        );

        res.redirect('/ventas');

    } catch (error) {

        console.error('Error actualizar venta:', error);

        res.redirect('/ventas');
    }
};

// ─────────────────────────────────────────────────────────────
// ELIMINAR VENTA
// ─────────────────────────────────────────────────────────────

exports.eliminar = async (req, res) => {

    try {

        const venta = await Venta.findById(req.params.id);

        if (!venta) {
            return res.redirect('/ventas');
        }

        await Venta.findByIdAndDelete(req.params.id);

        res.redirect('/ventas');

    } catch (error) {

        console.error('Error eliminar venta:', error);

        res.redirect('/ventas');
    }
};

// ─────────────────────────────────────────────────────────────
// REGISTRAR COBRO
// ─────────────────────────────────────────────────────────────

exports.registrarCobro = async (req, res) => {

    const {
        monto,
        metodo,
        referencia
    } = req.body;

    try {

        const venta = await Venta.findById(req.params.id);

        if (!venta) {

            return res.status(404).json({
                error: 'Venta no encontrada.'
            });
        }

        const montoNum = Number(monto);

        const saldoPendiente = Math.max(
            0,
            venta.total - (venta.totalPagado || 0)
        );

        // VALIDACIONES

        if (isNaN(montoNum) || montoNum <= 0) {

            return res.status(400).json({
                error: 'Monto inválido.'
            });
        }

        if (montoNum > saldoPendiente + 0.001) {

            return res.status(400).json({
                error: 'El monto supera el saldo pendiente.'
            });
        }

        if (venta.estadoPago === 'pagado') {

            return res.status(400).json({
                error: 'La venta ya está pagada.'
            });
        }

        // AGREGAR COBRO

        venta.cobros.push({

            monto: montoNum,

            metodo: metodo?.trim() || 'efectivo',

            referencia: referencia?.trim() || '',

            fecha: new Date(),

            cobradoPor: req.session.usuario?.nombre || 'Sistema'
        });

        // ACTUALIZAR TOTAL PAGADO

        venta.totalPagado =
            (venta.totalPagado || 0) + montoNum;

        // ACTUALIZAR ESTADO

        if (venta.totalPagado >= venta.total) {

            venta.estadoPago = 'pagado';

        } else if (venta.totalPagado > 0) {

            venta.estadoPago = 'parcial';
        }

        await venta.save();

        res.json({

            ok: true,

            estadoPago: venta.estadoPago,

            totalPagado: venta.totalPagado,

            saldoPendiente:
                venta.total - venta.totalPagado
        });

    } catch (error) {

        console.error(
            'Error registrarCobro:',
            error
        );

        res.status(500).json({
            error: 'Error interno al registrar el cobro.'
        });
    }
};