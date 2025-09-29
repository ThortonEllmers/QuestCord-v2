// Country coordinate data for server relocation feature
// Coordinates represent approximate geographic center of each country

const COUNTRIES = {
  // North America
  'United States': { lat: 39.8283, lon: -98.5795, continent: 'North America', cost: 5 },
  'Canada': { lat: 56.1304, lon: -106.3468, continent: 'North America', cost: 5 },
  'Mexico': { lat: 23.6345, lon: -102.5528, continent: 'North America', cost: 5 },
  
  // South America
  'Brazil': { lat: -14.2350, lon: -51.9253, continent: 'South America', cost: 5 },
  'Argentina': { lat: -38.4161, lon: -63.6167, continent: 'South America', cost: 5 },
  'Chile': { lat: -35.6751, lon: -71.5430, continent: 'South America', cost: 5 },
  'Colombia': { lat: 4.5709, lon: -74.2973, continent: 'South America', cost: 5 },
  'Peru': { lat: -9.1900, lon: -75.0152, continent: 'South America', cost: 5 },
  
  // Europe
  'United Kingdom': { lat: 55.3781, lon: -3.4360, continent: 'Europe', cost: 3 },
  'France': { lat: 46.6034, lon: 1.8883, continent: 'Europe', cost: 3 },
  'Germany': { lat: 51.1657, lon: 10.4515, continent: 'Europe', cost: 3 },
  'Italy': { lat: 41.8719, lon: 12.5674, continent: 'Europe', cost: 3 },
  'Spain': { lat: 40.4637, lon: -3.7492, continent: 'Europe', cost: 3 },
  'Russia': { lat: 61.5240, lon: 105.3188, continent: 'Europe/Asia', cost: 4 },
  'Poland': { lat: 51.9194, lon: 19.1451, continent: 'Europe', cost: 3 },
  'Netherlands': { lat: 52.1326, lon: 5.2913, continent: 'Europe', cost: 3 },
  'Switzerland': { lat: 46.8182, lon: 8.2275, continent: 'Europe', cost: 3 },
  'Sweden': { lat: 60.1282, lon: 18.6435, continent: 'Europe', cost: 3 },
  'Norway': { lat: 60.4720, lon: 8.4689, continent: 'Europe', cost: 3 },
  'Denmark': { lat: 56.2639, lon: 9.5018, continent: 'Europe', cost: 3 },
  'Finland': { lat: 61.9241, lon: 25.7482, continent: 'Europe', cost: 3 },
  'Austria': { lat: 47.5162, lon: 14.5501, continent: 'Europe', cost: 3 },
  'Belgium': { lat: 50.5039, lon: 4.4699, continent: 'Europe', cost: 3 },
  'Portugal': { lat: 39.3999, lon: -8.2245, continent: 'Europe', cost: 3 },
  'Greece': { lat: 39.0742, lon: 21.8243, continent: 'Europe', cost: 3 },
  'Czech Republic': { lat: 49.8175, lon: 15.4730, continent: 'Europe', cost: 3 },
  'Hungary': { lat: 47.1625, lon: 19.5033, continent: 'Europe', cost: 3 },
  'Romania': { lat: 45.9432, lon: 24.9668, continent: 'Europe', cost: 3 },
  'Ireland': { lat: 53.4129, lon: -8.2439, continent: 'Europe', cost: 3 },
  'Croatia': { lat: 45.1000, lon: 15.2000, continent: 'Europe', cost: 3 },
  'Ukraine': { lat: 48.3794, lon: 31.1656, continent: 'Europe', cost: 3 },
  
  // Asia
  'Japan': { lat: 36.2048, lon: 138.2529, continent: 'Asia', cost: 4 },
  'China': { lat: 35.8617, lon: 104.1954, continent: 'Asia', cost: 4 },
  'India': { lat: 20.5937, lon: 78.9629, continent: 'Asia', cost: 4 },
  'South Korea': { lat: 35.9078, lon: 127.7669, continent: 'Asia', cost: 4 },
  'Thailand': { lat: 15.8700, lon: 100.9925, continent: 'Asia', cost: 4 },
  'Vietnam': { lat: 14.0583, lon: 108.2772, continent: 'Asia', cost: 4 },
  'Singapore': { lat: 1.3521, lon: 103.8198, continent: 'Asia', cost: 4 },
  'Malaysia': { lat: 4.2105, lon: 101.9758, continent: 'Asia', cost: 4 },
  'Philippines': { lat: 12.8797, lon: 121.7740, continent: 'Asia', cost: 4 },
  'Indonesia': { lat: -0.7893, lon: 113.9213, continent: 'Asia', cost: 4 },
  'Turkey': { lat: 38.9637, lon: 35.2433, continent: 'Asia/Europe', cost: 4 },
  'Saudi Arabia': { lat: 23.8859, lon: 45.0792, continent: 'Asia', cost: 4 },
  'United Arab Emirates': { lat: 23.4241, lon: 53.8478, continent: 'Asia', cost: 4 },
  'Israel': { lat: 31.0461, lon: 34.8516, continent: 'Asia', cost: 4 },
  'Kazakhstan': { lat: 48.0196, lon: 66.9237, continent: 'Asia', cost: 4 },
  'Mongolia': { lat: 46.8625, lon: 103.8467, continent: 'Asia', cost: 4 },
  'Pakistan': { lat: 30.3753, lon: 69.3451, continent: 'Asia', cost: 4 },
  'Bangladesh': { lat: 23.6850, lon: 90.3563, continent: 'Asia', cost: 4 },
  'Sri Lanka': { lat: 7.8731, lon: 80.7718, continent: 'Asia', cost: 4 },
  'Myanmar': { lat: 21.9162, lon: 95.9560, continent: 'Asia', cost: 4 },
  'Cambodia': { lat: 12.5657, lon: 104.9910, continent: 'Asia', cost: 4 },
  'Laos': { lat: 19.8563, lon: 102.4955, continent: 'Asia', cost: 4 },
  'Nepal': { lat: 28.3949, lon: 84.1240, continent: 'Asia', cost: 4 },
  
  // Africa
  'South Africa': { lat: -30.5595, lon: 22.9375, continent: 'Africa', cost: 6 },
  'Egypt': { lat: 26.0975, lon: 30.0444, continent: 'Africa', cost: 6 },
  'Nigeria': { lat: 9.0820, lon: 8.6753, continent: 'Africa', cost: 6 },
  'Kenya': { lat: -0.0236, lon: 37.9062, continent: 'Africa', cost: 6 },
  'Morocco': { lat: 31.7917, lon: -7.0926, continent: 'Africa', cost: 6 },
  'Ghana': { lat: 7.9465, lon: -1.0232, continent: 'Africa', cost: 6 },
  'Ethiopia': { lat: 9.1450, lon: 40.4897, continent: 'Africa', cost: 6 },
  'Tanzania': { lat: -6.3690, lon: 34.8888, continent: 'Africa', cost: 6 },
  'Uganda': { lat: 1.3733, lon: 32.2903, continent: 'Africa', cost: 6 },
  'Zimbabwe': { lat: -19.0154, lon: 29.1549, continent: 'Africa', cost: 6 },
  'Botswana': { lat: -22.3285, lon: 24.6849, continent: 'Africa', cost: 6 },
  'Tunisia': { lat: 33.8869, lon: 9.5375, continent: 'Africa', cost: 6 },
  'Algeria': { lat: 28.0339, lon: 1.6596, continent: 'Africa', cost: 6 },
  'Cameroon': { lat: 7.3697, lon: 12.3547, continent: 'Africa', cost: 6 },
  
  // Oceania
  'Australia': { lat: -25.2744, lon: 133.7751, continent: 'Oceania', cost: 7 },
  'New Zealand': { lat: -41.2865, lon: 174.7762, continent: 'Oceania', cost: 7 },
  'Fiji': { lat: -16.5740, lon: 179.4144, continent: 'Oceania', cost: 7 },
  'Papua New Guinea': { lat: -6.3149, lon: 143.9555, continent: 'Oceania', cost: 7 },
  
  // Special/Premium Locations (Higher cost)
  'Iceland': { lat: 64.9631, lon: -19.0208, continent: 'Europe', cost: 8 },
  'Greenland': { lat: 71.7069, lon: -42.6043, continent: 'North America', cost: 10 },
  'Antarctica': { lat: -82.8628, lon: 135.0000, continent: 'Antarctica', cost: 15 },
  'Madagascar': { lat: -18.7669, lon: 46.8691, continent: 'Africa', cost: 8 },
  'Cuba': { lat: 21.5218, lon: -77.7812, continent: 'North America', cost: 6 },
  'Jamaica': { lat: 18.1096, lon: -77.2975, continent: 'North America', cost: 6 },
  'Puerto Rico': { lat: 18.2208, lon: -66.5901, continent: 'North America', cost: 6 },
};

