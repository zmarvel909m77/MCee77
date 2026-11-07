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

function karateGameUrl(webAppUrl: string): string {
  if (!webAppUrl) return "";
  if (webAppUrl.endsWith("/karate")) return `${webAppUrl}/`;
  if (webAppUrl.endsWith("/city-strike")) {
    return webAppUrl.replace(/\/city-strike$/, "/karate/");
  }
  return `${webAppUrl}/karate/`;
}

/** @deprecated Use karateGameUrl */
function cityStrikeGameUrl(webAppUrl: string): string {
  return karateGameUrl(webAppUrl);
}

export function resolveWebAppUrls(webAppUrlRaw: string | undefined): {
  webAppUrl: string;
  miniAppUrl: string;
  karateUrl: string;
  cityStrikeUrl: string;
  shopUrl: string;
  /** @deprecated Use karateUrl / miniAppUrl */
  airHockeyUrl: string;
} {
  const webAppUrl = webAppUrlRaw?.trim().replace(/\/?$/, "") ?? "";
  const karateUrl = karateGameUrl(webAppUrl);
  return {
    webAppUrl,
    miniAppUrl: appUrl(webAppUrl),
    karateUrl,
    cityStrikeUrl: karateUrl,
    shopUrl: shopUrl(webAppUrl),
    airHockeyUrl: karateUrl,
  };
}

export { appUrl, shopUrl, karateGameUrl, cityStrikeGameUrl };
