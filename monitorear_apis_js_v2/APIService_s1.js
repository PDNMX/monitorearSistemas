const axios = require("axios");
const https = require("https");
const qs = require("qs");
const log4js = require("log4js");
const fs = require("fs");
const path = require("path");

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
  RESULTS_DIR: path.join(__dirname, ruta_salida_archivos), // Usar la variable ruta_salida_archivos
  TIMEOUT: 300000, // 5 minutos timeout general
  SFP_TIMEOUT: 600000, // 10 minutos para SFP
  MAX_RETRIES: 5,
  RETRY_DELAY: 30000, // 30 segundos entre reintentos
};

// Configurar logging
const logger = log4js.getLogger("numeralia");
logger.level = "all";

// Crear cliente específico para SFP
const sfpClient = axios.create({
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

// Función específica para la petición de SFP
async function fetchSFPData() {
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
    supplier_id: "SFP",
  };

  try {
    logger.info("Iniciando petición a SFP...");
    const response = await sfpClient({
      url,
      method: "POST",
      headers,
      data,
      validateStatus: function (status) {
        return status >= 200 && status < 500; // Acepta cualquier respuesta no 5xx
      },
    });

    if (response.data?.pagination?.totalRows !== undefined) {
      logger.info(
        `Petición a SFP exitosa. Total de registros: ${response.data.pagination.totalRows}`
      );
    } else {
      logger.warn(
        "Respuesta de SFP recibida pero sin datos de totalRows en pagination:",
        response.data
      );
    }

    return response.data;
  } catch (error) {
    logger.error(
      `Error SFP detallado: ${JSON.stringify(
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
    this.dailyCSV = path.join(
      this.resultsDir,
      `resultados_${getFileDate()}.csv`
    );
    this.totalCSV = path.join(this.resultsDir, "resultados_total.csv");
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
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
      // Guardar en archivo diario
      const dailyRow = `"${timestamp}","${supplier_name}","${supplier_id}","${total_records}","${sistema}"\n`;
      await fs.promises.appendFile(this.dailyCSV, dailyRow);

      // Acumular total de registros para el archivo total
      this.accumulatedTotal =
        (this.accumulatedTotal || 0) +
        (parseInt(total_records.replace(/,/g, "")) || 0);
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

    if (!url) {
      logger.warn(
        `No hay URL principal para ${supplier_name} (${supplier_id})`
      );
      return;
    }

    try {
      // Verificar si es el endpoint de SFP
      if (supplier_id === "SFP") {
        logger.info(`Iniciando petición a SFP...`);
        const operation = async () => {
          const result = await fetchSFPData();
          logger.info(`Petición a SFP completada exitosamente`);
          return result;
        };

        const result = await retryOperation(operation);
        const total_records = result.pagination?.totalRows ?? "No disponible";

        await this.saveResult({
          supplier_name,
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

      const endpointsData = JSON.parse(
        fs.readFileSync(CONFIG.ENDPOINTS_PATH, "utf8")
      );
      const validEndpoints = endpointsData.filter(
        (endpoint) => endpoint.url || endpoint.entities_url
      );

      if (validEndpoints.length === 0) {
        logger.warn("No se encontraron endpoints válidos con URLs requeridas");
        return;
      }

      console.log(`Procesando ${validEndpoints.length} endpoints...\n`);

      // Reiniciar el total acumulado
      this.accumulatedTotal = 0;

      // Procesar endpoints en grupos de 5 para evitar sobrecarga
      const chunkSize = 5;
      for (let i = 0; i < validEndpoints.length; i += chunkSize) {
        const chunk = validEndpoints.slice(i, i + chunkSize);
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
