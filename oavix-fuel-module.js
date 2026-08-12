/* OAVIX Fuel Module v1.1 - precios SEN + consumo */
(function(){
  'use strict';
  if(window.__OAVIX_FUEL_MODULE__) return;
  window.__OAVIX_FUEL_MODULE__ = true;

  const HONDURAS_CITIES = [
    {id:'tegucigalpa',name:'Tegucigalpa',region:'Francisco Morazán',lat:14.0723,lng:-87.1921},
    {id:'sps',name:'San Pedro Sula',region:'Cortés',lat:15.5007,lng:-88.0353},
    {id:'laceiba',name:'La Ceiba',region:'Atlántida',lat:15.7606,lng:-86.7775},
    {id:'choloma',name:'Choloma',region:'Cortés',lat:15.6722,lng:-88.1639},
    {id:'danli',name:'Danli',region:'El Paraíso',lat:14.9056,lng:-86.5781},
    {id:'juticalpa',name:'Juticalpa',region:'Olancho',lat:14.6731,lng:-86.2269},
    {id:'comayagua',name:'Comayagua',region:'Comayagua',lat:14.4553,lng:-87.6424},
    {id:'trujillo',name:'Trujillo',region:'Colón',lat:16.2723,lng:-85.9531}
  ];
  const FUEL_TYPES=['Gasolina Súper','Gasolina Regular','Diésel','Kerosene','GLP'];
  const FUEL_STORAGE_KEY='oavix_fuel_data';
  const FUEL_HISTORY_KEY='oavix_fuel_history';
  const FUEL_VEHICLE_KEY='oavix_fuel_vehicle_config';
  const SEN_DATA_URL='data/sen-prices.json';
  const SEN_SOURCE='https://sen.hn/';

  let fuelData={lastUpdate:null,prices:{},nextUpdate:null,source:'none',sourceUrl:SEN_SOURCE};
  let vehicleConfig={tankCapacity:15,city:'tegucigalpa',fuelType:'Gasolina Regular',avgConsumption:8};
  let fuelHistory=[];

  function saveFuelData(){
    try{
      localStorage.setItem(FUEL_STORAGE_KEY,JSON.stringify(fuelData));
      localStorage.setItem(FUEL_VEHICLE_KEY,JSON.stringify(vehicleConfig));
      localStorage.setItem(FUEL_HISTORY_KEY,JSON.stringify(fuelHistory));
    }catch(e){console.error('[OAVIX Fuel Save]',e);}
  }
  function loadFuelData(){
    try{
      const d=localStorage.getItem(FUEL_STORAGE_KEY); if(d) fuelData={...fuelData,...JSON.parse(d)};
      const v=localStorage.getItem(FUEL_VEHICLE_KEY); if(v) vehicleConfig={...vehicleConfig,...JSON.parse(v)};
      const h=localStorage.getItem(FUEL_HISTORY_KEY); if(h) fuelHistory=JSON.parse(h);
    }catch(e){console.error('[OAVIX Fuel Load]',e);}
  }
  function nextFriday(){
    const now=new Date(); const days=(5-now.getDay()+7)%7||7;
    const d=new Date(now.getTime()+days*86400000); d.setHours(0,0,0,0); return d.toISOString();
  }
  function normalizePrices(raw){
    const out={}; if(!raw||typeof raw!=='object') return out;
    for(const city of HONDURAS_CITIES){
      const aliases=[city.id,city.name,city.name.toLowerCase(),city.name.toLowerCase().replace(/ /g,'_')];
      const src=aliases.map(k=>raw[k]).find(v=>v&&typeof v==='object');
      if(!src) continue;
      const p={};
      for(const type of FUEL_TYPES){
        const aliases2=[type,type.replace('Gasolina Súper','Gasolina Superior'),'Superior','Super','Diésel','Diesel'];
        const key=aliases2.find(k=>src[k]!=null);
        if(key){const n=Number(String(src[key]).replace(/[^0-9.,-]/g,'').replace(',','.')); if(Number.isFinite(n)&&n>0)p[type]=n;}
      }
      if(Object.keys(p).length) out[city.id]=p;
    }
    return out;
  }
  async function loadOfficialSEN(){
    try{
      const r=await fetch(SEN_DATA_URL,{cache:'no-store'});
      if(!r.ok) throw new Error('SEN data HTTP '+r.status);
      const data=await r.json();
      const prices=normalizePrices(data.prices);
      const count=Object.values(prices).reduce((n,p)=>n+Object.keys(p).length,0);
      if(data.status!=='official'||count<5) throw new Error('SEN data is not verified');
      fuelData={...fuelData,prices,lastUpdate:data.updatedAt||new Date().toISOString(),source:'official',sourceUrl:data.sourceUrl||SEN_SOURCE,nextUpdate:nextFriday()};
      saveFuelData();
      return true;
    }catch(e){console.warn('[OAVIX Fuel] Official SEN data unavailable:',e.message); return false;}
  }
  function setLegacyFallback(){
    if(Object.keys(fuelData.prices||{}).length) return;
    fuelData.source='fallback';
    fuelData.sourceUrl=SEN_SOURCE;
    fuelData.lastUpdate=null;
  }
  async function fetchSENPrices(){
    if(await loadOfficialSEN()){
      if(window.renderFuelPrices) window.renderFuelPrices();
      return true;
    }
    const external=typeof window.fetchRealSENData==='function'?await window.fetchRealSENData().catch(()=>null):null;
    if(external){
      const prices=normalizePrices(external.prices||external);
      if(Object.keys(prices).length){
        fuelData={...fuelData,prices,lastUpdate:external.date||new Date().toISOString(),source:'official',sourceUrl:SEN_SOURCE,nextUpdate:nextFriday()};
        saveFuelData(); if(window.renderFuelPrices)window.renderFuelPrices(); return true;
      }
    }
    setLegacyFallback();
    saveFuelData();
    return false;
  }
  window.FuelModule={
    getCurrentPrice:(cityId,fuelType)=>fuelData.prices?.[cityId]?.[fuelType]??null,
    calculateFullTank(gallons,cityId,fuelType){const p=this.getCurrentPrice(cityId,fuelType);return p?gallons*p:null;},
    calculateCostPerKm(distance,cityId,fuelType,avgConsumption){const p=this.getCurrentPrice(cityId,fuelType);if(!p||!avgConsumption)return null;return distance/avgConsumption*p;},
    getAutoFillAmount(gallons,cityId,fuelType){const p=this.getCurrentPrice(cityId,fuelType);return p?Number((gallons*p).toFixed(2)):null;},
    recordFuelFill(data){const r={id:Date.now().toString(),date:new Date().toISOString(),city:data.city||vehicleConfig.city,fuelType:data.fuelType||vehicleConfig.fuelType,gallons:Number(data.gallons)||0,amountPaid:Number(data.amountPaid)||0,odometer:data.odometer||0,notes:data.notes||''};fuelHistory.push(r);saveFuelData();return r;},
    getFuelHistory(limit=10){return fuelHistory.slice(-limit).reverse();},
    getVehicleConfig(){return {...vehicleConfig};},
    updateVehicleConfig(config){vehicleConfig={...vehicleConfig,...config};saveFuelData();},
    getCities(){return HONDURAS_CITIES;},
    getFuelTypes(){return FUEL_TYPES;},
    getCurrentPrices(){return fuelData.prices;},
    getLastUpdate(){return fuelData.lastUpdate;},
    getNextUpdate(){return fuelData.nextUpdate;},
    getPriceSource(){return {type:fuelData.source,url:fuelData.sourceUrl,updatedAt:fuelData.lastUpdate};},
    refreshPrices:fetchSENPrices,
    getConsumptionStats(){
      if(fuelHistory.length<2)return null;
      const s=[...fuelHistory].sort((a,b)=>new Date(a.date)-new Date(b.date));let g=0,km=0;
      for(let i=1;i<s.length;i++){g+=Number(s[i].gallons)||0;km+=(Number(s[i].odometer)-Number(s[i-1].odometer))||0;}
      const valid=fuelHistory.filter(r=>Number(r.gallons)>0);const avg=valid.length?valid.reduce((sum,r)=>sum+(Number(r.amountPaid)/Number(r.gallons)),0)/valid.length:0;
      return {totalGallons:g,totalKm:km,avgConsumption:g?km/g:0,avgPrice:avg.toFixed(2)};
    },
    updatePricesManually(pricesObject,date=null){const prices=normalizePrices(pricesObject);if(!Object.keys(prices).length)return false;fuelData={...fuelData,prices,lastUpdate:date||new Date().toISOString(),source:'manual',sourceUrl:SEN_SOURCE,nextUpdate:nextFriday()};saveFuelData();if(window.renderFuelPrices)window.renderFuelPrices();return true;},
    exportPrices(){return {timestamp:new Date().toISOString(),data:fuelData,version:'1.1'};},
    importPrices(json){return json?.data?.prices?this.updatePricesManually(json.data.prices,json.timestamp):false;}
  };

  loadFuelData();
  document.addEventListener('DOMContentLoaded',()=>{
    loadOfficialSEN().then(ok=>{if(!ok)fetchSENPrices();});
  },{once:true});
})();
