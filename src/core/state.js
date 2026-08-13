    let currentUnit = localStorage.getItem('oavix_auto_unit') || 'km';
    let currentVehicleMileage = Number(localStorage.getItem('oavix_auto_mileage')) || 85400;

    let autoCategories = JSON.parse(localStorage.getItem('oavix_auto_categories')) || [
      'Mantenimiento General', 'Cambio de Aceite', 'Llantas / Frenos', 'Combustible', 'Reparaciones'
    ];
    let autoRecords = JSON.parse(localStorage.getItem('oavix_auto_records')) || [];
    let isAlarmRinging = false;
    let alarmAudioInterval = null;
    let currentBase64Image = '';

    let selectedCalendarMonth = new Date().getMonth();
    let selectedCalendarYear = new Date().getFullYear();
