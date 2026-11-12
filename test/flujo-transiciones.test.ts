import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADOS,
  REGLAS,
  NOTA_MINIMA,
  NOTA_MAXIMA,
  puede,
  pasosDisponibles,
  ErrorFlujo,
} from '../src/lib/flujo';
import { actuar, type Base } from '../src/lib/demo';
import type { Accion, Estado, Perfil, Tarea } from '../src/lib/types';
import fs from 'node:fs';
import path from 'node:path';

// --- Perfiles de prueba ---
const admin: Perfil = {
  id: 'usr-admin',
  userId: 'auth-admin',
  email: 'admin@relevo.test',
  nombre: 'Admin Relevo',
  rol: 'admin',
  activo: true,
  codigo: null,
  invitacionVence: null,
  creado: '2026-01-01T00:00:00Z',
};

const responsable: Perfil = {
  id: 'usr-resp',
  userId: 'auth-resp',
  email: 'responsable@relevo.test',
  nombre: 'Empleado Responsable',
  rol: 'empleado',
  activo: true,
  codigo: null,
  invitacionVence: null,
  creado: '2026-01-01T00:00:00Z',
};

const otroEmpleado: Perfil = {
  id: 'usr-otro',
  userId: 'auth-otro',
  email: 'otro@relevo.test',
  nombre: 'Otro Empleado',
  rol: 'empleado',
  activo: true,
  codigo: null,
  invitacionVence: null,
  creado: '2026-01-01T00:00:00Z',
};

const cliente: Perfil = {
  id: 'usr-cliente',
  userId: 'auth-cliente',
  email: 'cliente@relevo.test',
  nombre: 'Cliente Externo',
  rol: 'cliente',
  activo: true,
  codigo: null,
  invitacionVence: null,
  creado: '2026-01-01T00:00:00Z',
};

function crearTarea(estado: Estado, asignadaA: string | null = responsable.id, archivada: string | null = null): Tarea {
  return {
    id: 't-test-1',
    numero: 101,
    titulo: 'Instalar piso de madera',
    descripcion: 'Piso laminado en sala',
    prioridad: 'alta',
    vence: '2026-11-20',
    asignadaA,
    obraId: 'obra-1',
    estado,
    creada: '2026-11-01T00:00:00Z',
    actualizada: '2026-11-01T00:00:00Z',
    completada: estado === 'completada' ? '2026-11-05T00:00:00Z' : null,
    archivada,
  };
}

function crearBaseDemo(tarea: Tarea, actorId: string): Base {
  return {
    yo: actorId,
    perfiles: [admin, responsable, otroEmpleado, cliente],
    obras: [{ id: 'obra-1', nombre: 'Casa Norte', detalle: 'Bogotá', activa: true }],
    tareas: [tarea],
    eventos: [],
    archivos: [],
    clientes: [],
    sec: 1,
  };
}

// ============================================================================
// 1. Pruebas unitarias de la máquina de estados en TypeScript (`flujo.ts`)
// ============================================================================

test('1. Flujo: Transiciones válidas para el responsable', async (t) => {
  await t.test('aceptar: asignada -> aceptada', () => {
    const tarea = crearTarea('asignada');
    assert.equal(puede('aceptar', tarea, responsable), true);
    assert.equal(puede('aceptar', tarea, admin), false, 'Admin no puede aceptar tarea asignada a otro');
  });

  await t.test('aclarar: permitida desde asignada, aceptada, en_curso, devuelta', () => {
    const estadosPermitidos: Estado[] = ['asignada', 'aceptada', 'en_curso', 'devuelta'];
    for (const est of ESTADOS) {
      const tarea = crearTarea(est);
      const esperado = estadosPermitidos.includes(est);
      assert.equal(puede('aclarar', tarea, responsable), esperado, `aclarar desde ${est} debe ser ${esperado}`);
      assert.equal(puede('aclarar', tarea, admin), false, 'Admin no debe poder aclarar');
    }
  });

  await t.test('iniciar: aceptada, devuelta -> en_curso', () => {
    const estadosPermitidos: Estado[] = ['aceptada', 'devuelta'];
    for (const est of ESTADOS) {
      const tarea = crearTarea(est);
      const esperado = estadosPermitidos.includes(est);
      assert.equal(puede('iniciar', tarea, responsable), esperado, `iniciar desde ${est} debe ser ${esperado}`);
    }
  });

  await t.test('enviar: solo desde en_curso -> enviada', () => {
    for (const est of ESTADOS) {
      const tarea = crearTarea(est);
      const esperado = est === 'en_curso';
      assert.equal(puede('enviar', tarea, responsable), esperado, `enviar desde ${est} debe ser ${esperado}`);
    }
  });
});

