// index.js
const { exec } = require("child_process");

// Función para ejecutar un script con reintentos
async function executeScriptWithRetry(script, maxRetries = 3) {
  let attempts = 0;

  while (attempts < maxRetries) {
    attempts++;
    try {
      console.log(
        `Ejecutando ${script} (intento ${attempts} de ${maxRetries})...`
      );

      const result = await new Promise((resolve, reject) => {
        exec(`node ${script}`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error al ejecutar ${script}: ${error.message}`);
            return reject(error);
          }
          if (stderr) {
            console.error(`Error de stderr al ejecutar ${script}: ${stderr}`);
            return reject(stderr);
          }
          console.log(`Salida de ${script}: ${stdout}`);
          resolve(stdout);
        });
      });

      console.log(
        `${script} ejecutado correctamente en el intento ${attempts}`
      );
      return result; // Si se ejecuta correctamente, devuelve el resultado y termina la función
    } catch (error) {
      console.error(`Error en el intento ${attempts} para ${script}`);

      if (attempts >= maxRetries) {
        console.error(`Se alcanzó el número máximo de intentos para ${script}`);
        // No lanzamos el error, continuamos con el siguiente script
        return null;
      }

      // Esperamos un momento antes de volver a intentar (backoff exponencial)
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
  const scripts = ["APIService_s1.js", "APIService_s2.js", "APIService_s3.js"];
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
      `${script}: ${success ? "ÉXITO" : "FALLÓ después de varios intentos"}`
    );
  });

  if (hasErrors) {
    console.log("\nAlgunos scripts fallaron incluso después de reintentar.");
  } else {
    console.log("\nTodos los scripts se ejecutaron correctamente.");
  }
}

// Ejecutar la función principal
runScripts();
