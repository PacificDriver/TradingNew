/**
 * Simple i18n for landing page — EN / RU
 */
(function () {
  'use strict';

  const translations = {
    ru: {
      // Nav
      navPrizes: 'Призы',
      navHow: 'Как участвовать',
      navFaq: 'FAQ',
      navCta: 'Начать торговать',
      // Hero
      heroTitle: 'Торгуй и <span class="hero-title-underline">выигрывай</span><br />премиальные призы',
      heroSub: 'Мы открылись и разыгрываем среди активных трейдеров: <strong>2 квартиры</strong> в столице вашей страны, <strong>3 автомобиля BMW&nbsp;M5&nbsp;CS</strong> и <strong>3 денежных приза</strong> — $100&nbsp;000, $50&nbsp;000 и $20&nbsp;000.',
      heroCta: 'Начать торговать',
      heroMore: 'Подробнее ↓',
      // KPI
      kpiLabel1: 'ключевых призов',
      kpiLabel2: 'общий призовой фонд',
      // Prizes
      prizeTag: 'Розыгрыш',
      prizeTitle: 'Активным трейдерам —<br />лучшие призы',
      prizeSub: 'Чем больше сделок проводит трейдер — тем больше получает очков. Система рейтинга обновляется в реальном времени.',
      prizeApartments: 'Квартиры',
      prizeApartmentsDesc: 'В столице вашей страны. Премиальная недвижимость для лучших участников.',
      prizeGrand: 'Главный приз',
      prizeBmwDesc: 'Автомобили премиум-класса. Скорость, мощность и статус для победителей.',
      prizeHp: '635 л.с.',
      prizeCash: 'Денежные призы',
      prizeCashDesc: '$100&nbsp;000, $50&nbsp;000 и $20&nbsp;000 — прямо на ваш счёт.',
      // How
      howTag: 'Как это работает',
      howTitle: 'Три шага до участия<br />в розыгрыше',
      howStep1: 'Зарегистрируйтесь',
      howStep1Desc: 'Создайте аккаунт за 30 секунд на платформе Aura Trade.',
      howStep2: 'Торгуйте',
      howStep2Desc: 'Открывайте сделки по бинарным опционам. Каждая сделка = очки в рейтинге.',
      howStep3: 'Выигрывайте',
      howStep3Desc: 'Поднимайтесь в рейтинге. Топовые места получают главные призы.',
      // Stats
      statsTag: 'Статистика',
      statsTitle: 'Логика начисления очков',
      statsSub: 'Простая механика: торгуйте, копите очки и поднимайтесь выше в рейтинге.',
      statsChart1: 'Прогноз активности по неделям',
      statsChart2: 'Система очков',
      statsBar1: '1 сделка',
      statsBar2: '50 сделок',
      statsBar3: '100 сделок',
      statsBar4: '250 сделок',
      statsPool: 'Призовой фонд',
      statsLegend1: 'Квартиры <strong>40%</strong>',
      statsLegend2: 'BMW M5 CS <strong>30%</strong>',
      statsLegend3: 'Деньги <strong>30%</strong>',
      // FAQ
      faqTitle: 'Часто задаваемые вопросы',
      faq1Q: 'Приветственный бонус $100',
      faq1A: 'До 01.03.2026 — приветственный бонус $100 каждому трейдеру. Зарегистрируйтесь на Aura Trade и получите бонус $100 на торговый счёт для старта. Вывод доступен после 250 сделок.',
      faq2Q: 'Как попасть в розыгрыш?',
      faq2A: 'Достаточно зарегистрироваться и активно торговать на Aura Trade. Чем больше сделок — тем больше очков и тем выше ваше место в рейтинге.',
      faq3Q: 'Когда можно вывести бонус $100?',
      faq3A: 'Приветственный бонус участвует в торговом обороте. Вывод становится доступен после выполнения 250 сделок на платформе.',
      faq4Q: 'Какие призы считаются главными?',
      faq4A: 'Главные призы — 2 квартиры в столице вашей страны и 3 автомобиля BMW M5 CS. Денежные призы распределяются между следующими местами.',
      faq5Q: 'Как начисляются очки?',
      faq5A: 'За каждую завершённую сделку начисляются очки. За серии сделок предусмотрены бонусные множители. Рейтинг обновляется в реальном времени.',
      faq6Q: 'Можно ли участвовать из любой страны?',
      faq6A: 'Да, Aura Trade доступна для трейдеров по всему миру. Квартира разыгрывается в столице страны проживания победителя.',
      faq7Q: 'Когда состоится розыгрыш?',
      faq7A: 'Дата финального розыгрыша будет объявлена дополнительно. Следите за обновлениями в личном кабинете.',
      // Final CTA
      finalTitle: 'Запускайте торговлю<br />сейчас',
      finalSub: 'Боритесь за 2 квартиры, BMW&nbsp;M5&nbsp;CS и денежные призы на Aura Trade.',
      finalCta: 'Открыть аккаунт',
      // Footer
      footerCopy: '© 2026 Aura Trade. Все права защищены.',
      footerTerms: 'Условия',
      footerPolicy: 'Политика',
      footerContact: 'Контакты',
      // Meta
      metaDesc: 'Aura Trade — премиальная платформа бинарных опционов. Розыгрыш 2 квартир, 3 BMW M5 CS и денежных призов.',
    },
    en: {
      navPrizes: 'Prizes',
      navHow: 'How to participate',
      navFaq: 'FAQ',
      navCta: 'Start Trading',
      heroTitle: 'Trade and <span class="hero-title-underline">win</span><br />premium prizes',
      heroSub: "We've launched and are giving away to active traders: <strong>2 apartments</strong> in the capital of your country, <strong>3 BMW&nbsp;M5&nbsp;CS cars</strong> and <strong>3 cash prizes</strong> — $100,000, $50,000 and $20,000.",
      heroCta: 'Start Trading',
      heroMore: 'Learn more ↓',
      kpiLabel1: 'key prizes',
      kpiLabel2: 'total prize pool',
      prizeTag: 'Giveaway',
      prizeTitle: 'Best prizes for<br />active traders',
      prizeSub: 'The more trades a trader makes — the more points they earn. Ranking updates in real time.',
      prizeApartments: 'Apartments',
      prizeApartmentsDesc: 'In the capital of your country. Premium real estate for top participants.',
      prizeGrand: 'Grand prize',
      prizeBmwDesc: 'Premium-class cars. Speed, power and status for winners.',
      prizeHp: '635 hp',
      prizeCash: 'Cash prizes',
      prizeCashDesc: '$100,000, $50,000 and $20,000 — straight to your account.',
      howTag: 'How it works',
      howTitle: 'Three steps to enter<br />the giveaway',
      howStep1: 'Register',
      howStep1Desc: 'Create an account in 30 seconds on the Aura Trade platform.',
      howStep2: 'Trade',
      howStep2Desc: 'Open binary options trades. Each trade = points in the ranking.',
      howStep3: 'Win',
      howStep3Desc: 'Climb the ranking. Top places get the grand prizes.',
      statsTag: 'Statistics',
      statsTitle: 'Points scoring logic',
      statsSub: 'Simple mechanics: trade, accumulate points and climb the ranking.',
      statsChart1: 'Weekly activity forecast',
      statsChart2: 'Points system',
      statsBar1: '1 trade',
      statsBar2: '50 trades',
      statsBar3: '100 trades',
      statsBar4: '250 trades',
      statsPool: 'Prize pool',
      statsLegend1: 'Apartments <strong>40%</strong>',
      statsLegend2: 'BMW M5 CS <strong>30%</strong>',
      statsLegend3: 'Cash <strong>30%</strong>',
      faqTitle: 'Frequently Asked Questions',
      faq1Q: 'Welcome bonus $100',
      faq1A: 'Until 03/01/2026 — $100 welcome bonus for every trader. Register on Aura Trade and get $100 bonus to your trading account to start. Withdrawal available after 250 trades.',
      faq2Q: 'How to enter the giveaway?',
      faq2A: 'Just register and trade actively on Aura Trade. The more trades — the more points and the higher your place in the ranking.',
      faq3Q: 'When can I withdraw the $100 bonus?',
      faq3A: 'The welcome bonus participates in trading turnover. Withdrawal becomes available after completing 250 trades on the platform.',
      faq4Q: 'What are the grand prizes?',
      faq4A: 'The grand prizes are 2 apartments in the capital of your country and 3 BMW M5 CS cars. Cash prizes are distributed among the following places.',
      faq5Q: 'How are points awarded?',
      faq5A: 'Points are awarded for each completed trade. Bonus multipliers are provided for trade series. The ranking updates in real time.',
      faq6Q: 'Can I participate from any country?',
      faq6A: 'Yes, Aura Trade is available for traders worldwide. The apartment is drawn in the capital of the winner\'s country of residence.',
      faq7Q: 'When will the giveaway take place?',
      faq7A: 'The date of the final giveaway will be announced later. Follow updates in your personal account.',
      finalTitle: 'Launch trading<br />now',
      finalSub: 'Compete for 2 apartments, BMW&nbsp;M5&nbsp;CS and cash prizes on Aura Trade.',
      finalCta: 'Open account',
      footerCopy: '© 2026 Aura Trade. All rights reserved.',
      footerTerms: 'Terms',
      footerPolicy: 'Privacy',
      footerContact: 'Contact',
      metaDesc: 'Aura Trade — premium binary options platform. Giveaway of 2 apartments, 3 BMW M5 CS and cash prizes.',
    },
  };

  const STORAGE_KEY = 'aura-lang';
  const DEFAULT_LANG = 'ru';

  function getLang() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
  }

  function setLang(lang) {
    if (!translations[lang]) return;
    localStorage.setItem(STORAGE_KEY, lang);
  }

  function apply() {
    const lang = getLang();
    const t = translations[lang];
    if (!t) return;

    document.documentElement.lang = lang;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = t.metaDesc;

    const map = {
      '[data-i18n="navPrizes"]': t.navPrizes,
      '[data-i18n="navHow"]': t.navHow,
      '[data-i18n="navFaq"]': t.navFaq,
      '[data-i18n="navCta"]': t.navCta,
      '[data-i18n="heroTitle"]': t.heroTitle,
      '[data-i18n="heroSub"]': t.heroSub,
      '[data-i18n="heroCta"]': t.heroCta,
      '[data-i18n="heroMore"]': t.heroMore,
      '[data-i18n="kpiLabel1"]': t.kpiLabel1,
      '[data-i18n="kpiLabel2"]': t.kpiLabel2,
      '[data-i18n="prizeTag"]': t.prizeTag,
      '[data-i18n="prizeTitle"]': t.prizeTitle,
      '[data-i18n="prizeSub"]': t.prizeSub,
      '[data-i18n="prizeApartments"]': t.prizeApartments,
      '[data-i18n="prizeApartmentsDesc"]': t.prizeApartmentsDesc,
      '[data-i18n="prizeGrand"]': t.prizeGrand,
      '[data-i18n="prizeBmwDesc"]': t.prizeBmwDesc,
      '[data-i18n="prizeHp"]': t.prizeHp,
      '[data-i18n="prizeCash"]': t.prizeCash,
      '[data-i18n="prizeCashDesc"]': t.prizeCashDesc,
      '[data-i18n="howTag"]': t.howTag,
      '[data-i18n="howTitle"]': t.howTitle,
      '[data-i18n="howStep1"]': t.howStep1,
      '[data-i18n="howStep1Desc"]': t.howStep1Desc,
      '[data-i18n="howStep2"]': t.howStep2,
      '[data-i18n="howStep2Desc"]': t.howStep2Desc,
      '[data-i18n="howStep3"]': t.howStep3,
      '[data-i18n="howStep3Desc"]': t.howStep3Desc,
      '[data-i18n="statsTag"]': t.statsTag,
      '[data-i18n="statsTitle"]': t.statsTitle,
      '[data-i18n="statsSub"]': t.statsSub,
      '[data-i18n="statsChart1"]': t.statsChart1,
      '[data-i18n="statsChart2"]': t.statsChart2,
      '[data-i18n="statsBar1"]': t.statsBar1,
      '[data-i18n="statsBar2"]': t.statsBar2,
      '[data-i18n="statsBar3"]': t.statsBar3,
      '[data-i18n="statsBar4"]': t.statsBar4,
      '[data-i18n="statsPool"]': t.statsPool,
      '[data-i18n="statsLegend1"]': t.statsLegend1,
      '[data-i18n="statsLegend2"]': t.statsLegend2,
      '[data-i18n="statsLegend3"]': t.statsLegend3,
      '[data-i18n="faqTitle"]': t.faqTitle,
      '[data-i18n="faq1Q"]': t.faq1Q,
      '[data-i18n="faq1A"]': t.faq1A,
      '[data-i18n="faq2Q"]': t.faq2Q,
      '[data-i18n="faq2A"]': t.faq2A,
      '[data-i18n="faq3Q"]': t.faq3Q,
      '[data-i18n="faq3A"]': t.faq3A,
      '[data-i18n="faq4Q"]': t.faq4Q,
      '[data-i18n="faq4A"]': t.faq4A,
      '[data-i18n="faq5Q"]': t.faq5Q,
      '[data-i18n="faq5A"]': t.faq5A,
      '[data-i18n="faq6Q"]': t.faq6Q,
      '[data-i18n="faq6A"]': t.faq6A,
      '[data-i18n="faq7Q"]': t.faq7Q,
      '[data-i18n="faq7A"]': t.faq7A,
      '[data-i18n="finalTitle"]': t.finalTitle,
      '[data-i18n="finalSub"]': t.finalSub,
      '[data-i18n="finalCta"]': t.finalCta,
      '[data-i18n="footerCopy"]': t.footerCopy,
      '[data-i18n="footerTerms"]': t.footerTerms,
      '[data-i18n="footerPolicy"]': t.footerPolicy,
      '[data-i18n="footerContact"]': t.footerContact,
    };

    const htmlKeys = ['heroTitle', 'heroSub', 'prizeTitle', 'howTitle', 'finalTitle', 'finalSub', 'statsLegend1', 'statsLegend2', 'statsLegend3'];
    for (const sel in map) {
      const key = sel.match(/data-i18n="([^"]+)"/)?.[1] || '';
      const useHtml = htmlKeys.includes(key) || map[sel].indexOf('<') >= 0;
      const els = document.querySelectorAll(sel);
      els.forEach(function (el) {
        if (useHtml) {
          el.innerHTML = map[sel];
        } else {
          el.textContent = map[sel];
        }
      });
    }
  }

  function init() {
    apply();

    function updateSwitchers() {
      const lang = getLang();
      document.querySelectorAll('.lang-switcher').forEach(function (sw) {
        sw.querySelectorAll('button[data-lang]').forEach(function (b) {
          const isActive = b.getAttribute('data-lang') === lang;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-pressed', isActive);
        });
      });
    }
    updateSwitchers();
    document.querySelectorAll('.lang-switcher').forEach(function (sw) {
      sw.addEventListener('click', function (e) {
        const btn = e.target.closest('button[data-lang]');
        if (!btn) return;
        e.preventDefault();
        const lang = btn.getAttribute('data-lang');
        setLang(lang);
        apply();
        updateSwitchers();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.auraI18n = { getLang, setLang, apply };
})();
