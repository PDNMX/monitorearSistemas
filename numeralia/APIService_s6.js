const fs = require("fs");
const path = require("path");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

// Configuración
const CONFIG = {
  // Ruta donde se guardará el archivo (intenta usar la variable de entorno o el directorio por defecto)
  outputPath: process.env.salida_s6 || "./resultados_s6",
  // Nombre del archivo CSV
  csvFileName: "s6_contratos.csv",
  // URL de la API
  apiUrl:
    "https://api.plataformadigitalnacional.org/s6/api/v1/search?supplier_id=SHCP",
};

// Función para crear directorios de forma recursiva con manejo de errores
function ensureDirectoryExists(dirPath) {
  try {
    // Crear directorios recursivamente si no existen
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o777 });
      console.log(`Directorio creado: ${dirPath}`);
    }

    // Verificar si tenemos permisos de escritura
    fs.accessSync(dirPath, fs.constants.W_OK);
    return dirPath;
  } catch (error) {
    console.error(
      `Error al crear o acceder al directorio ${dirPath}: ${error.message}`
    );

    // Si hay un error de permisos, intentar con un directorio en la ubicación actual
    try {
      const alternativeDir = "./output";
      if (!fs.existsSync(alternativeDir)) {
        fs.mkdirSync(alternativeDir, { recursive: true, mode: 0o777 });
        console.log(`Usando directorio alternativo: ${alternativeDir}`);
      }
      return alternativeDir;
    } catch (fallbackError) {
      console.error(
        `Error al crear directorio alternativo: ${fallbackError.message}`
      );
      // Último recurso: usar el directorio actual
      return ".";
    }
  }
}

// Función para obtener la fecha actual en formato YYYY-MM-DD
function getCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Función para obtener la hora actual en formato HH:MM:SS
function getCurrentTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

// Función para formatear correctamente un campo CSV
function formatCSVField(value) {
  if (value === null || value === undefined) {
    return "";
  }

  // Convertir a string si no lo es ya
  const strValue = String(value);

  // Si contiene comillas, comas o saltos de línea, escapar las comillas y encerrar en comillas
  if (
    strValue.includes('"') ||
    strValue.includes(",") ||
    strValue.includes("\n")
  ) {
    return `"${strValue.replace(/"/g, '""')}"`;
  }

  return strValue;
}

