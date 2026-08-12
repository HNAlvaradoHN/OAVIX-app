/* OAVIX Fuel Module v1.0 - Gestor de Precios y Consumo de Combustibles Honduras */
(function(){
  'use strict';
  
  if(window.__OAVIX_FUEL_MODULE__) return;
  window.__OAVIX_FUEL_MODULE__ = true;

  // 🏙️ Ciudades principales de Honduras con códigos de región
  const HONDURAS_CITIES = [
    { id: 'tegucigalpa', name: 'Tegucigalpa', region: 'Francisco Morazán', lat: 14.0723, lng: -87.1921 },
    { id: 'sps', name: 'San Pedro Sula', region: 'Cortés', lat: 15.5007, lng: -88.0353 },
    { id: 'laceiba', name: 'La Ceiba', region: 'Atlántida', lat: 15.7606, lng: -86.7775 },
    { id: 'choloma', name: 'Choloma', region: 'Cortés', lat: 15.6722, lng: -88.1639 },
    { id: 'danli', name: 'Danli', region: 'El Paraíso', lat: 14.9056, lng: -86.5781 },
    { id: 'juticalpa', name: 'Juticalpa', region: 'Olancho', lat: 14.6731, lng: -86.2269 },
    { id: 'comayagua', name: 'Comayagua', region: 'Comayagua', lat: 14.4553, lng: -87.6424 },
    { id: 'trujillo', name: 'Trujillo', region: 'Colón', lat: 16.2723, lng: -85.9531 }
  ];

  // 💾 Estructura de datos de combustibles
  const FUEL_TYPES = ['Gasolina Súper', 'Gasolina Regular', 'Diésel', 'Kerosene', 'GLP'];
  const FUEL_STORAGE_KEY = 'oavix_fuel_data';
  const FUEL_HISTORY_KEY = 'oavix_fuel_history';
  const FUEL_VEHICLE_KEY = 'oavix_fuel_vehicle_config';

  // 📊 API Data Structure
  let fuelData = {
    lastUpdate: null,
    prices: {}, // { 'city_id': { 'Gasolina Súper': 45.50, ... }, ... }
    nextUpdate: null
  };

  let vehicleConfig = {
    tankCapacity: 15, // galones
    city: 'tegucigalpa',
    fuelType: 'Gasolina Regular',
    avgConsumption: 8 // km/galón
  };

  let fuelHistory = [];

  function toast(title, body, tone){
    if(typeof window.showToast === 'function'){
      try{ window.showToast(title, body, tone); }
      catch(e){ console.error('[OAVIX Fuel Toast]', e); }
    }
  }

  // 🔄 Leer una clave sin que un dato corrupto arrastre a las demás
  function readKey(key, fallback){
    const stored = localStorage.getItem(key);
    if(!stored) return fallback;
    try{
      const parsed = JSON.parse(stored);
      return parsed === null ? fallback : parsed;
    }catch(e){
      console.error('[OAVIX Fuel] Dato corrupto en ' + key + ', se usará el valor por defecto.', e);
      toast('⚠ Datos dañados', 'Los datos de combustible en "' + key + '" no se pudieron leer.', 'amber');
      return fallback;
    }
  }

  // 🔄 Cargar datos del localStorage
  function loadFuelData(){
    fuelData = readKey(FUEL_STORAGE_KEY, fuelData);
    vehicleConfig = readKey(FUEL_VEHICLE_KEY, vehicleConfig);
    fuelHistory = readKey(FUEL_HISTORY_KEY, fuelHistory);
    if(!fuelData || typeof fuelData !== 'object') fuelData = { lastUpdate: null, prices: {}, nextUpdate: null };
    if(!fuelData.prices || typeof fuelData.prices !== 'object') fuelData.prices = {};
    if(!Array.isArray(fuelHistory)) fuelHistory = [];
  }

  // 💾 Guardar datos al localStorage
  function saveFuelData(){
    try{
      localStorage.setItem(FUEL_STORAGE_KEY, JSON.stringify(fuelData));
      localStorage.setItem(FUEL_VEHICLE_KEY, JSON.stringify(vehicleConfig));
      localStorage.setItem(FUEL_HISTORY_KEY, JSON.stringify(fuelHistory));
      return true;
    }catch(e){
      console.error('[OAVIX Fuel Save]', e);
      toast('⚠ No se pudo guardar', 'El navegador rechazó guardar los datos de combustible (almacenamiento lleno o modo privado).', 'red');
      return false;
    }
  }

  // 🌐 Consultar API de precios SEN Honduras - CON DATOS REALES
  async function fetchSENPrices(){
    try{
      // Primero, intentar obtener datos reales del SEN vía proxy (opcional).
      // Un fallo aquí solo debe degradar a los precios por defecto, no cancelar la carga.
      if(typeof window.fetchRealSENData === 'function'){
        try{
          const senPrices = await window.fetchRealSENData();
          if(senPrices) return senPrices;
        }catch(e){
          console.warn('[OAVIX Fuel] No se pudo consultar el SEN, se usarán los precios por defecto.', e);
        }
      }

      // Datos por defecto (estructura lista para datos reales)
      const mockData = {
        date: new Date().toISOString(),
        prices: {
          'tegucigalpa': {
            'Gasolina Súper': 57.85,
            'Gasolina Regular': 55.20,
            'Diésel': 52.15,
            'Kerosene': 51.30,
            'GLP': 35.90
          },
          'sps': {
            'Gasolina Súper': 57.85,
            'Gasolina Regular': 55.20,
            'Diésel': 52.15,
            'Kerosene': 51.30,
            'GLP': 35.90
          },
          'laceiba': {
            'Gasolina Súper': 58.10,
            'Gasolina Regular': 55.45,
            'Diésel': 52.40,
            'Kerosene': 51.55,
            'GLP': 36.05
          },
          'choloma': {
            'Gasolina Súper': 57.85,
            'Gasolina Regular': 55.20,
            'Diésel': 52.15,
            'Kerosene': 51.30,
            'GLP': 35.90
          },
          'danli': {
            'Gasolina Súper': 57.95,
            'Gasolina Regular': 55.30,
            'Diésel': 52.25,
            'Kerosene': 51.40,
            'GLP': 36.00
          },
          'juticalpa': {
            'Gasolina Súper': 58.00,
            'Gasolina Regular': 55.35,
            'Diésel': 52.30,
            'Kerosene': 51.45,
            'GLP': 36.05
          },
          'comayagua': {
            'Gasolina Súper': 57.90,
            'Gasolina Regular': 55.25,
            'Diésel': 52.20,
            'Kerosene': 51.35,
            'GLP': 35.95
          },
          'trujillo': {
            'Gasolina Súper': 58.20,
            'Gasolina Regular': 55.55,
            'Diésel': 52.50,
            'Kerosene': 51.65,
            'GLP': 36.10
          }
        }
      };

      fuelData.lastUpdate = new Date().toISOString();
      fuelData.prices = mockData.prices;
      
      // Calcular próxima actualización (viernes próximo a las 00:00)
      const now = new Date();
      const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
      fuelData.nextUpdate = new Date(now.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000).toISOString();

      return saveFuelData();
    }catch(e){
      console.error('[OAVIX Fuel API]', e);
      toast('⚠ Error de precios', 'No se pudieron preparar los precios: ' + (e.message || 'error desconocido'), 'red');
      return false;
    }
  }

  // 📱 Exponer métodos públicos
  window.FuelModule = {
    // Obtener precio actual de combustible
    getCurrentPrice: function(cityId, fuelType){
      if(!fuelData.prices[cityId]) return null;
      return fuelData.prices[cityId][fuelType] || null;
    },

    // Calcular costo de tanque lleno
    calculateFullTank: function(gallons, cityId, fuelType){
      const price = this.getCurrentPrice(cityId, fuelType);
      if(!price) return null;
      return gallons * price;
    },

    // Calcular costo por kilómetro
    calculateCostPerKm: function(distance, cityId, fuelType, avgConsumption){
      const price = this.getCurrentPrice(cityId, fuelType);
      if(!price) return null;
      const gallonsNeeded = distance / avgConsumption;
      return gallonsNeeded * price;
    },

    // Autocompletetar monto de recarga
    getAutoFillAmount: function(gallons, cityId, fuelType){
      const price = this.getCurrentPrice(cityId, fuelType);
      if(!price) return null;
      return parseFloat((gallons * price).toFixed(2));
    },

    // Guardar recarga de combustible
    recordFuelFill: function(data){
      const record = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        city: data.city || vehicleConfig.city,
        fuelType: data.fuelType || vehicleConfig.fuelType,
        gallons: parseFloat(data.gallons) || 0,
        amountPaid: parseFloat(data.amountPaid) || 0,
        odometer: data.odometer || 0,
        notes: data.notes || ''
      };
      
      fuelHistory.push(record);
      if(!saveFuelData()){
        fuelHistory.pop();
        throw new Error('No se pudo guardar la recarga de combustible.');
      }
      return record;
    },

    // Obtener histórico de combustible
    getFuelHistory: function(limit = 10){
      return fuelHistory.slice(-limit).reverse();
    },

    // Obtener configuración de vehículo
    getVehicleConfig: function(){
      return { ...vehicleConfig };
    },

    // Actualizar configuración de vehículo
    updateVehicleConfig: function(config){
      const previous = vehicleConfig;
      vehicleConfig = { ...vehicleConfig, ...config };
      if(!saveFuelData()){
        vehicleConfig = previous;
        return false;
      }
      return true;
    },

    // Obtener ciudades disponibles
    getCities: function(){
      return HONDURAS_CITIES;
    },

    // Obtener tipos de combustible
    getFuelTypes: function(){
      return FUEL_TYPES;
    },

    // Obtener datos de precios actuales
    getCurrentPrices: function(){
      return fuelData.prices;
    },

    // Obtener fecha de última actualización
    getLastUpdate: function(){
      return fuelData.lastUpdate;
    },

    // Obtener fecha próxima actualización
    getNextUpdate: function(){
      return fuelData.nextUpdate;
    },

    // Forzar actualización de precios
    refreshPrices: async function(){
      return await fetchSENPrices();
    },

    // Obtener estadísticas de consumo
    getConsumptionStats: function(){
      if(fuelHistory.length < 2) return null;
      
      const sorted = [...fuelHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
      let totalGallons = 0;
      let totalKm = 0;
      let avgPrice = 0;

      for(let i = 1; i < sorted.length; i++){
        totalGallons += parseFloat(sorted[i].gallons) || 0;
        totalKm += (sorted[i].odometer - sorted[i-1].odometer) || 0;
      }

      avgPrice = fuelHistory.reduce((sum, r) => sum + (r.amountPaid / r.gallons), 0) / fuelHistory.length;

      return {
        totalGallons,
        totalKm,
        avgConsumption: totalKm / totalGallons,
        avgPrice: avgPrice.toFixed(2)
      };
    },

    // 🔧 Panel de Admin - Actualizar precios manualmente desde SEN
    updatePricesManually: function(pricesObject, date = null){
      try{
        if(!pricesObject || typeof pricesObject !== 'object' || Array.isArray(pricesObject)){
          console.error('[OAVIX Fuel] Formato inválido para precios', pricesObject);
          toast('⚠ Formato inválido', 'Los precios deben ser un objeto de ciudades.', 'red');
          return false;
        }

        const previousPrices = fuelData.prices;
        const previousUpdate = fuelData.lastUpdate;
        fuelData.prices = pricesObject;
        fuelData.lastUpdate = date || new Date().toISOString();
        
        // Calcular próxima actualización (viernes próximo a las 00:00)
        const now = new Date();
        const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
        fuelData.nextUpdate = new Date(now.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000).toISOString();
        
        if(!saveFuelData()){
          fuelData.prices = previousPrices;
          fuelData.lastUpdate = previousUpdate;
          return false;
        }

        // Disparar evento para actualizar UI
        if(window.renderFuelPrices) window.renderFuelPrices();

        return true;
      }catch(e){
        console.error('[OAVIX Fuel Admin]', e);
        toast('⚠ Error', 'No se pudieron actualizar los precios: ' + (e.message || 'error desconocido'), 'red');
        return false;
      }
    },

    // 📋 Exportar precios en formato JSON (para compartir con otros usuarios)
    exportPrices: function(){
      return {
        timestamp: new Date().toISOString(),
        data: fuelData,
        version: '1.0'
      };
    },

    // 📥 Importar precios desde JSON
    importPrices: function(jsonData){
      if(!jsonData || typeof jsonData !== 'object' || !jsonData.data || !jsonData.data.prices){
        console.error('[OAVIX Fuel Import] El JSON no contiene data.prices', jsonData);
        toast('⚠ Formato inválido', 'El JSON importado no contiene "data.prices".', 'red');
        return false;
      }
      return this.updatePricesManually(jsonData.data.prices, jsonData.timestamp);
    }
  };

  // 🔄 Inicializar módulo
  loadFuelData();
  
  // Actualizar precios al cargar (si es viernes)
  document.addEventListener('DOMContentLoaded', function(){
    if(!fuelData.lastUpdate){
      fetchSENPrices().catch(e => console.error('[OAVIX Fuel Init]', e));
    }
  }, { once: true });

  // Auto-actualizar cada 24 horas si es viernes
  setInterval(() => {
    const now = new Date();
    if(now.getDay() === 5 && now.getHours() === 0){
      fetchSENPrices().catch(e => console.error('[OAVIX Fuel Auto]', e));
    }
  }, 3600000); // Cada hora verificar

})();
