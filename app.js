// ==================== BETTER BEEN - Travel Tracker App ====================
// Uses real APIs: Natural Earth GeoJSON, RestCountries, GeoNames

// ==================== SUPABASE CONFIG ====================
// Credentials loaded from config.js (keep that file out of git)
const SUPABASE_URL = typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG.url : '';
const SUPABASE_ANON_KEY = typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG.anonKey : '';

let supabaseClient = null;
let currentUser = null;

// Initialize Supabase
function initSupabase() {
    if (typeof window.supabase !== 'undefined' && SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        // Listen for auth state changes
        supabaseClient.auth.onAuthStateChange((event, session) => {
            currentUser = session?.user || null;
            updateAuthUI();
            
            if (event === 'SIGNED_IN') {
                // Close auth modal and restore close button
                showAuthCloseButton();
                document.getElementById('auth-modal')?.classList.remove('active');
                loadUserData();
            } else if (event === 'SIGNED_OUT') {
                // Clear state and reload from localStorage
                state.visitedCountries.clear();
                state.visitedCities.clear();
                state.recentVisits = [];
                loadState();
                updateMapStyles();
                updateAllStats();
                renderListView();
                
                // Close logout modal and show login modal
                closeLogoutModal();
                setTimeout(() => forceShowAuthModal(), 300);
            }
        });
        
        // Check current session
        checkSession();
    }
}

async function checkSession() {
    if (!supabaseClient) return;
    
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user || null;
    updateAuthUI();
    
    if (currentUser) {
        loadUserData();
    } else {
        // Always show login modal if user is not signed in
        setTimeout(() => {
            if (!currentUser) {
                forceShowAuthModal();
            }
        }, 500);
    }
}

function forceShowAuthModal() {
    // Close any other modals first
    document.getElementById('logout-modal')?.classList.remove('active');
    document.getElementById('country-modal')?.classList.remove('active');
    
    // Show auth modal and hide close button (user must sign in)
    const modal = document.getElementById('auth-modal');
    const closeBtn = document.getElementById('auth-modal-close');
    if (closeBtn) closeBtn.style.display = 'none';
    
    modal.classList.add('active');
    setAuthMode('signin');
}

// Show close button after successful login
function showAuthCloseButton() {
    const closeBtn = document.getElementById('auth-modal-close');
    if (closeBtn) closeBtn.style.display = '';
}

function updateAuthUI() {
    const authBtn = document.getElementById('auth-btn');
    const authBtnText = document.getElementById('auth-btn-text');
    
    if (!authBtn) return;
    
    if (currentUser) {
        authBtn.classList.add('logged-in');
        authBtnText.textContent = currentUser.email.split('@')[0];
        authBtn.title = currentUser.email;
    } else {
        authBtn.classList.remove('logged-in');
        authBtnText.textContent = 'Sign in';
        authBtn.title = 'Sign in';
    }
}

// ==================== AUTH MODAL ====================
function openAuthModal() {
    if (currentUser) {
        // Show logout confirmation
        openLogoutModal();
        return;
    }
    
    closeAllModals();
    const modal = document.getElementById('auth-modal');
    modal.classList.add('active');
    setAuthMode('signin');
}

// ==================== LOGOUT CONFIRMATION ====================
function openLogoutModal() {
    closeAuthModal(); // Close auth modal if open
    document.getElementById('logout-modal').classList.add('active');
}

function closeLogoutModal() {
    document.getElementById('logout-modal').classList.remove('active');
}

function closeAllModals() {
    document.getElementById('logout-modal')?.classList.remove('active');
    document.getElementById('auth-modal')?.classList.remove('active');
    document.getElementById('country-modal')?.classList.remove('active');
}

function closeAuthModal() {
    // Don't allow closing if user isn't logged in - they must sign in
    if (!currentUser) {
        return;
    }
    const modal = document.getElementById('auth-modal');
    modal.classList.remove('active');
    clearAuthError();
}

function setAuthMode(mode) {
    const title = document.getElementById('auth-modal-title');
    const submitBtn = document.getElementById('auth-submit');
    const switchText = document.getElementById('auth-switch-text');
    const switchBtn = document.getElementById('auth-switch-btn');
    
    if (mode === 'signin') {
        title.textContent = 'Sign In';
        submitBtn.textContent = 'Sign In';
        switchText.textContent = "Don't have an account?";
        switchBtn.textContent = 'Sign Up';
        switchBtn.dataset.mode = 'signup';
    } else {
        title.textContent = 'Sign Up';
        submitBtn.textContent = 'Create Account';
        switchText.textContent = 'Already have an account?';
        switchBtn.textContent = 'Sign In';
        switchBtn.dataset.mode = 'signin';
    }
}

function showAuthError(message) {
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = message;
    errorEl.classList.add('active');
}

