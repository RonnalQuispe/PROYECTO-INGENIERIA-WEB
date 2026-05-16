// ============================================================
// src/controllers/clientes.controller.js
// FIX: actualizarCliente ahora acepta el campo `nombre`
// ============================================================
const Cliente = require('../models/cliente.model');
const Entidad = require('../models/entidad.model');

// ── CLIENTES ─────────────────────────────────────────────────────────────────

// GET /api/v1/clientes?q=nombre
exports.buscarClientes = async (req, res) => {
    try {
        const q      = req.query.q || '';
        const filtro = q ? { nombre: new RegExp(q, 'i'), activo: true } : { activo: true };
        const clientes = await Cliente.find(filtro).sort({ nombre: 1 }).limit(20);
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

        const existe = await Cliente.findOne({ nombre: nombre.trim() });
        if (existe) return res.json({ success: true, data: existe, yaExistia: true });

        const cliente = await Cliente.create({ nombre: nombre.trim(), zona, telefono, notas });
        res.status(201).json({ success: true, data: cliente });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

// PUT /api/v1/clientes/:id
// FIX: ahora acepta `nombre` además de telefono, zona y notas.
// Si se cambia el nombre, verifica que no exista otro cliente con ese nombre
// para evitar duplicados por el índice unique del modelo.
exports.actualizarCliente = async (req, res) => {
    try {
        const campos = {};
        if (req.body.telefono !== undefined) campos.telefono = req.body.telefono;
        if (req.body.zona     !== undefined) campos.zona     = req.body.zona;
        if (req.body.notas    !== undefined) campos.notas    = req.body.notas;

        // ── FIX: aceptar cambio de nombre ────────────────────────────────────
        if (req.body.nombre !== undefined) {
            const nombreNuevo = req.body.nombre.trim();
            if (nombreNuevo.length < 2)
                return res.status(400).json({ success: false, message: 'El nombre debe tener al menos 2 caracteres.' });

            // Verificar que no exista otro cliente distinto con el mismo nombre
            const conflicto = await Cliente.findOne({
                nombre: nombreNuevo,
                _id:    { $ne: req.params.id }   // excluir el propio cliente
            });
            if (conflicto)
                return res.status(409).json({
                    success: false,
                    message: `Ya existe otro cliente con el nombre "${nombreNuevo}".`,
                    clienteExistente: conflicto._id
                });

            campos.nombre = nombreNuevo;
        }
        // ─────────────────────────────────────────────────────────────────────

        if (Object.keys(campos).length === 0)
            return res.status(400).json({ success: false, message: 'No se enviaron campos para actualizar.' });

        const cliente = await Cliente.findByIdAndUpdate(
            req.params.id,
            { $set: campos },
            { new: true, runValidators: true }
        );
        if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        res.json({ success: true, data: cliente });
    } catch (e) {
        // Error de índice único de MongoDB (nombre duplicado a nivel BD)
        if (e.code === 11000)
            return res.status(409).json({ success: false, message: 'Ya existe un cliente con ese nombre.' });
        res.status(500).json({ success: false, message: e.message });
    }
};

// ── ENTIDADES ─────────────────────────────────────────────────────────────────

// GET /api/v1/entidades?q=nombre
exports.buscarEntidades = async (req, res) => {
    try {
        const q      = req.query.q || '';
        const filtro = q ? { nombre: new RegExp(q, 'i'), activo: true } : { activo: true };
        const entidades = await Entidad.find(filtro).sort({ nombre: 1 }).limit(20);
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

        const existe = await Entidad.findOne({ nombre: nombre.trim() });
        if (existe) return res.json({ success: true, data: existe, yaExistia: true });

        const entidad = await Entidad.create({ nombre: nombre.trim(), zona, tipo, notas });
        res.status(201).json({ success: true, data: entidad });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};