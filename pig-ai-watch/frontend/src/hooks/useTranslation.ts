import { useSettingsStore } from '@/store';
import { translations, TranslationKey } from '@/i18n/translations';

export function useTranslation() {
  const language = useSettingsStore((state) => state.language);
  
  const t = (key: TranslationKey): string => {
    return translations[language][key] || translations.en[key] || key;
  };

  return { t, language };
}
