# ⚔ Dados de El Anillo Único

Lanzador de dados **online y en 3D** para el juego de rol *El Anillo Único / The One Ring*, construido con **Three.js**, **JavaScript** y **CSS**, con sesiones compartidas en tiempo real mediante **WebSockets**.

![dados](https://img.shields.io/badge/dados-d6%20%2B%20d12-7cc23a)

## ✨ Características

- 🎲 **Dados 3D reales** generados con Three.js:
  - **d6** (dado de éxito): caras 1–6, con la **runa Tengwar** marcando el 6.
  - **d12** (dado de hazaña): números 1–10, la **Runa de Gandalf** (mejor resultado) y el **Ojo de Sauron** (peor resultado).
- 🌐 **Sesiones en tiempo real**: crea o entra a una sala con un código; todos los participantes ven las mismas tiradas animarse al instante y quién las tiró.
- 🎨 **Color configurable** de los dados (se actualiza en vivo).
- ➕➖ **Añadir o quitar dados** antes de cada tirada.
- 📜 **Registro de tiradas** y panel de la **compañía** (jugadores conectados).
- 🔗 **Compartir enlace** de sesión con un clic.
- 🧝 **Hojas de personaje colaborativas** (solo El Anillo Único): cada jugador elige su
  **cultura heroica** (Hobbit/Elfo/Enano/Hombres) al entrar y obtiene una **hoja editable**
  fiel al PDF oficial. Todos en la sesión ven las hojas del resto y **quién está editando
  cada campo en vivo**, con el **mapa de La Comarca** de fondo. Las hojas se persisten en un
  **Strapi** independiente (ver abajo); sin él, funcionan en modo solo memoria.

El **resultado lo decide el servidor** (fuente única de verdad) y se transmite con una semilla, de modo que la animación se reproduce idéntica en todos los clientes de la sesión.

## 🚀 Puesta en marcha

Requisitos: **Node.js 18+**.

```bash
npm install
npm start
```

Luego abre en el navegador:

```
http://localhost:3000
```

Para jugar con más gente en tu misma red local, comparte tu IP (`http://TU_IP:3000`) o despliega el proyecto en cualquier hosting Node (Render, Railway, Fly.io, etc.).

### ☁️ Desplegar en Render (gratis)

Esta app es un **servidor Node con WebSockets** (no estático), así que necesita un
hosting que ejecute un proceso persistente. **Render** sirve el front y el WebSocket en
el mismo host/puerto, y el cliente se conecta solo (usa `wss` en `https`). El repo incluye
un Blueprint [`render.yaml`](render.yaml).

1. Sube este repo a GitHub.
2. En **Render → New + → Blueprint**, conecta el repo. Render lee `render.yaml` y crea el
   servicio web (plan **free**).
3. En **Settings → Environment** del servicio, añade (si quieres persistir hojas):
   - `STRAPI_URL` = la URL de tu Strapi (p. ej. `https://tu-proyecto.strapiapp.com`)
   - `STRAPI_TOKEN` = un **API Token nuevo creado en ese Strapi** (el token local no sirve
     en la nube).
   Sin estas variables, la app corre igual en **modo solo memoria** (sin guardar hojas).
4. Render te da una URL `https://...onrender.com`. Compártela con tu grupo.

> **Nota del plan free:** si nadie entra ~15 min, el servicio se **duerme** y el siguiente
> visitante espera ~30-60 s a que despierte. Durante una partida activa se mantiene
> encendido. Lo guardado en Strapi no se pierde aunque se duerma.

> **Vercel no sirve para esta app**: es serverless y no ejecuta un servidor WebSocket
> persistente. Usa Render (o Railway/Fly.io/Oracle Cloud).

### 📜 Persistencia de hojas (opcional, con Strapi)

Las hojas de personaje se guardan en un **Strapi independiente** ubicado en
`C:\Proyectos-propios\tor-strapi` (ver su `README-HOJAS.md`). Para activarlo:

1. Arranca Strapi: `cd C:\Proyectos-propios\tor-strapi && npm run develop`, crea el admin
   en `http://localhost:1337/admin` y genera un **API Token** (Full access).
2. En este proyecto crea un `.env` (copia de `.env.example`) con `STRAPI_URL` y
   `STRAPI_TOKEN`.
3. Arranca la mesa con `npm start`; el log dirá *"Hojas: persistidas en Strapi"*.

Sin `.env`, todo funciona igual pero **sin guardar** las hojas (modo solo memoria).

El **fondo** de la mesa usa `public/assets/map-comarca.jpg` (coloca ahí tu mapa de La
Comarca; si falta, se muestra un degradado de respaldo).

## 🕹 Cómo se usa

1. Escribe tu **nombre**, un **código de sesión** (o pulsa 🎲 para generarlo) y elige un **color**.
2. Pulsa **Entrar a la mesa**.
3. Comparte el código (o el botón 🔗) con tu grupo para que entren a la misma sesión.
4. Ajusta cuántos **d6** y **d12** quieres y pulsa **¡Tirar!**.
5. Todos en la sesión ven la tirada animarse y el resultado en el banner y el registro.

## 🗂 Estructura

```
.
├── server.js              # Servidor Express + WebSocket (sesiones y tiradas)
├── package.json
└── public/
    ├── index.html         # UI + import map de Three.js
    ├── css/style.css
    └── js/
        ├── main.js        # Orquestación: red + UI + escena
        ├── network.js     # Cliente WebSocket (reconexión automática)
        ├── scene.js       # Escena Three.js + animación de tirada
        ├── dice.js        # Geometría d6 (cubo) y d12 (dodecaedro mapeado)
        └── textures.js    # Texturas de caras (números, runa, ojo) por canvas
```

## ⚙ Detalles técnicos

- **Three.js** se carga vía CDN con un *import map* (sin paso de build).
- Las **caras de los dados** se dibujan proceduralmente con `<canvas>`, así el color del “plástico” se regenera al vuelo sin assets externos.
- El **d12** se construye reproyectando las UVs del `DodecahedronGeometry` para encajar una textura por cada cara pentagonal.
- La **animación** no usa física: cada dado rueda y luego hace *slerp* hasta dejar arriba la cara ganadora, garantizando que todos vean el mismo resultado.

## 🛠 Próximas ideas

- Física real con `cannon-es` para rebotes auténticos.
- Cálculo automático de éxitos/grados según las reglas de TOR (modo Esperanza/Sombra).
- Sonido de dados y temas visuales (Sombra, Rivendel...).
- Salas privadas con contraseña y roles (Guardián / jugadores).

---

Hecho para echar unas tiradas en la Tierra Media. 🧙
