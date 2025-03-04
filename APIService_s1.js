const fs = require("fs");
const path = require("path");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();
// Configuración
const CONFIG = {
  // Ruta donde se guardarán los archivos (modifica según necesites)
  outputPath: process.env.salida_s1,
  // Nombres de los archivos
  detailsFileName: "s1_declaraciones.csv",
  // URLs de la API
  providersUrl: process.env.url_proveedores_s1,
  searchUrl: process.env.url_busqueda_s1,
};

// Función para asegurar que exista el directorio
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Directorio creado: ${dirPath}`);
  }
}

// Función para obtener la fecha y hora actual en formato YYYY-MM-DD HH:MM
function getCurrentDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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

// Función para escribir en el archivo CSV
function appendToCSV(filePath, data) {
  const fileExists = fs.existsSync(filePath);

  // Si el archivo no existe, crear con encabezados
  if (!fileExists) {
    if (path.basename(filePath) === CONFIG.detailsFileName) {
      fs.writeFileSync(
        filePath,
        "FECHA_EJECUCION,ENTE_PUBLICO,TOTAL_REGISTROS,ESTATUS\n"
      );
    }
  }

  // Agregar datos
  fs.appendFileSync(filePath, data);
}

// Función principal
async function main() {
  const currentDateTime = getCurrentDateTime();

  try {
    // Verificar si las variables de entorno existen
    if (!process.env.salida_s1) {
      throw new Error("La variable de entorno 'salida_s1' no está definida");
    }

    if (!process.env.url_proveedores_s1) {
      throw new Error(
        "La variable de entorno 'url_proveedores_s1' no está definida"
      );
    }

    if (!process.env.url_busqueda_s1) {
      throw new Error(
        "La variable de entorno 'url_busqueda_s1' no está definida"
      );
    }

    // Asegurar que existe el directorio
    ensureDirectoryExists(CONFIG.outputPath);

    // Rutas completas a los archivos
    const detailsFilePath = path.join(
      CONFIG.outputPath,
      CONFIG.detailsFileName
    );

    // Obtener la lista de proveedores
    console.log("Obteniendo lista de proveedores...");
    const providersResponse = await axios.get(CONFIG.providersUrl);
    const providers = providersResponse.data;

    console.log(
      `Se encontraron ${providers.length} proveedores. Consultando datos para cada uno...`
    );

    // Procesar cada proveedor
    for (const provider of providers) {
      const supplierId = provider.supplier_id;
      console.log(`Consultando datos para: ${supplierId}`);

      try {
        // Construir el payload para la búsqueda
        const payload = {
          query: {
            nombres: "",
            primerApellido: "",
            segundoApellido: "",
            escolaridadNivel: "",
            nivelOrdenGobierno: "",
            nombreEntePublico: "",
            entidadFederativa: "",
            municipioAlcaldia: "",
            empleoCargoComision: "",
            nivelEmpleoCargoComision: "",
            superficieConstruccionMin: "",
            superficieConstruccionMax: "",
            superficieTerrenoMin: "",
            superficieTerrenoMax: "",
            valorAdquisicionMin: "",
            valorAdquisicionMax: "",
            formaAdquisicion: "",
            totalIngresosNetosMin: "",
            totalIngresosNetosMax: "",
          },
          sort: {},
          supplier_id: supplierId,
        };

        // Configurar los headers
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
        };

        // Realizar la búsqueda
        const searchResponse = await axios.post(CONFIG.searchUrl, payload, {
          headers,
        });

        // Obtener totalRows y verificar que sea un número
        const totalRows = searchResponse.data.pagination?.totalRows;

        // Verificar si totalRows es un número válido
        if (typeof totalRows !== "number" || isNaN(totalRows)) {
          const errorMessage = `El valor de totalRows no es un número: ${totalRows}`;
          console.error(`Error en ${supplierId}: ${errorMessage}`);

          // Crear línea para CSV usando nuestra función de formateo
          const csvLine =
            [
              formatCSVField(currentDateTime),
              formatCSVField(supplierId),
              formatCSVField("ERROR"),
              formatCSVField(
                `No disponible/El valor de totalRows no es un número: ${totalRows}`
              ),
            ].join(",") + "\n";

          appendToCSV(detailsFilePath, csvLine);
        } else {
          // Crear línea para CSV usando nuestra función de formateo
          const csvLine =
            [
              formatCSVField(currentDateTime),
              formatCSVField(supplierId),
              formatCSVField(totalRows),
              formatCSVField("Disponible"),
            ].join(",") + "\n";

          appendToCSV(detailsFilePath, csvLine);
          console.log(`${supplierId}: ${totalRows} filas`);
        }
      } catch (error) {
        console.error(`Error al consultar ${supplierId}:`, error.message);

        // Preparar mensaje de error para el CSV
        let errorMessage = error.message.replace(/\n/g, " ");

        // Agregar detalles adicionales si están disponibles
        if (error.response) {
          const responseInfo = `${error.response.status} ${error.response.statusText}`;
          errorMessage += ` (${responseInfo})`;
        }

        // Crear línea para CSV usando nuestra función de formateo
        const csvLine =
          [
            formatCSVField(currentDateTime),
            formatCSVField(supplierId),
            formatCSVField("ERROR"),
            formatCSVField(`No disponible/${errorMessage}`),
          ].join(",") + "\n";

        appendToCSV(detailsFilePath, csvLine);
      }

      // Pequeña pausa para no saturar la API
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`\nProceso completado.`);
    console.log(`Detalles guardados en: ${detailsFilePath}`);
  } catch (error) {
    console.error("Error general en el script:", error.message);

    try {
      // Asegurar que podemos escribir el error incluso si hay problemas con las variables de entorno
      const outputPath = CONFIG.outputPath || "./output";
      ensureDirectoryExists(outputPath);

      // Ruta completa al archivo CSV para registrar el error general
      const detailsFilePath = path.join(outputPath, CONFIG.detailsFileName);

      // Preparar mensaje de error para el CSV
      let errorMessage = error.message;

      // Agregar detalles adicionales si están disponibles
      if (error.response) {
        const responseInfo = `${error.response.status} ${error.response.statusText}`;
        errorMessage += ` (${responseInfo})`;
      }

      // Crear línea para CSV usando nuestra función de formateo
      const csvLine =
        [
          formatCSVField(currentDateTime),
          formatCSVField("ERROR_GENERAL"),
          formatCSVField("ERROR"),
          formatCSVField(`No disponible/${errorMessage}`),
        ].join(",") + "\n";

      appendToCSV(detailsFilePath, csvLine);
      console.error("Error registrado en el archivo CSV.");
    } catch (fileError) {
      console.error(
        "No se pudo registrar el error en el archivo CSV:",
        fileError.message
      );
    }
  }
}

// Ejecutar el script
main();