// Función para escribir en el archivo CSV con manejo adecuado de errores
function appendToCSV(filePath, data) {
  try {
    const dirPath = path.dirname(filePath);

    // Asegurar que el directorio existe
    ensureDirectoryExists(dirPath);

    // Si el archivo no existe, crear con encabezados
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(
        filePath,
        "FECHA_EJECUCION,HORA_EJECUCION,TOTAL_REGISTROS,ESTATUS\n",
        { mode: 0o666 }
      );
      console.log(`Archivo CSV creado: ${filePath}`);
    }

    // Agregar datos
    fs.appendFileSync(filePath, data, { mode: 0o666 });
    console.log(`Datos agregados al archivo: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`Error al escribir en el archivo CSV: ${error.message}`);

    // Intentar escribir en un archivo con nombre alternativo en el directorio actual
    try {
      const altFileName = `s6_output_${Date.now()}.csv`;
      const altFilePath = path.join(".", altFileName);

      if (!fs.existsSync(altFilePath)) {
        fs.writeFileSync(
          altFilePath,
          "FECHA_EJECUCION,HORA_EJECUCION,TOTAL_REGISTROS,ESTATUS\n",
          { mode: 0o666 }
        );
      }

      fs.appendFileSync(altFilePath, data, { mode: 0o666 });
      console.log(`Datos agregados al archivo alternativo: ${altFilePath}`);
      return true;
    } catch (fallbackError) {
      console.error(
        `Error al escribir en archivo alternativo: ${fallbackError.message}`
      );
      return false;
    }
  }
}

// Función principal
async function main() {
  const currentDate = getCurrentDate();
  const currentTime = getCurrentTime();

  try {
    // Validar la URL antes de continuar
    if (!CONFIG.apiUrl || !CONFIG.apiUrl.startsWith("http")) {
      throw new Error(`URL inválida: ${CONFIG.apiUrl}`);
    }

    // Garantizar que el directorio de salida existe
    const outputDir = ensureDirectoryExists(CONFIG.outputPath);
    const csvFilePath = path.join(outputDir, CONFIG.csvFileName);

    console.log(`Directorio de salida: ${outputDir}`);
    console.log(`Archivo de salida: ${csvFilePath}`);
    console.log(`URL de la API: ${CONFIG.apiUrl}`);
    console.log("Consultando datos de la API S6...");

    // Configurar los headers para la petición
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Content-Type": "application/json",
      Origin: "https://www.plataformadigitalnacional.org",
      Connection: "keep-alive",
      Referer: "https://www.plataformadigitalnacional.org/",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      Priority: "u=0",
      "Content-Length": "0",
      TE: "trailers",
    };

    // Realizar la petición POST a la API
    const response = await axios.post(CONFIG.apiUrl, {}, { headers });
    const responseData = response.data;

    // Validar y obtener el campo 'total' desde la estructura pagination
    let totalRegistros = "";
    let status = "Disponible"; // Por defecto asumimos disponibilidad

    // Verificar si el campo pagination.total existe y es válido
    if (
      responseData &&
      responseData.pagination &&
      responseData.pagination.total !== undefined
    ) {
      if (
        typeof responseData.pagination.total === "number" &&
        !isNaN(responseData.pagination.total)
      ) {
        totalRegistros = responseData.pagination.total;
      } else {
        totalRegistros = "ERROR";
        status = `No disponible/El valor de total no es un número: ${responseData.pagination.total}`;
      }
    } else {
      totalRegistros = "ERROR";
      status =
        "No disponible/El campo pagination.total no existe en la respuesta";
    }

    console.log(`Total de registros encontrados: ${totalRegistros}`);

    // Crear línea para CSV usando nuestra función de formateo
    const csvLine =
      [
        formatCSVField(currentDate),
        formatCSVField(currentTime),
        formatCSVField(totalRegistros),
        formatCSVField(status),
      ].join(",") + "\n";

    // Agregar al archivo CSV
    const success = appendToCSV(csvFilePath, csvLine);

    if (success) {
      console.log(`\nProceso completado.`);
      console.log(`Datos guardados en: ${csvFilePath}`);
    } else {
      console.error(`No se pudo guardar la información en el archivo.`);
    }
  } catch (error) {
    console.error("Error en el script:", error.message);

    try {
      // Intentar crear un directorio de respaldo para los errores
      const errorDir = "./errors";
      ensureDirectoryExists(errorDir);

      // Preparar datos para registrar el error
      let errorMessage = error.message;
      if (error.response) {
        const responseInfo = `${error.response.status} ${error.response.statusText}`;
        errorMessage += ` (${responseInfo})`;
      }

      // Preparar línea CSV para el error
      const csvLine =
        [
          formatCSVField(currentDate),
          formatCSVField(currentTime),
          formatCSVField("ERROR"),
          formatCSVField(`No disponible/${errorMessage}`),
        ].join(",") + "\n";

      // Intentar guardar en el archivo original
      let csvFilePath = path.join(CONFIG.outputPath, CONFIG.csvFileName);
      let success = appendToCSV(csvFilePath, csvLine);

      // Si falla, intentar con un archivo en el directorio de errores
      if (!success) {
        csvFilePath = path.join(errorDir, `error_s6_${Date.now()}.csv`);
        success = appendToCSV(csvFilePath, csvLine);
      }

      if (success) {
        console.log(`Error registrado en: ${csvFilePath}`);
      } else {
        console.error("No se pudo registrar el error en ningún archivo.");
      }
    } catch (fileError) {
      console.error("Error al intentar registrar el error:", fileError.message);
      console.error("Error original:", error.message);
    }
  }
}

// Ejecutar el script
main();