test('2. Flujo: Transiciones válidas para el administrador', async (t) => {
  await t.test('responder: solo desde aclaracion -> asignada', () => {
    for (const est of ESTADOS) {
      const tarea = crearTarea(est);
      const esperado = est === 'aclaracion';
      assert.equal(puede('responder', tarea, admin), esperado, `responder desde ${est} debe ser ${esperado}`);
      assert.equal(puede('responder', tarea, responsable), false, 'Responsable no debe poder responder');
    }
  });

  await t.test('revisar: solo desde enviada -> en_revision', () => {
    for (const est of ESTADOS) {
      const tarea = crearTarea(est);
      const esperado = est === 'enviada';
      assert.equal(puede('revisar', tarea, admin), esperado, `revisar desde ${est} debe ser ${esperado}`);
    }
  });

  await t.test('aprobar: desde enviada y en_revision -> completada', () => {
    const estadosPermitidos: Estado[] = ['enviada', 'en_revision'];
    for (const est of ESTADOS) {
      const tarea = crearTarea(est);
      const esperado = estadosPermitidos.includes(est);
      assert.equal(puede('aprobar', tarea, admin), esperado, `aprobar desde ${est} debe ser ${esperado}`);
    }
  });

  await t.test('devolver: desde enviada y en_revision -> devuelta', () => {
    const estadosPermitidos: Estado[] = ['enviada', 'en_revision'];
    for (const est of ESTADOS) {
      const tarea = crearTarea(est);
      const esperado = estadosPermitidos.includes(est);
      assert.equal(puede('devolver', tarea, admin), esperado, `devolver desde ${est} debe ser ${esperado}`);
    }
  });

  await t.test('reabrir: solo desde completada -> devuelta', () => {
    for (const est of ESTADOS) {
      const tarea = crearTarea(est);
      const esperado = est === 'completada';
      assert.equal(puede('reabrir', tarea, admin), esperado, `reabrir desde ${est} debe ser ${esperado}`);
    }
  });
});

test('3. Flujo: Comentar permitido para ambos en cualquier estado', () => {
  for (const est of ESTADOS) {
    const tarea = crearTarea(est);
    assert.equal(puede('comentar', tarea, admin), true, `admin puede comentar en ${est}`);
    assert.equal(puede('comentar', tarea, responsable), true, `responsable puede comentar en ${est}`);
    assert.equal(puede('comentar', tarea, otroEmpleado), false, `tercero no puede comentar en ${est}`);
    assert.equal(puede('comentar', tarea, cliente), false, `cliente no puede comentar en ${est}`);
  }
});

test('4. Flujo: Control de acceso para terceros y clientes', () => {
  const acciones: Accion[] = ['aceptar', 'aclarar', 'iniciar', 'enviar', 'responder', 'revisar', 'aprobar', 'devolver', 'reabrir', 'comentar'];
  for (const est of ESTADOS) {
    const tarea = crearTarea(est);
    for (const acc of acciones) {
      assert.equal(puede(acc, tarea, otroEmpleado), false, `Otro empleado no debe poder ejecutar ${acc} en ${est}`);
      assert.equal(puede(acc, tarea, cliente), false, `Cliente jamás debe poder ejecutar ${acc} en ${est}`);
    }
  }
});

test('5. Flujo: Función pasosDisponibles devuelve el orden correcto', () => {
  // En estado "asignada", responsable debe ver aceptar y aclarar
  const tareaAsignada = crearTarea('asignada');
  assert.deepEqual(pasosDisponibles(tareaAsignada, responsable), ['aceptar', 'aclarar']);

  // En estado "en_curso", responsable debe ver enviar y aclarar
  const tareaEnCurso = crearTarea('en_curso');
  assert.deepEqual(pasosDisponibles(tareaEnCurso, responsable), ['enviar', 'aclarar']);

  // En estado "enviada", admin debe ver aprobar, revisar y devolver
  const tareaEnviada = crearTarea('enviada');
  assert.deepEqual(pasosDisponibles(tareaEnviada, admin), ['aprobar', 'revisar', 'devolver']);

  // En estado "completada", admin debe ver reabrir
  const tareaCompletada = crearTarea('completada');
  assert.deepEqual(pasosDisponibles(tareaCompletada, admin), ['reabrir']);
});

