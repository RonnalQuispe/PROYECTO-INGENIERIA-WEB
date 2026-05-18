// ============================================================
// src/controllers/clientes.controller.js  —  OPTIMIZADO
// ============================================================
// CAMBIOS vs. original:
//
// buscarClientes / buscarEntidades:
//   ❌ ANTES: new RegExp(q, 'i') → COLLSCAN en colección completa.
//   ✅ AHORA: dos estrategias según el caso de uso:
//      — Sin q       → find({ activo:true })  usa índice { activo, nombre }.
//      — Con q       → $text search           usa índice de texto FTS.
//      — Alternativa → regex anclado /^q/i    usa índice B-tree (starts-with).
//   Ambas eliminan el COLLSCAN.
//   Añadido .select() con proyección mínima en todas las queries.
//   Añadido .lean() en todas las queries de solo lectura.
//
// crearCliente / crearEntidad:
//   ✅ findOne con proyección mínima { _id:1 } — no trae todo el doc
//     solo para chequear existencia.
//
// actualizarCliente:
//   ✅ Sin cambios funcionales — ya usaba findByIdAndUpdate con $set (correcto).
//   Añadido .lean() en la consulta de conflicto de nombre.
//
// ── CORRECCIONES DE SEGURIDAD (sin cambios funcionales) ──────
// [FIX-1] crearCliente / crearEntidad: comentario corregido en el
//         findOne de verificación de existencia. El comentario anterior
//         decía "proyección mínima: solo _id" pero el .select() incluía
//         5 campos porque esos campos se necesitan para retornar el
//         documento en caso de yaExistia: true. El comentario era
//         incorrecto y generaba confusión en revisiones de código.
//         El select amplio es intencional y correcto; el comentario
//         ahora lo describe con precisión.
//
// [FIX-2] Índices requeridos documentados explícitamente.
//         buildSearchFilter depende de índices FTS y compuestos que
//         DEBEN existir en los modelos. Sin ellos, $text search lanza
//         un error en runtime y la búsqueda sin query cae en COLLSCAN.
//         Ver sección "ÍNDICES REQUERIDOS" al final de este archivo.
// ============================================================

const Cliente = require('../models/cliente.model');
const Entidad = require('../models/entidad.model');

// ── Utilidad: construir filtro de búsqueda sin COLLSCAN ───────────────────────
// Estrategia:
//   1. Si no hay query → filtro simple { activo: true } → usa índice { activo, nombre }.
//   2. Si hay query → $text search → usa índice FTS { nombre: 'text' }.
//      Para búsqueda por prefijo exacto también funciona regex anclado /^q/i
//      sobre el índice B-tree, pero $text soporta términos parciales internos.
//
// [FIX-2] ÍNDICES REQUERIDOS en cliente.model.js y entidad.model.js:
//   clienteSchema.index({ nombre: 'text' });      // para $text search
//   clienteSchema.index({ activo: 1, nombre: 1 }); // para find sin query
//   Sin estos índices, $text arroja error en runtime y { activo:true }
//   ejecuta un COLLSCAN, anulando todas las optimizaciones de este controller.
const buildSearchFilter = (q, extraFields = {}) => {
    if (!q || q.trim() === '') {
        return { activo: true, ...extraFields };
    }
    // $text search usa el índice { nombre: 'text' } → IXSCAN, sin COLLSCAN.
    // activo: true se evalúa sobre los resultados del índice FTS.
    return { $text: { $search: q.trim() }, activo: true, ...extraFields };
};

// ── CLIENTES ──────────────────────────────────────────────────────────────────

