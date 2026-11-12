# Plan de Implementación · Rediseño UI Relevo
> **Superficie:** Tokens de diseño global y componentes compartidos de interfaz  
> **Rama objetivo:** `feat/rediseño-ui`  
> **Fuentes de diseño:** `src/app/globals.css`, `src/components/ui.tsx`, `README.md`  

---

## Design language
- **Audited surface:** `src/app/globals.css` y `src/components/ui.tsx` (sistema central de estilos y componentes UI).
- **Design sources:** `src/app/globals.css` (reglas de libro de trabajo, `:root`, `[data-theme="dark"]`, `@theme inline`), `README.md`.
- **Documented decisions:** Metáfora de bitácora técnica de obra (papel cálido, tinta de alto contraste, reglas, acento resaltador, escala de 9 estados de flujo y diseño móvil prioritario).
- **Governing owners and consumers:** `globals.css` es el propietario único de tokens; `ui.tsx` y las páginas de `/panel` son los consumidores directos.
- **Explicit exceptions:** None documented.

---

## Findings

| # | Problem | Evidence | Proposed change | Scope | Confidence |
|---|---------|----------|-----------------|-------|:----------:|
| 1 | Los 9 estados de flujo carecen de tokens semánticos de fondo y borde, limitando los sellos a un punto de 8px sin contenedor accesible bajo luz solar. | `src/app/globals.css:20-29` solo define `--e-<estado>` para el color sólido. `ui.tsx:46` usa únicamente `style={{ background: ... }}`. | Añadir tokens `--e-<estado>-fondo` y `--e-<estado>-borde` en `:root` y `[data-theme="dark"]` de `globals.css` e integrarlos en `@theme inline`. | `src/app/globals.css` | High |
| 2 | Las dimensiones táctiles mínimas para móvil (`min-h-12`, campos de 16px) están dispersas en clases utilitarias sin tokens CSS semánticos centralizados. | `globals.css:97-99` describe la regla de diseño en comentarios pero la aplica inline en `.btn` y `.campo`. | Definir `--touch-target-min: 44px`, `--touch-target-field: 48px`, escala de espaciado y radios en `:root` de `globals.css`. | `src/app/globals.css` | High |
| 3 | El componente `Sello` no aprovecha un contenedor semántico estructurado para escaneo visual rápido en obras. | `src/components/ui.tsx:40-49` renderiza texto plano con un cuadro pequeño. | Agregar soporte de badge suave con borde técnico y fondo semántico opcional en `Sello` para vistas de detalle y listas de obra. | `src/components/ui.tsx` | High |

---

## Improve first
**Hallazgo #1 (Tokens semánticos de los 9 estados del flujo):**  
Es el cambio con mayor impacto y menor riesgo. Provee la base cromática completa para que todos los estados del flujo (desde `borrador` hasta `completada`) tengan contraste garantizado, fondo suave y soporte pleno para modo claro y oscuro.

---

## Especificación técnica de cambios

### 1. Actualización en `src/app/globals.css`
* Expandir `:root` y `[data-theme="dark"]` con:
  * Tokens de color de fondo y borde para los 9 estados.
  * Tokens de escala modular tipográfica y espaciado.
  * Tokens ergonómicos `--touch-target-min: 44px` y `--touch-target-field: 48px`.
* Enlazar las nuevas variables dentro del bloque `@theme inline`.

### 2. Actualización en `src/components/ui.tsx`
* Enriquecer `Sello` para permitir estilo badge técnico con fondo y borde del color de su estado, mejorando la legibilidad en campo.
* Verificar que los botones primarios mantengan altura táctil accesible ($\ge 44\text{px}$).
