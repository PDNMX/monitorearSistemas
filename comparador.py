import csv
import sys
from collections import defaultdict
import re
from datetime import datetime

def normalizar_nombre_ente(nombre):
    """
    Normaliza los nombres de los entes para manejar variaciones en mayúsculas/minúsculas,
    espacios, guiones bajos, etc.
    """
    # Convertir a mayúsculas
    nombre = nombre.upper()
    # Reemplazar espacios por guiones bajos
    nombre = nombre.replace(' ', '_')
    # Casos especiales
    if nombre == 'MÉXICO' or nombre == 'MEXICO':
        return 'EDOMEX'
    if nombre == 'SABG':
        return 'SECRETARIA_ANTICORRUPCION'
    if nombre == 'QUERÉTARO':
        return 'QUERETARO'
    if nombre == 'MICHOACÁN':
        return 'MICHOACAN'
    if nombre == 'YUCATÁN':
        return 'YUCATAN'
    # Devolver el nombre normalizado
    return nombre

def encontrar_fecha_valida_cercana(fechas_horas, datos_por_fecha, ente, fecha_referencia, buscar_anterior=True):
    """
    Busca la fecha más cercana (anterior o posterior) a la fecha de referencia 
    que tenga un valor numérico válido para el ente especificado.
    
    Args:
        fechas_horas: Lista ordenada de todas las fechas/horas disponibles
        datos_por_fecha: Diccionario con todos los datos por fecha/hora y ente
        ente: El ente para el que buscamos un valor válido
        fecha_referencia: La fecha/hora de referencia desde la que buscamos
        buscar_anterior: Si es True, busca fechas anteriores; si es False, busca fechas posteriores
        
    Returns:
        Tupla con (fecha_hora, valor, fecha, hora) o (None, None, None, None) si no se encuentra
    """
    # Obtener el índice de la fecha de referencia
    try:
        indice_referencia = fechas_horas.index(fecha_referencia)
    except ValueError:
        # Si la fecha de referencia no está en la lista
        return None, None, None, None
    
    # Determinar el rango de índices a buscar
    if buscar_anterior:
        rango_indices = range(indice_referencia - 1, -1, -1)  # Buscar hacia atrás
    else:
        rango_indices = range(indice_referencia + 1, len(fechas_horas))  # Buscar hacia adelante
    
    # Buscar en el rango
    for i in rango_indices:
        fecha_hora = fechas_horas[i]
        if ente in datos_por_fecha[fecha_hora]:
            valor = datos_por_fecha[fecha_hora][ente]['TOTAL_REGISTROS']
            if isinstance(valor, int):  # Solo si es un valor numérico
                fecha = datos_por_fecha[fecha_hora][ente]['FECHA_EJECUCION']
                hora = datos_por_fecha[fecha_hora][ente]['HORA_EJECUCION']
                return fecha_hora, valor, fecha, hora
    
    # Si no se encuentra ningún valor válido
    return None, None, None, None