function clearAuthError() {
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = '';
    errorEl.classList.remove('active');
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    
    if (!supabaseClient) {
        showAuthError('Supabase not configured. Please add your credentials.');
        return;
    }
    
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const submitBtn = document.getElementById('auth-submit');
    const isSignUp = submitBtn.textContent === 'Create Account';
    
    submitBtn.disabled = true;
    clearAuthError();
    
    try {
        let result;
        
        if (isSignUp) {
            result = await supabaseClient.auth.signUp({ email, password });
        } else {
            result = await supabaseClient.auth.signInWithPassword({ email, password });
        }
        
        if (result.error) {
            showAuthError(result.error.message);
        } else {
            closeAuthModal();
            if (isSignUp) {
                alert('Check your email for the confirmation link!');
            }
        }
    } catch (error) {
        showAuthError(error.message);
    } finally {
        submitBtn.disabled = false;
    }
}


async function signOut() {
    if (!supabaseClient) return;
    
    await supabaseClient.auth.signOut();
    currentUser = null;
    updateAuthUI();
}

// ==================== USER DATA SYNC ====================
async function loadUserData() {
    if (!supabaseClient || !currentUser) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('travel_data')
            .select('*')
            .eq('user_id', currentUser.id)
            .single();
        
        if (data) {
            state.visitedCountries = new Set(data.countries || []);
            state.visitedCities = new Map(
                Object.entries(data.cities || {}).map(([k, v]) => [k, new Set(v)])
            );
            state.recentVisits = data.recent_visits || [];
            
            updateMapStyles();
            updateAllStats();
            renderListView();
        }
    } catch (error) {
        console.log('No existing data found, starting fresh');
    }
}

async function saveUserData() {
    if (!supabaseClient || !currentUser) {
        // Fall back to localStorage
        saveState();
        return;
    }
    
    const citiesObj = {};
    state.visitedCities.forEach((cities, country) => {
        citiesObj[country] = [...cities];
    });
    
    try {
        const { error } = await supabaseClient
            .from('travel_data')
            .upsert({
                user_id: currentUser.id,
                countries: [...state.visitedCountries],
                cities: citiesObj,
                recent_visits: state.recentVisits,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            });
        
        if (error) {
            console.error('Error saving to Supabase:', error);
            saveState(); // Fallback to localStorage
        }
    } catch (error) {
        console.error('Error saving to Supabase:', error);
        saveState(); // Fallback to localStorage
    }
}

// ==================== THEME ====================
function initTheme() {
    const savedColor = localStorage.getItem('been-accent-color') || '#0a0a0a';
    applyThemeColor(savedColor);
    
    const colorPicker = document.getElementById('color-picker');
    if (colorPicker) {
        colorPicker.value = savedColor;
        colorPicker.addEventListener('input', (e) => {
            applyThemeColor(e.target.value);
            localStorage.setItem('been-accent-color', e.target.value);
            // Update map with new colors
            if (state.geoJsonLayer) {
                updateMapStyles();
            }
        });
    }
}

