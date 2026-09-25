<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&height=220&color=gradient&customColorList=12,23,25,30&text=🧪%20SHIN-LAB%20⚡&fontSize=46&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=El%20laboratorio%20de%20Shin-MD%3A%20brain%2C%20memoria%20RAG%20y%20sub-bots&descSize=16&descAlignY=60" width="100%"/>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=26&duration=2800&pause=600&color=4ADE80&center=true&vCenter=true&width=640&lines=🧪+Zona+de+experimentos+🧪;🚧+NO+usar+en+producción;🌿+Todo+se+prueba+antes+aquí;✅+Solo+lo+probado+migra+a+Shin-MD" alt="Typing SVG"/>

<br/>

<img src="https://img.shields.io/badge/Status-Laboratorio-FBBF24?style=for-the-badge"/>
<img src="https://img.shields.io/badge/Node.js-22.5%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white"/>
<img src="https://img.shields.io/badge/Experimentos-por%20bloques-60A5FA?style=for-the-badge"/>
<img src="https://img.shields.io/badge/Inestable-Pruebas-F87171?style=for-the-badge"/>
<img src="https://img.shields.io/badge/License-AGPLv3-red?style=for-the-badge"/>

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

</div>

## 🧭 Estado del repositorio y reglas de trabajo

**Rol:** `LABORATORIO ACTIVO / EXPERIMENTAL` de [Shin-MD](https://github.com/riokuroxi-svg/Shin-MD) — zona para experimentar fuerte, medir y descartar.

**Reglas:**

- Aquí nacen las ideas nuevas de Shin-MD (Bloque 6 del plan).
- Todo se hace por experimentos pequeños, cada uno con sus tests.
- Se permite experimentar, pero no dejar basura si falla.
- **Nada migra a Shin-MD sin estar probado** (tests + arranque real).
- Un commit descriptivo por experimento; CI corre los tests en cada push.

> Regla central: laboratorio primero, estable después. Nada de arrastrar experimentos completos.

## 🧪 ¿Qué es Shin-Lab?

> ⚗️ **Shin-Lab** es el laboratorio de Shin-MD. Aquí se construyen el
> **brain local** (decisiones sin API), la **memoria RAG** sobre SQLite y
> los **sub-bots aislados por proceso**, entre otros experimentos. Lo que
> sobrevive a las pruebas migra al bot estable.
>
> Si buscas el bot listo para usar, ve al repo estable 👇

<p align="center">
  <a href="https://github.com/riokuroxi-svg/Shin-MD">
    <img src="https://img.shields.io/badge/🌿%20Ir%20al%20repo%20ESTABLE%20(Shin--MD)-25D366?style=for-the-badge&logo=whatsapp&logoColor=white"/>
  </a>
</p>

### 📌 ¿Para quién es este repo?

| ✅ Sí usa Shin-Lab | ❌ No usa Shin-Lab |
|:---|:---|
| Quieres probar lo más nuevo de Shin | Quieres algo que no se rompa |
| Te gusta reportar bugs y medir | No quieres lidiar con errores |
| Quieres aportar ideas al roadmap | Es tu primera vez con el bot |

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

## ⚗️ Experimentos

| # | Experimento | Qué es | Estado |
|:---|:---|:---|:---|
| 01 | 🧠 **Shin Brain** (`experiments/brain/`) | Clasificador heurístico anti-spam sin dependencias: decide ALLOW / SLOW / BLOCK con score 0-100 (ráfagas, texto repetido, flood de comandos). Futuro reemplazo del antispam simple. | ✅ Prototipo con 7 tests |
| 02 | 🗃️ **Memoria RAG** (`experiments/memory/`) | SQLite + FTS5: recuerda nombre, gustos, edad y lugar de cada usuario con heurísticas (sin LLM), refuerza hechos repetidos, búsqueda por texto y `forget()` (derecho al olvido). Benchmark: 10k memorias, recall en **0.4ms** (criterio: <10ms). | ✅ Prototipo con 9 tests |
| 03 | 🤖 **Sub-bots aislados** (`experiments/subbots/`) | Cada sub-bot en su propio proceso (`fork` + IPC JSON). Respawn automático con límite, `killAll` limpia sin zombies, y matar un sub-bot no afecta al resto ni al main. | ✅ Prototipo con 7 tests |
| 04 | 🔄 **Migrador de DB** | `global.db` JSON (Gata/Ginko) → SQLite WAL de Shin-MD, en un solo paso. | 🚧 Planeado |
| 05 | 📘 **Evaluación TypeScript** (`experiments/typescript/`) | ¿Vale la pena TS en Shin-MD? Port tipado de la cola, corrido NATIVO en Node 22.18+ sin dependencias. Veredicto: sí, migración gradual ([TS-VERDICT](docs/TS-VERDICT.md)). | ✅ Evaluado |
| 06 | 🏪 **Plugin store** | `.find-skill` + instalador con hash y sandbox. | 💭 Idea |

## 🔄 Flujo de trabajo

```
1. Idea nueva (de la lluvia de ideas o de un bug)
   ↓
2. Se construye AQUÍ como experimento con tests
   ↓
3. Se mide (velocidad, memoria, falsos positivos)
   ↓
4. El dueño confirma que funciona
   ↓
5. Migra a Shin-MD en su bloque correspondiente 🚀
```

### ⚠️ Reglas importantes del Lab

- 🚫 Nada se pasa al estable sin confirmación del dueño.
- 🏷️ Tag `v0.X` por cada experimento terminado.
- 📦 Cero dependencias por defecto: una dep nueva tiene que justificar su peso.
- 📛 Si un experimento muere, se documenta por qué y se borra el código.

## 🏃 Correr los tests

```bash
git clone https://github.com/riokuroxi-svg/Shin-Lab
cd Shin-Lab
npm test
```

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

## ⭐ Créditos y enlaces

- 🌿 **Creador:** [riokuroxi-svg](https://github.com/riokuroxi-svg) 🇲🇽
- 🤖 **Bot estable:** [Shin-MD](https://github.com/riokuroxi-svg/Shin-MD)
- 📜 **Licencia:** AGPL-3.0 (como el bot)

<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=22&duration=3000&pause=800&color=4ADE80&center=true&vCenter=true&width=640&lines=🧪+SHIN-LAB;Aquí+nace+lo+que+hará+a+Shin-MD;más+superior+🚀" alt="Typing SVG"/>

<br/>

<a href="https://github.com/riokuroxi-svg/Shin-Lab/stargazers">
  <img src="https://img.shields.io/github/stars/riokuroxi-svg/Shin-Lab?style=social"/>
</a>
<a href="https://github.com/riokuroxi-svg/Shin-Lab/forks">
  <img src="https://img.shields.io/github/forks/riokuroxi-svg/Shin-Lab?style=social"/>
</a>

<img src="https://capsule-render.vercel.app/api?type=waving&height=140&color=gradient&customColorList=12,23,25,30&section=footer" width="100%"/>

</div>
