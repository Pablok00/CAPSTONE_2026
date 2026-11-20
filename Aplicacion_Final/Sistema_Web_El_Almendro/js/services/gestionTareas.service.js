// 21F.10: cambiar solo durante el corte coordinado de 21F.11.
const GESTION_TAREAS_RPC_HABILITADA = true;

window.GestionTareas = (() => {
  const prefijo = 'alm:gestion-tareas:21f10:';
  const pendientes = new Map();
  const enCurso = new Set();
  // Solo deduplicación de peticiones EN CURSO. No se cachean autorizaciones
  // ni resultados principales después de resolverse; nunca se guardan tokens.
  const lecturasEnCurso = new Map();
  const historicosEnCurso = new Map();
  // Solo meses completos, 15 segundos y seis entradas; nunca cachear autoridad.
  const mesesRecientes = new Map();
  const asignacionesRecientes = new Map();
  let versionLecturas = 0;
  let versionSesion = 0;
  let ultimoContextoLectura = null;
  function invalidarLecturas() { versionLecturas++; lecturasEnCurso.clear(); historicosEnCurso.clear(); mesesRecientes.clear(); asignacionesRecientes.clear(); }
  let ultimaSesionAuth=null;
  // session_id solo aísla cachés; la autorización sigue siendo del servidor.
  function claveSesionAuth(sesion) {
    try {
      const payload=sesion?.access_token?.split('.')[1];
      const base=payload.replace(/-/g,'+').replace(/_/g,'/');
      const claims=JSON.parse(atob(base.padEnd(Math.ceil(base.length/4)*4,'=')));
      if(typeof sesion.user?.id!=='string'||typeof claims.session_id!=='string'||!claims.session_id)return null;
      return JSON.stringify([sesion.user.id,claims.session_id]);
    } catch { return null; }
  }
  window.supabaseClient.auth?.onAuthStateChange?.((evento,sesion) => {
    const clave=claveSesionAuth(sesion);
    if(['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED'].includes(evento)&&clave&&clave===ultimaSesionAuth)return;
    ultimaSesionAuth=clave;
    versionSesion++;invalidarLecturas();
  });
  const errorLectura=(code,mensaje)=>Object.assign(Error(mensaje),{code});
  const rpc = {
    crear: 'tareas_pendientes_crear_v1',
    editar: 'tareas_pendientes_editar_v1',
    responsables: 'tareas_pendientes_responsables_v1',
    ciclo: 'tareas_pendientes_ciclo_v1',
    retirar: 'tareas_pendientes_retirar_v1'
  };
  const actor = () => state.currentUser?.id;
  const admin = () => esAdminOperativoActual();
  const puede = () => Boolean(actor()) &&
    !(typeof sesionNoVerificable !== 'undefined' && sesionNoVerificable) &&
    !(typeof sesionEnReconexion !== 'undefined' && sesionEnReconexion) &&
    admin();
  const avisoBackend = 'Disponible al activar el nuevo sistema de tareas.';
  function exigirBackend() {
    if (!GESTION_TAREAS_RPC_HABILITADA) throw Error(avisoBackend);
  }
  function contexto() {
    if (!puede()) { mesesRecientes.clear(); asignacionesRecientes.clear(); ultimoContextoLectura=null; throw errorLectura('GESTION_SESION_NO_DISPONIBLE','Gestión de tareas no disponible para esta sesión.'); }
    const c={ id: actor(), admin: admin(), permisos: firmaPermisos(), sesion: versionSesion };
    const firma=JSON.stringify([c.permisos,c.sesion]);
    if(ultimoContextoLectura!==null&&ultimoContextoLectura!==firma)invalidarLecturas();
    ultimoContextoLectura=firma;
    return c;
  }
  function firmaPermisos() {
    const u=state.currentUser||{};
    const normalizar=v=>Array.isArray(v)?v.map(normalizar).sort((a,b)=>String(JSON.stringify(a)).localeCompare(String(JSON.stringify(b))))
      :v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalizar(v[k])])):v;
    return JSON.stringify([u.id,u.role,u.esAdminPermanente===true,u.esAdminTemporal===true,u.adminTemporalHasta||null,u.trabajador_id||null,normalizar(u.permissions??null),admin()]);
  }
  function comprobar(c) {
    if((typeof sesionNoVerificable!=='undefined'&&sesionNoVerificable)||(typeof sesionEnReconexion!=='undefined'&&sesionEnReconexion))
      throw errorLectura('GESTION_SESION_NO_DISPONIBLE','La sesión se está verificando.');
    if (!puede() || c.id !== actor() || c.admin !== admin() || c.permisos !== firmaPermisos() || c.sesion !== versionSesion) {
      throw errorLectura('GESTION_CONTEXTO_CAMBIO','Cambió tu acceso. Vuelve a abrir Gestión de tareas.');
    }
  }
  function pendiente(id) {
    if (!pendientes.has(id)) {
      try {
        const x = JSON.parse(sessionStorage.getItem(prefijo + id));
        if (x?.actor === id && Object.values(rpc).includes(x.nombre) &&
            typeof x.args?.p_solicitud_id === 'string') pendientes.set(id, x);
      } catch { /* almacenamiento no disponible */ }
    }
    return pendientes.get(id);
  }
  function registrar(id, valor) {
    if (valor) pendientes.set(id, valor);
    else pendientes.delete(id);
    try {
      if (valor) sessionStorage.setItem(prefijo + id, JSON.stringify(valor));
      else sessionStorage.removeItem(prefijo + id);
    } catch { /* se conserva el intento en memoria */ }
  }
  function permiteIntento(c, nombre, args) {
    if (!c.admin && !(nombre === rpc.responsables && args.p_accion === 'AVANCE')) {
      throw Error('Esta operación requiere administración vigente.');
    }
    if (nombre === rpc.retirar && !esAdminPermanenteActual()) {
      throw Error('El retiro de una tarea requiere administración permanente.');
    }
  }
  async function enviar(c, intento) {
    comprobar(c);
    permiteIntento(c, intento.nombre, intento.args);
    if (enCurso.has(c.id)) throw Error('Ya hay una solicitud en curso.');
    enCurso.add(c.id);
    invalidarLecturas();
    try {
      const { data, error } = await window.supabaseClient.rpc(intento.nombre, intento.args);
      if (error) {
        // Errores SQL con rechazo confirmado. Contención y transporte conservan el UUID.
        if (['22023', '42501', '23502', '23503', '23505', '23514', '40001',
          '55000', 'P0001', 'P0002', 'PGRST202'].includes(error.code)) registrar(c.id, null);
        throw error;
      }
      if (data?.solicitud_id !== intento.args.p_solicitud_id ||
          typeof data.tarea_id !== 'string' || (!Number.isSafeInteger(data.revision) || data.revision < 1)) {
        throw Error('No se pudo confirmar la respuesta. Reintenta la operación pendiente.');
      }
      registrar(c.id, null);
      comprobar(c);
      return data;
    } finally {
      invalidarLecturas();
      enCurso.delete(c.id);
    }
  }
  async function mutar(accion, args) {
    exigirBackend();
    const c = contexto();
    if (!Object.hasOwn(rpc, accion)) throw Error('Operación desconocida.');
    permiteIntento(c, rpc[accion], args);
    const anterior = pendiente(c.id);
    if (anterior) throw Error('Reintenta primero la operación pendiente.');
    const intento = { actor: c.id, nombre: rpc[accion],
      args: { ...args, p_solicitud_id: crypto.randomUUID() } };
    registrar(c.id, intento);
    return enviar(c, intento);
  }
  async function reintentar() {
    exigirBackend();
    const c = contexto();
    const intento = pendiente(c.id);
    if (!intento) throw Error('No hay una operación pendiente.');
    return enviar(c, intento);
  }
  function enriquecer(filas,c) {
    if(!window.UsuariosService?.anotarNombresHistoricos || !filas.some(f=>f.retirada_por))return null;
    const version=versionLecturas;
    const key=JSON.stringify([version,c.permisos,filas.map(f=>[f.id,f.revision,f.retirada_por,f.retirada_en])]);
    if(historicosEnCurso.has(key))return historicosEnCurso.get(key);
    const vigente=()=>{comprobar(c);if(version!==versionLecturas)throw errorLectura('GESTION_LECTURA_INVALIDADA','La lectura cambió. Vuelve a consultar.');};
    const promesa=Promise.resolve().then(()=>window.UsuariosService.anotarNombresHistoricos('TAREAS_REGISTROS',filas))
      .then(datos=>{vigente();return datos;},()=>{vigente();return filas.map(f=>({...f,lectura_historica:{estado:'NO_DISPONIBLE',codigo:'LECTURA_HISTORICA_NO_DISPONIBLE'}}));});
    promesa.catch(()=>{}); // Un panel puede cerrarse antes de consumir la lectura.
    historicosEnCurso.set(key,promesa);
    const limpiar=()=>{if(historicosEnCurso.get(key)===promesa)historicosEnCurso.delete(key);};
    promesa.then(limpiar,limpiar);
    return promesa;
  }
  function conHistoricos(resultado,promesa) {
    if(promesa){promesa.catch(()=>{});Object.defineProperty(resultado,'enriquecimientoHistorico',{value:promesa});}
    return resultado;
  }
  async function pagina(vista, filtros = {}, {historicos=true}={}) {
    exigirBackend();
    const c = contexto();
    const version=versionLecturas;
    const args={p_vista:vista,...filtros};
    const key=JSON.stringify([version,c.permisos,Object.keys(args).sort().map(k=>[k,args[k]])]);
    let lectura=lecturasEnCurso.get(key);
    if(!lectura){
      lectura=Promise.resolve(window.supabaseClient.rpc('tareas_pendientes_consultar_v1',args));
      lecturasEnCurso.set(key,lectura);
      const limpiar=()=>{if(lecturasEnCurso.get(key)===lectura)lecturasEnCurso.delete(key);};
      Promise.resolve(lectura).then(limpiar,limpiar);
    }
    const { data, error } = await lectura;
    comprobar(c);
    if(version!==versionLecturas)throw errorLectura('GESTION_LECTURA_INVALIDADA','La lectura cambió. Vuelve a consultar.');
    if (error) throw error;
    if (!Array.isArray(data?.items) || typeof data.hay_mas !== 'boolean' ||
        (data.hay_mas && data.siguiente_cursor == null)) throw Object.assign(Error('Respuesta de tareas incompleta.'),{code:'GESTION_RESPUESTA_INCOMPLETA'});
    const extra=historicos&&vista==='TAREAS'?enriquecer(data.items,c):null;
    return conHistoricos({...data},extra?.then(items=>({...data,items})));
  }
  async function todas(vista, filtros = {}) {
    exigirBackend();
    const c=contexto(),version=versionLecturas;
    const mensual=vista==='TAREAS' && Object.keys(filtros).length===2 &&
      /^\d{4}-(0[1-9]|1[0-2])-01$/.test(filtros.p_desde||'') && filtros.p_hasta===mes(filtros.p_desde).p_hasta;
    const asignaciones=vista==='ASIGNACIONES' && Object.keys(filtros).length===1 && typeof filtros.p_tarea_id==='string';
    if(!mensual&&!asignaciones)return consultarTodas(vista,filtros);
    const cache=asignaciones?asignacionesRecientes:mesesRecientes;
    const key=JSON.stringify([version,c.sesion,c.permisos,vista,filtros.p_tarea_id,filtros.p_desde,filtros.p_hasta]);
    let entrada=cache.get(key);
    if(entrada && entrada.hasta<=Date.now()){cache.delete(key);entrada=null;}
    if(!entrada){
      entrada={hasta:Infinity,promesa:null};
      entrada.promesa=consultarTodas(vista,filtros).then(filas=>{
        entrada.hasta=Date.now()+15000;entrada.filas=filas;return filas;
      }).catch(error=>{if(cache.get(key)===entrada)cache.delete(key);throw error;});
      cache.set(key,entrada);
      if(cache.size>(asignaciones?32:6))cache.delete(cache.keys().next().value);
    }
    const filas=await entrada.promesa;
    const vigente=()=>{comprobar(c);if(version!==versionLecturas)throw errorLectura('GESTION_LECTURA_INVALIDADA','La lectura cambió. Vuelve a consultar.');};
    vigente();
    const copiar=rows=>JSON.parse(JSON.stringify(rows));
    return conHistoricos(copiar(filas),filas.enriquecimientoHistorico?.then(rows=>{vigente();return copiar(rows);}));
  }
  function asignacionesDisponibles(id) {
    const c=contexto();
    const key=JSON.stringify([versionLecturas,c.sesion,c.permisos,'ASIGNACIONES',id,undefined,undefined]);
    const e=asignacionesRecientes.get(key);
    if(!e||e.hasta<=Date.now()||!e.filas)return undefined;
    comprobar(c);return JSON.parse(JSON.stringify(e.filas));
  }
  async function consultarTodas(vista, filtros = {}) {
    exigirBackend();
    const c = contexto();
    const filas = [];
    const cursores = new Set();
    const clave = vista === 'HISTORIAL' ? 'p_cursor_revision' : 'p_cursor_id';
    let cursor;
    do {
      comprobar(c);
      const datos = await pagina(vista, { ...filtros, p_limite: 50, ...(cursor == null ? {} : { [clave]: cursor }) },{historicos:false});
      filas.push(...datos.items);
      if (!datos.hay_mas) return conHistoricos(filas,vista==='TAREAS'?enriquecer(filas,c):null);
      cursor = datos.siguiente_cursor;
      if (cursores.has(cursor)) throw Error('Cursor de tareas repetido.');
      cursores.add(cursor);
    } while (true);
  }
  async function historialLaboral(trabajador, cursor) {
    exigirBackend();
    const c = contexto();
    if (!c.admin) throw Error('Se requiere administración vigente para consultar la ficha laboral.');
    const r = await pagina('ASIGNACIONES', {
      p_trabajador_id: trabajador, p_limite: 10, ...(cursor == null ? {} : { p_cursor_id: cursor })
    });
    comprobar(c);
    if (!r.items.length) return r;
    const ids = [...new Set(r.items.map(a => a.tarea_id))];
    const datos=await Promise.all(ids.map(async id=>{
      const paginaTarea=await pagina('TAREAS',{p_tarea_id:id,p_limite:1},{historicos:false});
      comprobar(c);
      if(paginaTarea.items.length!==1||paginaTarea.items[0].id!==id)throw Error('No se pudieron consultar los datos del historial.');
      return paginaTarea.items[0];
    }));
    const titulos = new Map(datos.map(t => [t.id, t]));
    if (ids.some(id => !titulos.has(id))) throw Error('No se pudieron consultar los datos del historial.');
    const unir=filas=>{const mapa=new Map(filas.map(t=>[t.id,t]));return {...r,items:r.items.map(a=>({...a,tarea:mapa.get(a.tarea_id)}))};};
    const extra=enriquecer(datos,c);
    return conHistoricos(unir(datos),extra?.then(unir));
  }
  function mes(fecha) {
    const [anio, mes] = fecha.split('-').map(Number);
    const bisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
    const dias = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return { p_desde: fecha.slice(0, 7) + '-01', p_hasta: fecha.slice(0, 7) + '-' + dias[mes - 1] };
  }
  return {
    habilitada: GESTION_TAREAS_RPC_HABILITADA, avisoBackend, puede, admin, contexto, comprobar,
    mutar, reintentar, pagina, todas, historialLaboral, mes, invalidarLecturas, asignacionesDisponibles,
    tienePendiente() {
      if (!GESTION_TAREAS_RPC_HABILITADA || !puede() || enCurso.has(actor())) return false;
      const intento = pendiente(actor());
      if (!intento) return false;
      try {
        permiteIntento(contexto(), intento.nombre, intento.args);
        return true;
      } catch {
        return false;
      }
    }
  };
})();