// ============================================================================
// 2. Pruebas de ejecución en memoria con `demo.ts` (actuar)
// ============================================================================

test('6. actuar (demo.ts): Validación de notas', () => {
  const tareaAclaracion = crearTarea('asignada');
  const base = crearBaseDemo(tareaAclaracion, responsable.id);

  // Nota obligatoria vacía o menor al mínimo debe fallar
  assert.throws(() => actuar(base, tareaAclaracion.id, 'aclarar', ''), (e: ErrorFlujo) => e.fallo === 'nota');
  assert.throws(() => actuar(base, tareaAclaracion.id, 'aclarar', 'a'.repeat(NOTA_MINIMA - 1)), (e: ErrorFlujo) => e.fallo === 'nota');
  assert.throws(() => actuar(base, tareaAclaracion.id, 'aclarar', 'a'.repeat(NOTA_MAXIMA + 1)), (e: ErrorFlujo) => e.fallo === 'nota');

  // Nota válida
  actuar(base, tareaAclaracion.id, 'aclarar', 'Necesito planos nuevos');
  assert.equal(base.tareas[0].estado, 'aclaracion');
  assert.equal(base.eventos.length, 1);
  assert.equal(base.eventos[0].nota, 'Necesito planos nuevos');
});

test('7. actuar (demo.ts): Tareas archivadas no admiten acciones', () => {
  const tareaArchivada = crearTarea('asignada', responsable.id, '2026-11-10T00:00:00Z');
  const base = crearBaseDemo(tareaArchivada, responsable.id);
  assert.throws(() => actuar(base, tareaArchivada.id, 'aceptar', ''), (e: ErrorFlujo) => e.fallo === 'archivada');
});

test('8. actuar (demo.ts): Gestión de completed_at al aprobar y reabrir', () => {
  const tarea = crearTarea('enviada');
  const base = crearBaseDemo(tarea, admin.id);

  // Aprobar fija fecha completada
  const fechaAprobacion = '2026-11-11T12:00:00Z';
  actuar(base, tarea.id, 'aprobar', 'Buen trabajo', fechaAprobacion);
  assert.equal(base.tareas[0].estado, 'completada');
  assert.equal(base.tareas[0].completada, fechaAprobacion);

  // Reabrir limpia fecha completada y pasa a devuelta
  actuar(base, tarea.id, 'reabrir', 'Faltó pintar una esquina');
  assert.equal(base.tareas[0].estado, 'devuelta');
  assert.equal(base.tareas[0].completada, null);
});

// ============================================================================
// 3. Prueba de Paridad Estricta: TypeScript (`flujo.ts`) vs SQL (`tm_act`)
// ============================================================================