function applyThemeColor(color) {
    const root = document.documentElement;
    
    // Calculate if the color is light or dark
    const rgb = hexToRgb(color);
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    const isLight = luminance > 0.5;
    
    // Set the accent color
    root.style.setProperty('--accent', color);
    root.style.setProperty('--map-visited', color);
    root.style.setProperty('--map-hover', isLight ? darkenColor(color, 20) : lightenColor(color, 30));
    
    // Update stats bar background
    root.style.setProperty('--stats-bar-bg', color);
    root.style.setProperty('--stats-bar-text', isLight ? '#0a0a0a' : '#ffffff');
    
    // Update button active states
    root.style.setProperty('--btn-active-bg', color);
    root.style.setProperty('--btn-active-text', isLight ? '#0a0a0a' : '#ffffff');
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

function lightenColor(hex, percent) {
    const rgb = hexToRgb(hex);
    const r = Math.min(255, rgb.r + (255 - rgb.r) * (percent / 100));
    const g = Math.min(255, rgb.g + (255 - rgb.g) * (percent / 100));
    const b = Math.min(255, rgb.b + (255 - rgb.b) * (percent / 100));
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function darkenColor(hex, percent) {
    const rgb = hexToRgb(hex);
    const r = rgb.r * (1 - percent / 100);
    const g = rgb.g * (1 - percent / 100);
    const b = rgb.b * (1 - percent / 100);
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

// ==================== CONFIGURATION ====================
const CONFIG = {
    GEOJSON_URL: 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson',
    REST_COUNTRIES_URL: 'https://restcountries.com/v3.1',
    // GeoNames API - registered account (20,000 credits/day)
    GEONAMES_USERNAME: 'arnaav',
    TOTAL_COUNTRIES: 195,
    MAP_CENTER: [20, 0],
    MAP_ZOOM: 2,
    MAP_MIN_ZOOM: 1,
    MAP_MAX_ZOOM: 8
};

// ==================== STATE ====================
const state = {
    visitedCountries: new Set(),
    visitedCities: new Map(), // Map<countryCode, Set<cityName>>
    countriesData: [], // From RestCountries API
    geoJsonData: null, // World GeoJSON
    map: null, // Leaflet map instance
    geoJsonLayer: null,
    currentCountry: null,
    currentFilter: 'all',
    recentVisits: [] // Track order of visits
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    closeAllModals(); // Ensure all modals are closed on start
    initSupabase();
    showLoadingState();
    await Promise.all([
        loadState(),
        fetchCountriesData(),
        initMap()
    ]);
    attachEventListeners();
    attachAuthListeners();
    updateAllStats();
    hideLoadingState();
});

function attachAuthListeners() {
    // Auth button
    document.getElementById('auth-btn')?.addEventListener('click', openAuthModal);
    
    // Close auth modal
    document.getElementById('auth-modal-close')?.addEventListener('click', closeAuthModal);
    document.getElementById('auth-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'auth-modal') closeAuthModal();
    });
    
    // Auth form
    document.getElementById('auth-form')?.addEventListener('submit', handleAuthSubmit);
    
    // Switch between sign in/sign up
    document.getElementById('auth-switch-btn')?.addEventListener('click', function() {
        setAuthMode(this.dataset.mode);
    });
    
    // Logout confirmation modal
    document.getElementById('logout-modal-close')?.addEventListener('click', closeLogoutModal);
    document.getElementById('logout-cancel')?.addEventListener('click', closeLogoutModal);
    document.getElementById('logout-confirm')?.addEventListener('click', () => {
        closeLogoutModal();
        signOut();
    });
    document.getElementById('logout-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'logout-modal') closeLogoutModal();
    });
}

function showLoadingState() {
    document.body.style.opacity = '0.5';
    document.body.style.pointerEvents = 'none';
}

function hideLoadingState() {
    document.body.style.opacity = '1';
    document.body.style.pointerEvents = 'auto';
}

// ==================== API CALLS ====================

// Fetch all countries data from RestCountries API
async function fetchCountriesData() {
    try {
        const response = await fetch(`${CONFIG.REST_COUNTRIES_URL}/all?fields=name,cca2,cca3,flags,region,subregion,population,capital`);
        if (!response.ok) throw new Error('Failed to fetch countries');
        state.countriesData = await response.json();
        console.log(`Loaded ${state.countriesData.length} countries from API`);
    } catch (error) {
        console.error('Error fetching countries data:', error);
        state.countriesData = [];
    }
}

// Fetch cities for a country from GeoNames API
async function fetchCitiesForCountry(countryCode) {
    try {
        // GeoNames API for cities with population > 15000
        const response = await fetch(
            `https://secure.geonames.org/searchJSON?country=${countryCode}&featureClass=P&maxRows=100&orderby=population&username=${CONFIG.GEONAMES_USERNAME}`
        );
        
        if (!response.ok) throw new Error('Failed to fetch cities');
        
        const data = await response.json();
        
        if (data.geonames && data.geonames.length > 0) {
            return data.geonames.map(city => ({
                name: city.name,
                population: city.population,
                adminName: city.adminName1 || ''
            }));
        }
        
        // Fallback: try alternative endpoint
        return await fetchCitiesFallback(countryCode);
    } catch (error) {
        console.error('Error fetching cities:', error);
        return await fetchCitiesFallback(countryCode);
    }
}

// Fallback cities data using a public database
async function fetchCitiesFallback(countryCode) {
    try {
        // Use the countrystatecity.in public JSON files from GitHub
        const response = await fetch(
            `https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/cities.json`
        );
        
        if (!response.ok) {
            // Return major cities as ultimate fallback
            return getMajorCitiesFallback(countryCode);
        }
        
        const allCities = await response.json();
        const countryCities = allCities.filter(city => city.country_code === countryCode);
        
        return countryCities.slice(0, 100).map(city => ({
            name: city.name,
            population: 0,
            adminName: city.state_name || ''
        }));
    } catch (error) {
        console.error('Cities fallback failed:', error);
        return getMajorCitiesFallback(countryCode);
    }
}

