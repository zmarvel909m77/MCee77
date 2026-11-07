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
  return `${webAppUrl}/karate/`;
}

export function resolveWebAppUrls(webAppUrlRaw: string | undefined): {
  webAppUrl: string;
  miniAppUrl: string;
  karateUrl: string;
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
    shopUrl: shopUrl(webAppUrl),
    airHockeyUrl: karateUrl,
  };
}

export { appUrl, shopUrl, karateGameUrl };
