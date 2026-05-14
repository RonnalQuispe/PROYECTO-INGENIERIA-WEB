// ============================================================
// src/controllers/clientes.controller.js
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

        // Verificar si ya existe
        const existe = await Cliente.findOne({ nombre: nombre.trim() });
        if (existe) return res.json({ success: true, data: existe, yaExistia: true });

        const cliente = await Cliente.create({ nombre: nombre.trim(), zona, telefono, notas });
        res.status(201).json({ success: true, data: cliente });
    } catch (e) {
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
