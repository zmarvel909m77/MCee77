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

function airHockeyGameUrl(webAppUrl: string): string {
  if (!webAppUrl) return "";
  if (webAppUrl.endsWith("/air-hockey")) return `${webAppUrl}/`;
  return `${webAppUrl}/air-hockey/`;
}

export function resolveWebAppUrls(webAppUrlRaw: string | undefined): {
  webAppUrl: string;
  miniAppUrl: string;
  airHockeyUrl: string;
  shopUrl: string;
} {
  const webAppUrl = webAppUrlRaw?.trim().replace(/\/?$/, "") ?? "";
  return {
    webAppUrl,
    miniAppUrl: appUrl(webAppUrl),
    airHockeyUrl: airHockeyGameUrl(webAppUrl),
    shopUrl: shopUrl(webAppUrl),
  };
}

export { appUrl, shopUrl, airHockeyGameUrl };
