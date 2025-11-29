import { getLocales, Locale } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const locales = require.context("./locales");
const deviceLocale = getLocales()?.[0];

const resources = locales.keys().reduce((acc, key) => {
  const [locale, ...namespace] = key
    .replace(/^\.\//, "")
    .replace(/\.json$/, "")
    .split("/") as [string, ...string[]];
  if (!acc[locale]) acc[locale] = {};
  acc[locale][namespace.join("/")] = locales(key);
  return acc;
}, {} as Record<string, Record<string, any>>);

// eslint-disable-next-line import/no-named-as-default-member
i18n.use(initReactI18next).init({
  resources,
  lng: (deviceLocale && resolveSupportedLanguage(deviceLocale, Object.keys(resources))) || "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: true,
    nsMode: "fallback",
  },
  ns: "common",
  defaultNS: "common",
});

function resolveSupportedLanguage(deviceLocale: Locale, supportedLanguages: string[]) {
  return supportedLanguages.find(
    (lang) =>
      lang === deviceLocale.languageTag ||
      lang === deviceLocale.languageCode ||
      lang.startsWith(deviceLocale.languageCode + "-")
  );
}

export default i18n;
