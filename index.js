#!/usr/bin/env node

const { exec } = require("child_process");
const path = require("path");
const dotenv = require("dotenv");

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, ".env") });

// Definir rutas relativas al directorio del proyecto
const SCRIPTS_DIR = path.join(__dirname, "numeralia");
const RESULTS_DIR = path.join(__dirname, "reports");

// Función para ejecutar un script con reintentos
async function executeScriptWithRetry(script, maxRetries = 3) {
  let attempts = 0;
  const scriptPath = path.join(SCRIPTS_DIR, script);

  while (attempts < maxRetries) {
    attempts++;
    try {
      console.log(
        `Ejecutando ${script} (intento ${attempts} de ${maxRetries})...`
      );

      const result = await new Promise((resolve, reject) => {
        // Ejecutar el script con la ruta completa
        exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error al ejecutar ${script}: ${error.message}`);
            return reject(error);
          }
          if (stderr) {
            console.error(`Error de stderr al ejecutar ${script}: ${stderr}`);
            return reject(new Error(stderr));
          }
          console.log(`Salida de ${script}: ${stdout}`);
          resolve(stdout);
        });
      });

      console.log(
        `${script} ejecutado correctamente en el intento ${attempts}`
      );
      return result;
    } catch (error) {
      console.error(`Error en el intento ${attempts} para ${script}`);

      if (attempts >= maxRetries) {
        console.error(
          `Se alcanzó el número máximo de intentos para ${script}`
        );
        return null;
      }

      // Esperar antes de reintentar (backoff exponencial)
      const waitTime = Math.pow(2, attempts) * 1000; // 2s, 4s, 8s...
      console.log(
        `Esperando ${waitTime / 1000} segundos antes de reintentar...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
}

// Ejecutar los scripts en secuencia
async function runScripts() {
  console.log(`Directorio de scripts: ${SCRIPTS_DIR}`);
  console.log(`Directorio de resultados: ${RESULTS_DIR}`);
  
  const scripts = [
    "APIService_s1.js",
    "APIService_s2.js",
    "APIService_s3.js",
    "APIService_s6.js",
  ];
  
  const results = [];
  let hasErrors = false;

  for (const script of scripts) {
    const result = await executeScriptWithRetry(script);
    results.push({ script, success: result !== null });

    if (result === null) {
      hasErrors = true;
    }
  }

  // Mostrar resumen de la ejecución
  console.log("\n----- Resumen de ejecución -----");
  results.forEach(({ script, success }) => {
    console.log(
      `${script}: ${
        success ? "ÉXITO" : "FALLÓ después de varios intentos"
      }`
    );
  });

  if (hasErrors) {
    console.log("\nAlgunos scripts fallaron incluso después de reintentar.");
    process.exit(1);
  } else {
    console.log("\nTodos los scripts se ejecutaron correctamente.");
    process.exit(0);
  }
}

// Ejecutar la función principal
runScripts().catch((error) => {
  console.error("Error fatal:", error);
  process.exit(1);
});