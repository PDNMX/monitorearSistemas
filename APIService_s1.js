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
  detailsFileName: "resultados_s1_declaraciones.csv",
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

// Función para obtener la fecha actual en formato YYYY-MM-DD
function getCurrentDate() {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

// Función para escribir en el archivo CSV
function appendToCSV(filePath, data) {
  const fileExists = fs.existsSync(filePath);

  // Si el archivo no existe, crear con encabezados
  if (!fileExists) {
    if (path.basename(filePath) === CONFIG.detailsFileName) {
      fs.writeFileSync(
        filePath,
        "FECHA_EJECUCION,ENTIDAD,TOTAL_REGISTROS,Error\n"
      );
    }
  }

  // Agregar datos
  fs.appendFileSync(filePath, data);
}

// Función principal
async function main() {
  const currentDate = getCurrentDate();

  try {
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

          // Escribir en el archivo de detalles con error
          const formattedError = String(totalRows)
            .replace(/,/g, " ")
            .replace(/\n/g, " ");
          const detailsLine = `${currentDate},"${supplierId}","ERROR","${formattedError}"\n`;
          appendToCSV(detailsFilePath, detailsLine);
        } else {
          // Escribir en el archivo de detalles sin error
          const detailsLine = `${currentDate},"${supplierId}",${totalRows}\n`;
          appendToCSV(detailsFilePath, detailsLine);
          console.log(`${supplierId}: ${totalRows} filas`);
        }
      } catch (error) {
        console.error(`Error al consultar ${supplierId}:`, error.message);

        // Escribir el error en el archivo de detalles
        const errorMessage = error.message
          .replace(/,/g, " ")
          .replace(/\n/g, " ");
        const detailsLine = `${currentDate},"${supplierId}","ERROR","${errorMessage}"\n`;
        appendToCSV(detailsFilePath, detailsLine);
      }

      // Pequeña pausa para no saturar la API
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`\nProceso completado.`);
    console.log(`Detalles guardados en: ${detailsFilePath}`);
  } catch (error) {
    console.error("Error general en el script:", error);
  }
}

// Ejecutar el script
main();