def analizar_cambios(archivo_entrada, archivo_salida):
    """
    Analiza un archivo CSV con datos históricos y genera un reporte comparando
    el TOTAL_REGISTROS entre la fecha más antigua y la fecha más reciente para cada ENTE_PUBLICO.
    Busca automáticamente fechas con valores válidos cuando encuentra errores.
    
    Args:
        archivo_entrada: Ruta al archivo CSV de entrada
        archivo_salida: Ruta al archivo CSV de salida donde se guardarán los resultados
    """
    # Estructura para almacenar los datos por fecha de ejecución y ente
    datos_por_fecha = defaultdict(lambda: defaultdict(dict))
    
    # Leer el archivo de entrada
    try:
        with open(archivo_entrada, 'r', encoding='utf-8') as f:
            lector = csv.DictReader(f)
            for fila in lector:
                fecha = fila['FECHA_EJECUCION']
                hora = fila['HORA_EJECUCION']
                
                # Verificar qué columna existe para el ente
                if 'ENTE_PUBLICO' in fila:
                    ente_original = fila['ENTE_PUBLICO']
                elif 'ENTE' in fila:
                    ente_original = fila['ENTE']
                else:
                    # Si no encontramos la columna, buscamos una similar
                    ente_original = None
                    for columna in fila.keys():
                        if 'ENTE' in columna.upper():
                            ente_original = fila[columna]
                            break
                
                if ente_original is None:
                    print(f"No se pudo identificar la columna de ENTE en la fila: {fila}")
                    continue
                
                # Normalizar el nombre del ente para manejar variaciones
                ente = normalizar_nombre_ente(ente_original)
                
                # Manejar el valor de total_registros, que puede ser un ERROR
                total_registros_str = fila['TOTAL_REGISTROS']
                if total_registros_str == 'ERROR' or not total_registros_str.isdigit():
                    total_registros = 'ERROR'
                else:
                    total_registros = int(total_registros_str)
                
                estatus = fila['ESTATUS']
                
                # Crear una clave combinada de fecha y hora para tener un orden cronológico correcto
                fecha_hora = f"{fecha} {hora}"
                
                # Almacenar los datos por fecha_hora y ente
                datos_por_fecha[fecha_hora][ente] = {
                    'FECHA_EJECUCION': fecha,
                    'HORA_EJECUCION': hora,
                    'ENTE_ORIGINAL': ente_original,
                    'TOTAL_REGISTROS': total_registros,
                    'ESTATUS': estatus
                }
    except Exception as e:
        print(f"Error al leer el archivo de entrada: {str(e)}")
        return
    
    # Obtener las fechas_horas ordenadas cronológicamente
    fechas_horas = sorted(datos_por_fecha.keys())
    
    if len(fechas_horas) < 2:
        print("No hay suficientes fechas para comparar (se necesitan al menos 2 fechas distintas).")
        return
    
    # La fecha más antigua será nuestra referencia inicial
    fecha_referencia = fechas_horas[0]
    # La fecha más reciente será nuestra referencia final
    fecha_mas_reciente = fechas_horas[-1]
    
    print(f"Comparando la fecha más antigua ({fecha_referencia}) con la más reciente ({fecha_mas_reciente})")
    
    # Crear el archivo de salida
    try:
        with open(archivo_salida, 'w', newline='', encoding='utf-8') as f:
            campos = ['ENTE', 'FECHA INICIAL', 'FECHA FINAL', 'REGISTROS INICIALES', 'REGISTROS FINALES', 
                     'DIFERENCIA DE REGISTROS EN EL PERIODO', 'PORCENTAJE DE CAMBIO', 'OBSERVACIONES']
            escritor = csv.DictWriter(f, fieldnames=campos)
            escritor.writeheader()
            
            # Conjunto para almacenar todos los ENTES que aparecen en cualquiera de las dos fechas
            todos_entes = set()
            for fecha_hora in fechas_horas:
                for ente in datos_por_fecha[fecha_hora]:
                    todos_entes.add(ente)
            
            # Comparar cada ENTE entre la fecha más antigua y la más reciente
            for ente in todos_entes:
                observaciones = []
                
                # Información para fecha inicial
                fecha_inicial_usada = fecha_referencia
                if ente in datos_por_fecha[fecha_referencia]:
                    registros_inicial_valor = datos_por_fecha[fecha_referencia][ente]['TOTAL_REGISTROS']
                    fecha_ref = datos_por_fecha[fecha_referencia][ente]['FECHA_EJECUCION']
                    hora_ref = datos_por_fecha[fecha_referencia][ente]['HORA_EJECUCION']
                    ente_original_inicial = datos_por_fecha[fecha_referencia][ente]['ENTE_ORIGINAL']
                    
                    # Si tenemos ERROR, buscamos una fecha válida cercana
                    if registros_inicial_valor == 'ERROR':
                        fecha_alternativa, valor_alternativo, fecha_alt, hora_alt = encontrar_fecha_valida_cercana(
                            fechas_horas, datos_por_fecha, ente, fecha_referencia, buscar_anterior=False)
                        
                        if fecha_alternativa is not None:
                            registros_inicial = valor_alternativo
                            fecha_ref = fecha_alt
                            hora_ref = hora_alt
                            fecha_inicial_usada = fecha_alternativa
                            observaciones.append(f"Se usó fecha alternativa para datos iniciales: {fecha_alt} {hora_alt}")
                        else:
                            registros_inicial = "ERROR"
                            observaciones.append("No se encontró fecha con valores válidos para datos iniciales")
                    else:
                        registros_inicial = registros_inicial_valor
                else:
                    fecha_ref = fecha_referencia.split()[0]
                    hora_ref = fecha_referencia.split()[1]
                    ente_original_inicial = ente
                    
                    # Si el ente no existe en la fecha inicial, buscamos la primera fecha donde aparezca
                    for fecha_hora in fechas_horas:
                        if ente in datos_por_fecha[fecha_hora]:
                            valor = datos_por_fecha[fecha_hora][ente]['TOTAL_REGISTROS']
                            if isinstance(valor, int):
                                registros_inicial = valor
                                fecha_ref = datos_por_fecha[fecha_hora][ente]['FECHA_EJECUCION']
                                hora_ref = datos_por_fecha[fecha_hora][ente]['HORA_EJECUCION']
                                fecha_inicial_usada = fecha_hora
                                ente_original_inicial = datos_por_fecha[fecha_hora][ente]['ENTE_ORIGINAL']
                                observaciones.append(f"Ente no existente en fecha inicial. Se usó primera aparición: {fecha_ref} {hora_ref}")
                                break
                    else:
                        registros_inicial = "No disponible"
                        observaciones.append("Ente sin datos numéricos en ninguna fecha")
                
                # Información para fecha final
                fecha_final_usada = fecha_mas_reciente
                if ente in datos_por_fecha[fecha_mas_reciente]:
                    registros_final_valor = datos_por_fecha[fecha_mas_reciente][ente]['TOTAL_REGISTROS']
                    fecha_fin = datos_por_fecha[fecha_mas_reciente][ente]['FECHA_EJECUCION']
                    hora_fin = datos_por_fecha[fecha_mas_reciente][ente]['HORA_EJECUCION']
                    ente_original_final = datos_por_fecha[fecha_mas_reciente][ente]['ENTE_ORIGINAL']
                    
                    # Si tenemos ERROR, buscamos una fecha válida cercana
                    if registros_final_valor == 'ERROR':
                        fecha_alternativa, valor_alternativo, fecha_alt, hora_alt = encontrar_fecha_valida_cercana(
                            fechas_horas, datos_por_fecha, ente, fecha_mas_reciente, buscar_anterior=True)
                        
                        if fecha_alternativa is not None:
                            registros_final = valor_alternativo
                            fecha_fin = fecha_alt
                            hora_fin = hora_alt
                            fecha_final_usada = fecha_alternativa
                            observaciones.append(f"Se usó fecha alternativa para datos finales: {fecha_alt} {hora_alt}")
                        else:
                            registros_final = "ERROR"
                            observaciones.append("No se encontró fecha con valores válidos para datos finales")
                    else:
                        registros_final = registros_final_valor
                else:
                    fecha_fin = fecha_mas_reciente.split()[0]
                    hora_fin = fecha_mas_reciente.split()[1]
                    ente_original_final = ente
                    
                    # Si el ente no existe en la fecha final, buscamos la última fecha donde aparezca
                    for fecha_hora in reversed(fechas_horas):
                        if ente in datos_por_fecha[fecha_hora]:
                            valor = datos_por_fecha[fecha_hora][ente]['TOTAL_REGISTROS']
                            if isinstance(valor, int):
                                registros_final = valor
                                fecha_fin = datos_por_fecha[fecha_hora][ente]['FECHA_EJECUCION']
                                hora_fin = datos_por_fecha[fecha_hora][ente]['HORA_EJECUCION']
                                fecha_final_usada = fecha_hora
                                ente_original_final = datos_por_fecha[fecha_hora][ente]['ENTE_ORIGINAL']
                                observaciones.append(f"Ente no existente en fecha final. Se usó última aparición: {fecha_fin} {hora_fin}")
                                break
                    else:
                        registros_final = "No disponible"
                        observaciones.append("Ente sin datos numéricos en ninguna fecha")
                
                # Verificar que las fechas inicial y final sean diferentes
                if fecha_inicial_usada == fecha_final_usada and fecha_inicial_usada != fecha_referencia and fecha_final_usada != fecha_mas_reciente:
                    observaciones.append("Se usó la misma fecha para los datos iniciales y finales debido a falta de datos en otras fechas")
                
                # Calcular diferencia y porcentaje solo si ambos valores son numéricos
                if isinstance(registros_inicial, int) and isinstance(registros_final, int):
                    diferencia = registros_final - registros_inicial
                    
                    if registros_inicial > 0:
                        porcentaje = f"{(diferencia / registros_inicial) * 100:.2f}%"
                    else:
                        porcentaje = "∞%" if diferencia > 0 else "0%"
                else:
                    diferencia = "No calculable"
                    porcentaje = "No calculable"
                    if not isinstance(registros_inicial, int):
                        observaciones.append("No se puede calcular el cambio debido a falta de datos iniciales válidos")
                    if not isinstance(registros_final, int):
                        observaciones.append("No se puede calcular el cambio debido a falta de datos finales válidos")
                
                # Usar el nombre original más reciente disponible para el reporte
                nombre_reporte = ente_original_final if ente in datos_por_fecha[fecha_final_usada] else ente_original_inicial
                
                # Escribir fila en el archivo de salida
                escritor.writerow({
                    'ENTE': nombre_reporte,
                    'FECHA INICIAL': f"{fecha_ref} {hora_ref}",
                    'FECHA FINAL': f"{fecha_fin} {hora_fin}",
                    'REGISTROS INICIALES': registros_inicial,
                    'REGISTROS FINALES': registros_final,
                    'DIFERENCIA DE REGISTROS EN EL PERIODO': diferencia,
                    'PORCENTAJE DE CAMBIO': porcentaje,
                    'OBSERVACIONES': "; ".join(observaciones) if observaciones else "Sin observaciones"
                })
        
        print(f"Análisis completado. Resultados guardados en '{archivo_salida}'")
    except Exception as e:
        print(f"Error al escribir el archivo de salida: {str(e)}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python comparador.py <archivo_entrada.csv> <archivo_salida.csv>")
    else:
        analizar_cambios(sys.argv[1], sys.argv[2])