// Ultimate fallback with major world cities
function getMajorCitiesFallback(countryCode) {
    const majorCities = {
        'US': ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Indianapolis', 'Charlotte', 'San Francisco', 'Seattle', 'Denver', 'Washington', 'Boston', 'Nashville', 'Las Vegas', 'Portland', 'Miami'],
        'GB': ['London', 'Birmingham', 'Manchester', 'Glasgow', 'Liverpool', 'Bristol', 'Sheffield', 'Leeds', 'Edinburgh', 'Leicester', 'Coventry', 'Bradford', 'Cardiff', 'Belfast', 'Nottingham', 'Kingston upon Hull', 'Newcastle upon Tyne', 'Stoke-on-Trent', 'Southampton', 'Derby'],
        'FR': ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg', 'Montpellier', 'Bordeaux', 'Lille', 'Rennes', 'Reims', 'Saint-Étienne', 'Toulon', 'Le Havre', 'Grenoble', 'Dijon', 'Angers', 'Nîmes', 'Villeurbanne'],
        'DE': ['Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt', 'Stuttgart', 'Düsseldorf', 'Leipzig', 'Dortmund', 'Essen', 'Bremen', 'Dresden', 'Hanover', 'Nuremberg', 'Duisburg', 'Bochum', 'Wuppertal', 'Bielefeld', 'Bonn', 'Münster'],
        'JP': ['Tokyo', 'Yokohama', 'Osaka', 'Nagoya', 'Sapporo', 'Fukuoka', 'Kobe', 'Kawasaki', 'Kyoto', 'Saitama', 'Hiroshima', 'Sendai', 'Chiba', 'Kitakyushu', 'Sakai', 'Niigata', 'Hamamatsu', 'Shizuoka', 'Okayama', 'Kumamoto'],
        'CN': ['Shanghai', 'Beijing', 'Shenzhen', 'Guangzhou', 'Chengdu', 'Tianjin', 'Wuhan', 'Dongguan', 'Chongqing', 'Nanjing', 'Hangzhou', 'Shenyang', 'Xi\'an', 'Harbin', 'Suzhou', 'Qingdao', 'Dalian', 'Zhengzhou', 'Jinan', 'Changsha'],
        'IN': ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Ahmedabad', 'Chennai', 'Kolkata', 'Surat', 'Pune', 'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Visakhapatnam', 'Pimpri-Chinchwad', 'Patna', 'Vadodara'],
        'BR': ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza', 'Belo Horizonte', 'Manaus', 'Curitiba', 'Recife', 'Goiânia', 'Belém', 'Porto Alegre', 'Guarulhos', 'Campinas', 'São Luís', 'São Gonçalo', 'Maceió', 'Duque de Caxias', 'Natal', 'Campo Grande'],
        'AU': ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast', 'Canberra', 'Newcastle', 'Wollongong', 'Logan City', 'Geelong', 'Hobart', 'Townsville', 'Cairns', 'Darwin', 'Toowoomba', 'Ballarat', 'Bendigo', 'Launceston', 'Mackay'],
        'CA': ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg', 'Quebec City', 'Hamilton', 'Kitchener', 'London', 'Victoria', 'Halifax', 'Oshawa', 'Windsor', 'Saskatoon', 'Regina', 'St. Catharines', 'Kelowna', 'Barrie'],
        'IT': ['Rome', 'Milan', 'Naples', 'Turin', 'Palermo', 'Genoa', 'Bologna', 'Florence', 'Bari', 'Catania', 'Venice', 'Verona', 'Messina', 'Padua', 'Trieste', 'Brescia', 'Parma', 'Taranto', 'Prato', 'Modena'],
        'ES': ['Madrid', 'Barcelona', 'Valencia', 'Seville', 'Zaragoza', 'Málaga', 'Murcia', 'Palma', 'Las Palmas', 'Bilbao', 'Alicante', 'Córdoba', 'Valladolid', 'Vigo', 'Gijón', 'Hospitalet de Llobregat', 'A Coruña', 'Granada', 'Vitoria-Gasteiz', 'Elche'],
        'MX': ['Mexico City', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana', 'León', 'Zapopan', 'Ciudad Juárez', 'Mérida', 'San Luis Potosí', 'Aguascalientes', 'Hermosillo', 'Saltillo', 'Mexicali', 'Culiacán', 'Querétaro', 'Morelia', 'Chihuahua', 'Cancún', 'Acapulco'],
        'RU': ['Moscow', 'Saint Petersburg', 'Novosibirsk', 'Yekaterinburg', 'Kazan', 'Nizhny Novgorod', 'Chelyabinsk', 'Samara', 'Omsk', 'Rostov-on-Don', 'Ufa', 'Krasnoyarsk', 'Voronezh', 'Perm', 'Volgograd', 'Krasnodar', 'Saratov', 'Tyumen', 'Tolyatti', 'Izhevsk'],
        'KR': ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Daejeon', 'Gwangju', 'Suwon', 'Ulsan', 'Changwon', 'Seongnam', 'Goyang', 'Yongin', 'Bucheon', 'Ansan', 'Cheongju', 'Anyang', 'Jeonju', 'Cheonan', 'Namyangju', 'Hwaseong']
    };
    
    const cities = majorCities[countryCode] || [];
    return cities.map(name => ({ name, population: 0, adminName: '' }));
}

// ==================== MAP INITIALIZATION ====================
async function initMap() {
    // Create Leaflet map
    state.map = L.map('world-map', {
        center: CONFIG.MAP_CENTER,
        zoom: CONFIG.MAP_ZOOM,
        minZoom: CONFIG.MAP_MIN_ZOOM,
        maxZoom: CONFIG.MAP_MAX_ZOOM,
        zoomControl: false,
        attributionControl: false,
        worldCopyJump: true,
        boxZoom: false,
        keyboard: false
    });

    // Add a simple tile layer as background (optional - white background)
    // L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png').addTo(state.map);

    // Load and render GeoJSON
    try {
        const response = await fetch(CONFIG.GEOJSON_URL);
        if (!response.ok) throw new Error('Failed to fetch GeoJSON');
        
        state.geoJsonData = await response.json();
        
        state.geoJsonLayer = L.geoJSON(state.geoJsonData, {
            style: getCountryStyle,
            onEachFeature: onEachCountry
        }).addTo(state.map);

        console.log('Map initialized with', state.geoJsonData.features.length, 'countries');
    } catch (error) {
        console.error('Error loading map:', error);
        document.getElementById('world-map').innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #888;">
                <p>Error loading map. Please refresh the page.</p>
            </div>
        `;
    }
}

function getCountryStyle(feature) {
    const countryName = getCountryName(feature);
    const isVisited = state.visitedCountries.has(countryName);
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0a0a0a';
    
    return {
        fillColor: isVisited ? accentColor : '#f0f0f0',
        weight: 1,
        opacity: 1,
        color: '#ffffff',
        fillOpacity: 1
    };
}

function onEachCountry(feature, layer) {
    const countryName = getCountryName(feature);
    
    layer.on({
        mouseover: (e) => {
            const layer = e.target;
            const isVisited = state.visitedCountries.has(countryName);
            const hoverColor = getComputedStyle(document.documentElement).getPropertyValue('--map-hover').trim() || '#333333';
            layer.setStyle({
                fillColor: isVisited ? hoverColor : '#888888',
                weight: 2
            });
            layer.bringToFront();
        },
        mouseout: (e) => {
            state.geoJsonLayer.resetStyle(e.target);
        },
        click: () => {
            handleCountryClick(countryName, feature);
        }
    });

    // Tooltip
    layer.bindTooltip(countryName, {
        permanent: false,
        direction: 'center',
        className: 'country-tooltip'
    });
}

function getCountryName(feature) {
    return feature.properties.ADMIN || feature.properties.name || feature.properties.NAME || 'Unknown';
}

// ==================== COUNTRY INTERACTIONS ====================
function handleCountryClick(countryName, feature) {
    if (state.visitedCountries.has(countryName)) {
        // Already visited - open modal to manage cities
        openCountryModal(countryName);
    } else {
        // Mark as visited
        state.visitedCountries.add(countryName);
        state.recentVisits.unshift({ name: countryName, date: new Date().toISOString() });
        if (state.recentVisits.length > 10) state.recentVisits.pop();
        
        saveState();
        updateMapStyles();
        updateAllStats();
        renderListView();
    }
}

function updateMapStyles() {
    if (state.geoJsonLayer) {
        state.geoJsonLayer.eachLayer(layer => {
            state.geoJsonLayer.resetStyle(layer);
        });
    }
}

// ==================== MODAL ====================
async function openCountryModal(countryName) {
    state.currentCountry = countryName;

    const modal = document.getElementById('country-modal');
    const modalTitle = document.getElementById('modal-country-name');
    const modalFlag = document.getElementById('modal-flag');
    const modalRegion = document.getElementById('modal-region');
    const modalContent = document.getElementById('modal-content');
    const modalLoading = document.getElementById('modal-loading');
    
    // Find country data
    const countryData = findCountryData(countryName);

    modalTitle.textContent = countryName;
    modalFlag.textContent = countryData?.flag || '🏳️';
    modalRegion.textContent = countryData?.region || '';
    
    // Show modal with loading state
    modal.classList.add('active');
    modalContent.innerHTML = '';
    modalLoading.classList.add('active');
    
    // Fetch cities
    const countryCode = countryData?.cca2 || '';
    let cities = [];
    
    if (countryCode) {
        cities = await fetchCitiesForCountry(countryCode);
    }
    
    modalLoading.classList.remove('active');
    
    // Render cities
    if (cities.length === 0) {
        modalContent.innerHTML = `
            <div class="no-cities">
                <p>No cities data available for ${countryName}.</p>
                <p style="margin-top: 0.5rem; font-size: 0.75rem;">Cities are sourced from the GeoNames database.</p>
            </div>
    `;
    } else {
        renderCitiesGrid(cities, countryName);
    }
    
    // Setup city search
    setupCitySearch(cities, countryName);
}

function renderCitiesGrid(cities, countryName) {
    const modalContent = document.getElementById('modal-content');
    const visitedCities = state.visitedCities.get(countryName) || new Set();
    
        const citiesHTML = cities.map(city => {
        const isVisited = visitedCities.has(city.name);
            return `
            <label class="city-item ${isVisited ? 'visited' : ''}" data-city="${escapeHtml(city.name)}">
                <span class="city-checkbox"></span>
                <span class="city-name">${escapeHtml(city.name)}</span>
        </label>
      `;
        }).join('');

        modalContent.innerHTML = `<div class="cities-grid">${citiesHTML}</div>`;
    
    // Add click listeners
    modalContent.querySelectorAll('.city-item').forEach(item => {
        item.addEventListener('click', () => {
            const cityName = item.dataset.city;
            toggleCity(countryName, cityName);
            item.classList.toggle('visited');
        });
    });
}

function setupCitySearch(cities, countryName) {
    const searchInput = document.getElementById('city-search');
    searchInput.value = '';
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = cities.filter(city => 
            city.name.toLowerCase().includes(query)
        );
        renderCitiesGrid(filtered, countryName);
    });
}

function toggleCity(countryName, cityName) {
    if (!state.visitedCities.has(countryName)) {
        state.visitedCities.set(countryName, new Set());
    }
    
    const countryCities = state.visitedCities.get(countryName);
    
    if (countryCities.has(cityName)) {
        countryCities.delete(cityName);
    } else {
        countryCities.add(cityName);
    }
    
    saveState();
    updateAllStats();
}

function closeCountryModal() {
    document.getElementById('country-modal').classList.remove('active');
    state.currentCountry = null;
}

function unmarkCountry() {
    if (!state.currentCountry) return;
    
    const countryName = state.currentCountry;
    state.visitedCountries.delete(countryName);
    state.visitedCities.delete(countryName);
    state.recentVisits = state.recentVisits.filter(v => v.name !== countryName);

    saveState();
    updateMapStyles();
    updateAllStats();
    renderListView();
    closeCountryModal();
}

// ==================== HELPER FUNCTIONS ====================
function findCountryData(countryName) {
    // Try to find country by common name
    let country = state.countriesData.find(c => 
        c.name.common.toLowerCase() === countryName.toLowerCase() ||
        c.name.official.toLowerCase() === countryName.toLowerCase()
    );
    
    // Try partial match if exact match fails
    if (!country) {
        const nameLower = countryName.toLowerCase();
        country = state.countriesData.find(c => 
            c.name.common.toLowerCase().includes(nameLower) ||
            nameLower.includes(c.name.common.toLowerCase())
        );
    }
    
    if (country) {
        return {
            name: country.name.common,
            cca2: country.cca2,
            cca3: country.cca3,
            flag: country.flags?.emoji || getFlagEmoji(country.cca2),
            region: country.region,
            subregion: country.subregion,
            population: country.population,
            capital: country.capital?.[0]
        };
    }
    
    return null;
}

function getFlagEmoji(countryCode) {
    if (!countryCode) return '🏳️';
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== DATA PERSISTENCE ====================
function loadState() {
    try {
        const countries = localStorage.getItem('been-countries');
        const cities = localStorage.getItem('been-cities');
        const recent = localStorage.getItem('been-recent');
        
        if (countries) {
            state.visitedCountries = new Set(JSON.parse(countries));
        }
        
        if (cities) {
            const citiesObj = JSON.parse(cities);
            state.visitedCities = new Map(
                Object.entries(citiesObj).map(([k, v]) => [k, new Set(v)])
            );
        }
        
        if (recent) {
            state.recentVisits = JSON.parse(recent);
        }
    } catch (error) {
        console.error('Error loading state:', error);
    }
}

function saveState() {
    try {
        // Always save to localStorage as backup
        localStorage.setItem('been-countries', JSON.stringify([...state.visitedCountries]));
        
        const citiesObj = {};
        state.visitedCities.forEach((cities, country) => {
            citiesObj[country] = [...cities];
        });
        localStorage.setItem('been-cities', JSON.stringify(citiesObj));
        
        localStorage.setItem('been-recent', JSON.stringify(state.recentVisits));
        
        // Also save to Supabase if logged in
        if (currentUser && supabaseClient) {
            saveUserData();
        }
    } catch (error) {
        console.error('Error saving state:', error);
    }
}

function resetData() {
    if (!confirm('Reset all your travel data? This cannot be undone.')) return;
    
    state.visitedCountries.clear();
    state.visitedCities.clear();
    state.recentVisits = [];
    
    localStorage.removeItem('been-countries');
    localStorage.removeItem('been-cities');
    localStorage.removeItem('been-recent');
    
    updateMapStyles();
    updateAllStats();
    renderListView();
    renderStatsView();
}

// ==================== STATS ====================
function updateAllStats() {
    updateStatsBar();
    updateProgressRing();
    renderStatsView();
}

function updateStatsBar() {
    const countriesCount = state.visitedCountries.size;
    
    let citiesCount = 0;
    state.visitedCities.forEach(cities => {
        citiesCount += cities.size;
    });
    
    const percentage = ((countriesCount / CONFIG.TOTAL_COUNTRIES) * 100).toFixed(1);
    
    document.getElementById('countries-visited').textContent = countriesCount;
    document.getElementById('cities-visited').textContent = citiesCount;
    document.getElementById('world-percentage').textContent = `${percentage}%`;
    document.getElementById('progress-percentage').textContent = `${percentage}%`;
}

function updateProgressRing() {
    const percentage = (state.visitedCountries.size / CONFIG.TOTAL_COUNTRIES) * 100;
    const circumference = 2 * Math.PI * 90; // r = 90
    const offset = circumference - (percentage / 100) * circumference;
    
    const ring = document.getElementById('progress-ring');
    if (ring) {
        ring.style.strokeDashoffset = offset;
    }
}

function renderStatsView() {
    renderContinentsList();
    renderRecentList();
    renderRegionsChart();
}

function renderContinentsList() {
    const container = document.getElementById('continents-list');
    if (!container) return;
    
    const continentCounts = {
        'Africa': 0,
        'Americas': 0,
        'Asia': 0,
        'Europe': 0,
        'Oceania': 0
    };
    
    state.visitedCountries.forEach(countryName => {
        const countryData = findCountryData(countryName);
        if (countryData?.region && continentCounts.hasOwnProperty(countryData.region)) {
            continentCounts[countryData.region]++;
        }
    });
    
    container.innerHTML = Object.entries(continentCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `
            <div class="continent-item">
                <span class="continent-name">${name}</span>
                <span class="continent-count">${count}</span>
            </div>
        `).join('');
}

function renderRecentList() {
    const container = document.getElementById('recent-list');
    if (!container) return;
    
    if (state.recentVisits.length === 0) {
        container.innerHTML = '<div class="recent-item"><span class="recent-name" style="color: var(--text-muted);">No recent visits</span></div>';
        return;
    }
    
    container.innerHTML = state.recentVisits.slice(0, 5).map(visit => {
        const date = new Date(visit.date);
        const formattedDate = date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
        });
        const countryData = findCountryData(visit.name);
        const flag = countryData?.flag || '🏳️';
        
        return `
            <div class="recent-item">
                <span class="recent-name">${flag} ${visit.name}</span>
                <span class="recent-date">${formattedDate}</span>
            </div>
        `;
    }).join('');
}

function renderRegionsChart() {
    const container = document.getElementById('regions-chart');
    if (!container) return;
    
    const regionCounts = {};
    
    state.visitedCountries.forEach(countryName => {
        const countryData = findCountryData(countryName);
        if (countryData?.subregion) {
            regionCounts[countryData.subregion] = (regionCounts[countryData.subregion] || 0) + 1;
        }
    });
    
    const sortedRegions = Object.entries(regionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
    
    if (sortedRegions.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.875rem; text-align: center; padding: 2rem;">Visit some countries to see regional stats</div>';
        return;
    }
    
    const maxCount = Math.max(...sortedRegions.map(r => r[1]));
    
    container.innerHTML = sortedRegions.map(([region, count]) => {
        const height = (count / maxCount) * 120;
        const shortName = region.split(' ').slice(0, 2).join(' ');
        return `
            <div class="region-bar-container">
                <div class="region-bar" style="height: ${height}px"></div>
                <span class="region-label">${shortName}</span>
            </div>
        `;
    }).join('');
}

// ==================== LIST VIEW ====================
function renderListView() {
    const container = document.getElementById('visited-list');
    if (!container) return;
    
    const filter = state.currentFilter;
    let items = [];
    
    // Add countries
    if (filter === 'all' || filter === 'countries') {
        state.visitedCountries.forEach(countryName => {
            const countryData = findCountryData(countryName);
            const citiesCount = state.visitedCities.get(countryName)?.size || 0;
            
            items.push({
                type: 'country',
                name: countryName,
                flag: countryData?.flag || '🏳️',
                region: countryData?.region || '',
                citiesCount
            });
        });
    }
    
    // Add cities
    if (filter === 'all' || filter === 'cities') {
        state.visitedCities.forEach((cities, countryName) => {
            const countryData = findCountryData(countryName);
            cities.forEach(cityName => {
                items.push({
                    type: 'city',
                    name: cityName,
                    country: countryName,
                    flag: countryData?.flag || '🏳️'
                });
            });
        });
    }
    
    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 6.9 8 11.7z"/>
                </svg>
                <p>Click on a country on the map to mark it as visited</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = items.map(item => {
        if (item.type === 'country') {
            return `
                <div class="visited-item" data-country="${escapeHtml(item.name)}">
                    <span class="visited-flag">${item.flag}</span>
                    <div class="visited-info">
                        <div class="visited-name">${escapeHtml(item.name)}</div>
                        <div class="visited-meta">${item.region}${item.citiesCount ? ` · ${item.citiesCount} cities` : ''}</div>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="visited-item" data-city="${escapeHtml(item.name)}" data-country="${escapeHtml(item.country)}">
                    <span class="visited-flag">${item.flag}</span>
                    <div class="visited-info">
                        <div class="visited-name">${escapeHtml(item.name)}</div>
                        <div class="visited-meta">${escapeHtml(item.country)}</div>
                    </div>
                </div>
            `;
        }
    }).join('');
    
    // Add click handlers
    container.querySelectorAll('.visited-item[data-country]').forEach(item => {
        item.addEventListener('click', () => {
            const countryName = item.dataset.country;
            if (state.visitedCountries.has(countryName)) {
                openCountryModal(countryName);
            }
        });
    });
}

// ==================== SEARCH ====================
function setupSearch() {
    const searchInput = document.getElementById('country-search');
    const searchResults = document.getElementById('search-results');
    
    if (!searchInput || !searchResults) return;
    
    let debounceTimer;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim().toLowerCase();
        
        if (query.length < 2) {
            searchResults.classList.remove('active');
            return;
        }
        
        debounceTimer = setTimeout(() => {
            const results = searchCountries(query);
            renderSearchResults(results);
        }, 150);
    });
    
    searchInput.addEventListener('focus', () => {
        const query = searchInput.value.trim().toLowerCase();
        if (query.length >= 2) {
            searchResults.classList.add('active');
        }
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            searchResults.classList.remove('active');
        }
    });
}

function searchCountries(query) {
    if (!state.geoJsonData) return [];
    
    return state.geoJsonData.features
        .map(f => getCountryName(f))
        .filter(name => name.toLowerCase().includes(query))
        .slice(0, 10);
}

function renderSearchResults(results) {
    const container = document.getElementById('search-results');
    
    if (results.length === 0) {
        container.innerHTML = '<div class="search-result-item">No countries found</div>';
        container.classList.add('active');
        return;
    }
    
    container.innerHTML = results.map(name => {
        const countryData = findCountryData(name);
        const isVisited = state.visitedCountries.has(name);
        
        return `
            <div class="search-result-item ${isVisited ? 'visited' : ''}" data-country="${escapeHtml(name)}">
                <span class="search-result-flag">${countryData?.flag || '🏳️'}</span>
                <span>${escapeHtml(name)}</span>
            </div>
        `;
    }).join('');
    
    container.classList.add('active');
    
    // Add click handlers
    container.querySelectorAll('.search-result-item[data-country]').forEach(item => {
        item.addEventListener('click', () => {
            const countryName = item.dataset.country;
            
            if (state.visitedCountries.has(countryName)) {
                openCountryModal(countryName);
            } else {
                // Find and click on the map
                const feature = state.geoJsonData.features.find(f => 
                    getCountryName(f) === countryName
                );
                if (feature) {
                    handleCountryClick(countryName, feature);
                }
            }
            
            container.classList.remove('active');
            document.getElementById('country-search').value = '';
        });
    });
}

// ==================== EVENT LISTENERS ====================
function attachEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
    
    
    // Reset button
    document.getElementById('reset-btn')?.addEventListener('click', resetData);
    
    // Modal
    document.getElementById('modal-close')?.addEventListener('click', closeCountryModal);
    document.getElementById('modal-unmark')?.addEventListener('click', unmarkCountry);
    document.getElementById('country-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'country-modal') {
            closeCountryModal();
        }
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeCountryModal();
            document.getElementById('search-results')?.classList.remove('active');
        }
    });
    
    // List filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentFilter = btn.dataset.filter;
            renderListView();
        });
    });
    
    // Search
    setupSearch();
}

function switchView(viewName) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    
    // Update view panels
    document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `${viewName}-view`);
    });
    
    // Render content when switching to list or stats
    if (viewName === 'list') {
        renderListView();
    } else if (viewName === 'stats') {
        renderStatsView();
    } else if (viewName === 'map' && state.map) {
        // Invalidate map size when switching back
        setTimeout(() => state.map.invalidateSize(), 100);
    }
}

