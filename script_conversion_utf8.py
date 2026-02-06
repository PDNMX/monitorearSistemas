#!/usr/bin/env python3
import csv
import re
import sys
import os

# Patrones de reemplazo específicos
replacements = {
    '+//3//Q-': 'é',
    '+AF8-': '_',
    'M+//3//Q-xico': 'México',
    'Michoac+//3//Q-n': 'Michoacán',
    'San Luis Potos+//3//Q-': 'San Luis Potosí'
}

def clean_file(input_file_path, output_file_name, sistema_origen):
    # Definir directorio de salida fijo
    output_dir = "resultados_convertidos_utf8"
    
    # Crear directorio de salida si no existe
    os.makedirs(output_dir, exist_ok=True)
    
    # Construir ruta completa de salida
    output_file_path = os.path.join(output_dir, output_file_name)
    
    try:
        with open(input_file_path, 'r') as infile, \
             open(output_file_path, 'w', newline='') as outfile:
            
            reader = csv.reader(infile)
            writer = csv.writer(outfile)
            
            # Leer la primera fila (encabezados)
            headers = next(reader, None)
            
            # Agregar el nuevo encabezado si existían encabezados
            if headers is not None:
                headers.append('sistema_origen')
                writer.writerow(headers)
            
            for row in reader:
                cleaned_row = []
                for cell in row:
                    # Aplicar todos los reemplazos
                    for pattern, replacement in replacements.items():
                        cell = cell.replace(pattern, replacement)
                    cleaned_row.append(cell)
                
                # Agregar el valor de sistema_origen a cada fila
                cleaned_row.append(sistema_origen)
                writer.writerow(cleaned_row)
        
        print(f"Archivo procesado correctamente. Resultado guardado en: {output_file_path}")
        return True
    
    except Exception as e:
        print(f"Error al procesar los archivos: {str(e)}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Uso: python script.py <ruta_completa_archivo_entrada> <nombre_archivo_salida> <valor_sistema_origen>")
        print("Ejemplo: python script.py /home/datos/entrada.csv salida_limpia.csv SISTEMA1")
        sys.exit(1)
    
    input_file_path = sys.argv[1]
    output_file_name = sys.argv[2]
    sistema_origen = sys.argv[3]
    
    # Procesar archivo
    success = clean_file(input_file_path, output_file_name, sistema_origen)
    
    if not success:
        sys.exit(1)