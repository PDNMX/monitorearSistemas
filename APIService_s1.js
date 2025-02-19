const axios = require("axios");
const https = require("https");
const qs = require("qs");
const log4js = require("log4js");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Variables constantes para el nombre de los archivos
const sistema = "Sistema1"; // Variable para el primer archivo
const sistema_total = "SistemaTotal"; // Variable para el archivo acumulativo
const ruta_salida_archivos = "resultados_s1"; // Ruta de salida de los archivos

// Configuración de rutas y timeouts
const CONFIG = {
  ENDPOINTS_PATH: path.join(
    __dirname,
    "../EndPointsAPIS/EndPoints_s1/endpointsS1.json"
  ),
  RESULTS_DIR: path.join(__dirname, ruta_salida_archivos),
  TIMEOUT: 300000, // 5 minutos timeout general
  SFP_TIMEOUT: 600000, // 10 minutos para SFP
  MAX_RETRIES: 5,
  RETRY_DELAY: 30000, // 30 segundos entre reintentos
};

// Configurar logging
const logger = log4js.getLogger("numeralia");
logger.level = "all";

// Crear cliente específico para SFP y Puebla
const specialClient = axios.create({
  timeout: CONFIG.SFP_TIMEOUT,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
  decompress: true,
  validateStatus: function (status) {
    return status >= 200 && status < 500;
  },
  headers: {
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0",
  },
});

// Crear cliente general
const apiClient = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
  }),
  timeout: CONFIG.TIMEOUT,
});

