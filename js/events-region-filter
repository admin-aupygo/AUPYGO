/* AUPYGO — events-region-filter.js v4 (23/10/2026)
 *
 * Règles :
 *  - VILLE  : relue depuis Supabase (profiles.city) à CHAQUE chargement des sorties
 *             et après chaque enregistrement du profil.
 *  - USERS  : ne voient que les sorties situées à ≤ 100 km de la ville de leur profil
 *             (+ leurs propres sorties, celles où ils participent, celles « entre amis »).
 *  - STAFF / AMIRAL : voient tout.
 *  - TOUT LE MONDE : la grille « Sorties » est découpée en sections par pays
 *             (🌍 Suisse, 🌍 France…), le pays du viewer en premier.
 *
 * Ce qui a changé par rapport à la v3 (qui ne fonctionnait pas) :
 *  1. Le crochet sur saveProfile était écrasé par save-profile-fix.js / profile-security-fix.js
 *     → on le repose tant qu'il manque + filet de sécurité sur le clic du bouton.
 *  2. Le wrapper de loadAndRenderEvents s'empilait toutes les 4 s → il est posé UNE seule fois.
 *  3. La grille groupée était repeinte à plat par app.js / les autres modules
 *     → le regroupement se fait maintenant dans le DOM (MutationObserver), donc quel que
 *       soit le module qui dessine les cartes, le résultat est filtré + groupé.
 *  4. Ville inconnue du petit dictionnaire = plus aucune sortie visible
 *     → gros dictionnaire + géocodage de secours (OpenStreetMap/Nominatim, mis en cache).
 *  5. Le pays d'une sortie venait du pays d'ORIGINE du créateur → on utilise l'adresse
 *     de la sortie, puis le pays d'accueil (host_country).
 *
 * Diagnostic dans la console du navigateur :  aupygoRegionDebug()
 * Désactiver le géocodage externe (si besoin) : window.AUPYGO_GEOCODER = false (dans config.js)
 */
