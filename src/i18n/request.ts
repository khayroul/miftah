import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALES,
  type AppLocale,
} from "./config";

export { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, type AppLocale } from "./config";

function isAppLocale(value: string | undefined): value is AppLocale {
  return LOCALES.includes(value as AppLocale);
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale = isAppLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
