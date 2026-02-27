// Function to calculate SweetSpot

/**
 * Calculates the SweetSpot based on the provided parameters.
 * @param {number} minSleepTime - The minimum sleep time in hours.
 * @param {number} maxSleepTime - The maximum sleep time in hours.
 * @param {number} sleepCycle - The average sleep cycle duration in minutes.
 * @returns {string} - The calculated SweetSpot time range in a readable format.
 */
function calculateSweetSpot(minSleepTime: number, maxSleepTime: number, sleepCycle: number): string {
    const cycleDurationInHours = sleepCycle / 60;
    const totalCycles = Math.floor((maxSleepTime - minSleepTime) / cycleDurationInHours);
    const optimalSleepDuration = totalCycles * cycleDurationInHours + minSleepTime;
    const sweetSpotStart = optimalSleepDuration - cycleDurationInHours;
    const sweetSpotEnd = optimalSleepDuration + cycleDurationInHours;
    return `SweetSpot: ${sweetSpotStart.toFixed(2)} hours to ${sweetSpotEnd.toFixed(2)} hours`;
}

// Example usage
console.log(calculateSweetSpot(7, 9, 90)); // Example parameters