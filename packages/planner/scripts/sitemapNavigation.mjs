const DEFAULTS = Object.freeze({
  subAreaId: 'subarea_tela_planner',
  webResourceName: 'new_TelaPlanner.html',
  iconResourceName: 'cr40f_sitemap_clipboard_list.svg',
  title: 'Planner',
});

export function createPlannerSubArea(options = {}) {
  const config = { ...DEFAULTS, ...options };

  return [
    `<SubArea Id="${config.subAreaId}" ResourceId="SitemapDesigner.NewSubArea" VectorIcon="/WebResources/${config.iconResourceName}" Icon="/_imgs/imagestrips/transparent_spacer.gif" Url="$webresource:${config.webResourceName}" Client="All,Outlook,OutlookLaptopClient,OutlookWorkstationClient,Web" AvailableOffline="true" PassParams="false" Sku="All,OnPremise,Live,SPLA">`,
    `  <Titles><Title LCID="1046" Title="${config.title}" /></Titles>`,
    '</SubArea>',
  ].join('');
}

export function insertSubAreaIntoGroup(sitemapXml, groupId, subAreaXml) {
  const groupPattern = new RegExp(`(<Group\\b[^>]*\\bId="${escapeRegExp(groupId)}"[^>]*>[\\s\\S]*?)(</Group>)`);
  const match = sitemapXml.match(groupPattern);

  if (!match) {
    throw new Error(`grupo do sitemap n\u00e3o encontrado: ${groupId}`);
  }

  if (sitemapXml.includes('Id="subarea_tela_planner"')) {
    return sitemapXml;
  }

  return sitemapXml.replace(groupPattern, `$1${subAreaXml}$2`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}
