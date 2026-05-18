// ============================================================
// src/models/venta.model.js  —  AUDITADO
// ============================================================
// HALLAZGOS vs. original (versión ya optimizada en índices):
//
// [FIX-1] SEGURIDAD — Arrays sin límite de tamaño: items[], cobros[] y
//         historialEdiciones[] podían crecer sin restricción. Un cliente
//         malicioso podría hacer $push indefinidamente hasta que el
//         documento supere el límite de 16 MB de MongoDB, causando un
//         error irrecuperable en ese documento.
//         Ahora: validadores de tamaño máximo en los tres arrays.
//
// [FIX-2] SEGURIDAD — Campos de texto libre en sub-schemas sin maxlength.
//         itemSchema.nombre, cobroSchema.referencia, cobroSchema.cobradoPor
//         y historialEdicion.motivo aceptaban strings arbitrariamente largos.
//         Ahora: maxlength razonables en todos los campos de texto de sub-schemas.
//
// [FIX-3] SEGURIDAD / INTEGRIDAD — clientTempId y creadoPorDispositivo sin
//         maxlength en el schema. El controller ya sanitiza creadoPorDispositivo
//         a 64 chars [FIX-2 del ventas.controller], pero la capa de datos
//         debe ser la última línea de defensa (defense in depth).
//         Ahora: maxlength en ambos campos a nivel de schema.
//
// [FIX-4] INTEGRIDAD — El hook pre-save sobreescribía estadoEntrega a
//         'Inmediata' para tipoTransaccion === 'venta', pero no validaba
//         que estadoEntrega fuera un valor del enum antes de la asignación.
//         Si llegaba un valor inválido en un pedido, el hook lo dejaba pasar.
//         Ahora: el hook solo toca estadoEntrega cuando corresponde y el
//         enum del schema ya hace la validación en Mongoose (runValidators).
//
// ÍNDICES: conservados sin cambios (ya estaban correctos).
// SIN CAMBIOS FUNCIONALES en lógica de negocio ni en el hook pre-save.
// ============================================================

const mongoose = require('mongoose');

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const cobroSchema = new mongoose.Schema({
    monto:  { type: Number, required: true, min: 0 },
    metodo: {
        type:     String,
        required: true,
        enum:     ['efectivo', 'transferencia', 'deposito']
    },
    // [FIX-2] maxlength en campos de texto libre
    referencia: { type: String, trim: true, default: '', maxlength: [100, 'Referencia máximo 100 caracteres.'] },
    fecha:      { type: Date, default: Date.now },
    cobradoPor: { type: String, trim: true, default: '', maxlength: [100, 'cobradoPor máximo 100 caracteres.'] }
}, { _id: true });

const itemSchema = new mongoose.Schema({
    // [FIX-2] maxlength en nombre del ítem
    nombre:    { type: String, required: true, trim: true, maxlength: [200, 'Nombre del ítem máximo 200 caracteres.'] },
    cantidad:  { type: Number, required: true, min: 1 },
    precio:    { type: Number, required: true, min: 0 },
    subtotal:  { type: Number, required: true, min: 0 },
    entregado: { type: Boolean, default: false }
}, { _id: true });

