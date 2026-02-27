// calculateSweetSpot.ts

interface SleepQualityMetrics {
    sleepDuration: number; // in hours
    sleepEfficiency: number; // percentage
}

interface SweetSpotOptions {
    minSweetSpot: number; // minimum acceptable sleep duration
    maxSweetSpot: number; // maximum acceptable sleep duration
}

function calculateSweetSpot(metrics: SleepQualityMetrics, options: SweetSpotOptions): number {
    const { sleepDuration, sleepEfficiency } = metrics;

    // Base sweet spot calculation based on provided options
    let sweetSpot = (options.minSweetSpot + options.maxSweetSpot) / 2;

    // Adjust sweet spot based on sleep quality metrics
    if(sleepEfficiency < 85) {
        sweetSpot -= 0.5; // Decrease sweet spot for low efficiency
    } else if(sleepEfficiency > 90) {
        sweetSpot += 0.5; // Increase sweet spot for high efficiency
    }

    // Ensure sweet spot remains within defined limits
    sweetSpot = Math.max(sweetSpot, options.minSweetSpot);
    sweetSpot = Math.min(sweetSpot, options.maxSweetSpot);
    
    return sweetSpot;
}

export { calculateSweetSpot, SleepQualityMetrics, SweetSpotOptions };