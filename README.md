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
