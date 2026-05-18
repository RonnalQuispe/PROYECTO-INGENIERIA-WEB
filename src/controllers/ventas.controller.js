// ============================================================
// src/controllers/ventas.controller.js  —  OPTIMIZADO
// ============================================================
// CAMBIOS vs. original:
//
// listarAPI():
//   ❌ ANTES: filtro.cliente = new RegExp(...)  →  COLLSCAN.
//   ✅ AHORA: filtra por clienteRef (ObjectId) si viene clienteId  →  IXSCAN.
//   ✅ Añadida proyección estricta: no carga historialEdiciones[] ni cobros[].
//
// registrarCobro() y registrarCobroAPI():
//   ❌ ANTES: findById → mutación en memoria → venta.save()  →  2 round-trips
//     + hidratación completa del documento (incluye todos los arrays pesados).
//   ✅ AHORA: findById con .select() mínimo para validar + updateOne atómico
//     con $push + $set  →  1.5 round-trips, sin hidratar el documento completo.
//
// actualizarEntregaItemAPI():
//   ❌ ANTES: findById → item.entregado = x → venta.save()  →  trae TODO a RAM
//     para cambiar un solo booleano de un subdocumento.
//   ✅ AHORA: updateOne con operador posicional $ + pipeline de aggregation
//     para recalcular estadoEntrega de forma atómica  →  sin traer nada a RAM.
//
// Resto de métodos: sin cambios funcionales, solo añadido .lean() y .select()
// en las queries de solo lectura que aún no los tenían.
//
// ── CORRECCIONES DE SEGURIDAD (sin cambios funcionales) ──────
// [FIX-1] actualizarEntregaItemAPI: validación de ObjectId antes de
//         construir los objetos ObjectId para la query. Antes: si id o
//         itemId no eran ObjectIds válidos, mongoose.Types.ObjectId()
//         lanzaba una excepción no controlada que escapaba al catch
//         genérico y exponía un stack trace en la respuesta.
//         Ahora: validación explícita con mongoose.Types.ObjectId.isValid()
//         antes de la query → respuesta 400 limpia sin stack trace.
//
// [FIX-2] guardarAPI: el header x-device-id se sanitiza antes de
//         persistir en la base de datos. Antes: se guardaba directamente
//         desde req.headers sin ningún filtrado → un atacante podía
//         inyectar strings arbitrariamente largos o con caracteres
//         especiales en el campo creadoPorDispositivo.
//         Ahora: truncado a 64 caracteres y saneado con trim().
//
// [FIX-3] listarAPI: el parámetro limite ya tenía cap de 100, pero no
//         validaba que el valor sea un número positivo. Si limite llegaba
//         como "abc", Math.min(NaN, 100) = NaN → skip y limit(NaN)
//         podían causar comportamiento inesperado en Mongoose.
//         Ahora: fallback explícito a 20 si el valor parseado no es un
//         número positivo.
// ============================================================

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

    // findById usa el índice _id automático → O(log n).
    // .select() mínimo: solo los campos que construyen la venta.
    // .lean() → POJO en lugar de documento Mongoose, sin hidratación.
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
// WEB — sin cambios funcionales, solo .lean() añadido donde faltaba
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
    const { zona, entidad, piso, cliente, producto, precioUnitario, cantidad } = req.body;
    const errores = validarVenta({ zona, cliente, producto, precioUnitario, cantidad });

    if (errores.length > 0)
        return res.render('ventas/crear', { usuario: req.session.usuario, error: errores.join(' ') });

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
        res.status(500).render('ventas/crear', { usuario: req.session.usuario, error: 'Error interno al guardar la venta.' });
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
        // ✅ Una sola operación: findByIdAndDelete (sin findById previo)
        const eliminada = await Venta.findByIdAndDelete(req.params.id);
        if (!eliminada) return res.redirect('/ventas');
        res.redirect('/ventas');
    } catch (error) {
        console.error('Error eliminar venta:', error);
        res.redirect('/ventas');
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// registrarCobro — WEB  (también usado por registrarCobroAPI)
// ✅ OPTIMIZADO: findById con .select() mínimo + updateOne atómico con $push/$set
// ─────────────────────────────────────────────────────────────────────────────
exports.registrarCobro = async (req, res) => {
    const { monto, metodo, referencia } = req.body;
    const { id } = req.params;

    try {
        // ✅ Solo traemos los 3 campos que necesitamos para validar.
        // El documento de venta puede tener arrays pesados (historial, items, cobros)
        // que NO necesitamos para registrar un cobro.
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

        // Calcular nuevo estado en JS (lógica simple, no amerita round-trip extra)
        const nuevoTotalPagado = Math.min(venta.total, (venta.totalPagado || 0) + montoNum);
        const nuevoEstadoPago  =
            nuevoTotalPagado >= venta.total ? 'pagado'  :
            nuevoTotalPagado  > 0           ? 'parcial' : 'pendiente';

        // ✅ Una sola operación atómica: $push añade el cobro al array,
        // $set actualiza totalPagado y estadoPago — todo en un solo write.
        // Sin .save(), sin pre('save') hook, sin hidratar el documento.
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

// GET /api/v1/ventas
// ✅ OPTIMIZADO: filtra por clienteRef (ObjectId, indexado) en lugar de
// cliente (String, sin índice útil). Proyección estricta: no carga arrays pesados.
//
// [FIX-3] limite: validación de que sea un número positivo antes del cap.
//   Antes: Math.min(Number("abc"), 100) = Math.min(NaN, 100) = NaN
//          → skip(NaN) y limit(NaN) en Mongoose → comportamiento indefinido.
//   Ahora: fallback explícito a 20 si el valor no es un número positivo.
exports.listarAPI = async (req, res) => {
    const { zona, clienteId, estadoPago, pagina = 1, limite = 20 } = req.query;

    // [FIX-3] Validar que limite sea un número positivo antes de aplicar cap
    const limiteParseado = parseInt(limite, 10);
    const limiteNum      = (isNaN(limiteParseado) || limiteParseado < 1)
        ? 20
        : Math.min(limiteParseado, 100); // cap de seguridad

    const paginaNum = Math.max(1, parseInt(pagina, 10) || 1);
    const skip      = (paginaNum - 1) * limiteNum;

    try {
        const filtro = {};
        if (zona       && zona       !== '') filtro.zona       = zona;
        if (estadoPago && estadoPago !== '') filtro.estadoPago = estadoPago;

        // ✅ clienteRef (ObjectId indexado) en lugar de cliente (String sin índice)
        // Usa el índice { clienteRef, estadoPago } o { clienteRef, fecha }
        // según los campos del filtro → IXSCAN garantizado.
        if (clienteId && mongoose.Types.ObjectId.isValid(clienteId))
            filtro.clienteRef = new mongoose.Types.ObjectId(clienteId);

        // ✅ Proyección estricta: excluye historialEdiciones[] y cobros[] que
        // pueden ser muy pesados y no se necesitan en la lista.
        const proyeccion = {
            zona: 1, cliente: 1, clienteRef: 1,
            producto: 1, total: 1, totalPagado: 1,
            estadoPago: 1, estadoEntrega: 1,
            tipoTransaccion: 1, fecha: 1,
            'ubicacion.entidad': 1,
            'items.nombre': 1, 'items.cantidad': 1, 'items.entregado': 1
        };

        // ✅ Promise.all → las dos queries corren EN PARALELO en MongoDB
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
                paginaActual: paginaNum,
                totalPaginas: Math.ceil(total / limiteNum),
                total
            }
        });
    } catch (error) {
        console.error('Error listarAPI:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/v1/ventas
//
// [FIX-2] x-device-id sanitizado antes de persistir.
//   Antes: req.headers['x-device-id'] se guardaba directamente sin filtrado.
//   Ahora: truncado a 64 caracteres y sanitizado con trim().
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

    // [FIX-2] Sanitizar x-device-id: truncar a 64 chars y limpiar espacios
    const deviceId = typeof req.headers['x-device-id'] === 'string'
        ? req.headers['x-device-id'].trim().slice(0, 64)
        : null;

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
                ubicacion:      { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
                clienteRef:     cliente._id,
                cliente:        cliente.nombre,
                producto:       primerItem.nombre,
                precioUnitario: primerItem.precio,
                cantidad:       primerItem.cantidad,
                total:          totalGeneral,
                items:          itemsNorm,
                tipoTransaccion:      tipoTransaccion || 'venta',
                estadoEntrega:        estadoEntrega   || 'Inmediata',
                estadoPago:           'pendiente',
                totalPagado:          0,
                cobros:               [],
                clientTempId:         clientTempId || null,
                creadoPorDispositivo: deviceId  // [FIX-2] valor sanitizado
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
            ubicacion:      { entidad: entidad?.trim() || '', piso: piso?.trim() || '' },
            clienteRef:     cliente._id,
            cliente:        cliente.nombre,
            producto:       producto.trim(),
            precioUnitario: precio,
            cantidad:       cantidadNum,
            total:          precio * cantidadNum,
            tipoTransaccion:      tipoTransaccion || 'venta',
            estadoEntrega:        estadoEntrega   || 'Inmediata',
            estadoPago:           'pendiente',
            totalPagado:          0,
            cobros:               [],
            clientTempId:         clientTempId || null,
            creadoPorDispositivo: deviceId  // [FIX-2] valor sanitizado
        });

        return res.status(201).json({ success: true, data: nueva });

    } catch (error) {
        console.error('Error guardarAPI:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /api/v1/ventas/:id
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

        // ✅ updateOne → no devuelve el documento (más eficiente que findByIdAndUpdate
        // cuando solo necesitamos saber si la operación tuvo efecto).
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

// DELETE /api/v1/ventas/:id
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

// POST /api/v1/ventas/:id/cobros
// ✅ Reutiliza registrarCobro (ya optimizado con $push/$set atómico)
exports.registrarCobroAPI = (req, res) => {
    return exports.registrarCobro(req, res);
};

// PATCH /api/v1/ventas/:id/items/:itemId/entrega
// ✅ OPTIMIZADO: updateOne atómico con operador posicional $ +
//    pipeline de aggregation para recalcular estadoEntrega.
//    Antes: findById → mutación JS → save() (2 round-trips + hidratación completa).
//    Ahora: 2 updateOne atómicos, sin traer NADA a la RAM del servidor.
//
// [FIX-1] Validación de ObjectId antes de construir los objetos.
//   Antes: new mongoose.Types.ObjectId(id) sin validar → lanzaba excepción
//   si id o itemId no eran ObjectIds válidos, escapando al catch genérico
//   y potencialmente exponiendo un stack trace en la respuesta.
//   Ahora: mongoose.Types.ObjectId.isValid() previo → 400 limpio.
exports.actualizarEntregaItemAPI = async (req, res) => {
    const { id, itemId } = req.params;
    const { entregado }  = req.body;

    if (typeof entregado !== 'boolean')
        return res.status(400).json({ success: false, message: 'El campo entregado debe ser boolean.' });

    // [FIX-1] Validar ambos IDs antes de construir ObjectId
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(itemId))
        return res.status(400).json({ success: false, message: 'ID de venta o ítem inválido.' });

    try {
        // ── Paso 1: Actualizar solo el booleano del ítem específico ──────────
        // El operador posicional $ localiza el subdocumento por su _id
        // y actualiza SOLO ese campo. MongoDB no mueve el documento completo.
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

        // ── Paso 2: Recalcular estadoEntrega atómicamente ────────────────────
        // Aggregation pipeline en updateOne (requiere MongoDB 4.2+).
        // Lee y escribe en la misma operación sin traer el documento a RAM.
        // $allElementsTrue evalúa si todos los items tienen entregado: true.
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

// PUT /api/v1/cartera/:ventaId/editar
// Edita ítems/totales y guarda historial de cambios.
// Mantiene .save() porque el hook pre('save') recalcula estadoPago
// y el historialEdiciones requiere leer el estado anterior completo.
// Si el historial crece mucho, considera migrar a $push atómico también.
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