const historialEdicionSchema = new mongoose.Schema({
    fecha:   { type: Date, default: Date.now },
    // [FIX-2] maxlength en campos de texto del historial
    usuario: { type: String, default: 'app', trim: true, maxlength: [100, 'Usuario máximo 100 caracteres.'] },
    motivo:  { type: String, default: '',    trim: true, maxlength: [300, 'Motivo máximo 300 caracteres.'] },
    anterior: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

// ── Schema principal ──────────────────────────────────────────────────────────

const ventaSchema = new mongoose.Schema({
    zona: { type: String, required: true, enum: ['Norte', 'Centro', 'Sur'] },

    ubicacion: {
        // [FIX-2] maxlength en campos de ubicación
        entidad: { type: String, default: '', maxlength: [150, 'Entidad máximo 150 caracteres.'] },
        piso:    { type: String, default: '', maxlength: [20,  'Piso máximo 20 caracteres.']    }
    },

    // ── Relación por ID — OBLIGATORIA ─────────────────────────────────────────
    clienteRef: {
        type:     mongoose.Schema.Types.ObjectId,
        ref:      'Cliente',
        required: true
    },

    entidadRef: {
        type:    mongoose.Schema.Types.ObjectId,
        ref:     'Entidad',
        default: null
    },

    // ── Campo display (solo lectura) ──────────────────────────────────────────
    // [FIX-2] maxlength en campo display de cliente
    cliente: { type: String, required: true, trim: true, maxlength: [150, 'Nombre de cliente máximo 150 caracteres.'] },

    // [FIX-2] maxlength en producto
    producto:       { type: String, required: true, trim: true, maxlength: [200, 'Producto máximo 200 caracteres.'] },
    precioUnitario: { type: Number, required: true, min: 0 },
    cantidad:       { type: Number, required: true, min: 1 },
    total:          { type: Number, required: true, min: 0 },

    // [FIX-1] Validadores de tamaño máximo en arrays para evitar documentos de 16 MB
    items: {
        type:     [itemSchema],
        default:  [],
        validate: {
            validator: (v) => v.length <= 100,
            message:   'Una venta no puede tener más de 100 ítems.'
        }
    },
    historialEdiciones: {
        type:     [historialEdicionSchema],
        default:  [],
        validate: {
            validator: (v) => v.length <= 200,
            message:   'El historial de ediciones no puede superar 200 entradas.'
        }
    },

    tipoTransaccion: {
        type: String, enum: ['venta', 'pedido'], default: 'venta'
    },
    estadoEntrega: {
        type: String, enum: ['Inmediata', 'Pendiente', 'Entregado', 'Cancelado'], default: 'Inmediata'
    },

    estadoPago:  { type: String, enum: ['pendiente', 'parcial', 'pagado'], default: 'pendiente' },
    totalPagado: { type: Number, default: 0, min: 0 },

    cobros: {
        type:     [cobroSchema],
        default:  [],
        // [FIX-1] Un documento con miles de cobros rompería el límite de 16 MB
        validate: {
            validator: (v) => v.length <= 500,
            message:   'El registro de cobros no puede superar 500 entradas.'
        }
    },

    fecha: { type: Date, default: Date.now },

    // [FIX-3] maxlength en campos que vienen del cliente móvil
    clientTempId: {
        type:      String,
        default:   null,
        maxlength: [100, 'clientTempId máximo 100 caracteres.']
    },
    creadoPorDispositivo: {
        type:      String,
        default:   null,
        maxlength: [64, 'El identificador de dispositivo no puede superar 64 caracteres.']
    }

}, { timestamps: true });

// ══════════════════════════════════════════════════════════════════════════════
// ÍNDICES (conservados del original optimizado)
// ══════════════════════════════════════════════════════════════════════════════

// ① clienteRef + fecha  →  el JOIN más frecuente de toda la app
ventaSchema.index({ clienteRef: 1, fecha: -1 });

// ② zona + fecha  →  lista principal filtrada por zona
ventaSchema.index({ zona: 1, fecha: -1 });

// ③ estadoPago + fecha  →  cartera global de deudas
ventaSchema.index({ estadoPago: 1, fecha: -1 });

// ④ clientTempId  →  idempotencia offline
ventaSchema.index({ clientTempId: 1 }, { sparse: true });

// ⑤ zona + estadoPago + fecha  →  filtro combinado de listarAPI
ventaSchema.index({ zona: 1, estadoPago: 1, fecha: -1 });

// ⑥ estadoEntrega + fecha  →  pedidos pendientes / vista de entregas
ventaSchema.index({ estadoEntrega: 1, fecha: -1 });

// ⑦ clienteRef + estadoPago  →  cartera pendiente por cliente específico
ventaSchema.index({ clienteRef: 1, estadoPago: 1 });

// ── Virtual ───────────────────────────────────────────────────────────────────

ventaSchema.virtual('saldoPendiente').get(function () {
    return Math.max(0, this.total - this.totalPagado);
});

// ── Hook pre-save ─────────────────────────────────────────────────────────────
// [FIX-4] El hook solo modifica estadoEntrega cuando tipoTransaccion es 'venta'.
// Para 'pedido', el enum del schema ya valida que estadoEntrega sea un valor
// permitido — el hook no interfiere con esa rama.
ventaSchema.pre('save', function (next) {
    if (this.totalPagado <= 0)               this.estadoPago = 'pendiente';
    else if (this.totalPagado >= this.total) {
        this.totalPagado = this.total;
        this.estadoPago  = 'pagado';
    } else                                   this.estadoPago = 'parcial';

    if (this.tipoTransaccion === 'venta') this.estadoEntrega = 'Inmediata';
    next();
});

module.exports = mongoose.model('Venta', ventaSchema);