test('9. Paridad Estricta TypeScript vs SQL (tm_act)', () => {
  // Simulador exacto del CASE de SQL en supabase/schema.sql (líneas 510-521):
  // v_to := case
  //   when p_action = 'aceptar' and v_mine and v_t.status = 'asignada' then 'aceptada'
  //   when p_action = 'aclarar' and v_mine and v_t.status in ('asignada', 'aceptada', 'en_curso', 'devuelta') then 'aclaracion'
  //   when p_action = 'iniciar' and v_mine and v_t.status in ('aceptada', 'devuelta') then 'en_curso'
  //   when p_action = 'enviar' and v_mine and v_t.status = 'en_curso' then 'enviada'
  //   when p_action = 'responder' and v_admin and v_t.status = 'aclaracion' then 'asignada'
  //   when p_action = 'revisar' and v_admin and v_t.status = 'enviada' then 'en_revision'
  //   when p_action = 'aprobar' and v_admin and v_t.status in ('enviada', 'en_revision') then 'completada'
  //   when p_action = 'devolver' and v_admin and v_t.status in ('enviada', 'en_revision') then 'devuelta'
  //   when p_action = 'reabrir' and v_admin and v_t.status = 'completada' then 'devuelta'
  //   when p_action = 'comentar' then v_t.status
  // end;
  function simularSQL(accion: Accion, estado: Estado, esResponsable: boolean, esAdmin: boolean) {
    if (!esResponsable && !esAdmin) return { permitido: false, error: 'permiso' };

    let nuevoEstado: Estado | null = null;
    if (accion === 'aceptar' && esResponsable && estado === 'asignada') nuevoEstado = 'aceptada';
    else if (accion === 'aclarar' && esResponsable && ['asignada', 'aceptada', 'en_curso', 'devuelta'].includes(estado)) nuevoEstado = 'aclaracion';
    else if (accion === 'iniciar' && esResponsable && ['aceptada', 'devuelta'].includes(estado)) nuevoEstado = 'en_curso';
    else if (accion === 'enviar' && esResponsable && estado === 'en_curso') nuevoEstado = 'enviada';
    else if (accion === 'responder' && esAdmin && estado === 'aclaracion') nuevoEstado = 'asignada';
    else if (accion === 'revisar' && esAdmin && estado === 'enviada') nuevoEstado = 'en_revision';
    else if (accion === 'aprobar' && esAdmin && ['enviada', 'en_revision'].includes(estado)) nuevoEstado = 'completada';
    else if (accion === 'devolver' && esAdmin && ['enviada', 'en_revision'].includes(estado)) nuevoEstado = 'devuelta';
    else if (accion === 'reabrir' && esAdmin && estado === 'completada') nuevoEstado = 'devuelta';
    else if (accion === 'comentar') nuevoEstado = estado;

    if (!nuevoEstado) return { permitido: false, error: 'transicion' };
    return { permitido: true, nuevoEstado };
  }

  const acciones: Accion[] = [
    'aceptar',
    'aclarar',
    'iniciar',
    'enviar',
    'responder',
    'revisar',
    'aprobar',
    'devolver',
    'reabrir',
    'comentar',
  ];

  const perfilesPrueba = [
    { desc: 'Responsable (empleado asignado)', perfil: responsable, esMio: true, esAdmin: false },
    { desc: 'Admin asignado (es mío y admin)', perfil: { ...admin, id: responsable.id }, esMio: true, esAdmin: true },
    { desc: 'Admin no asignado', perfil: admin, esMio: false, esAdmin: true },
    { desc: 'Otro empleado no asignado', perfil: otroEmpleado, esMio: false, esAdmin: false },
    { desc: 'Cliente', perfil: cliente, esMio: false, esAdmin: false },
  ];

  let combinacionesProbadas = 0;

  for (const accion of acciones) {
    for (const estado of ESTADOS) {
      for (const p of perfilesPrueba) {
        combinacionesProbadas++;
        const tarea = crearTarea(estado, responsable.id);

        const tsPermitido = puede(accion, tarea, p.perfil);
        const sqlRes = simularSQL(accion, estado, p.esMio, p.esAdmin);

        assert.equal(
          tsPermitido,
          sqlRes.permitido,
          `Discrepancia en [${accion}] desde [${estado}] para [${p.desc}]: TS=${tsPermitido}, SQL=${sqlRes.permitido}`
        );

        if (tsPermitido && sqlRes.permitido) {
          const regla = REGLAS[accion];
          const tsNuevoEstado = regla.hacia ?? estado;
          assert.equal(
            tsNuevoEstado,
            sqlRes.nuevoEstado,
            `Discrepancia de estado destino en [${accion}] desde [${estado}]: TS=${tsNuevoEstado}, SQL=${sqlRes.nuevoEstado}`
          );
        }
      }
    }
  }

  assert.equal(combinacionesProbadas, 10 * 9 * 5, 'Debe haber probado exactamente 450 combinaciones');
});

test('10. Paridad SQL: Verificación directa contra el archivo schema.sql', () => {
  const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/schema.sql'), 'utf-8');

  // Verificar que la función private.tm_act existe y contiene las reglas clave
  assert.ok(schemaSql.includes('create or replace function private.tm_act('), 'tm_act debe estar definida');
  assert.ok(schemaSql.includes("when p_action = 'aceptar' and v_mine and v_t.status = 'asignada' then 'aceptada'"));
  assert.ok(schemaSql.includes("when p_action = 'responder' and v_admin and v_t.status = 'aclaracion' then 'asignada'"));
  assert.ok(schemaSql.includes("when p_action = 'reabrir' and v_admin and v_t.status = 'completada' then 'devuelta'"));
  assert.ok(schemaSql.includes("char_length(v_note) > 2000"));
});