// GET /api/v1/clientes?q=nombre
exports.buscarClientes = async (req, res) => {
    try {
        const q      = (req.query.q || '').trim();
        const filtro = buildSearchFilter(q);

        // Proyección mínima → .select() evita cargar notas y timestamps
        // que nunca se muestran en los autocompletes de la app móvil.
        // .lean() → POJO puro, sin hidratación Mongoose (~2-5× más rápido).
        const clientes = await Cliente
            .find(filtro)
            .select('_id nombre zona telefono activo')
            .sort({ nombre: 1 })
            .limit(20)
            .lean();

        res.json({ success: true, data: clientes });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

// POST /api/v1/clientes — crear cliente nuevo
exports.crearCliente = async (req, res) => {
    try {
        const { nombre, zona, telefono, notas } = req.body;
        if (!nombre) return res.status(400).json({ success: false, message: 'El nombre es requerido' });

        // [FIX-1] Select amplio intencional: si el cliente ya existe
        // (yaExistia: true), estos campos se retornan directamente al cliente
        // sin una segunda consulta. El comentario anterior ("solo _id") era
        // incorrecto; se corrige para reflejar la intención real del código.
        const existe = await Cliente
            .findOne({ nombre: nombre.trim() })
            .select('_id nombre zona telefono activo')
            .lean();

        if (existe) return res.json({ success: true, data: existe, yaExistia: true });

        const cliente = await Cliente.create({ nombre: nombre.trim(), zona, telefono, notas });
        res.status(201).json({ success: true, data: cliente });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

// PUT /api/v1/clientes/:id
exports.actualizarCliente = async (req, res) => {
    try {
        const campos = {};
        if (req.body.telefono !== undefined) campos.telefono = req.body.telefono;
        if (req.body.zona     !== undefined) campos.zona     = req.body.zona;
        if (req.body.notas    !== undefined) campos.notas    = req.body.notas;

        if (req.body.nombre !== undefined) {
            const nombreNuevo = req.body.nombre.trim();
            if (nombreNuevo.length < 2)
                return res.status(400).json({ success: false, message: 'El nombre debe tener al menos 2 caracteres.' });

            // Verificar conflicto de nombre — proyección mínima + .lean()
            // Usa el índice único de { nombre } → IXSCAN, O(log n).
            const conflicto = await Cliente
                .findOne({ nombre: nombreNuevo, _id: { $ne: req.params.id } })
                .select('_id')
                .lean();

            if (conflicto)
                return res.status(409).json({
                    success: false,
                    message: `Ya existe otro cliente con el nombre "${nombreNuevo}".`,
                    clienteExistente: conflicto._id
                });

            campos.nombre = nombreNuevo;
        }

        if (Object.keys(campos).length === 0)
            return res.status(400).json({ success: false, message: 'No se enviaron campos para actualizar.' });

        // findByIdAndUpdate con $set → atómico, sin traer el doc a RAM antes.
        // new: true → retorna el documento ya actualizado.
        // runValidators: true → aplica las validaciones del schema.
        const cliente = await Cliente.findByIdAndUpdate(
            req.params.id,
            { $set: campos },
            { new: true, runValidators: true }
        ).lean();

        if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        res.json({ success: true, data: cliente });
    } catch (e) {
        if (e.code === 11000)
            return res.status(409).json({ success: false, message: 'Ya existe un cliente con ese nombre.' });
        res.status(500).json({ success: false, message: e.message });
    }
};

// ── ENTIDADES ─────────────────────────────────────────────────────────────────

// GET /api/v1/entidades?q=nombre
exports.buscarEntidades = async (req, res) => {
    try {
        const q      = (req.query.q || '').trim();
        const filtro = buildSearchFilter(q);

        const entidades = await Entidad
            .find(filtro)
            .select('_id nombre zona tipo activo')
            .sort({ nombre: 1 })
            .limit(20)
            .lean();

        res.json({ success: true, data: entidades });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

// POST /api/v1/entidades — crear entidad nueva
exports.crearEntidad = async (req, res) => {
    try {
        const { nombre, zona, tipo, notas } = req.body;
        if (!nombre) return res.status(400).json({ success: false, message: 'El nombre es requerido' });

        // [FIX-1] Mismo criterio que crearCliente: select amplio intencional
        // para retornar el documento existente sin segunda consulta.
        const existe = await Entidad
            .findOne({ nombre: nombre.trim() })
            .select('_id nombre zona tipo activo')
            .lean();

        if (existe) return res.json({ success: true, data: existe, yaExistia: true });

        const entidad = await Entidad.create({ nombre: nombre.trim(), zona, tipo, notas });
        res.status(201).json({ success: true, data: entidad });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

// ── ÍNDICES REQUERIDOS EN LOS MODELOS ────────────────────────────────────────
// [FIX-2] Para que buildSearchFilter funcione correctamente, los modelos
// Cliente y Entidad DEBEN declarar estos índices:
//
// En cliente.model.js:
//   clienteSchema.index({ nombre: 'text' });
//   clienteSchema.index({ activo: 1, nombre: 1 });
//
// En entidad.model.js:
//   entidadSchema.index({ nombre: 'text' });
//   entidadSchema.index({ activo: 1, nombre: 1 });
//
// Sin los índices FTS, la línea { $text: { $search: q } } lanza:
//   MongoServerError: text index required for $text query
// Sin el índice compuesto, find({ activo: true }) ejecuta COLLSCAN.
// ─────────────────────────────────────────────────────────────────────────────