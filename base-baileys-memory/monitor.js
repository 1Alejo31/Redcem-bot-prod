const os = require('os');

// Función para formatear bytes a MB
const formatMemoryUsage = (bytes) => `${Math.round(bytes / 1024 / 1024 * 100) / 100} MB`;

// Función para calcular el costo mensual en Railway
const calculateMonthlyCost = (memoryGB, cpuUsage) => {
    // Precios de Railway: $10/GB/mes para RAM, $20/vCPU/mes para CPU
    const memoryCost = memoryGB * 10;
    const cpuCost = cpuUsage * 20;
    
    return {
        memoryCost,
        cpuCost,
        totalCost: memoryCost + cpuCost,
        // El plan Hobby incluye $5 de uso de recursos
        finalCost: Math.max(5, memoryCost + cpuCost)
    };
};

// Iniciar monitoreo
const startMonitoring = (intervalMs = 5000) => {
    console.log('Iniciando monitoreo de recursos...');
    console.log('Precios Railway: $10/GB/mes (RAM), $20/vCPU/mes (CPU)');
    
    // Variables para almacenar promedios
    let memoryReadings = [];
    let cpuReadings = [];
    let lastCpuUsage = process.cpuUsage();
    let lastMeasureTime = Date.now();
    
    // Función para medir CPU
    const measureCPU = () => {
        const currentTime = Date.now();
        const elapsedMs = currentTime - lastMeasureTime;
        const usage = process.cpuUsage(lastCpuUsage);
        
        // Convertir microsegundos a milisegundos y calcular porcentaje de uso
        const cpuPercent = (usage.user + usage.system) / 1000 / elapsedMs;
        
        lastCpuUsage = process.cpuUsage();
        lastMeasureTime = currentTime;
        
        return cpuPercent;
    };
    
    const interval = setInterval(() => {
        // Medir memoria
        const memoryData = process.memoryUsage();
        const memoryUsageMB = memoryData.rss / 1024 / 1024;
        memoryReadings.push(memoryUsageMB);
        
        // Medir CPU
        const cpuPercent = measureCPU();
        cpuReadings.push(cpuPercent);
        
        // Limitar el número de lecturas almacenadas (últimas 60 = 5 minutos con intervalo de 5s)
        if (memoryReadings.length > 60) {
            memoryReadings.shift();
            cpuReadings.shift();
        }
        
        // Calcular promedios
        const avgMemoryMB = memoryReadings.reduce((sum, val) => sum + val, 0) / memoryReadings.length;
        const avgMemoryGB = avgMemoryMB / 1024;
        const avgCpuUsage = cpuReadings.reduce((sum, val) => sum + val, 0) / cpuReadings.length;
        
        // Calcular costo estimado
        const costEstimate = calculateMonthlyCost(avgMemoryGB, avgCpuUsage);
        
        console.log(`\n--- Monitoreo de Recursos (${new Date().toLocaleTimeString()}) ---`);
        console.log(`Memoria actual: ${formatMemoryUsage(memoryData.rss)}`);
        console.log(`Memoria promedio: ${avgMemoryMB.toFixed(2)} MB (${avgMemoryGB.toFixed(4)} GB)`);
        console.log(`CPU actual: ${(cpuPercent * 100).toFixed(2)}%`);
        console.log(`CPU promedio: ${(avgCpuUsage * 100).toFixed(2)}%`);
        console.log('\n--- Estimación de Costos Mensuales en Railway ---');
        console.log(`Costo por RAM: $${costEstimate.memoryCost.toFixed(2)}/mes`);
        console.log(`Costo por CPU: $${costEstimate.cpuCost.toFixed(2)}/mes`);
        console.log(`Costo total estimado: $${costEstimate.totalCost.toFixed(2)}/mes`);
        console.log(`Costo final (Plan Hobby): $${costEstimate.finalCost.toFixed(2)}/mes`);
    }, intervalMs);
    
    return {
        stop: () => clearInterval(interval)
    };
};

// Exportar funciones
module.exports = {
    startMonitoring
};

// Si se ejecuta directamente este archivo
if (require.main === module) {
    startMonitoring(5000); // Monitoreo cada 5 segundos
}