(function () {
  'use strict';
  if (window.__aupygoRegionV4) return;
  window.__aupygoRegionV4 = true;

  var RADIUS_KM = 100;
  var STORE_KEY = 'aupygo_geo_v1';
  var PENDING_TAG = '[EN_ATTENTE_VALIDATION_ADMIN]';
  var STAFF_ROLES = ['amiral', 'major_staff', 'sergent_staff', 'major_moderateur',
    'sergent_moderateur', 'admin_general', 'admin', 'host', 'moderator'];

  /* ------------------------------------------------------------------ */
  /*  Pays                                                               */
  /* ------------------------------------------------------------------ */
  var CC_NAME = {
    CH: 'Suisse', FR: 'France', BE: 'Belgique', LU: 'Luxembourg', NL: 'Pays-Bas',
    DE: 'Allemagne', AT: 'Autriche', ES: 'Espagne', PT: 'Portugal', IT: 'Italie',
    GB: 'Royaume-Uni', IE: 'Irlande', SE: 'Suède', DK: 'Danemark', NO: 'Norvège',
    FI: 'Finlande', IS: 'Islande', CZ: 'Tchéquie', PL: 'Pologne', HU: 'Hongrie',
    RO: 'Roumanie', GR: 'Grèce', TR: 'Turquie', MC: 'Monaco', AD: 'Andorre',
    MT: 'Malte', HR: 'Croatie', SI: 'Slovénie', SK: 'Slovaquie', BG: 'Bulgarie',
    RS: 'Serbie', LV: 'Lettonie', LT: 'Lituanie', EE: 'Estonie', UA: 'Ukraine',
    RU: 'Russie', CA: 'Canada', US: 'États-Unis', MX: 'Mexique', AU: 'Australie',
    NZ: 'Nouvelle-Zélande', JP: 'Japon', SG: 'Singapour', AE: 'Émirats arabes unis',
    HK: 'Hong Kong', KR: 'Corée du Sud', TH: 'Thaïlande', BR: 'Brésil',
    AR: 'Argentine', MA: 'Maroc', TN: 'Tunisie', DZ: 'Algérie', EG: 'Égypte',
    ZA: 'Afrique du Sud', LI: 'Liechtenstein'
  };

  // alias (normalisés, séparés par « | ») → nom français canonique
  var COUNTRY_ALIAS = {};
  [
    ['Suisse', 'suisse|switzerland|schweiz|suiza|svizzera|confederation helvetique'],
    ['France', 'france|francia|frankreich'],
    ['Belgique', 'belgique|belgium|belgica|belgien|belgie'],
    ['Luxembourg', 'luxembourg|luxemburg'],
    ['Pays-Bas', 'pays bas|netherlands|holland|hollande|paises bajos|nederland'],
    ['Allemagne', 'allemagne|germany|alemania|deutschland'],
    ['Autriche', 'autriche|austria|osterreich'],
    ['Espagne', 'espagne|spain|espana'],
    ['Portugal', 'portugal'],
    ['Italie', 'italie|italy|italia'],
    ['Royaume-Uni', 'royaume uni|united kingdom|uk|angleterre|england|reino unido|grande bretagne|great britain|ecosse|scotland|pays de galles|wales'],
    ['Irlande', 'irlande|ireland|irlanda'],
    ['Suède', 'suede|sweden|suecia'],
    ['Danemark', 'danemark|denmark|dinamarca'],
    ['Norvège', 'norvege|norway|noruega'],
    ['Finlande', 'finlande|finland|finlandia'],
    ['Islande', 'islande|iceland|islandia'],
    ['Tchéquie', 'tchequie|republique tcheque|czech republic|czechia'],
    ['Pologne', 'pologne|poland|polonia'],
    ['Hongrie', 'hongrie|hungary|hungria'],
    ['Roumanie', 'roumanie|romania|rumania'],
    ['Grèce', 'grece|greece|grecia'],
    ['Turquie', 'turquie|turkey|turkiye|turquia'],
    ['Monaco', 'monaco'],
    ['Andorre', 'andorre|andorra'],
    ['Malte', 'malte|malta'],
    ['Croatie', 'croatie|croatia|croacia'],
    ['Slovénie', 'slovenie|slovenia|eslovenia'],
    ['Slovaquie', 'slovaquie|slovakia|eslovaquia'],
    ['Bulgarie', 'bulgarie|bulgaria'],
    ['Serbie', 'serbie|serbia'],
    ['Lettonie', 'lettonie|latvia|letonia'],
    ['Lituanie', 'lituanie|lithuania|lituania'],
    ['Estonie', 'estonie|estonia'],
    ['Ukraine', 'ukraine|ucrania'],
    ['Russie', 'russie|russia'],
    ['Canada', 'canada'],
    ['États-Unis', 'etats unis|united states|usa|etats unis d amerique|estados unidos|united states of america'],
    ['Mexique', 'mexique|mexico'],
    ['Australie', 'australie|australia'],
    ['Nouvelle-Zélande', 'nouvelle zelande|new zealand|nueva zelanda'],
    ['Japon', 'japon|japan'],
    ['Singapour', 'singapour|singapore|singapur'],
    ['Émirats arabes unis', 'emirats arabes unis|uae|united arab emirates'],
    ['Hong Kong', 'hong kong'],
    ['Corée du Sud', 'coree du sud|south korea|corea del sur'],
    ['Thaïlande', 'thailande|thailand|tailandia'],
    ['Brésil', 'bresil|brazil|brasil'],
    ['Argentine', 'argentine|argentina'],
    ['Maroc', 'maroc|morocco|marruecos'],
    ['Tunisie', 'tunisie|tunisia|tunez'],
    ['Algérie', 'algerie|algeria|argelia'],
    ['Égypte', 'egypte|egypt|egipto'],
    ['Afrique du Sud', 'afrique du sud|south africa|sudafrica'],
    ['Liechtenstein', 'liechtenstein']
  ].forEach(function (row) {
    row[1].split('|').forEach(function (a) { COUNTRY_ALIAS[a] = row[0]; });
  });

  function normRaw(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[’'`´"]/g, ' ')
      .replace(/[\-_\/.,;:()\[\]{}|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  var norm = normRaw;

  function canonCountry(name) {
    var n = norm(name);
    if (!n) return '';
    if (COUNTRY_ALIAS[n]) return COUNTRY_ALIAS[n];
    if (/^[a-z]{2}$/.test(n) && CC_NAME[n.toUpperCase()]) return CC_NAME[n.toUpperCase()];
    // forme inconnue : on garde ce que l'utilisateur a écrit, joliment présenté
    var raw = String(name).trim();
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  /* ------------------------------------------------------------------ */
  /*  Dictionnaire de villes  « noms/alias | lat | lng | pays »          */
  /* ------------------------------------------------------------------ */
  var CITY_SRC = [
    // --- Suisse
    'geneve/geneva/genf/ginevra|46.2044|6.1432|CH', 'lausanne|46.5197|6.6323|CH',
    'zurich/zuerich|47.3769|8.5417|CH', 'berne/bern|46.9480|7.4474|CH',
    'bale/basel|47.5596|7.5886|CH', 'nyon|46.3833|6.2396|CH', 'vevey|46.4628|6.8434|CH',
    'montreux|46.4312|6.9107|CH', 'morges|46.5113|6.4981|CH',
    'yverdon les bains/yverdon|46.7785|6.6411|CH', 'fribourg suisse/fribourg|46.8065|7.1620|CH',
    'neuchatel|46.9896|6.9293|CH', 'sion|46.2293|7.3590|CH', 'sierre|46.2920|7.5330|CH',
    'martigny|46.1026|7.0736|CH', 'monthey|46.2540|6.9560|CH', 'lugano|46.0037|8.9511|CH',
    'bellinzone|46.1946|9.0243|CH', 'locarno|46.1708|8.7995|CH', 'lucerne/luzern|47.0502|8.3093|CH',
    'saint gall/st gallen|47.4245|9.3767|CH', 'winterthur|47.5001|8.7501|CH', 'zoug/zug|47.1724|8.5176|CH',
    'schaffhouse/schaffhausen|47.6960|8.6340|CH', 'coire/chur|46.8499|9.5329|CH',
    'thoune/thun|46.7580|7.6280|CH', 'bienne/biel|47.1368|7.2467|CH',
    'la chaux de fonds|47.1035|6.8286|CH', 'delemont|47.3650|7.3440|CH',
    'carouge|46.1833|6.1394|CH', 'lancy|46.1887|6.1175|CH', 'meyrin|46.2333|6.0833|CH',
    'versoix|46.2833|6.1667|CH', 'vernier|46.2167|6.0833|CH', 'onex|46.1833|6.1000|CH',
    'plan les ouates|46.1667|6.1167|CH', 'thonex|46.1900|6.2000|CH', 'chene bourg|46.1944|6.1944|CH',
    'chene bougeries|46.1925|6.1861|CH', 'cologny|46.2167|6.1833|CH', 'grand saconnex|46.2333|6.1167|CH',
    'petit saconnex/saconnex|46.2200|6.1400|CH', 'hauterive|46.9667|6.8833|CH',
    'renens|46.5390|6.5880|CH', 'pully|46.5105|6.6600|CH', 'prilly|46.5330|6.6050|CH',
    'ecublens|46.5290|6.5620|CH', 'gland|46.4210|6.2700|CH', 'rolle|46.4590|6.3380|CH',
    'coppet|46.3150|6.1950|CH', 'aigle|46.3180|6.9700|CH', 'bulle|46.6190|7.0580|CH',
    'baden|47.4730|8.3060|CH', 'aarau|47.3900|8.0450|CH', 'olten|47.3500|7.9030|CH',
    'soleure/solothurn|47.2088|7.5372|CH', 'interlaken|46.6863|7.8632|CH', 'davos|46.8027|9.8360|CH',
    'saint moritz/st moritz|46.4908|9.8355|CH', 'zermatt|46.0207|7.7491|CH', 'verbier|46.0964|7.2286|CH',
    'crans montana|46.3100|7.4800|CH', 'nendaz|46.1860|7.3050|CH',
    // --- France
    'paris|48.8566|2.3522|FR', 'lyon|45.7640|4.8357|FR', 'marseille|43.2965|5.3698|FR',
    'toulouse|43.6047|1.4442|FR', 'nice|43.7102|7.2620|FR', 'nantes|47.2184|-1.5536|FR',
    'montpellier|43.6108|3.8767|FR', 'strasbourg|48.5734|7.7521|FR', 'bordeaux|44.8378|-0.5792|FR',
    'lille|50.6292|3.0573|FR', 'rennes|48.1173|-1.6778|FR', 'reims|49.2583|4.0317|FR',
    'le havre|49.4944|0.1079|FR', 'saint etienne|45.4397|4.3872|FR', 'toulon|43.1242|5.9280|FR',
    'grenoble|45.1885|5.7245|FR', 'dijon|47.3220|5.0415|FR', 'angers|47.4784|-0.5632|FR',
    'nimes|43.8367|4.3601|FR', 'villeurbanne|45.7719|4.8902|FR', 'clermont ferrand|45.7772|3.0870|FR',
    'le mans|48.0061|0.1996|FR', 'aix en provence|43.5297|5.4474|FR', 'brest|48.3904|-4.4861|FR',
    'tours|47.3941|0.6848|FR', 'amiens|49.8941|2.2958|FR', 'limoges|45.8336|1.2611|FR',
    'annecy|45.8992|6.1294|FR', 'perpignan|42.6887|2.8948|FR', 'metz|49.1193|6.1757|FR',
    'besancon|47.2378|6.0241|FR', 'orleans|47.9029|1.9093|FR', 'rouen|49.4432|1.0993|FR',
    'mulhouse|47.7508|7.3359|FR', 'caen|49.1829|-0.3707|FR', 'nancy|48.6921|6.1844|FR',
    'avignon|43.9493|4.8055|FR', 'cannes|43.5528|7.0174|FR', 'antibes|43.5808|7.1239|FR',
    'annemasse|46.1958|6.2354|FR', 'thonon les bains/thonon|46.3704|6.4800|FR',
    'evian les bains/evian|46.4006|6.5894|FR', 'saint julien en genevois|46.1440|6.0820|FR',
    'ferney voltaire|46.2564|6.1081|FR', 'gex|46.3340|6.0580|FR', 'divonne les bains|46.3570|6.1410|FR',
    'saint genis pouilly|46.2430|6.0200|FR', 'ambilly|46.1950|6.2100|FR', 'gaillard|46.1870|6.2060|FR',
    'cluses|46.0600|6.5800|FR', 'chamonix|45.9237|6.8694|FR', 'megeve|45.8567|6.6173|FR',
    'chambery|45.5646|5.9178|FR', 'aix les bains|45.6886|5.9150|FR', 'bourg en bresse|46.2056|5.2256|FR',
    'versailles|48.8049|2.1204|FR', 'boulogne billancourt|48.8397|2.2399|FR',
    'saint denis|48.9362|2.3574|FR', 'neuilly sur seine|48.8848|2.2686|FR',
    'nanterre|48.8924|2.2071|FR', 'creteil|48.7904|2.4556|FR', 'pau|43.2951|-0.3708|FR',
    'bayonne|43.4929|-1.4748|FR', 'biarritz|43.4832|-1.5586|FR', 'la rochelle|46.1603|-1.1511|FR',
    'poitiers|46.5802|0.3404|FR', 'lorient|47.7482|-3.3702|FR', 'quimper|47.9960|-4.1024|FR',
    'saint malo|48.6493|-2.0257|FR', 'colmar|48.0794|7.3585|FR', 'ajaccio|41.9192|8.7386|FR',
    'bastia|42.6977|9.4509|FR', 'menton|43.7745|7.4980|FR', 'valence drome|44.9334|4.8924|FR',
    // --- Belgique / Luxembourg / Pays-Bas
    'bruxelles/brussels/brussel|50.8503|4.3517|BE', 'anvers/antwerp/antwerpen|51.2194|4.4025|BE',
    'liege/luik|50.6326|5.5797|BE', 'gand/ghent/gent|51.0543|3.7174|BE', 'bruges/brugge|51.2093|3.2247|BE',
    'namur|50.4674|4.8719|BE', 'charleroi|50.4108|4.4446|BE', 'mons|50.4542|3.9523|BE',
    'louvain/leuven|50.8798|4.7005|BE', 'luxembourg|49.6116|6.1319|LU',
    'amsterdam|52.3676|4.9041|NL', 'rotterdam|51.9244|4.4777|NL', 'la haye/den haag/the hague|52.0705|4.3007|NL',
    'utrecht|52.0907|5.1214|NL', 'eindhoven|51.4416|5.4697|NL', 'groningen|53.2194|6.5665|NL',
    'maastricht|50.8514|5.6910|NL',
    // --- Allemagne / Autriche
    'berlin|52.5200|13.4050|DE', 'munich/munchen|48.1351|11.5820|DE', 'hambourg/hamburg|53.5511|9.9937|DE',
    'cologne/koln|50.9375|6.9603|DE', 'francfort/frankfurt|50.1109|8.6821|DE', 'stuttgart|48.7758|9.1829|DE',
    'dusseldorf|51.2277|6.7735|DE', 'dortmund|51.5136|7.4653|DE', 'essen|51.4556|7.0116|DE',
    'leipzig|51.3397|12.3731|DE', 'dresde/dresden|51.0504|13.7373|DE', 'hanovre/hannover|52.3759|9.7320|DE',
    'nuremberg/nurnberg|49.4521|11.0767|DE', 'breme/bremen|53.0793|8.8017|DE',
    'fribourg en brisgau/freiburg im breisgau|47.9990|7.8421|DE', 'heidelberg|49.3988|8.6724|DE',
    'mannheim|49.4875|8.4660|DE', 'karlsruhe|49.0069|8.4037|DE', 'constance/konstanz|47.6779|9.1732|DE',
    'bonn|50.7374|7.0982|DE', 'aix la chapelle/aachen|50.7753|6.0839|DE',
    'vienne autriche/vienna/wien/vienne|48.2082|16.3738|AT', 'salzbourg/salzburg|47.8095|13.0550|AT',
    'innsbruck|47.2692|11.4041|AT', 'graz|47.0707|15.4395|AT',
    // --- Espagne / Portugal
    'madrid|40.4168|-3.7038|ES', 'barcelone/barcelona|41.3874|2.1686|ES', 'valencia|39.4699|-0.3763|ES',
    'seville/sevilla|37.3891|-5.9845|ES', 'bilbao|43.2630|-2.9350|ES', 'malaga|36.7213|-4.4214|ES',
    'saragosse/zaragoza|41.6488|-0.8891|ES', 'palma|39.5696|2.6502|ES', 'alicante|38.3452|-0.4810|ES',
    'grenade/granada|37.1773|-3.5986|ES', 'san sebastian/donostia|43.3183|-1.9812|ES',
    'murcia|37.9922|-1.1307|ES', 'valladolid|41.6523|-4.7245|ES', 'vigo|42.2406|-8.7207|ES',
    'las palmas|28.1235|-15.4363|ES', 'santa cruz de tenerife/tenerife|28.4636|-16.2518|ES',
    'ibiza|38.9067|1.4206|ES', 'marbella|36.5100|-4.8858|ES', 'sitges|41.2371|1.8058|ES',
    'gerone/girona|41.9794|2.8214|ES', 'tarragone/tarragona|41.1189|1.2445|ES',
    'lisbonne/lisbon/lisboa|38.7223|-9.1393|PT', 'porto|41.1579|-8.6291|PT', 'faro|37.0194|-7.9304|PT',
    'braga|41.5454|-8.4265|PT', 'coimbra|40.2033|-8.4103|PT', 'funchal|32.6669|-16.9241|PT',
    'cascais|38.6979|-9.4215|PT',
    // --- Italie
    'rome/roma|41.9028|12.4964|IT', 'milan/milano|45.4642|9.1900|IT', 'turin/torino|45.0703|7.6869|IT',
    'florence/firenze|43.7696|11.2558|IT', 'naples/napoli|40.8518|14.2681|IT',
    'venise/venezia/venice|45.4408|12.3155|IT', 'bologne/bologna|44.4949|11.3426|IT',
    'genes/genova|44.4056|8.9463|IT', 'palerme/palermo|38.1157|13.3615|IT', 'verone/verona|45.4384|10.9916|IT',
    'pise/pisa|43.7228|10.4017|IT', 'bari|41.1171|16.8719|IT', 'catane/catania|37.5079|15.0830|IT',
    'padoue/padova|45.4064|11.8768|IT', 'trieste|45.6495|13.7768|IT', 'cagliari|39.2238|9.1217|IT',
    'sienne/siena|43.3188|11.3308|IT', 'como|45.8081|9.0852|IT', 'bergame/bergamo|45.6983|9.6773|IT',
    'brescia|45.5416|10.2118|IT', 'trento|46.0748|11.1217|IT', 'aoste/aosta|45.7370|7.3150|IT',
    // --- Royaume-Uni / Irlande
    'londres/london|51.5074|-0.1278|GB', 'manchester|53.4808|-2.2426|GB', 'birmingham|52.4862|-1.8904|GB',
    'edimbourg/edinburgh|55.9533|-3.1883|GB', 'glasgow|55.8642|-4.2518|GB', 'liverpool|53.4084|-2.9916|GB',
    'leeds|53.8008|-1.5491|GB', 'bristol|51.4545|-2.5879|GB', 'cardiff|51.4816|-3.1791|GB',
    'oxford|51.7520|-1.2577|GB', 'cambridge|52.2053|0.1218|GB', 'brighton|50.8225|-0.1372|GB',
    'belfast|54.5973|-5.9301|GB', 'sheffield|53.3811|-1.4701|GB', 'newcastle|54.9783|-1.6178|GB',
    'nottingham|52.9548|-1.1581|GB', 'southampton|50.9097|-1.4044|GB',
    'dublin|53.3498|-6.2603|IE', 'cork|51.8985|-8.4756|IE', 'galway|53.2707|-9.0568|IE', 'limerick|52.6638|-8.6267|IE',
    // --- Nord / Est / Sud-Est
    'stockholm|59.3293|18.0686|SE', 'goteborg/gothenburg|57.7089|11.9746|SE', 'malmo|55.6050|13.0038|SE',
    'copenhague/copenhagen/kobenhavn|55.6761|12.5683|DK', 'oslo|59.9139|10.7522|NO', 'bergen|60.3913|5.3221|NO',
    'helsinki|60.1699|24.9384|FI', 'reykjavik|64.1466|-21.9426|IS',
    'prague/praha|50.0755|14.4378|CZ', 'varsovie/warsaw/warszawa|52.2297|21.0122|PL',
    'cracovie/krakow|50.0647|19.9450|PL', 'budapest|47.4979|19.0402|HU', 'bucarest/bucharest|44.4268|26.1025|RO',
    'athenes/athens|37.9838|23.7275|GR', 'istanbul|41.0082|28.9784|TR', 'monaco|43.7384|7.4246|MC',
    'andorre la vieille/andorre/andorra|42.5063|1.5218|AD', 'la valette/valletta|35.8989|14.5146|MT',
    'zagreb|45.8150|15.9819|HR', 'ljubljana|46.0569|14.5058|SI', 'bratislava|48.1486|17.1077|SK',
    'sofia|42.6977|23.3219|BG', 'belgrade|44.7866|20.4489|RS', 'riga|56.9496|24.1052|LV',
    'vilnius|54.6872|25.2797|LT', 'tallinn|59.4370|24.7536|EE', 'kiev/kyiv|50.4501|30.5234|UA',
    'moscou/moscow|55.7558|37.6173|RU', 'vaduz|47.1410|9.5209|LI',
    // --- Amérique du Nord
    'montreal|45.5017|-73.5673|CA', 'quebec|46.8139|-71.2080|CA', 'toronto|43.6532|-79.3832|CA',
    'vancouver|49.2827|-123.1207|CA', 'ottawa|45.4215|-75.6972|CA', 'calgary|51.0447|-114.0719|CA',
    'new york|40.7128|-74.0060|US', 'los angeles|34.0522|-118.2437|US', 'chicago|41.8781|-87.6298|US',
    'san francisco|37.7749|-122.4194|US', 'boston|42.3601|-71.0589|US', 'washington|38.9072|-77.0369|US',
    'miami|25.7617|-80.1918|US', 'seattle|47.6062|-122.3321|US', 'houston|29.7604|-95.3698|US',
    'dallas|32.7767|-96.7970|US', 'atlanta|33.7490|-84.3880|US', 'philadelphie/philadelphia|39.9526|-75.1652|US',
    'san diego|32.7157|-117.1611|US', 'denver|39.7392|-104.9903|US', 'austin|30.2672|-97.7431|US',
    'las vegas|36.1699|-115.1398|US', 'orlando|28.5383|-81.3792|US', 'mexico|19.4326|-99.1332|MX',
    // --- Océanie / Asie / autres
    'sydney|-33.8688|151.2093|AU', 'melbourne|-37.8136|144.9631|AU', 'brisbane|-27.4698|153.0251|AU',
    'perth|-31.9505|115.8605|AU', 'auckland|-36.8485|174.7633|NZ', 'wellington|-41.2866|174.7756|NZ',
    'tokyo|35.6762|139.6503|JP', 'singapour/singapore|1.3521|103.8198|SG', 'dubai|25.2048|55.2708|AE',
    'hong kong|22.3193|114.1694|HK', 'seoul|37.5665|126.9780|KR', 'bangkok|13.7563|100.5018|TH',
    'sao paulo|-23.5505|-46.6333|BR', 'rio de janeiro|-22.9068|-43.1729|BR',
    'buenos aires|-34.6037|-58.3816|AR', 'casablanca|33.5731|-7.5898|MA', 'marrakech|31.6295|-7.9811|MA',
    'tunis|36.8065|10.1815|TN', 'alger|36.7538|3.0588|DZ', 'le caire/cairo|30.0444|31.2357|EG',
    'johannesburg|-26.2041|28.0473|ZA', 'le cap/cape town|-33.9249|18.4241|ZA'
  ];

  var CITY = {};        // clé normalisée → {lat,lng,cc}
  var CITY_KEYS = [];
  CITY_SRC.forEach(function (line) {
    var p = line.split('|');
    var entry = { lat: parseFloat(p[1]), lng: parseFloat(p[2]), cc: p[3] };
    p[0].split('/').forEach(function (name) {
      var k = norm(name);
      if (k && !CITY[k]) { CITY[k] = entry; CITY_KEYS.push(k); }
    });
  });

  /** Dernière occurrence de `key` comme mot entier dans `text` (index ou -1). */
  function lastWordIndex(text, key) {
    var idx = text.lastIndexOf(key);
    while (idx !== -1) {
      var end = idx + key.length;
      var okL = idx === 0 || text.charAt(idx - 1) === ' ';
      var okR = end === text.length || text.charAt(end) === ' ';
      if (okL && okR) return idx;
      if (idx === 0) return -1;
      idx = text.lastIndexOf(key, idx - 1);
    }
    return -1;
  }

  /** Ville du dictionnaire trouvée dans un texte (adresse…). La plus à DROITE gagne :
   *  « Rue de Lausanne 5, Genève » → Genève. */
  function findCityInText(text) {
    var n = norm(text);
    if (!n) return null;
    if (CITY[n]) return CITY[n];
    var best = null, bestEnd = -1, bestLen = 0;
    for (var i = 0; i < CITY_KEYS.length; i++) {
      var k = CITY_KEYS[i];
      var idx = lastWordIndex(n, k);
      if (idx === -1) continue;
      var end = idx + k.length;
      if (end > bestEnd || (end === bestEnd && k.length > bestLen)) {
        best = CITY[k]; bestEnd = end; bestLen = k.length;
      }
    }
    return best;
  }

  /** Pays cité en toutes lettres dans un texte (≥ 4 lettres pour éviter « us », « ch »…). */
  function findCountryInText(text) {
    var n = norm(text);
    if (!n) return '';
    var best = '', bestEnd = -1;
    Object.keys(COUNTRY_ALIAS).forEach(function (k) {
      if (k.length < 4) return;
      var idx = lastWordIndex(n, k);
      if (idx === -1) return;
      var end = idx + k.length;
      if (end > bestEnd) { bestEnd = end; best = COUNTRY_ALIAS[k]; }
    });
    return best;
  }

  /* ------------------------------------------------------------------ */
  /*  Géocodage de secours (Nominatim) + cache                           */
  /* ------------------------------------------------------------------ */
  var geoCache = {};
  var geoVersion = 0;
  var geoRequests = 0;
  var GEO_MAX_REQUESTS = 80;
  var GEO_FAIL_TTL = 6 * 3600 * 1000;
  var geoQueue = [];
  var geoInFlight = {};
  var geoBusy = false;

  try { geoCache = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { geoCache = {}; }
  function saveGeoCache() {
    try {
      var keys = Object.keys(geoCache);
      if (keys.length > 400) {
        keys.sort(function (a, b) { return (geoCache[a][3] || 0) - (geoCache[b][3] || 0); });
        keys.slice(0, keys.length - 400).forEach(function (k) { delete geoCache[k]; });
      }
      localStorage.setItem(STORE_KEY, JSON.stringify(geoCache));
    } catch (e) {}
  }
  function geocoderOn() { return window.AUPYGO_GEOCODER !== false && typeof fetch === 'function'; }
  function geoKey(query, hint) { return norm(query) + '|' + norm(hint || ''); }

  /** Lecture synchrone du cache : {lat,lng,country} | null (inconnu ou échec récent) */
  function geoLookup(query, hint) {
    var c = geoCache[geoKey(query, hint)];
    if (!c || c[0] == null) return null;
    return { lat: c[0], lng: c[1], country: c[2] || '' };
  }
  function geoKnownFailure(query, hint) {
    var c = geoCache[geoKey(query, hint)];
    return !!(c && c[0] == null && Date.now() - (c[3] || 0) < GEO_FAIL_TTL);
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function geocode(query, hint, urgent) {
    return new Promise(function (resolve) {
      if (!geocoderOn() || !query || String(query).trim().length < 2) return resolve(null);
      var key = geoKey(query, hint);
      var hit = geoLookup(query, hint);
      if (hit) return resolve(hit);
      if (geoKnownFailure(query, hint)) return resolve(null);
      if (geoInFlight[key]) { geoInFlight[key].resolvers.push(resolve); return; }
      var job = { key: key, query: String(query).trim(), hint: hint || '', resolvers: [resolve] };
      geoInFlight[key] = job;
      if (urgent) geoQueue.unshift(job); else geoQueue.push(job);
      pumpGeo();
    });
  }

  function pumpGeo() {
    if (geoBusy || !geoQueue.length) return;
    if (geoRequests >= GEO_MAX_REQUESTS) {
      geoQueue.splice(0).forEach(function (j) {
        delete geoInFlight[j.key];
        j.resolvers.forEach(function (r) { r(null); });
      });
      return;
    }
    geoBusy = true;
    var job = geoQueue.shift();
    geoRequests++;
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1' +
      '&accept-language=fr&q=' + encodeURIComponent(job.query + (job.hint ? ', ' + job.hint : ''));
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (e) {} }, 6000);
    var done = function (val, ok) {
      clearTimeout(timer);
      if (val) {
        geoCache[job.key] = [val.lat, val.lng, val.country || '', Date.now()];
        geoVersion++;
      } else if (ok) {
        geoCache[job.key] = [null, null, '', Date.now()];   // « introuvable » : on ne redemande pas avant 6 h
      }
      saveGeoCache();
      delete geoInFlight[job.key];
      job.resolvers.forEach(function (r) { r(val); });
      setTimeout(function () { geoBusy = false; pumpGeo(); }, 1100);   // 1 requête / seconde max
      if (val) scheduleGeoRefresh();
    };
    fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)); })
      .then(function (arr) {
        var r = Array.isArray(arr) && arr[0];
        if (!r || isNaN(parseFloat(r.lat)) || isNaN(parseFloat(r.lon))) return done(null, true);
        var a = r.address || {};
        var cc = String(a.country_code || '').toUpperCase();
        var country = CC_NAME[cc] || canonCountry(a.country || '');
        done({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), country: country }, true);
      })
      .catch(function () { done(null, false); });   // réseau / CSP : pas de mémoire d'échec définitive
  }

  /* ------------------------------------------------------------------ */
  /*  État du viewer (relu depuis Supabase)                              */
  /* ------------------------------------------------------------------ */
  var V = {
    uid: null, city: '', cityKey: '', host: '', country: '', staffCountry: '',
    approx: null, coords: null, coordsSrc: '', homeCountry: '', privDb: false, loadedAt: 0
  };

  function client() {
    try { if (window.supabaseClient) return window.supabaseClient; } catch (e) {}
    try { if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient; } catch (e2) {}
    return null;
  }

  function isPrivileged() {
    try {
      if (typeof window.isStaff === 'function' && window.isStaff()) return true;
      if (typeof window.isAmiral === 'function' && window.isAmiral()) return true;
      if (typeof window.isAdmin === 'function' && window.isAdmin()) return true;
    } catch (e) {}
    return !!V.privDb;
  }

  function computeViewerCoords() {
    V.coords = null; V.coordsSrc = '';
    if (V.city) {
      var d = findCityInText(V.city);
      if (d) { V.coords = { lat: d.lat, lng: d.lng }; V.coordsSrc = 'dico'; V.homeCountry = CC_NAME[d.cc] || ''; return; }
      var g = geoLookup(cityQuery(V.city), V.host);
      if (g) { V.coords = { lat: g.lat, lng: g.lng }; V.coordsSrc = 'geocodage'; V.homeCountry = g.country || ''; return; }
    }
    if (V.approx) { V.coords = V.approx; V.coordsSrc = 'profil (approx_lat/lng)'; }
  }
  function cityQuery(city) { return String(city || '').split(/[,(]/)[0].trim(); }

  async function refreshViewer() {
    var sb = client();
    if (!sb) return V;
    var uid = null;
    try { uid = window.currentUser && window.currentUser.id; } catch (e) {}
    if (!uid) {
      try {
        var u = await sb.auth.getUser();
        uid = u && u.data && u.data.user && u.data.user.id;
      } catch (e1) {}
    }
    if (!uid) { V.uid = null; return V; }
    V.uid = uid;
    try {
      var q = function (cols) { return sb.from('profiles').select(cols).eq('id', uid).maybeSingle(); };
      var res = await Promise.race([
        q('id, city, country, host_country, approx_lat, approx_lng, staff_country, role, is_admin'),
        sleep(6000).then(function () { return null; })
      ]);
      if (res && res.error) {
        res = await Promise.race([q('id, city, country, host_country'), sleep(6000).then(function () { return null; })]);
      }
      var p = res && res.data;
      if (p) {
        V.city = String(p.city || '').trim();
        V.country = p.country || '';
        V.host = p.host_country || '';
        V.staffCountry = p.staff_country || '';
        V.approx = (p.approx_lat != null && p.approx_lng != null &&
          !isNaN(Number(p.approx_lat)) && !isNaN(Number(p.approx_lng)))
          ? { lat: Number(p.approx_lat), lng: Number(p.approx_lng) } : null;
        var role = String(p.role || '').toLowerCase().trim();
        V.privDb = p.is_admin === true || STAFF_ROLES.indexOf(role) !== -1;
        V.loadedAt = Date.now();
        // garder les autres modules à jour (ils lisent currentUserProfile.city / host_country)
        try {
          var cp = window.currentUserProfile;
          if (cp && typeof cp === 'object') {
            cp.city = p.city; cp.host_country = p.host_country; if (p.country) cp.country = p.country;
          }
        } catch (e2) {}
      } else if (!V.city) {
        var el = document.getElementById('city');
        if (el && el.value) V.city = String(el.value).trim();
      }
    } catch (e3) {
      console.warn('[AUPYGO] relecture ville profil impossible', e3);
    }
    V.cityKey = norm(V.city);
    computeViewerCoords();
    return V;
  }

  async function ensureViewerGeo() {
    if (isPrivileged() || !V.city || V.coords && V.coordsSrc !== 'profil (approx_lat/lng)') return;
    if (!geocoderOn()) return;
    await Promise.race([geocode(cityQuery(V.city), V.host, true), sleep(3500)]);
    computeViewerCoords();
  }

  function viewerCountryLabel() {
    var c = V.host || V.staffCountry || V.homeCountry || '';
    return c ? canonCountry(c) : '';
  }

  /* ------------------------------------------------------------------ */
  /*  Localisation / pays d'une sortie                                   */
  /* ------------------------------------------------------------------ */
  var geoMemo = {};
  function haversineKm(lat1, lng1, lat2, lng2) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function tagValue(ev, name) {
    var m = String((ev && ev.description) || '').match(new RegExp('\\[' + name + ':([^\\]]+)\\]', 'i'));
    return m ? m[1].trim() : '';
  }

  function creatorOf(ev) {
    var list = window.profiles;
    if (!Array.isArray(list) || !ev) return null;
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === ev.creator_id) return list[i];
    return null;
  }

  /** Position d'une sortie : {lat,lng,country,src} | null.  `queue` = autorise le géocodage en tâche de fond. */
  function eventGeo(ev, queue) {
    if (!ev) return null;
    var addr = String(ev.address || '').trim();
    var hostCity = tagValue(ev, 'HOST_CITY');
    var memoKey = String(ev.id) + '|' + addr + '|' + hostCity + '|' + geoVersion;
    if (geoMemo[memoKey] !== undefined && !(queue && geoMemo[memoKey] === null)) return geoMemo[memoKey];

    var out = null, d;
    if (hostCity && (d = findCityInText(hostCity))) {
      out = { lat: d.lat, lng: d.lng, country: CC_NAME[d.cc] || '', src: 'tag ville' };
    }
    if (!out && addr && (d = findCityInText(addr))) {
      out = { lat: d.lat, lng: d.lng, country: CC_NAME[d.cc] || '', src: 'dico' };
    }
    if (!out && addr) {
      var hint = tagValue(ev, 'HOST_COUNTRY') || findCountryInText(addr) || '';
      var g = geoLookup(addr, '');
      if (!g && hint) g = geoLookup(addr, hint);
      if (g) out = { lat: g.lat, lng: g.lng, country: g.country, src: 'geocodage' };
      else if (queue && geocoderOn() && !geoKnownFailure(addr, '')) geocode(addr, '', false);
    }
    if (!out) {
      var cr = creatorOf(ev);
      if (cr) {
        if (cr.approx_lat != null && cr.approx_lng != null && !isNaN(Number(cr.approx_lat))) {
          out = { lat: Number(cr.approx_lat), lng: Number(cr.approx_lng),
            country: cr.host_country ? canonCountry(cr.host_country) : '', src: 'créateur' };
        } else if (cr.city && (d = findCityInText(cr.city))) {
          out = { lat: d.lat, lng: d.lng, country: CC_NAME[d.cc] || '', src: 'ville du créateur' };
        }
      }
    }
    geoMemo[memoKey] = out;
    return out;
  }

  function eventCountry(ev) {
    var addr = String((ev && ev.address) || '');
    var g = eventGeo(ev, false);
    if (g && g.src !== 'créateur' && g.src !== 'ville du créateur' && g.country) return g.country;
    var tag = tagValue(ev, 'HOST_COUNTRY');
    if (tag) return canonCountry(tag);
    var inText = findCountryInText(addr);
    if (inText) return inText;
    var cr = creatorOf(ev);
    if (cr && cr.host_country) return canonCountry(cr.host_country);
    if (g && g.country) return g.country;
    return 'Autre';
  }

  function isPending(ev) { return String((ev && ev.description) || '').indexOf(PENDING_TAG) !== -1; }

  function isMineOrJoined(ev) {
    var uid = V.uid || (window.currentUser && window.currentUser.id);
    if (!uid) return false;
    if (ev.creator_id === uid) return true;
    var parts = ev.event_participants || [];
    for (var i = 0; i < parts.length; i++) {
      if (((parts[i] && parts[i].user_id) || parts[i]) === uid) return true;
    }
    return false;
  }

  /** Règle pour un USER (les privilégiés ne passent jamais ici). */
  function allowedForUser(ev) {
    if (!ev) return false;
    if (isPending(ev)) return false;
    if (isMineOrJoined(ev)) return true;
    if (ev.visibility === 'friends') return true;       // déjà limité aux invités par la RLS
    if (!V.coords) return true;                          // pas de ville connue : on ne peut pas filtrer
    var g = eventGeo(ev, true);
    if (!g) return false;                                // lieu introuvable : masquée
    return haversineKm(V.coords.lat, V.coords.lng, g.lat, g.lng) <= RADIUS_KM;
  }

  /* ------------------------------------------------------------------ */
  /*  Cache d'événements d'app.js                                        */
  /* ------------------------------------------------------------------ */
  var rawById = {};
  var rawList = [];

  function getCache() {
    if (Array.isArray(window.cachedEvents)) return window.cachedEvents;
    try { if (typeof cachedEvents !== 'undefined' && Array.isArray(cachedEvents)) return cachedEvents; } catch (e) {}
    return null;
  }
  function absorbCache() {
    var c = getCache();
    if (!c) return;
    c.forEach(function (ev) {
      if (!ev || ev.id == null) return;
      var id = String(ev.id);
      if (!rawById[id]) rawList.push(ev);
      rawById[id] = ev;
    });
  }
  function resetRaw() { rawById = {}; rawList = []; absorbCache(); }

  /** Retire du cache les sorties hors zone (en place). Retourne le nombre retiré. */
  function syncCache() {
    var c = getCache();
    if (!c || isPrivileged()) return 0;
    var keep = c.filter(allowedForUser);
    var removed = c.length - keep.length;
    if (removed > 0) {
      c.splice.apply(c, [0, c.length].concat(keep));
      if (window.cachedEvents !== c) { try { window.cachedEvents = c; } catch (e) {} }
    }
    return removed;
  }

  function rerenderAll() {
    var list = getCache() || [];
    var calls = [
      ['renderEventGridFiltered', []],
      ['renderSpecialEventsHero', [list]],
      ['renderEventsAgenda', [list]],
      ['renderCommunityAgenda', [list]],
      ['renderPersonalAgenda', [list]],
      ['updateMyAgendaList', []]
    ];
    calls.forEach(function (c) {
      try { if (typeof window[c[0]] === 'function') window[c[0]].apply(window, c[1]); } catch (e) {
        console.warn('[AUPYGO] ' + c[0], e);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Regroupement par pays dans le DOM                                  */
  /* ------------------------------------------------------------------ */
  var applying = false;
  var observer = null;
  var observedGrid = null;

  function injectCss() {
    if (document.getElementById('aupygo-region-css')) return;
    var st = document.createElement('style');
    st.id = 'aupygo-region-css';
    st.textContent =
      '.aupygo-country-group{grid-column:1/-1;flex:0 0 100%;width:100%;box-sizing:border-box;display:flex;align-items:center;gap:8px;' +
      'margin:16px 0 4px;padding:8px 14px;border-radius:12px;background:rgba(124,58,237,.12);' +
      'border:1px solid rgba(124,58,237,.28);font-weight:800;font-size:14px;color:inherit}' +
      '.aupygo-country-group.first{margin-top:4px}' +
      '.aupygo-country-group .acg-count{font-size:12px;font-weight:600;opacity:.7}' +
      '.aupygo-region-empty{grid-column:1/-1;flex:0 0 100%;width:100%;box-sizing:border-box;padding:16px;opacity:.85}';
    (document.head || document.documentElement).appendChild(st);
  }

  function cardId(node) {
    if (!node || node.nodeType !== 1) return null;
    var el = node.hasAttribute('data-event-id') ? node : node.querySelector('[data-event-id]');
    return el ? el.getAttribute('data-event-id') : null;
  }
  function isOurs(node) {
    return node.classList && (node.classList.contains('aupygo-country-group') || node.classList.contains('aupygo-region-empty'));
  }

  function regroup() {
    var grid = document.getElementById('eventGrid');
    if (!grid || applying) return;
    ensureObserver(grid);

    // 1) cache de données à jour (filtré pour les users) — avant de toucher au DOM
    absorbCache();
    var removed = 0;
    try { removed = syncCache(); } catch (e) { console.warn('[AUPYGO] syncCache', e); }
    if (removed > 0) rerenderAll();

    applying = true;
    try {
      var privileged = isPrivileged();
      var children = Array.prototype.slice.call(grid.children);
      children.filter(isOurs).forEach(function (n) { grid.removeChild(n); });
      children = children.filter(function (n) { return !isOurs(n); });

      var others = [], cards = [], hidden = [];
      children.forEach(function (node) {
        var id = cardId(node);
        if (!id) { others.push(node); return; }
        var ev = rawById[id] || null;
        if (ev && !privileged && !allowedForUser(ev)) {
          node.style.display = 'none';
          node.setAttribute('data-region-hidden', '1');
          hidden.push(node);
          return;
        }
        if (node.getAttribute('data-region-hidden')) {
          node.style.display = '';
          node.removeAttribute('data-region-hidden');
        }
        cards.push({ node: node, country: ev ? eventCountry(ev) : 'Autre' });
      });

      // groupes
      var groups = {}, order = [];
      cards.forEach(function (c) {
        if (!groups[c.country]) { groups[c.country] = []; order.push(c.country); }
        groups[c.country].push(c.node);
      });
      var mine = viewerCountryLabel();
      order.sort(function (a, b) {
        if (a === mine && b !== mine) return -1;
        if (b === mine && a !== mine) return 1;
        if (a === 'Autre') return 1;
        if (b === 'Autre') return -1;
        return a.localeCompare(b, 'fr');
      });

      var seq = others.slice();
      order.forEach(function (country, i) {
        var h = document.createElement('div');
        h.className = 'aupygo-country-group' + (i === 0 && !others.length ? ' first' : '');
        h.setAttribute('data-country', country);
        h.innerHTML = '<span class="acg-flag">🌍</span><span class="acg-name"></span>' +
          '<span class="acg-count">(' + groups[country].length + ')</span>';
        h.querySelector('.acg-name').textContent = country === 'Autre' ? 'Autre / lieu non précisé' : country;
        seq.push(h);
        groups[country].forEach(function (n) { seq.push(n); });
      });
      if (!cards.length && hidden.length) {
        var empty = document.createElement('p');
        empty.className = 'aupygo-region-empty footer-muted';
        empty.textContent = 'Aucune sortie dans un rayon de ' + RADIUS_KM + ' km autour de ' +
          (V.city || 'ta ville') + '. Change de ville dans ton profil pour en voir d\'autres.';
        seq.push(empty);
      }
      hidden.forEach(function (n) { seq.push(n); });

      // on ne touche au DOM que si l'ordre change réellement
      var current = Array.prototype.slice.call(grid.children);
      var same = current.length === seq.length && current.every(function (n, i) { return n === seq[i]; });
      if (!same) {
        var frag = document.createDocumentFragment();
        seq.forEach(function (n) { frag.appendChild(n); });
        grid.appendChild(frag);
      }
    } finally {
      if (observer) { try { observer.takeRecords(); } catch (e2) {} }
      applying = false;
    }
  }

  function ensureObserver(grid) {
    if (observedGrid === grid && observer) return;
    if (observer) { try { observer.disconnect(); } catch (e) {} }
    if (typeof MutationObserver !== 'function') return;
    observer = new MutationObserver(function () { if (!applying) regroup(); });
    observer.observe(grid, { childList: true });
    observedGrid = grid;
  }

  /* ------------------------------------------------------------------ */
  /*  Chargement / sauvegarde du profil                                  */
  /* ------------------------------------------------------------------ */
  var reloading = false, reloadAgain = false, lastState = null, geoRefreshTimer = null;

  function stateKey() {
    return [isPrivileged() ? 'P' : 'U', V.uid || '', V.cityKey,
      V.coords ? V.coords.lat.toFixed(2) + ',' + V.coords.lng.toFixed(2) : ''].join('|');
  }

  async function reloadEvents() {
    if (typeof window.loadAndRenderEvents !== 'function') return;
    if (reloading) { reloadAgain = true; return; }
    reloading = true;
    try { await window.loadAndRenderEvents(); } catch (e) { console.warn('[AUPYGO] reload sorties', e); }
    reloading = false;
    if (reloadAgain) { reloadAgain = false; setTimeout(reloadEvents, 300); }
  }
  window.aupygoRegionRefresh = reloadEvents;

  function scheduleGeoRefresh() {
    if (geoRefreshTimer) return;
    geoRefreshTimer = setTimeout(function () {
      geoRefreshTimer = null;
      if (isPrivileged()) regroup(); else reloadEvents();
    }, 1500);
  }

  var wrappedLoad = false;
  function patchLoad() {
    if (wrappedLoad || typeof window.loadAndRenderEvents !== 'function') return;
    wrappedLoad = true;
    var orig = window.loadAndRenderEvents;
    var wrapped = async function () {
      // relecture de la ville (et du rôle) depuis Supabase à CHAQUE chargement
      try { await refreshViewer(); await ensureViewerGeo(); } catch (e) { console.warn('[AUPYGO] viewer', e); }
      var r = await orig.apply(this, arguments);
      try {
        resetRaw();
        var removed = isPrivileged() ? 0 : syncCache();
        if (removed > 0) rerenderAll();
        rawList.forEach(function (ev) { eventGeo(ev, true); });    // lance les géocodages manquants
        regroup();
        lastState = stateKey();
      } catch (e2) { console.warn('[AUPYGO] filtre régional', e2); }
      return r;
    };
    wrapped.__aupygoRegion = true;
    window.loadAndRenderEvents = wrapped;
  }

  function afterSave() {
    return reloadEvents();   // le wrapper relit le profil dans Supabase puis refiltre
  }

  function hookSave() {
    var fn = window.saveProfile;
    if (typeof fn !== 'function' || fn.__aupygoRegionSave) return;
    var w = async function () {
      try { return await fn.apply(this, arguments); }
      finally { setTimeout(afterSave, 250); }
    };
    w.__aupygoRegionSave = true;
    window.saveProfile = w;
  }

  // filet de sécurité : clic sur un bouton « Enregistrer le profil » même si le crochet est écrasé
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var b = t.closest('[onclick*="saveProfile"]');
    if (!b) return;
    [1800, 4500].forEach(function (ms) {
      setTimeout(async function () {
        var before = stateKey();
        await refreshViewer();
        if (stateKey() !== before) { await ensureViewerGeo(); reloadEvents(); }
      }, ms);
    });
  }, true);

  /* ------------------------------------------------------------------ */
  /*  Diagnostic + exports de compatibilité                              */
  /* ------------------------------------------------------------------ */
  window.aupygoRefreshViewerCity = async function () { await refreshViewer(); return V; };
  window.aupygoFilterEventsByRegion = function (list) {
    if (!Array.isArray(list)) return list || [];
    return isPrivileged() ? list : list.filter(allowedForUser);
  };
  window.aupygoGroupEventsByCountry = function (list) {
    var g = {}, order = [];
    (list || []).forEach(function (ev) {
      var c = eventCountry(ev);
      if (!g[c]) { g[c] = []; order.push(c); }
      g[c].push(ev);
    });
    return order.map(function (c) { return { country: c, events: g[c] }; });
  };
  window.aupygoRegionDebug = function () {
    absorbCache();
    var priv = isPrivileged();
    console.log('[AUPYGO] viewer', JSON.stringify({
      ville: V.city, paysAccueil: V.host, privilegie: priv, rayonKm: RADIUS_KM,
      coordsSource: V.coordsSrc || 'aucune', pays: viewerCountryLabel(), geocodeur: geocoderOn()
    }));
    var rows = rawList.map(function (ev) {
      var g = eventGeo(ev, false);
      var km = (g && V.coords) ? Math.round(haversineKm(V.coords.lat, V.coords.lng, g.lat, g.lng)) : null;
      return {
        titre: ev.title, adresse: ev.address, pays: eventCountry(ev),
        km: km, source: g ? g.src : 'INTROUVABLE', visible: priv ? true : allowedForUser(ev)
      };
    });
    try { console.table(rows); } catch (e) { console.log(rows); }
    return rows;
  };

  /* ------------------------------------------------------------------ */
  /*  Démarrage                                                          */
  /* ------------------------------------------------------------------ */
  function boot() {
    injectCss();
    patchLoad();
    hookSave();
    var grid = document.getElementById('eventGrid');
    if (grid) { ensureObserver(grid); if (getCache() && getCache().length) regroup(); }
  }

  boot();
  [300, 800, 1500, 3000, 6000].forEach(function (ms) { setTimeout(boot, ms); });

  setInterval(function () {
    patchLoad();
    hookSave();                       // le recolle si save-profile-fix / profile-security-fix l'ont écrasé
    var grid = document.getElementById('eventGrid');
    if (grid && grid !== observedGrid) ensureObserver(grid);
    // rôle ou ville modifiés depuis le dernier chargement ? → on relit
    if (lastState !== null && !reloading && V.uid && stateKey() !== lastState) reloadEvents();
  }, 2500);

  console.log('[AUPYGO] events-region-filter v4 — ville relue à chaque chargement · ≤ ' + RADIUS_KM +
    ' km · sections par pays · aupygoRegionDebug() pour le diagnostic');
})();
