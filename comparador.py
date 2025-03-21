import csv
import sys
from collections import defaultdict
import re
from datetime import datetime, timedelta

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

def analizar_cambios(fecha_inicio_str, fecha_fin_str, archivo_entrada, archivo_salida):
    """
    Analiza un archivo CSV con datos históricos y genera un reporte comparando
    el TOTAL_REGISTROS entre dos fechas específicas para cada ENTE_PUBLICO.
    
    Args:
        fecha_inicio_str: Fecha de inicio del periodo en formato YYYY-MM-DD
        fecha_fin_str: Fecha de fin del periodo en formato YYYY-MM-DD
        archivo_entrada: Ruta al archivo CSV de entrada
        archivo_salida: Ruta al archivo CSV de salida donde se guardarán los resultados
    """
    # Convertir fechas a objetos datetime para comparaciones más precisas
    fecha_inicio = datetime.strptime(fecha_inicio_str, "%Y-%m-%d")
    # Ajustar la fecha final para incluir todo el día
    fecha_fin = datetime.strptime(fecha_fin_str, "%Y-%m-%d") + timedelta(days=1) - timedelta(seconds=1)
    
    print(f"Analizando período: {fecha_inicio.strftime('%Y-%m-%d')} hasta {fecha_fin.strftime('%Y-%m-%d')}")
    
    # Estructura para almacenar los datos por ente y fecha
    datos_por_ente = defaultdict(list)
    
    # Leer el archivo de entrada
    try:
        with open(archivo_entrada, 'r', encoding='utf-8') as f:
            lector = csv.DictReader(f)
            for fila in lector:
                fecha = fila['FECHA_EJECUCION']
                hora = fila['HORA_EJECUCION']
                
                # Crear fecha completa como objeto datetime
                fecha_hora_obj = datetime.strptime(f"{fecha} {hora}", "%Y-%m-%d %H:%M:%S")
                
                # Verificar si la fecha está dentro del período especificado
                if fecha_inicio <= fecha_hora_obj <= fecha_fin:
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
                    
                    # Almacenar los datos en la lista correspondiente al ente
                    datos_por_ente[ente].append({
                        'FECHA_EJECUCION': fecha,
                        'HORA_EJECUCION': hora,
                        'FECHA_COMPLETA': fecha_hora_obj,
                        'ENTE_ORIGINAL': ente_original,
                        'TOTAL_REGISTROS': total_registros,
                        'ESTATUS': estatus
                    })
    except Exception as e:
        print(f"Error al leer el archivo de entrada: {str(e)}")
        return
    
    # Crear el archivo de salida
    try:
        with open(archivo_salida, 'w', newline='', encoding='utf-8') as f:
            campos = ['ENTE', 'FECHA INICIAL', 'FECHA FINAL', 'REGISTROS INICIALES', 'REGISTROS FINALES', 
                     'DIFERENCIA DE REGISTROS EN EL PERIODO', 'PORCENTAJE DE CAMBIO', 'OBSERVACIONES']
            escritor = csv.DictWriter(f, fieldnames=campos)
            escritor.writeheader()
            
            # Procesar cada ente que tiene datos en el período
            entes_procesados = 0
            for ente, registros in datos_por_ente.items():
                # Ordenar los registros por fecha
                registros.sort(key=lambda x: x['FECHA_COMPLETA'])
                
                # Si no hay registros para este ente en el período, continuar con el siguiente
                if not registros:
                    continue
                
                entes_procesados += 1
                observaciones = []
                
                # Obtener el primer y último registro del periodo
                primer_registro = registros[0]
                ultimo_registro = registros[-1]
                
                # Buscar el primer registro con valor numérico válido
                registro_inicial = None
                for reg in registros:
                    if isinstance(reg['TOTAL_REGISTROS'], int):
                        registro_inicial = reg
                        break
                
                # Si no encontramos un registro inicial válido, usar el primero pero marcar observación
                if registro_inicial is None:
                    registro_inicial = primer_registro
                    registros_inicial = "No disponible"
                    observaciones.append("No se encontró un valor numérico válido para la fecha inicial")
                else:
                    registros_inicial = registro_inicial['TOTAL_REGISTROS']
                
                # Buscar el último registro con valor numérico válido (en orden inverso)
                registro_final = None
                for reg in reversed(registros):
                    if isinstance(reg['TOTAL_REGISTROS'], int):
                        registro_final = reg
                        break
                
                # Si no encontramos un registro final válido, usar el último pero marcar observación
                if registro_final is None:
                    registro_final = ultimo_registro
                    registros_final = "No disponible"
                    observaciones.append("No se encontró un valor numérico válido para la fecha final")
                else:
                    registros_final = registro_final['TOTAL_REGISTROS']
                
                # Verificar si estamos usando el mismo registro para inicial y final
                if registro_inicial['FECHA_COMPLETA'] == registro_final['FECHA_COMPLETA']:
                    if len(registros) > 1:
                        observaciones.append("Solo se encontró un registro con valor numérico válido en el periodo")
                
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
                    
                # Usar el nombre original del registro final o inicial
                nombre_reporte = registro_final['ENTE_ORIGINAL']
                
                # Escribir fila en el archivo de salida
                escritor.writerow({
                    'ENTE': nombre_reporte,
                    'FECHA INICIAL': f"{registro_inicial['FECHA_EJECUCION']} {registro_inicial['HORA_EJECUCION']}",
                    'FECHA FINAL': f"{registro_final['FECHA_EJECUCION']} {registro_final['HORA_EJECUCION']}",
                    'REGISTROS INICIALES': registros_inicial,
                    'REGISTROS FINALES': registros_final,
                    'DIFERENCIA DE REGISTROS EN EL PERIODO': diferencia,
                    'PORCENTAJE DE CAMBIO': porcentaje,
                    'OBSERVACIONES': "; ".join(observaciones) if observaciones else "Sin observaciones"
                })
        
        print(f"Análisis completado. Se procesaron {entes_procesados} entes. Resultados guardados en '{archivo_salida}'")
    except Exception as e:
        print(f"Error al escribir el archivo de salida: {str(e)}")
        print(f"Detalles del error: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Uso: python comparador.py <fecha_inicio> <fecha_fin> <archivo_entrada.csv> <archivo_salida.csv>")
        print("Ejemplo: python comparador.py 2025-03-16 2025-03-20 datos.csv resultados.csv")
    else:
        fecha_inicio = sys.argv[1]
        fecha_fin = sys.argv[2]
        archivo_entrada = sys.argv[3]
        archivo_salida = sys.argv[4]
        
        # Validar formato de fechas
        try:
            datetime.strptime(fecha_inicio, "%Y-%m-%d")
            datetime.strptime(fecha_fin, "%Y-%m-%d")
        except ValueError:
            print("Error: Las fechas deben tener el formato YYYY-MM-DD (por ejemplo: 2025-03-16)")
            sys.exit(1)
            
        analizar_cambios(fecha_inicio, fecha_fin, archivo_entrada, archivo_salida)
