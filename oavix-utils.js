/* OAVIX — utilidades compartidas (DOM, almacenamiento, formato y fechas). */
(function(){
  'use strict';

  if (window.OAVIX) return;

  const CURRENCY_SYMBOLS = {
    USD: '$', EUR: '€', HNL: 'L ', MXN: '$', GTQ: 'Q ',
    NIO: 'C$ ', CRC: '₡', PAB: 'B/. ', CAD: '$'
  };

  const el = id => document.getElementById(id);

  function show(id){ const node = el(id); if (node) node.classList.remove('hidden'); return node; }
  function hide(id){ const node = el(id); if (node) node.classList.add('hidden'); return node; }
  function setText(id, value){ const node = el(id); if (node) node.textContent = value; return node; }
  function setHtml(id, value){ const node = el(id); if (node) node.innerHTML = value; return node; }
  function getValue(id){ const node = el(id); return node ? node.value : ''; }
  function setValue(id, value){ const node = el(id); if (node) node.value = value; return node; }
  function getNumber(id, fallback = 0){ const n = parseFloat(getValue(id)); return Number.isFinite(n) ? n : fallback; }

  /* Anima una clase CSS sobre un elemento y la retira al terminar. */
  function flashClass(id, className, duration){
    const node = el(id);
    if (!node) return;
    node.classList.add(className);
    setTimeout(() => node.classList.remove(className), duration);
  }

  function read(key, fallback = null){
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw;
  }

  function readJSON(key, fallback = null){
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const parsed = JSON.parse(raw);
      return parsed === null ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function readNumber(key, fallback = 0){
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && localStorage.getItem(key) !== null ? n : fallback;
  }

  function readBool(key){ return localStorage.getItem(key) === 'true'; }
  function write(key, value){ localStorage.setItem(key, value); }
  function writeJSON(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
  function remove(key){ localStorage.removeItem(key); }

  function formatNumber(num, decimals = 0){
    const n = Number(num || 0);
    return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function formatMoney(amount, currency = 'USD'){
    const num = Number(amount || 0);
    const sym = CURRENCY_SYMBOLS[currency] || '$';
    const formatted = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (num < 0 ? '-' : '') + sym + formatted;
  }

  function toISODate(date){
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function todayISO(){ return toISODate(new Date()); }

  function currentTimeHHMM(){
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  /* Los precios del SEN se publican cada viernes: próxima actualización prevista. */
  function nextFridayISO(from = new Date()){
    const daysUntilFriday = (5 - from.getDay() + 7) % 7 || 7;
    return new Date(from.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000).toISOString();
  }

  window.OAVIX = {
    CURRENCY_SYMBOLS,
    el, show, hide, setText, setHtml, getValue, setValue, getNumber, flashClass,
    openModal: show,
    closeModal: hide,
    storage: { read, readJSON, readNumber, readBool, write, writeJSON, remove },
    formatNumber, formatMoney,
    toISODate, todayISO, currentTimeHHMM, nextFridayISO
  };

  window.formatNumber = formatNumber;
  window.formatMoney = formatMoney;
})();
