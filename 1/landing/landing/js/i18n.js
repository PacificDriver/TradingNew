(function () {
  "use strict";

  var STORAGE_KEY = "aura-landing-lang";
  var SUPPORTED = ["ru", "en", "es"];
  var DEFAULT = "ru";

  var t = {
    ru: {
      nav: { prizes: "Призы", how: "Как участвовать", faq: "FAQ", startTrading: "Начать торговать" },
      hero: {
        badge: "Aura Trade · Grand Launch 2026",
        title: "Торгуй и {win}<br />премиальные призы",
        titleWin: "выигрывай",
        sub: "Мы открылись и разыгрываем среди активных трейдеров: <strong>2 квартиры</strong> в столице вашей страны, <strong>3 автомобиля BMW&nbsp;M5&nbsp;CS</strong> и <strong>3 денежных приза</strong> — $100&nbsp;000, $50&nbsp;000 и $20&nbsp;000.",
        startTrading: "Начать торговать",
        more: "Подробнее ↓"
      },
      kpi: { prizes: "ключевых призов", prizeFund: "общий призовой фонд" },
      section: {
        prizesTag: "Розыгрыш",
        prizesTitle: "Активным трейдерам —<br />лучшие призы",
        prizesSub: "Чем больше сделок проводит трейдер — тем больше получает очков. Система рейтинга обновляется в реальном времени.",
        howTag: "Как это работает",
        howTitle: "Три шага до участия<br />в розыгрыше",
        statsTag: "Статистика",
        statsTitle: "Логика начисления очков",
        statsSub: "Простая механика: торгуйте, копите очки и поднимайтесь выше в рейтинге.",
        faqTag: "FAQ",
        faqTitle: "Часто задаваемые вопросы"
      },
      prize: {
        apartments: "Квартиры",
        apartmentsDesc: "В столице вашей страны. Премиальная недвижимость для лучших участников.",
        apartmentsValue: "Главный приз",
        bmw: "BMW M5 CS",
        bmwDesc: "Автомобили премиум-класса. Скорость, мощность и статус для победителей.",
        bmwValue: "635 л.с.",
        money: "Денежные призы",
        moneyDesc: "$100&nbsp;000, $50&nbsp;000 и $20&nbsp;000 — прямо на ваш счёт.",
        moneyValue: "$170 000"
      },
      step: {
        s1: "Зарегистрируйтесь",
        s1Desc: "Создайте аккаунт за 30 секунд на платформе Aura Trade.",
        s2: "Торгуйте",
        s2Desc: "Открывайте сделки по бинарным опционам. Каждая сделка = очки в рейтинге.",
        s3: "Выигрывайте",
        s3Desc: "Поднимайтесь в рейтинге. Топовые места получают главные призы."
      },
      chart: { activity: "Прогноз активности по неделям", points: "Система очков", prizeFund: "Призовой фонд" },
      bar: { deal1: "1 сделка", deal50: "50 сделок", deal100: "100 сделок", deal250: "250 сделок" },
      legend: { apartments: "Квартиры", bmw: "BMW M5 CS", money: "Деньги" },
      faq: {
        q1: "Приветственный бонус $100",
        a1: "До 01.03.2026 — приветственный бонус $100 каждому трейдеру. Зарегистрируйтесь на Aura Trade и получите бонус $100 на торговый счёт для старта. Вывод доступен после 250 сделок.",
        q2: "Как попасть в розыгрыш?",
        a2: "Достаточно зарегистрироваться и активно торговать на Aura Trade. Чем больше сделок — тем больше очков и тем выше ваше место в рейтинге.",
        q3: "Когда можно вывести бонус $100?",
        a3: "Приветственный бонус участвует в торговом обороте. Вывод становится доступен после выполнения 250 сделок на платформе.",
        q4: "Какие призы считаются главными?",
        a4: "Главные призы — 2 квартиры в столице вашей страны и 3 автомобиля BMW M5 CS. Денежные призы распределяются между следующими местами.",
        q5: "Как начисляются очки?",
        a5: "За каждую завершённую сделку начисляются очки. За серии сделок предусмотрены бонусные множители. Рейтинг обновляется в реальном времени.",
        q6: "Можно ли участвовать из любой страны?",
        a6: "Да, Aura Trade доступна для трейдеров по всему миру. Квартира разыгрывается в столице страны проживания победителя.",
        q7: "Когда состоится розыгрыш?",
        a7: "Дата финального розыгрыша будет объявлена дополнительно. Следите за обновлениями в личном кабинете."
      },
      cta: { title: "Запускайте торговлю<br />сейчас", sub: "Боритесь за 2 квартиры, BMW&nbsp;M5&nbsp;CS и денежные призы на Aura Trade.", btn: "Открыть аккаунт" },
      footer: { copy: "© 2026 Aura Trade. Все права защищены.", terms: "Условия", policy: "Политика", contacts: "Контакты" }
    },
    en: {
      nav: { prizes: "Prizes", how: "How to Participate", faq: "FAQ", startTrading: "Start Trading" },
      hero: {
        badge: "Aura Trade · Grand Launch 2026",
        title: "Trade and {win}<br />premium prizes",
        titleWin: "win",
        sub: "We're live and giving away to active traders: <strong>2 apartments</strong> in your country's capital, <strong>3 BMW&nbsp;M5&nbsp;CS cars</strong> and <strong>3 cash prizes</strong> — $100,000, $50,000 and $20,000.",
        startTrading: "Start Trading",
        more: "Learn More ↓"
      },
      kpi: { prizes: "key prizes", prizeFund: "total prize pool" },
      section: {
        prizesTag: "Giveaway",
        prizesTitle: "Best prizes for<br />active traders",
        prizesSub: "The more trades you make, the more points you earn. The ranking updates in real time.",
        howTag: "How it works",
        howTitle: "Three steps to<br />join the giveaway",
        statsTag: "Statistics",
        statsTitle: "Points scoring logic",
        statsSub: "Simple mechanics: trade, earn points and climb the ranking.",
        faqTag: "FAQ",
        faqTitle: "Frequently asked questions"
      },
      prize: {
        apartments: "Apartments",
        apartmentsDesc: "In your country's capital. Premium real estate for top participants.",
        apartmentsValue: "Grand Prize",
        bmw: "BMW M5 CS",
        bmwDesc: "Premium-class cars. Speed, power and status for winners.",
        bmwValue: "635 hp",
        money: "Cash Prizes",
        moneyDesc: "$100,000, $50,000 and $20,000 — straight to your account.",
        moneyValue: "$170,000"
      },
      step: {
        s1: "Register",
        s1Desc: "Create an account in 30 seconds on the Aura Trade platform.",
        s2: "Trade",
        s2Desc: "Open binary options trades. Each trade = points in the ranking.",
        s3: "Win",
        s3Desc: "Climb the ranking. Top positions get the grand prizes."
      },
      chart: { activity: "Weekly activity forecast", points: "Points system", prizeFund: "Prize fund" },
      bar: { deal1: "1 trade", deal50: "50 trades", deal100: "100 trades", deal250: "250 trades" },
      legend: { apartments: "Apartments", bmw: "BMW M5 CS", money: "Cash" },
      faq: {
        q1: "Welcome bonus $100",
        a1: "Until 01.03.2026 — $100 welcome bonus for every trader. Register on Aura Trade and get a $100 bonus to your trading account to start. Withdrawal available after 250 trades.",
        q2: "How do I enter the giveaway?",
        a2: "Just register and trade actively on Aura Trade. The more trades you make, the more points and the higher your ranking.",
        q3: "When can I withdraw the $100 bonus?",
        a3: "The welcome bonus is part of the trading turnover. Withdrawal becomes available after completing 250 trades on the platform.",
        q4: "What are the main prizes?",
        a4: "The main prizes are 2 apartments in your country's capital and 3 BMW M5 CS cars. Cash prizes are distributed among the following places.",
        q5: "How are points awarded?",
        a5: "Points are awarded for each completed trade. Bonus multipliers apply for trade streaks. The ranking updates in real time.",
        q6: "Can I participate from any country?",
        a6: "Yes, Aura Trade is available to traders worldwide. The apartment is drawn in the winner's country of residence capital.",
        q7: "When will the draw take place?",
        a7: "The final draw date will be announced later. Follow updates in your personal account."
      },
      cta: { title: "Start trading<br />now", sub: "Compete for 2 apartments, BMW&nbsp;M5&nbsp;CS and cash prizes on Aura Trade.", btn: "Open Account" },
      footer: { copy: "© 2026 Aura Trade. All rights reserved.", terms: "Terms", policy: "Privacy", contacts: "Contacts" }
    },
    es: {
      nav: { prizes: "Premios", how: "Cómo participar", faq: "FAQ", startTrading: "Empezar a operar" },
      hero: {
        badge: "Aura Trade · Grand Launch 2026",
        title: "Opera y {win}<br />premios premium",
        titleWin: "gana",
        sub: "Estamos en vivo y sorteamos entre traders activos: <strong>2 apartamentos</strong> en la capital de tu país, <strong>3 BMW&nbsp;M5&nbsp;CS</strong> y <strong>3 premios en efectivo</strong> — $100.000, $50.000 y $20.000.",
        startTrading: "Empezar a operar",
        more: "Saber más ↓"
      },
      kpi: { prizes: "premios clave", prizeFund: "fondo de premios total" },
      section: {
        prizesTag: "Sorteo",
        prizesTitle: "Mejores premios para<br />traders activos",
        prizesSub: "Cuantas más operaciones hagas, más puntos ganas. El ranking se actualiza en tiempo real.",
        howTag: "Cómo funciona",
        howTitle: "Tres pasos para<br />participar en el sorteo",
        statsTag: "Estadísticas",
        statsTitle: "Lógica de puntos",
        statsSub: "Mecánica simple: opera, acumula puntos y sube en el ranking.",
        faqTag: "FAQ",
        faqTitle: "Preguntas frecuentes"
      },
      prize: {
        apartments: "Apartamentos",
        apartmentsDesc: "En la capital de tu país. Inmuebles premium para los mejores participantes.",
        apartmentsValue: "Gran premio",
        bmw: "BMW M5 CS",
        bmwDesc: "Automóviles premium. Velocidad, potencia y estatus para los ganadores.",
        bmwValue: "635 hp",
        money: "Premios en efectivo",
        moneyDesc: "$100.000, $50.000 y $20.000 — directo a tu cuenta.",
        moneyValue: "$170.000"
      },
      step: {
        s1: "Regístrate",
        s1Desc: "Crea una cuenta en 30 segundos en la plataforma Aura Trade.",
        s2: "Opera",
        s2Desc: "Abre operaciones de opciones binarias. Cada operación = puntos en el ranking.",
        s3: "Gana",
        s3Desc: "Sube en el ranking. Las primeras posiciones obtienen los grandes premios."
      },
      chart: { activity: "Pronóstico de actividad semanal", points: "Sistema de puntos", prizeFund: "Fondo de premios" },
      bar: { deal1: "1 operación", deal50: "50 operaciones", deal100: "100 operaciones", deal250: "250 operaciones" },
      legend: { apartments: "Apartamentos", bmw: "BMW M5 CS", money: "Efectivo" },
      faq: {
        q1: "Bono de bienvenida $100",
        a1: "Hasta el 01.03.2026 — bono de bienvenida de $100 para cada trader. Regístrate en Aura Trade y obtén un bono de $100 en tu cuenta de trading para empezar. Retiro disponible después de 250 operaciones.",
        q2: "¿Cómo participo en el sorteo?",
        a2: "Basta con registrarse y operar activamente en Aura Trade. Cuantas más operaciones hagas, más puntos y mayor posición en el ranking.",
        q3: "¿Cuándo puedo retirar el bono de $100?",
        a3: "El bono de bienvenida forma parte del volumen de operaciones. El retiro está disponible después de completar 250 operaciones en la plataforma.",
        q4: "¿Cuáles son los premios principales?",
        a4: "Los premios principales son 2 apartamentos en la capital de tu país y 3 BMW M5 CS. Los premios en efectivo se distribuyen entre los siguientes puestos.",
        q5: "¿Cómo se otorgan los puntos?",
        a5: "Se otorgan puntos por cada operación completada. Hay multiplicadores de bonificación para rachas de operaciones. El ranking se actualiza en tiempo real.",
        q6: "¿Puedo participar desde cualquier país?",
        a6: "Sí, Aura Trade está disponible para traders de todo el mundo. El apartamento se sortea en la capital del país de residencia del ganador.",
        q7: "¿Cuándo será el sorteo?",
        a7: "La fecha del sorteo final se anunciará más adelante. Sigue las actualizaciones en tu cuenta personal."
      },
      cta: { title: "Empieza a operar<br />ahora", sub: "Compite por 2 apartamentos, BMW&nbsp;M5&nbsp;CS y premios en efectivo en Aura Trade.", btn: "Abrir cuenta" },
      footer: { copy: "© 2026 Aura Trade. Todos los derechos reservados.", terms: "Términos", policy: "Privacidad", contacts: "Contacto" }
    }
  };

  function get(lang, path) {
    var keys = path.split(".");
    var obj = t[lang] || t[DEFAULT];
    for (var i = 0; i < keys.length && obj; i++) obj = obj[keys[i]];
    return obj != null ? String(obj) : path;
  }

  function detectLang() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
      var browser = (navigator.language || navigator.userLanguage || "").toLowerCase();
      if (browser.indexOf("es") === 0) return "es";
      if (browser.indexOf("en") === 0) return "en";
    } catch (e) {}
    return DEFAULT;
  }

  function setLang(lang) {
    if (SUPPORTED.indexOf(lang) === -1) return;
    window.i18n.lang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    document.documentElement.lang = lang === "ru" ? "ru" : lang === "es" ? "es" : "en";
    applyLang(lang);
    updateSwitcher(lang);
    if (typeof window.onLangChange === "function") window.onLangChange(lang);
  }

  function applyLang(lang) {
    var L = t[lang] || t[DEFAULT];
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var html = el.hasAttribute("data-i18n-html");
      var val = get(lang, key);
      if (key === "hero.title") val = val.replace("{win}", "<span class=\"hero-title-underline\">" + L.hero.titleWin + "</span>");
      if (html) el.innerHTML = val; else el.textContent = val;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      el.setAttribute("placeholder", get(lang, key));
    });
  }

  function updateSwitcher(lang) {
    document.querySelectorAll(".lang-switcher [data-lang]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-lang") === lang);
      btn.setAttribute("aria-pressed", btn.getAttribute("data-lang") === lang ? "true" : "false");
    });
  }

  function initSwitcher() {
    document.querySelectorAll(".lang-switcher [data-lang]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var lang = btn.getAttribute("data-lang");
        setLang(lang);
      });
    });
  }

  window.i18n = {
    lang: DEFAULT,
    setLang: setLang,
    get: function (path) { return get(window.i18n.lang, path); },
    supported: SUPPORTED
  };

  var initial = detectLang();
  window.i18n.lang = initial;
  document.documentElement.lang = initial === "ru" ? "ru" : initial === "es" ? "es" : "en";

  function boot() {
    applyLang(initial);
    initSwitcher();
    updateSwitcher(initial);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
