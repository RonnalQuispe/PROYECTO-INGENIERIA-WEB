<h1 align="center">🛒 SISTEMA JALEJ</h1>

<p align="center">
  <img src="https://img.shields.io/badge/STATUS-EN%20DESARROLLO-blue?style=for-the-badge" alt="Estado del proyecto">
  <img src="https://img.shields.io/badge/Node.js-v18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB">
  <img src="https://img.shields.io/badge/Express.js-4.x-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/EJS-Template-B4CA65?style=for-the-badge" alt="EJS">
  <img src="https://img.shields.io/badge/Licencia-MIT-yellow?style=for-the-badge" alt="Licencia MIT">
</p>

<p align="center">
  Sistema web de gestión y registro de pedidos/ventas, con autenticación segura de usuarios, construido bajo el patrón de arquitectura <strong>MVC</strong> con operaciones <strong>CRUD</strong> completas.
</p>

---

## 📋 Índice

- [Descripción del Proyecto](#-descripción-del-proyecto)
- [Estado del Proyecto](#-estado-del-proyecto)
- [Funcionalidades](#-funcionalidades)
- [Demostración](#-demostración)
- [Acceso al Proyecto](#-acceso-al-proyecto)
- [Tecnologías Utilizadas](#-tecnologías-utilizadas)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Autor](#-autor)
- [Licencia](#-licencia)

---

## 📌 Descripción del Proyecto

**AdminExpress** es una aplicación web de tipo CRUD desarrollada en **Node.js** bajo la arquitectura **MVC (Modelo - Vista - Controlador)**. Permite a usuarios autenticados registrar, consultar, editar y eliminar pedidos de ventas de un catálogo, con filtros avanzados por zona y cliente, y cálculo automático de totales.

El sistema implementa autenticación segura con sesiones y contraseñas encriptadas, garantizando que ninguna URL protegida sea accesible sin haber iniciado sesión previamente.

---

## 🚧 Estado del Proyecto

<h4 align="center">
🚧 Proyecto en construcción 🚧
</h4>

---

## ✅ Funcionalidades

- `Login seguro`: Autenticación con usuario y contraseña encriptada con `bcrypt`.
- `Sesiones protegidas`: Middleware `isLoggedIn` que bloquea el acceso a rutas sin sesión activa.
- `Logout`: Cierre de sesión que destruye la cookie de sesión.
- `Crear pedido`: Formulario con campos de zona, ubicación, cliente, producto, precio y cantidad.
- `Cálculo automático`: El campo **Total** se calcula en el navegador antes de enviar el formulario.
- `Listar pedidos`: Tabla completa con todos los registros ordenados por fecha.
- `Editar pedido`: Formulario precargado con los datos actuales del registro.
- `Eliminar pedido`: Confirmación antes de borrar el registro de la base de datos.
- `Filtros de consulta`: Búsqueda dinámica por **zona** (Norte, Centro, Sur) y por **cliente**.
- `Gran Total`: Al final de la tabla de resultados se muestra la suma de todos los totales de la consulta actual.
- `Diseño responsivo`: Adaptado a pantallas móviles y de escritorio.

---

## 🎬 Demostración

### Pantalla de Login
> El usuario ingresa con su usuario y contraseña para acceder al sistema protegido.

```
URL: http://localhost:3000/login
```

### Dashboard de inicio
> Panel de acceso rápido a las funcionalidades principales.

```
URL: http://localhost:3000/inicio  ← requiere sesión activa
```

### Listado de ventas con filtros
> Tabla con todos los pedidos, filtros por zona/cliente y gran total al pie.

```
URL: http://localhost:3000/ventas  ← requiere sesión activa
```

### Registro de nuevo pedido
```
URL: http://localhost:3000/ventas/crear  ← requiere sesión activa
```

> ⚠️ Si intentas acceder a cualquier URL protegida sin sesión, serás redirigido automáticamente a `/login`.

---

## 📁 Acceso al Proyecto

### Requisitos previos

Antes de comenzar, asegúrate de tener instalado:

- [Node.js](https://nodejs.org/) v18 o superior
- [MongoDB Compass](https://www.mongodb.com/products/compass) o acceso a **MongoDB Atlas**
- [Git](https://git-scm.com/)

### Clonar el repositorio

```bash
git clone https://github.com/RonnalQuispe/PROYECTO-INGENIERIA-WEB.git
cd INGENIERIAWEB
```

### Instalar dependencias

```bash
npm install
```

### Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto con el siguiente contenido:

```env
MONGODB_URI=mongodb://localhost:27017/ingenieriaweb
SESSION_SECRET=mi_clave_secreta_super_segura
PORT=3000
```

> Si usas **MongoDB Atlas**, reemplaza `MONGODB_URI` con tu cadena de conexión de Atlas.

---

## 🛠️ Abre y ejecuta el proyecto

### 1. Crear el usuario administrador (solo la primera vez)

Inicia el servidor y abre esta URL en tu navegador:

```
http://localhost:3000/setup
```

Esto creará automáticamente el usuario `admin` con contraseña `1234` en la base de datos.

> ⚠️ **Importante:** Elimina o comenta la ruta `/setup` en `src/routes/auth.routes.js` después de usarla.

### 2. Iniciar el servidor

```bash
# Modo desarrollo (con recarga automática)
npm run dev

# Modo producción
npm start
```

### 3. Acceder a la aplicación

```
http://localhost:3000
```

Credenciales por defecto:
| Campo | Valor |
|-------|-------|
| Usuario | `admin` |
| Contraseña | `1234` |

---

## 🗂️ Estructura del Proyecto

```
INGENIERIAWEB/
│
├── public/
│   └── css/
│       ├── styleIndex.css     → Estilos del login
│       └── styleApp.css       → Estilos del sistema protegido
│
├── src/
│   ├── app.js                 → Configuración principal de Express
│   │
│   ├── database/
│   │   └── db.js              → Conexión a MongoDB con Mongoose
│   │
│   ├── models/
│   │   ├── usuario.model.js   → Esquema de usuario + encriptación bcrypt
│   │   └── venta.model.js     → Esquema de pedido/venta
│   │
│   ├── middleware/
│   │   └── auth.middleware.js → Función isLoggedIn (protección de rutas)
│   │
│   ├── controllers/
│   │   ├── auth.controller.js    → Login, logout, creación de usuario
│   │   └── ventas.controller.js  → CRUD + filtros + gran total
│   │
│   ├── routes/
│   │   ├── auth.routes.js        → Rutas de autenticación
│   │   └── ventas.routes.js      → Rutas del CRUD (todas protegidas)
│   │
│   └── views/
│       ├── index.ejs              → Página de login
│       ├── partials/
│       │   └── navbar.ejs         → Barra de navegación reutilizable
│       ├── paginaInicio/
│       │   └── Inicio.ejs         → Dashboard principal
│       └── ventas/
│           ├── lista.ejs          → Listado + filtros + gran total
│           ├── crear.ejs          → Formulario de registro
│           └── editar.ejs         → Formulario de edición
│
├── .env                       → Variables de entorno (NO subir a Git)
├── .gitignore
└── package.json
```

---

## 🔐 Seguridad

| Característica | Implementación |
|---|---|
| Contraseñas | Encriptadas con `bcrypt` (salt rounds: 10) |
| Sesiones | `express-session` + almacenamiento en MongoDB con `connect-mongo` |
| Rutas protegidas | Middleware `isLoggedIn` aplicado a todas las rutas `/ventas` |
| Variables sensibles | Gestionadas con `dotenv` (nunca expuestas en el código) |

---

## 🧰 Tecnologías Utilizadas

| Tecnología | Uso |
|---|---|
| **Node.js** | Entorno de ejecución del servidor |
| **Express.js** | Framework web y manejo de rutas |
| **MongoDB** | Base de datos NoSQL |
| **Mongoose** | ODM para modelar datos con esquemas |
| **EJS** | Motor de plantillas para las vistas HTML |
| **bcrypt** | Encriptación de contraseñas |
| **express-session** | Gestión de sesiones de usuario |
| **connect-mongo** | Almacenamiento de sesiones en MongoDB |
| **dotenv** | Gestión de variables de entorno |
| **nodemon** | Recarga automática en desarrollo |

---

## 👨‍💻 Autor

Desarrollado como proyecto de **Ingeniería Web** — aplicación del patrón MVC con CRUD y sistema de autenticación.

---

## 📄 Licencia

Este proyecto está bajo la licencia **MIT**.

```
MIT License — puedes usar, copiar, modificar y distribuir este software
libremente, siempre que incluyas el aviso de copyright original.
```
