import { useId } from "react";
import { Icon } from "./Icon";

/** SVG liviano. La secuencia se ejecuta una sola vez mediante CSS. */
export function Arquitectura() {
  const id = useId().replace(/:/g, "");
  return (
    <div
      className="arquitectura"
      role="img"
      aria-label="Ilustración de un edificio que se construye desde un plano, con indicadores de ejemplo de tareas, avance y equipo"
    >
      <svg
        viewBox="0 0 720 550"
        fill="none"
        aria-hidden="true"
        className="edificio-svg"
      >
        <defs>
          <linearGradient
            id={`${id}-cristal`}
            x1="200"
            y1="170"
            x2="550"
            y2="440"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#16D2F2" stopOpacity=".18" />
            <stop offset="1" stopColor="#1764F5" stopOpacity=".04" />
          </linearGradient>
          <linearGradient id={`${id}-luz`}>
            <stop stopColor="#16D2F2" />
            <stop offset="1" stopColor="#1764F5" />
          </linearGradient>
          <radialGradient id={`${id}-suelo`}>
            <stop stopColor="#16D2F2" stopOpacity=".24" />
            <stop offset="1" stopColor="#16D2F2" stopOpacity="0" />
          </radialGradient>
          <filter
            id={`${id}-brillo`}
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>
        <ellipse
          cx="370"
          cy="457"
          rx="300"
          ry="85"
          fill={`url(#${id}-suelo)`}
        />
        <g
          className="plano-grid"
          stroke="#16D2F2"
          strokeOpacity=".2"
          strokeWidth=".8"
        >
          {Array.from({ length: 13 }, (_, i) => (
            <path key={`a${i}`} d={`M${35 + i * 27} ${398 - i * 12}l330 145`} />
          ))}
          {Array.from({ length: 13 }, (_, i) => (
            <path key={`b${i}`} d={`M${35 + i * 27} ${398 + i * 12}l330-145`} />
          ))}
        </g>
        <g
          className="grua"
          stroke="#F5B947"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <path d="M529 395V62h16v340M529 62l16 22-16 22 16 22-16 22 16 22-16 22 16 22-16 22 16 22-16 22 16 22-16 22 16 22-16 22" />
          <path d="m371 108 241-73v17l-241 74zm0 0 15 12 10-20 15 12 10-20 15 12 10-20 15 12 10-20 15 12 10-20 15 12 10-20 15 12 10-20 15 12M537 61V28l-81 54M537 28l75 7M401 116v76m-5 0h10l-5 9-5-9" />
          <path d="m599 52 25-7v19l-25 7z" fill="#F5B947" fillOpacity=".5" />
        </g>
        <g className="edificio-superficies" fill={`url(#${id}-cristal)`}>
          <path d="m194 247 175-75 169 72v185l-169 75-175-75z" />
          <path d="m215 201 154-66 149 63v224l-149 66-154-66z" />
        </g>
        <g
          className="estructura"
          stroke={`url(#${id}-luz)`}
          strokeWidth="2"
          strokeLinejoin="round"
        >
          {[0, 1, 2, 3].map((nivel) => (
            <g
              key={nivel}
              style={{ animationDelay: `${1 + nivel * 0.23}s` }}
              className="trazo-piso"
            >
              <path
                pathLength="1"
                d={`m194 ${429 - nivel * 74} 175-75 169 72-169 77z`}
              />
              <path
                pathLength="1"
                d={`m194 ${435 - nivel * 74} 175-75 169 72M369 ${354 - nivel * 74}v75`}
                strokeOpacity=".5"
              />
            </g>
          ))}
          {[0, 1, 2, 3, 4].map((columna) => (
            <g
              key={columna}
              className="trazo-columna"
              style={{ animationDelay: `${0.9 + columna * 0.12}s` }}
            >
              <path
                pathLength="1"
                d={`M${194 + columna * 43.75} ${429 - columna * 18.75}V${207 - columna * 18.75}`}
              />
              <path
                pathLength="1"
                d={`M${369 + columna * 42.25} ${354 + columna * 18.75}V${132 + columna * 18.75}`}
              />
            </g>
          ))}
          <path
            className="trazo-cubierta"
            pathLength="1"
            d="m194 207 175-75 169 72-169 77zM194 200l175-75 169 72M369 125v237"
            strokeWidth="3"
          />
        </g>
        <g className="ventanas" stroke="#16D2F2" strokeOpacity=".48">
          {[0, 1, 2].map((piso) => (
            <g key={piso}>
              {[0, 1, 2, 3, 4, 5, 6].map((v) => (
                <path
                  key={v}
                  d={`M${206 + v * 23} ${414 - piso * 74 - v * 10}v-53M${381 + v * 22} ${351 - piso * 74 + v * 10}v-53`}
                />
              ))}
            </g>
          ))}
          <path d="m194 392 175-75 169 72M194 318l175-75 169 72M194 244l175-75 169 72" />
        </g>
        <g className="luces-finales" stroke="#FFD38A" strokeWidth="3">
          <path d="m195 355 174-75 168 72M195 429l174-75 168 72" />
          <path
            d="m393 365 24 11v41l-24-11zM464 397l24 11v41l-24-11z"
            fill="#F5B947"
            fillOpacity=".25"
            strokeWidth="1"
          />
        </g>
        <g
          className="cotas"
          stroke="#61DDF4"
          strokeOpacity=".4"
          strokeWidth=".8"
        >
          <path d="M166 204v230m-5-230h10m-10 230h10M206 464l154 67 173-76M206 458v12m154 55v12m173-88v12" />
        </g>
        <path
          className="luces-finales"
          d="m194 429 175 77 169-77"
          stroke="#16D2F2"
          strokeWidth="5"
          filter={`url(#${id}-brillo)`}
        />
      </svg>
      <div className="obra-flotante flotante-tareas">
        <span className="flotante-icono">
          <Icon name="tareas" />
        </span>
        <span>
          Tareas en curso<strong>24</strong>
        </span>
      </div>
      <div className="obra-flotante flotante-avance">
        <span className="flotante-icono">
          <Icon name="avance" />
        </span>
        <span>
          Avance de obra
          <strong>
            72<span>%</span>
          </strong>
          <span className="mini-progreso">
            <i />
          </span>
        </span>
      </div>
      <div className="obra-flotante flotante-equipo">
        <span className="flotante-icono">
          <Icon name="equipo" />
        </span>
        <span>
          Equipo asignado<strong>8 personas</strong>
        </span>
      </div>
      <span className="sr-only">
        Los indicadores de la ilustración son ejemplos.
      </span>
    </div>
  );
}

/** Fondo predeterminado para obras que aún no tienen fotografía. */
export function ObraVisual({ className = "" }: { className?: string }) {
  return (
    <div className={`obra-visual ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 400 140"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <path
          d="M0 120 400 40M0 90l400 80M80 0v140M240 0v140M0 50h400"
          stroke="currentColor"
          opacity=".1"
        />
        <path
          d="m115 117 90-38 82 36-90 40zM115 89l90-38 82 36-90 40zM115 61l90-38 82 36-90 40z"
          fill="currentColor"
          fillOpacity=".06"
          stroke="currentColor"
        />
        <path
          d="M115 61v56M145 74v56M175 87v56M197 99v56M205 23v56M232 35v56M260 47v56M287 59v56"
          stroke="currentColor"
        />
        <path
          d="M320 115V14h7v101M250 33l110-30v8L250 41zM267 37v28"
          stroke="currentColor"
          opacity=".4"
        />
      </svg>
    </div>
  );
}