// Get all countries grouped by continent
function getCountriesByContinent() {
  const grouped = {};
  for (const [name, data] of Object.entries(COUNTRIES)) {
    const continent = data.continent;
    if (!grouped[continent]) grouped[continent] = [];
    grouped[continent].push({ name, ...data });
  }
  
  // Sort each continent's countries alphabetically
  for (const continent in grouped) {
    grouped[continent].sort((a, b) => a.name.localeCompare(b.name));
  }
  
  return grouped;
}

// Get all countries as a flat list
function getAllCountries() {
  return Object.entries(COUNTRIES).map(([name, data]) => ({
    name,
    ...data
  })).sort((a, b) => a.name.localeCompare(b.name));
}

// Find countries by name (fuzzy matching)
function findCountries(search) {
  const searchLower = search.toLowerCase();
  return getAllCountries().filter(country => 
    country.name.toLowerCase().includes(searchLower)
  );
}

// Get country by exact name
function getCountry(name) {
  return COUNTRIES[name] ? { name, ...COUNTRIES[name] } : null;
}

// Get countries with cost <= maxCost
function getCountriesByCost(maxCost) {
  return getAllCountries().filter(country => country.cost <= maxCost);
}

// Helper function to calculate distance between two points
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Find the nearest country to given coordinates
function findNearestCountry(lat, lon, maxDistance = 2000) {
  let nearest = null;
  let minDistance = Infinity;
  
  for (const [name, data] of Object.entries(COUNTRIES)) {
    const distance = haversineDistance(lat, lon, data.lat, data.lon);
    if (distance < minDistance && distance <= maxDistance) {
      minDistance = distance;
      nearest = { name, ...data, distance };
    }
  }
  
  return nearest;
}

// Get country region/area (rough geographical boundaries)
function getCountryByCoordinates(lat, lon) {
  // This is a simplified approach - for more accuracy, you'd use proper country boundary data
  const nearest = findNearestCountry(lat, lon, 1000); // Within 1000km
  
  if (nearest && nearest.distance < 500) { // Within 500km is considered "in" the country
    return nearest;
  }
  
  return null;
}

module.exports = {
  COUNTRIES,
  getCountriesByContinent,
  getAllCountries,
  findCountries,
  getCountry,
  getCountriesByCost,
  findNearestCountry,
  getCountryByCoordinates
};