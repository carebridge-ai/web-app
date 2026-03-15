// ---------------------------------------------------------------------------
// Landing page translations for 8 supported languages
// ---------------------------------------------------------------------------

export type LangCode = 'en' | 'es' | 'fr' | 'ar' | 'zh' | 'hi' | 'tl' | 'pt'

type LandingStrings = {
  trustPoints: [string, string, string]
  headline1: string
  headline2: string // the typed word (e.g. "Hospital")
  tagline: string
  subtitle: string
  getStarted: string
  tryAsGuest: string
  quickFacts: [
    { value: string; label: string },
    { value: string; label: string },
    { value: string; label: string },
  ]
  langPanelEyebrow: string
  langPanelHeadline: string
  langPanelDescription: string
  disclaimer: string
}

export const translations: Record<LangCode, LandingStrings> = {
  en: {
    trustPoints: ['Private by default', '8-language support', 'Free guest access'],
    headline1: 'Never be scared to go to the',
    headline2: 'Hospital',
    tagline: 'Your guide to the right coverage.',
    subtitle:
      'Calm, private support for families navigating care, coverage, and unfamiliar medical systems.',
    getStarted: 'Get Started',
    tryAsGuest: 'Try as guest',
    quickFacts: [
      { value: '24/7', label: 'ready when appointments feel overwhelming' },
      { value: 'Plain', label: 'guidance in simpler language' },
      { value: 'Calm', label: 'designed for stressful moments' },
    ],
    langPanelEyebrow: 'Choose your language',
    langPanelHeadline: 'Start in the language that feels most comfortable.',
    langPanelDescription:
      'We save your preference locally now and to your profile later if you sign in.',
    disclaimer: 'This is not medical advice. In an emergency, call 911.',
  },

  es: {
    trustPoints: ['Privado por defecto', 'Soporte en 8 idiomas', 'Acceso gratuito como invitado'],
    headline1: 'Nunca tengas miedo de ir al',
    headline2: 'Hospital',
    tagline: 'Tu guía hacia la cobertura correcta.',
    subtitle:
      'Apoyo tranquilo y privado para familias que navegan el cuidado, la cobertura y sistemas médicos desconocidos.',
    getStarted: 'Comenzar',
    tryAsGuest: 'Probar como invitado',
    quickFacts: [
      { value: '24/7', label: 'listo cuando las citas se sienten abrumadoras' },
      { value: 'Simple', label: 'orientación en un lenguaje más sencillo' },
      { value: 'Calma', label: 'diseñado para momentos de estrés' },
    ],
    langPanelEyebrow: 'Elige tu idioma',
    langPanelHeadline: 'Comienza en el idioma que te resulte más cómodo.',
    langPanelDescription:
      'Guardamos tu preferencia localmente ahora y en tu perfil más tarde si inicias sesión.',
    disclaimer: 'Esto no es consejo médico. En una emergencia, llama al 911.',
  },

  fr: {
    trustPoints: ['Privé par défaut', 'Support en 8 langues', 'Accès gratuit en tant qu\'invité'],
    headline1: 'N\'ayez plus jamais peur d\'aller à l\'',
    headline2: 'Hôpital',
    tagline: 'Votre guide vers la bonne couverture.',
    subtitle:
      'Un soutien calme et privé pour les familles qui naviguent dans les soins, la couverture et les systèmes médicaux inconnus.',
    getStarted: 'Commencer',
    tryAsGuest: 'Essayer en tant qu\'invité',
    quickFacts: [
      { value: '24/7', label: 'prêt quand les rendez-vous semblent accablants' },
      { value: 'Simple', label: 'des conseils dans un langage plus simple' },
      { value: 'Calme', label: 'conçu pour les moments de stress' },
    ],
    langPanelEyebrow: 'Choisissez votre langue',
    langPanelHeadline: 'Commencez dans la langue qui vous convient le mieux.',
    langPanelDescription:
      'Nous sauvegardons votre préférence localement maintenant et dans votre profil plus tard si vous vous connectez.',
    disclaimer: 'Ceci n\'est pas un avis médical. En cas d\'urgence, appelez le 911.',
  },

  ar: {
    trustPoints: ['خاص افتراضيًا', 'دعم بـ 8 لغات', 'وصول مجاني كضيف'],
    headline1: 'لا تخف أبدًا من الذهاب إلى',
    headline2: 'المستشفى',
    tagline: 'دليلك إلى التغطية الصحيحة.',
    subtitle:
      'دعم هادئ وخاص للعائلات التي تتنقل في الرعاية والتغطية والأنظمة الطبية غير المألوفة.',
    getStarted: 'ابدأ الآن',
    tryAsGuest: 'جرّب كضيف',
    quickFacts: [
      { value: '24/7', label: 'جاهز عندما تبدو المواعيد مرهقة' },
      { value: 'بسيط', label: 'إرشادات بلغة أبسط' },
      { value: 'هادئ', label: 'مصمم للحظات التوتر' },
    ],
    langPanelEyebrow: 'اختر لغتك',
    langPanelHeadline: 'ابدأ باللغة التي تشعرك بالراحة.',
    langPanelDescription:
      'نحفظ تفضيلك محليًا الآن وفي ملفك الشخصي لاحقًا إذا قمت بتسجيل الدخول.',
    disclaimer: 'هذا ليس نصيحة طبية. في حالة الطوارئ، اتصل بـ 911.',
  },

  zh: {
    trustPoints: ['默认隐私保护', '支持8种语言', '免费访客访问'],
    headline1: '不要害怕去',
    headline2: '医院',
    tagline: '您的正确保障指南。',
    subtitle:
      '为在医疗、保险和陌生医疗系统中寻找方向的家庭提供平静、私密的支持。',
    getStarted: '开始使用',
    tryAsGuest: '以访客身份尝试',
    quickFacts: [
      { value: '24/7', label: '在预约让您感到不安时随时为您服务' },
      { value: '简单', label: '用更简单的语言提供指导' },
      { value: '安心', label: '专为紧张时刻而设计' },
    ],
    langPanelEyebrow: '选择您的语言',
    langPanelHeadline: '从最舒适的语言开始。',
    langPanelDescription:
      '我们现在会在本地保存您的偏好，如果您登录，稍后会保存到您的个人资料中。',
    disclaimer: '这不是医疗建议。紧急情况下请拨打911。',
  },

  hi: {
    trustPoints: ['डिफ़ॉल्ट रूप से निजी', '8 भाषाओं में सहायता', 'मुफ़्त अतिथि पहुँच'],
    headline1: 'कभी भी जाने से न डरें',
    headline2: 'अस्पताल',
    tagline: 'सही कवरेज के लिए आपका मार्गदर्शक।',
    subtitle:
      'देखभाल, कवरेज और अपरिचित चिकित्सा प्रणालियों में मार्गदर्शन करने वाले परिवारों के लिए शांत, निजी सहायता।',
    getStarted: 'शुरू करें',
    tryAsGuest: 'अतिथि के रूप में आज़माएं',
    quickFacts: [
      { value: '24/7', label: 'जब अपॉइंटमेंट भारी लगें तब तैयार' },
      { value: 'सरल', label: 'आसान भाषा में मार्गदर्शन' },
      { value: 'शांत', label: 'तनावपूर्ण क्षणों के लिए डिज़ाइन किया गया' },
    ],
    langPanelEyebrow: 'अपनी भाषा चुनें',
    langPanelHeadline: 'उस भाषा में शुरू करें जो सबसे आरामदायक लगे।',
    langPanelDescription:
      'हम अभी आपकी प्राथमिकता स्थानीय रूप से सहेजते हैं और बाद में यदि आप साइन इन करते हैं तो आपकी प्रोफ़ाइल में।',
    disclaimer: 'यह चिकित्सा सलाह नहीं है। आपातकाल में, 911 पर कॉल करें।',
  },

  tl: {
    trustPoints: ['Pribado bilang default', 'Suporta sa 8 na wika', 'Libreng bisita na access'],
    headline1: 'Huwag kailanman matakot pumunta sa',
    headline2: 'Ospital',
    tagline: 'Ang iyong gabay sa tamang coverage.',
    subtitle:
      'Mahinahon at pribadong suporta para sa mga pamilyang nag-na-navigate sa pangangalaga, coverage, at hindi pamilyar na medical system.',
    getStarted: 'Magsimula',
    tryAsGuest: 'Subukan bilang bisita',
    quickFacts: [
      { value: '24/7', label: 'handa kapag nakakabalisa ang mga appointment' },
      { value: 'Simple', label: 'patnubay sa mas simpleng wika' },
      { value: 'Kalma', label: 'dinisenyo para sa mga stressful na sandali' },
    ],
    langPanelEyebrow: 'Piliin ang iyong wika',
    langPanelHeadline: 'Magsimula sa wikang pinaka-komportable para sa iyo.',
    langPanelDescription:
      'Sine-save namin ang iyong kagustuhan nang lokal ngayon at sa iyong profile mamaya kung mag-sign in ka.',
    disclaimer: 'Hindi ito medikal na payo. Sa emergency, tumawag sa 911.',
  },

  pt: {
    trustPoints: ['Privado por padrão', 'Suporte em 8 idiomas', 'Acesso gratuito como convidado'],
    headline1: 'Nunca tenha medo de ir ao',
    headline2: 'Hospital',
    tagline: 'Seu guia para a cobertura certa.',
    subtitle:
      'Apoio calmo e privado para famílias navegando cuidados, cobertura e sistemas médicos desconhecidos.',
    getStarted: 'Começar',
    tryAsGuest: 'Experimentar como convidado',
    quickFacts: [
      { value: '24/7', label: 'pronto quando as consultas parecem avassaladoras' },
      { value: 'Simples', label: 'orientação em linguagem mais simples' },
      { value: 'Calmo', label: 'projetado para momentos de estresse' },
    ],
    langPanelEyebrow: 'Escolha seu idioma',
    langPanelHeadline: 'Comece no idioma que parecer mais confortável.',
    langPanelDescription:
      'Salvamos sua preferência localmente agora e no seu perfil depois se você fizer login.',
    disclaimer: 'Isto não é aconselhamento médico. Em uma emergência, ligue para o 911.',
  },
}

export function getTranslation(lang: string): LandingStrings {
  return translations[lang as LangCode] ?? translations.en
}
