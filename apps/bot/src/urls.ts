function appUrl(webAppUrl: string): string {
  if (!webAppUrl) return "";
  if (webAppUrl.endsWith("/app")) return `${webAppUrl}/`;
  return `${webAppUrl}/app/`;
}

function shopUrl(webAppUrl: string): string {
  if (!webAppUrl) return "";
  const base = appUrl(webAppUrl);
  return base ? `${base}shop/` : "";
}

function cityStrikeGameUrl(webAppUrl: string): string {
  if (!webAppUrl) return "";
  if (webAppUrl.endsWith("/city-strike")) return `${webAppUrl}/`;
  if (webAppUrl.endsWith("/karate")) return webAppUrl.replace(/\/karate$/, "/city-strike/");
  return `${webAppUrl}/city-strike/`;
}

/** @deprecated Use cityStrikeGameUrl */
function karateGameUrl(webAppUrl: string): string {
  return cityStrikeGameUrl(webAppUrl);
}

export function resolveWebAppUrls(webAppUrlRaw: string | undefined): {
  webAppUrl: string;
  miniAppUrl: string;
  karateUrl: string;
  cityStrikeUrl: string;
  shopUrl: string;
  /** @deprecated Use cityStrikeUrl / miniAppUrl */
  airHockeyUrl: string;
} {
  const webAppUrl = webAppUrlRaw?.trim().replace(/\/?$/, "") ?? "";
  const cityStrikeUrl = cityStrikeGameUrl(webAppUrl);
  return {
    webAppUrl,
    miniAppUrl: appUrl(webAppUrl),
    karateUrl: cityStrikeUrl,
    cityStrikeUrl,
    shopUrl: shopUrl(webAppUrl),
    airHockeyUrl: cityStrikeUrl,
  };
}

export { appUrl, shopUrl, karateGameUrl, cityStrikeGameUrl };
