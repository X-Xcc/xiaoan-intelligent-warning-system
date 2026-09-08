import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'

export type Locale =
  | 'zh-CN'
  | 'en-US'
  | 'ja-JP'
  | 'ko-KR'
  | 'es-ES'
  | 'fr-FR'
  | 'de-DE'
  | 'pt-PT'
  | 'ru-RU'
  | 'ar'

type LocaleOption = {
  code: Locale
  nativeName: string
  englishName: string
}

export const localeOptions: LocaleOption[] = [
  { code: 'zh-CN', nativeName: '简体中文', englishName: 'Chinese (Simplified)' },
  { code: 'en-US', nativeName: 'English', englishName: 'English' },
  { code: 'ja-JP', nativeName: '日本語', englishName: 'Japanese' },
  { code: 'ko-KR', nativeName: '한국어', englishName: 'Korean' },
  { code: 'es-ES', nativeName: 'Español', englishName: 'Spanish' },
  { code: 'fr-FR', nativeName: 'Français', englishName: 'French' },
  { code: 'de-DE', nativeName: 'Deutsch', englishName: 'German' },
  { code: 'pt-PT', nativeName: 'Português', englishName: 'Portuguese' },
  { code: 'ru-RU', nativeName: 'Русский', englishName: 'Russian' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic' },
]

type MessageKey =
  | 'language'
  | 'selectLanguage'
  | 'login.kicker'
  | 'login.title'
  | 'login.subtitle'
  | 'login.opening'
  | 'login.services'
  | 'login.help'
  | 'login.visitor'
  | 'login.staff'
  | 'nav.home'
  | 'nav.report'
  | 'nav.help'
  | 'nav.progress'
  | 'nav.mine'
  | 'mine.language'
  | 'language.changed'

const messages: Record<Locale, Partial<Record<MessageKey, string>>> = {
  'zh-CN': {
    language: '语言',
    selectLanguage: '选择语言',
    'login.kicker': '夜市现场服务',
    'login.title': '烟火哨兵',
    'login.subtitle': '逛夜市前看一眼，遇到事也能及时求助',
    'login.opening': '今日情况',
    'login.services': '附近点位',
    'login.help': '马上求助',
    'login.visitor': '进入群众端',
    'login.staff': '巡防人员登录',
    'nav.home': '首页',
    'nav.report': '反馈',
    'nav.help': '求助',
    'nav.progress': '进度',
    'nav.mine': '我的',
    'mine.language': '语言偏好',
    'language.changed': '语言已切换',
  },
  'en-US': {
    language: 'Language',
    selectLanguage: 'Select language',
    'login.kicker': 'Night market safety service',
    'login.title': 'Yanhuo Sentinel',
    'login.subtitle': 'Check before you go, enjoy with peace of mind',
    'login.opening': 'Open areas',
    'login.services': 'Nearby services',
    'login.help': 'Get help',
    'login.visitor': 'Visitor services',
    'login.staff': 'Staff login',
    'nav.home': 'Home',
    'nav.report': 'Report',
    'nav.help': 'Help',
    'nav.progress': 'Progress',
    'nav.mine': 'Mine',
    'mine.language': 'Language preference',
    'language.changed': 'Language updated',
  },
  'ja-JP': {
    language: '言語',
    selectLanguage: '言語を選択',
    'login.kicker': '夜市の安全サービス',
    'login.title': 'Yanhuo Sentinel',
    'login.subtitle': '出発前に確認して、安心して楽しみましょう',
    'login.opening': '開放エリア',
    'login.services': '近くのサービス',
    'login.help': '安心ヘルプ',
    'login.visitor': '観光客サービス',
    'login.staff': 'スタッフログイン',
    'nav.home': 'ホーム',
    'nav.report': '報告',
    'nav.help': 'ヘルプ',
    'nav.progress': '進捗',
    'nav.mine': 'マイページ',
    'mine.language': '言語設定',
    'language.changed': '言語を変更しました',
  },
  'ko-KR': {
    language: '언어',
    selectLanguage: '언어 선택',
    'login.kicker': '야시장 안전 서비스',
    'login.title': 'Yanhuo Sentinel',
    'login.subtitle': '출발 전에 확인하고 안심하고 즐겨보세요',
    'login.opening': '개방 구역',
    'login.services': '주변 서비스',
    'login.help': '안심 도움',
    'login.visitor': '방문객 서비스',
    'login.staff': '직원 로그인',
    'nav.home': '홈',
    'nav.report': '신고',
    'nav.help': '도움',
    'nav.progress': '진행',
    'nav.mine': '내 정보',
    'mine.language': '언어 설정',
    'language.changed': '언어가 변경되었습니다',
  },
  'es-ES': {
    language: 'Idioma',
    selectLanguage: 'Seleccionar idioma',
    'login.kicker': 'Servicio de seguridad del mercado nocturno',
    'login.title': 'Yanhuo Sentinel',
    'login.subtitle': 'Consulta antes de salir y disfruta con tranquilidad',
    'login.opening': 'Zonas abiertas',
    'login.services': 'Servicios cercanos',
    'login.help': 'Pedir ayuda',
    'login.visitor': 'Servicio para visitantes',
    'login.staff': 'Acceso del personal',
    'nav.home': 'Inicio',
    'nav.report': 'Avisar',
    'nav.help': 'Ayuda',
    'nav.progress': 'Progreso',
    'nav.mine': 'Mi cuenta',
    'mine.language': 'Preferencia de idioma',
    'language.changed': 'Idioma actualizado',
  },
  'fr-FR': {
    language: 'Langue',
    selectLanguage: 'Choisir la langue',
    'login.kicker': 'Service de sécurité du marché nocturne',
    'login.title': 'Yanhuo Sentinel',
    'login.subtitle': 'Informez-vous avant de partir et profitez sereinement',
    'login.opening': 'Zones ouvertes',
    'login.services': 'Services proches',
    'login.help': 'Demander de l’aide',
    'login.visitor': 'Service visiteurs',
    'login.staff': 'Connexion du personnel',
    'nav.home': 'Accueil',
    'nav.report': 'Signaler',
    'nav.help': 'Aide',
    'nav.progress': 'Suivi',
    'nav.mine': 'Mon espace',
    'mine.language': 'Préférence de langue',
    'language.changed': 'Langue mise à jour',
  },
  'de-DE': {
    language: 'Sprache',
    selectLanguage: 'Sprache auswählen',
    'login.kicker': 'Sicherheitsservice am Nachtmarkt',
    'login.title': 'Yanhuo Sentinel',
    'login.subtitle': 'Vor dem Besuch prüfen und entspannt genießen',
    'login.opening': 'Geöffnete Bereiche',
    'login.services': 'Services in der Nähe',
    'login.help': 'Hilfe anfordern',
    'login.visitor': 'Besucherservice',
    'login.staff': 'Mitarbeiter-Login',
    'nav.home': 'Start',
    'nav.report': 'Melden',
    'nav.help': 'Hilfe',
    'nav.progress': 'Status',
    'nav.mine': 'Konto',
    'mine.language': 'Spracheinstellung',
    'language.changed': 'Sprache aktualisiert',
  },
  'pt-PT': {
    language: 'Idioma',
    selectLanguage: 'Selecionar idioma',
    'login.kicker': 'Serviço de segurança do mercado noturno',
    'login.title': 'Yanhuo Sentinel',
    'login.subtitle': 'Consulte antes de sair e desfrute com tranquilidade',
    'login.opening': 'Zonas abertas',
    'login.services': 'Serviços próximos',
    'login.help': 'Pedir ajuda',
    'login.visitor': 'Serviço para visitantes',
    'login.staff': 'Acesso da equipa',
    'nav.home': 'Início',
    'nav.report': 'Reportar',
    'nav.help': 'Ajuda',
    'nav.progress': 'Progresso',
    'nav.mine': 'A minha conta',
    'mine.language': 'Preferência de idioma',
    'language.changed': 'Idioma atualizado',
  },
  'ru-RU': {
    language: 'Язык',
    selectLanguage: 'Выберите язык',
    'login.kicker': 'Сервис безопасности ночного рынка',
    'login.title': 'Yanhuo Sentinel',
    'login.subtitle': 'Проверьте информацию перед прогулкой и отдыхайте спокойно',
    'login.opening': 'Открытые зоны',
    'login.services': 'Сервисы рядом',
    'login.help': 'Получить помощь',
    'login.visitor': 'Сервис для посетителей',
    'login.staff': 'Вход для сотрудников',
    'nav.home': 'Главная',
    'nav.report': 'Сообщить',
    'nav.help': 'Помощь',
    'nav.progress': 'Статус',
    'nav.mine': 'Профиль',
    'mine.language': 'Языковые настройки',
    'language.changed': 'Язык изменён',
  },
  ar: {
    language: 'اللغة',
    selectLanguage: 'اختر اللغة',
    'login.kicker': 'خدمة السلامة في السوق الليلي',
    'login.title': 'Yanhuo Sentinel',
    'login.subtitle': 'تحقق قبل الانطلاق واستمتع براحة بال',
    'login.opening': 'المناطق المفتوحة',
    'login.services': 'الخدمات القريبة',
    'login.help': 'طلب المساعدة',
    'login.visitor': 'خدمات الزوار',
    'login.staff': 'دخول الموظفين',
    'nav.home': 'الرئيسية',
    'nav.report': 'بلاغ',
    'nav.help': 'مساعدة',
    'nav.progress': 'التقدم',
    'nav.mine': 'حسابي',
    'mine.language': 'تفضيل اللغة',
    'language.changed': 'تم تحديث اللغة',
  },
}

const STORAGE_KEY = 'yanhuo-shaobing-locale'
const listeners = new Set<(locale: Locale) => void>()

const isLocale = (value: unknown): value is Locale => (
  typeof value === 'string' && localeOptions.some((item) => item.code === value)
)

const getLocale = (): Locale => {
  const stored = Taro.getStorageSync(STORAGE_KEY)
  return isLocale(stored) ? stored : 'zh-CN'
}

export const getLocaleOption = (locale: Locale) => (
  localeOptions.find((item) => item.code === locale) || localeOptions[0]
)

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>(() => getLocale())

  useEffect(() => {
    const listener = (next: Locale) => setLocaleState(next)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const setLocale = (next: Locale) => {
    Taro.setStorageSync(STORAGE_KEY, next)
    listeners.forEach((listener) => listener(next))
    setLocaleState(next)
  }

  const t = (key: MessageKey) => messages[locale][key] || messages['zh-CN'][key] || key

  return { locale, setLocale, t }
}