// Función helper para obtener timestamp formateado
const getFormattedDate = () => {
  const date = new Date();
  return date.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

// Función helper para obtener fecha formateada para nombre de archivo
const getFileDate = () => {
  const date = new Date();
  return date.toISOString().split("T")[0].replace(/-/g, "");
};

// Función helper para esperar
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Función para reintento con delay
const retryOperation = async (
  operation,
  retries = CONFIG.MAX_RETRIES,
  delay = CONFIG.RETRY_DELAY
) => {
  let lastError;

  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (i < retries - 1) {
        logger.warn(
          `Intento ${i + 1} falló, reintentando en ${delay / 1000} segundos...`
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

// Función para hacer peticiones especiales (SFP y Puebla)
async function fetchSpecialData(supplier_id) {
  const url = "https://api.plataformadigitalnacional.org/s1/v1/search";
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
    TE: "trailers",
  };

  const data = {
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
    supplier_id: supplier_id === "PUEBLA" ? "Puebla" : supplier_id,
  };

  try {
    logger.info(`Iniciando petición a ${supplier_id}...`);
    const response = await specialClient({
      url,
      method: "POST",
      headers,
      data,
      validateStatus: function (status) {
        return status >= 200 && status < 500;
      },
    });

    if (response.data?.pagination?.totalRows !== undefined) {
      logger.info(
        `Petición a ${supplier_id} exitosa. Total de registros: ${response.data.pagination.totalRows}`
      );
    } else {
      logger.warn(
        `Respuesta de ${supplier_id} recibida pero sin datos de totalRows en pagination:`,
        response.data
      );
    }

    return response.data;
  } catch (error) {
    logger.error(
      `Error ${supplier_id} detallado: ${JSON.stringify(
        {
          message: error.message,
          code: error.code,
          response: error.response?.status,
          headers: error.response?.headers,
          data: error.response?.data,
        },
        null,
        2
      )}`
    );
    throw error;
  }
}

class APIService {
  constructor() {
    this.resultsDir = CONFIG.RESULTS_DIR;
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }

    // Inicializar archivos CSV
    this.dailyCSV = path.join(
      this.resultsDir,
      `resultados_${sistema}_${getFileDate()}.csv`
    );
    this.totalCSV = path.join(this.resultsDir, "registros_totales.csv");
    this.errorLogCSV = path.join(
      this.resultsDir,
      `errores_${getFileDate()}.csv`
    );
    this.accumulatedTotal = 0;

    // Crear archivos CSV si no existen
    this.initializeCSVFiles();
  }

  initializeCSVFiles() {
    // Crear archivo diario con encabezados
    if (!fs.existsSync(this.dailyCSV)) {
      fs.writeFileSync(
        this.dailyCSV,
        "Fecha,Proveedor,ID,Total_Registros,Sistema\n"
      );
    }

    // Crear archivo total con encabezados si no existe
    if (!fs.existsSync(this.totalCSV)) {
      fs.writeFileSync(this.totalCSV, "Fecha,Total_Registros,Sistema\n");
    }
  }

  async saveResult(data) {
    const { supplier_name, supplier_id, total_records, error } = data;
    const timestamp = getFormattedDate();

    if (!error) {
      // Asegurarse de que total_records sea una cadena
      const totalRecordsStr = String(total_records);

      // Guardar en archivo diario
      const dailyRow = `"${timestamp}","${supplier_name}","${supplier_id}","${totalRecordsStr}","${sistema}"\n`;
      await fs.promises.appendFile(this.dailyCSV, dailyRow);

      // Acumular total de registros
      const numericTotal = parseInt(totalRecordsStr.replace(/[^\d]/g, "")) || 0;
      this.accumulatedTotal += numericTotal;
    }

    if (error) {
      // Extraer información detallada del error
      const errorType = error.name || "Error";
      const errorMessage = error.message || "Unknown error";
      const httpCode = error.response?.status || "N/A";
      const errorDetails = JSON.stringify({
        stack: error.stack,
        config: error.config,
        responseData: error.response?.data,
      }).replace(/"/g, '""'); // Escapar comillas dobles para CSV

      // Guardar en archivo de errores
      const errorRow = `"${timestamp}","${supplier_name}","${supplier_id}","${errorType}","${errorMessage}","${httpCode}","${errorDetails}"\n`;
      await fs.promises.appendFile(this.errorLogCSV, errorRow);

      logger.error(
        `Error guardado para ${supplier_name} (${supplier_id}): ${errorMessage}`
      );
    }

    console.log(`
        Proveedor: ${supplier_name}
        ID: ${supplier_id}
        Total de registros: ${total_records}
        ${error ? `Error: ${error}` : ""}
        -------------------------------------------`);
  }

  async saveTotalResults() {
    const timestamp = getFormattedDate();
    const totalRow = `"${timestamp}","${this.accumulatedTotal.toLocaleString()}","${sistema_total}"\n`;
    await fs.promises.appendFile(this.totalCSV, totalRow);
    logger.info(`Total de registros guardado en ${this.totalCSV}`);
  }

  async getToken(endpoint) {
    const {
      supplier_id,
      supplier_name,
      token_url,
      username,
      password,
      client_id,
      client_secret,
      scope,
    } = endpoint;

    if (!token_url) {
      logger.warn(`No hay URL de token para ${supplier_name} (${supplier_id})`);
      return null;
    }

    const data = {
      grant_type: "password",
      username,
      password,
      client_id,
      client_secret,
      ...(scope && { scope }),
    };

    try {
      const response = await apiClient.post(
        token_url,
        decodeURI(qs.stringify(data)),
        {
          auth: {
            username: client_id,
            password: client_secret,
          },
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      return response;
    } catch (error) {
      logger.error(
        `Error obteniendo token para ${supplier_name} (${supplier_id}):`,
        error.message
      );
      return { error: error.message };
    }
  }

  async fetchData(endpoint) {
    const { supplier_id, supplier_name, url } = endpoint;

    if (!url && !["SFP", "PUEBLA"].includes(supplier_id)) {
      logger.warn(
        `No hay URL principal para ${supplier_name} (${supplier_id})`
      );
      return;
    }

    try {
      // Verificar si es un endpoint especial (SFP o PUEBLA)
      if (supplier_id === "SFP" || supplier_id === "PUEBLA") {
        logger.info(`Iniciando petición a ${supplier_id}...`);
        const operation = async () => {
          const result = await fetchSpecialData(supplier_id);
          logger.info(`Petición a ${supplier_id} completada exitosamente`);
          return result;
        };

        const result = await retryOperation(operation);
        const total_records = result.pagination?.totalRows ?? "No disponible";

        await this.saveResult({
          supplier_name:
            supplier_id === "PUEBLA"
              ? "Secretaría Ejecutiva del Sistema Anticorrupción del Estado de Puebla"
              : "Secretaría de la Función Pública",
          supplier_id,
          total_records: total_records.toLocaleString(),
        });
        return;
      }

      // Código para otros endpoints
      const tokenResponse = await this.getToken(endpoint);

      if (!tokenResponse || tokenResponse.error) {
        await this.saveResult({
          supplier_name,
          supplier_id,
          total_records: "No disponible",
          error: tokenResponse?.error || "Error obteniendo token",
        });
        return;
      }

      const { access_token } = tokenResponse.data;
      const response = await apiClient({
        url: url,
        method: "post",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          Authorization: `Bearer ${access_token}`,
        },
        data: {
          page: 1,
          pageSize: 1,
        },
      });

      const { pagination } = response.data;
      await this.saveResult({
        supplier_name,
        supplier_id,
        total_records: pagination?.totalRows ?? "No disponible",
      });
    } catch (error) {
      logger.error(
        `Error obteniendo datos para ${supplier_name} (${supplier_id}):`,
        error.message
      );

      await this.saveResult({
        supplier_name,
        supplier_id,
        total_records: "No disponible",
        error: error.message,
      });
    }
  }

  async checkEndpoints() {
    try {
      const startTimestamp = getFormattedDate();
      logger.info(`=== EJECUCIÓN INICIADA: ${startTimestamp} ===`);

      // Crear endpoints especiales
      const specialEndpoints = [
        {
          supplier_id: "SFP",
          supplier_name: "Secretaría de la Función Pública",
          url: "https://api.plataformadigitalnacional.org/s1/v1/search",
        },
        {
          supplier_id: "PUEBLA",
          supplier_name:
            "Secretaría Ejecutiva del Sistema Anticorrupción del Estado de Puebla",
          url: "https://api.plataformadigitalnacional.org/s1/v1/search",
        },
      ];

      // Obtener endpoints del archivo
      const endpointsData = JSON.parse(
        fs.readFileSync(CONFIG.ENDPOINTS_PATH, "utf8")
      );

      // Filtrar endpoints excluyendo SFP y PUEBLA
      const fileEndpoints = endpointsData.filter(
        (endpoint) =>
          endpoint.url && !["SFP", "PUEBLA"].includes(endpoint.supplier_id)
      );

      // Combinar todos los endpoints
      const allEndpoints = [...specialEndpoints, ...fileEndpoints];

      if (allEndpoints.length === 0) {
        logger.warn("No se encontraron endpoints válidos");
        return;
      }

      console.log(`Procesando ${allEndpoints.length} endpoints...\n`);

      // Reiniciar el total acumulado
      this.accumulatedTotal = 0;

      // Procesar endpoints especiales primero
      for (const endpoint of specialEndpoints) {
        await this.fetchData(endpoint);
      }

      // Procesar otros endpoints en grupos de 5 para evitar sobrecarga
      const chunkSize = 5;
      for (let i = 0; i < fileEndpoints.length; i += chunkSize) {
        const chunk = fileEndpoints.slice(i, i + chunkSize);
        await Promise.all(chunk.map((endpoint) => this.fetchData(endpoint)));
      }

      // Guardar el total en el archivo acumulativo
      await this.saveTotalResults();

      const endTimestamp = getFormattedDate();
      logger.info(`=== EJECUCIÓN FINALIZADA: ${endTimestamp} ===`);

      console.log(
        `\nProcesamiento de endpoints completado. Resultados guardados en:`
      );
      console.log(`- Archivo diario: ${this.dailyCSV}`);
      console.log(`- Archivo total: ${this.totalCSV}`);
    } catch (error) {
      logger.error("Error leyendo o procesando endpoints.json:", error.message);
    }
  }
}

// Ejecutar el script
async function main() {
  try {
    const apiService = new APIService();
    await apiService.checkEndpoints();
  } catch (error) {
    console.error("Error ejecutando script:", error);
  }
}

main();
