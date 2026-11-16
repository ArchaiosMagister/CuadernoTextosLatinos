/** Snapshot fiel del banco docente de GeneradorExamenes (16/11/2026).
 * Origen: ArchaiosMagister/GeneradorExamenes/data/modificacion-preverbial-docente.json.
 * Contiene familias y derivados atestiguados, NO formas verbales generadas.
 * Formato resumido para uso offline, sin añadir ni inventar derivados.
 */
export interface PreverbFamily {
  id:number;
  prompt:string;
  enunciado:string;
  derivatives:string[];
  ambiguousPrompt:boolean;
}
export const PREVERB_FAMILIES:readonly PreverbFamily[]=[
  {
    "id": 1,
    "prompt": "ago",
    "enunciado": "ago, -ere, egi, actum",
    "derivatives": [
      "abigo",
      "adigo",
      "ambigo",
      "cogo",
      "dego",
      "exigo",
      "indago",
      "perago",
      "prodigo",
      "redigo",
      "subigo",
      "transigo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 2,
    "prompt": "arceo",
    "enunciado": "arceo, -ere, -cui",
    "derivatives": [
      "coerceo",
      "exerceo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 3,
    "prompt": "cado",
    "enunciado": "cado, -ere, cecidi, casum",
    "derivatives": [
      "accido",
      "concido",
      "decido",
      "excido",
      "incido",
      "occido",
      "recido"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 4,
    "prompt": "caedo",
    "enunciado": "caedo, -ere, cecidi, caesum",
    "derivatives": [
      "abscido",
      "circumcido",
      "concido",
      "decido",
      "excido",
      "incido",
      "occido",
      "praecido",
      "recido"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 5,
    "prompt": "cano",
    "enunciado": "cano, -ere, cecini, cantum",
    "derivatives": [
      "concino",
      "intercino",
      "occino",
      "praecino",
      "recino",
      "succino"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 6,
    "prompt": "capio",
    "enunciado": "capio, -ere, cepi, captum",
    "derivatives": [
      "accipio",
      "antecapio",
      "concipio",
      "decipio",
      "excipio",
      "incipio",
      "intercipio",
      "percipio",
      "praecipio",
      "recipio",
      "suscipio"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 7,
    "prompt": "carpo",
    "enunciado": "carpo, -ere, -psi, -ptum",
    "derivatives": [
      "concerpo",
      "decerpo",
      "discerpo",
      "excerpo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 8,
    "prompt": "cedo",
    "enunciado": "cedo, -ere, cessi, cessum",
    "derivatives": [
      "abscedo",
      "accedo",
      "antecedo",
      "concedo",
      "decedo",
      "discedo",
      "excedo",
      "incedo",
      "intercedo",
      "praecedo",
      "procedo",
      "recedo",
      "retrocedo",
      "secedo",
      "succedo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 9,
    "prompt": "cerno",
    "enunciado": "cerno, -ere, -crevi, -cretum",
    "derivatives": [
      "decerno",
      "discerno",
      "excerno",
      "secerno"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 10,
    "prompt": "cieo",
    "enunciado": "cieo, -ere, civi, citum",
    "derivatives": [
      "accio",
      "concieo",
      "excio",
      "percieo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 11,
    "prompt": "clamo",
    "enunciado": "clamo, -are, -avi, -atum",
    "derivatives": [
      "acclamo",
      "conclamo",
      "declamo",
      "exclamo",
      "inclamo",
      "proclamo",
      "reclamo",
      "succlamo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 12,
    "prompt": "claudo",
    "enunciado": "claudo, -ere, clausi, clausum",
    "derivatives": [
      "concludo",
      "excludo",
      "includo",
      "intercludo",
      "occludo",
      "praecludo",
      "recludo",
      "secludo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 13,
    "prompt": "colo",
    "enunciado": "colo, -ere, colui, cultum",
    "derivatives": [
      "accolo",
      "excolo",
      "incolo",
      "percolo",
      "recolo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 14,
    "prompt": "creo",
    "enunciado": "creo, -are, -avi, -atum",
    "derivatives": [
      "concreo",
      "procreo",
      "recreo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 15,
    "prompt": "cubo",
    "enunciado": "cubo, -are, -ui, -itum",
    "derivatives": [
      "accubo",
      "excubo",
      "incubo",
      "recubo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 16,
    "prompt": "curo",
    "enunciado": "curo, -are, -avi, -atum",
    "derivatives": [
      "accuro",
      "percuro",
      "procuro"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 17,
    "prompt": "curro",
    "enunciado": "curro, -ere, cucurri, cursum",
    "derivatives": [
      "accurro",
      "concurro",
      "decurro",
      "discurro",
      "excurro",
      "incurro",
      "intercurro",
      "occurro",
      "percurro",
      "praecurro",
      "procurro",
      "recurro",
      "succurro",
      "transcurro"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 18,
    "prompt": "dico",
    "enunciado": "dico, -ere, dixi, dictum",
    "derivatives": [
      "abdico",
      "addico",
      "benedico",
      "contradico",
      "dedico",
      "edico",
      "indico",
      "interdico",
      "maledico",
      "praedico"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 19,
    "prompt": "disco",
    "enunciado": "disco, -ere, didici, discitum",
    "derivatives": [
      "addisco",
      "condisco",
      "dedisco",
      "edisco",
      "perdisco",
      "praedisco"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 20,
    "prompt": "do",
    "enunciado": "do, dare, dedi, datum",
    "derivatives": [
      "abdo",
      "abscondo",
      "addo",
      "circumdo",
      "condo",
      "dedo",
      "edo",
      "indo",
      "obdo",
      "perdo",
      "prodo",
      "recondo",
      "reddo",
      "subdo",
      "trado",
      "vendo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 21,
    "prompt": "doceo",
    "enunciado": "doceo, -ere, -cui, doctum",
    "derivatives": [
      "edoceo",
      "perdoceo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 22,
    "prompt": "duco",
    "enunciado": "duco, -ere, duxi, ductum",
    "derivatives": [
      "abduco",
      "adduco",
      "circumduco",
      "conduco",
      "deduco",
      "diduco",
      "educo",
      "induco",
      "introduco",
      "obduco",
      "perduco",
      "produco",
      "reduco",
      "seduco",
      "subduco",
      "traduco"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 23,
    "prompt": "emo",
    "enunciado": "emo, -ere, emi, emptum",
    "derivatives": [
      "adimo",
      "coemo",
      "como",
      "demo",
      "dirimo",
      "eximo",
      "interimo",
      "perimo",
      "promo",
      "redimo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 24,
    "prompt": "eo",
    "enunciado": "eo, ire, ivi, itum",
    "derivatives": [
      "abeo",
      "adeo",
      "ambio",
      "circumeo",
      "coeo",
      "exeo",
      "ineo",
      "intereo",
      "obeo",
      "pereo",
      "praeeo",
      "praetereo",
      "prodeo",
      "redeo",
      "subeo",
      "transeo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 25,
    "prompt": "facio",
    "enunciado": "facio, -ere, feci, factum",
    "derivatives": [
      "afficio",
      "calefacio",
      "conficio",
      "deficio",
      "efficio",
      "inficio",
      "interficio",
      "perficio",
      "praeficio",
      "proficio",
      "reficio",
      "satisfacio",
      "sufficio"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 26,
    "prompt": "fero",
    "enunciado": "fero, ferre, tuli, latum",
    "derivatives": [
      "affero",
      "antefero",
      "aufero",
      "circumfero",
      "confero",
      "defero",
      "differo",
      "effero",
      "infero",
      "offero",
      "perfero",
      "praefero",
      "profero",
      "refero",
      "suffero",
      "transfero"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 27,
    "prompt": "figo",
    "enunciado": "figo, -ere, fixi, fixum",
    "derivatives": [
      "affigo",
      "configo",
      "defigo",
      "infigo",
      "praefigo",
      "refigo",
      "suffigo",
      "transfigo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 28,
    "prompt": "fingo",
    "enunciado": "fingo, -ere, finxi, fictum",
    "derivatives": [
      "affingo",
      "confingo",
      "diffingo",
      "effingo",
      "refingo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 29,
    "prompt": "flecto",
    "enunciado": "flecto, -ere, flexi, flexum",
    "derivatives": [
      "circumflecto",
      "deflecto",
      "inflecto",
      "reflecto"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 30,
    "prompt": "for",
    "enunciado": "for, fari, fatus sum",
    "derivatives": [
      "affor",
      "effor",
      "praefor",
      "profor"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 31,
    "prompt": "frango",
    "enunciado": "frango, -ere, fregi, fractum",
    "derivatives": [
      "confringo",
      "diffringo",
      "effringo",
      "infringo",
      "perfringo",
      "refringo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 32,
    "prompt": "fugio",
    "enunciado": "fugio, -ere, fugi, -giturus",
    "derivatives": [
      "aufugio",
      "confugio",
      "defugio",
      "diffugio",
      "effugio",
      "perfugio",
      "profugio",
      "refugio",
      "subterfugio",
      "transfugio"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 33,
    "prompt": "fundo",
    "enunciado": "fundo, -ere, fudi, fusum",
    "derivatives": [
      "affundo",
      "circumfundo",
      "confundo",
      "defundo",
      "diffundo",
      "effundo",
      "infundo",
      "offundo",
      "perfundo",
      "profundo",
      "refundo",
      "suffundo",
      "transfundo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 34,
    "prompt": "gigno",
    "enunciado": "geno (gigno), -ere, genui, genitum",
    "derivatives": [
      "ingigno",
      "progigno",
      "progenero"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 35,
    "prompt": "gero",
    "enunciado": "gero, -ere, gessi, gestum",
    "derivatives": [
      "aggero",
      "belligero",
      "congero",
      "digero",
      "egero",
      "ingero",
      "regero",
      "suggero"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 36,
    "prompt": "gradior",
    "enunciado": "gradior, gradi, gressus sum",
    "derivatives": [
      "aggredior",
      "congredior",
      "digredior",
      "egredior",
      "ingredior",
      "praegredior",
      "progredior",
      "regredior",
      "transgredior"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 37,
    "prompt": "habeo",
    "enunciado": "habeo, -ere, -ui, -itum",
    "derivatives": [
      "adhibeo",
      "cohibeo",
      "debeo",
      "exhibeo",
      "inhibeo",
      "perhibeo",
      "posthabeo",
      "praebeo",
      "prohibeo",
      "redhibeo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 38,
    "prompt": "haereo",
    "enunciado": "haereo, -ere, haesi, haesum",
    "derivatives": [
      "adhaereo",
      "cohaereo",
      "inhaereo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 39,
    "prompt": "iacio",
    "enunciado": "iacio, -ere, ieci, iactum",
    "derivatives": [
      "abicio",
      "adicio",
      "conicio",
      "deicio",
      "disicio",
      "eicio",
      "inicio",
      "intericio",
      "obicio",
      "proicio",
      "reicio",
      "subicio",
      "traicio"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 40,
    "prompt": "iungo",
    "enunciado": "iungo, -ere, iunxi, iunctum",
    "derivatives": [
      "adiungo",
      "coniungo",
      "disiungo",
      "iniungo",
      "seiungo",
      "subiungo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 41,
    "prompt": "labor",
    "enunciado": "labor, -i, lapsus sum",
    "derivatives": [
      "allabor",
      "collabor",
      "delabor",
      "elabor",
      "illabor",
      "prolabor",
      "relabor",
      "sublabor"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 42,
    "prompt": "lego",
    "enunciado": "lego, -ere, -legi, lectum",
    "derivatives": [
      "colligo",
      "deligo",
      "diligo",
      "eligo",
      "intellego",
      "neglego",
      "perlego",
      "praelego",
      "relego",
      "seligo",
      "sublego"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 43,
    "prompt": "levo",
    "enunciado": "levo, -are, -avi, -atum",
    "derivatives": [
      "allevo",
      "elevo",
      "relevo",
      "sublevo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 44,
    "prompt": "ligo",
    "enunciado": "ligo, -are, -avi, -atum",
    "derivatives": [
      "alligo",
      "colligo",
      "deligo",
      "obligo",
      "praeligo",
      "religo",
      "subligo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 45,
    "prompt": "maneo",
    "enunciado": "maneo, -ere, mansi, mansum",
    "derivatives": [
      "immaneo",
      "permaneo",
      "remaneo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 46,
    "prompt": "misceo",
    "enunciado": "misceo, -ere, -cui, mixtum",
    "derivatives": [
      "admisceo",
      "commisceo",
      "immisceo",
      "intermisceo",
      "permisceo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 47,
    "prompt": "mitto",
    "enunciado": "mitto, -ere, misi, missum",
    "derivatives": [
      "admitto",
      "amitto",
      "circummitto",
      "committo",
      "demitto",
      "dimitto",
      "emitto",
      "immitto",
      "intermitto",
      "omitto",
      "permitto",
      "praemitto",
      "praetermitto",
      "promitto",
      "remitto",
      "submitto",
      "transmitto"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 48,
    "prompt": "moneo",
    "enunciado": "moneo, -ere, -ui, -itum",
    "derivatives": [
      "admoneo",
      "commoneo",
      "praemoneo",
      "summoneo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 49,
    "prompt": "moror",
    "enunciado": "moror, -ari, -atus sum",
    "derivatives": [
      "commoror",
      "demoror",
      "immoror",
      "remoror"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 50,
    "prompt": "moveo",
    "enunciado": "moveo, -ere, movi, motum",
    "derivatives": [
      "admoveo",
      "amoveo",
      "commoveo",
      "demoveo",
      "dimoveo",
      "emoveo",
      "permoveo",
      "promoveo",
      "removeo",
      "summoveo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 51,
    "prompt": "muto",
    "enunciado": "muto, -are, -avi, -atum",
    "derivatives": [
      "commuto",
      "demuto",
      "immuto",
      "permuto",
      "transmuto"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 52,
    "prompt": "nosco",
    "enunciado": "nosco, -ere, novi, notum",
    "derivatives": [
      "agnosco",
      "cognosco",
      "dignosco",
      "ignosco",
      "internosco",
      "recognosco"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 53,
    "prompt": "nuntio",
    "enunciado": "nuntio, -are, -avi, -atum",
    "derivatives": [
      "annuntio",
      "denuntio",
      "enuntio",
      "internuntio",
      "pronuntio",
      "renuntio"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 54,
    "prompt": "orior",
    "enunciado": "orior, oriri, ortus sum",
    "derivatives": [
      "aborior",
      "adorior",
      "coorior",
      "exorior"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 55,
    "prompt": "oro",
    "enunciado": "oro, -are, -avi, -atum",
    "derivatives": [
      "adoro",
      "exoro",
      "peroro"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 56,
    "prompt": "paro",
    "enunciado": "paro, -are, -avi, -atum",
    "derivatives": [
      "apparo",
      "comparo",
      "impero",
      "praeparo",
      "reparo",
      "separo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 57,
    "prompt": "pello",
    "enunciado": "pello, -ere, pepuli, pulsum",
    "derivatives": [
      "appello",
      "compello",
      "depello",
      "dispello",
      "expello",
      "impello",
      "interpello",
      "propello",
      "repello"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 58,
    "prompt": "pendo",
    "enunciado": "pendo, -ere, pependi, pensum",
    "derivatives": [
      "appendo",
      "dependo",
      "expendo",
      "impendo",
      "perpendo",
      "rependo",
      "suspendo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 59,
    "prompt": "peto",
    "enunciado": "peto, -ere, -ivi, -itum",
    "derivatives": [
      "appeto",
      "competo",
      "expeto",
      "impeto",
      "oppeto",
      "repeto",
      "suppeto"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 60,
    "prompt": "plecto",
    "enunciado": "plecto, -ere, plexi, plexum",
    "derivatives": [
      "amplector",
      "complector",
      "implecto"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 61,
    "prompt": "pleo",
    "enunciado": "pleo, -ere, -plevi, -pletum",
    "derivatives": [
      "compleo",
      "expleo",
      "impleo",
      "oppleo",
      "repleo",
      "suppleo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 62,
    "prompt": "pono",
    "enunciado": "pono, -ere, -sui, -situm",
    "derivatives": [
      "antepono",
      "appono",
      "circumpono",
      "compono",
      "depono",
      "dispono",
      "expono",
      "impono",
      "interpono",
      "oppono",
      "postpono",
      "praepono",
      "propono",
      "repono",
      "sepono",
      "superpono",
      "suppono",
      "transpono"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 63,
    "prompt": "porto",
    "enunciado": "porto, -are, -avi, -atum",
    "derivatives": [
      "apporto",
      "asporto",
      "comporto",
      "deporto",
      "exporto",
      "importo",
      "reporto",
      "supporto",
      "transporto"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 64,
    "prompt": "prehendo",
    "enunciado": "prehendo, -ere, -di, -sum",
    "derivatives": [
      "apprehendo",
      "comprehendo",
      "deprehendo",
      "reprehendo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 65,
    "prompt": "precor",
    "enunciado": "precor, -ari, -atus sum",
    "derivatives": [
      "comprecor",
      "deprecor",
      "imprecor"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 66,
    "prompt": "premo",
    "enunciado": "premo, -ere, pressi, pressum",
    "derivatives": [
      "apprimo",
      "comprimo",
      "deprimo",
      "exprimo",
      "imprimo",
      "opprimo",
      "reprimo",
      "supprimo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 67,
    "prompt": "pugno",
    "enunciado": "pugno, -are, -avi, -atum",
    "derivatives": [
      "depugno",
      "expugno",
      "impugno",
      "oppugno",
      "propugno",
      "repugno"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 68,
    "prompt": "puto",
    "enunciado": "puto, -are, -avi, -atum",
    "derivatives": [
      "amputo",
      "computo",
      "deputo",
      "disputo",
      "imputo",
      "reputo",
      "supputo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 69,
    "prompt": "quaero",
    "enunciado": "quaero, -ere, -sivi, -situm",
    "derivatives": [
      "acquiro",
      "conquiro",
      "disquiro",
      "exquiro",
      "inquiro",
      "perquiro",
      "requiro"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 70,
    "prompt": "quatio",
    "enunciado": "quatio, -ere, quassum",
    "derivatives": [
      "concutio",
      "decutio",
      "discutio",
      "excutio",
      "incutio",
      "percutio",
      "recutio",
      "succutio"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 71,
    "prompt": "rapio",
    "enunciado": "rapio, -ere, -pui, -ptum",
    "derivatives": [
      "abripio",
      "arripio",
      "corripio",
      "deripio",
      "diripio",
      "eripio",
      "praeripio",
      "proripio",
      "surripio"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 72,
    "prompt": "rego",
    "enunciado": "rego, -ere, rexi, rectum",
    "derivatives": [
      "arrigo",
      "corrigo",
      "dirigo",
      "erigo",
      "pergo",
      "porrigo",
      "surgo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 73,
    "prompt": "rogo",
    "enunciado": "rogo, -are, -avi, -atum",
    "derivatives": [
      "abrogo",
      "arrogo",
      "derogo",
      "erogo",
      "interrogo",
      "irrogo",
      "obrogo",
      "prorogo",
      "subrogo",
      "surrogo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 74,
    "prompt": "rumpo",
    "enunciado": "rumpo, -ere, rupi, ruptum",
    "derivatives": [
      "abrumpo",
      "corrumpo",
      "dirumpo",
      "erumpo",
      "interrumpo",
      "irrumpo",
      "perrumpo",
      "prorumpo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 75,
    "prompt": "salio",
    "enunciado": "salio, -ire, -lui, saltum",
    "derivatives": [
      "absilio",
      "assilio",
      "circumsilio",
      "desilio",
      "dissilio",
      "exsilio",
      "insilio",
      "prosilio",
      "resilio",
      "subsilio",
      "transilio"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 76,
    "prompt": "sapio",
    "enunciado": "sapio, -ere, -pui",
    "derivatives": [
      "desipio",
      "resipio"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 77,
    "prompt": "scando",
    "enunciado": "scando, -ere, -ndi, -nsum",
    "derivatives": [
      "ascendo",
      "conscendo",
      "descendo",
      "inscendo",
      "transcendo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 78,
    "prompt": "scio",
    "enunciado": "scio, -ire, -ivi, scitum",
    "derivatives": [
      "conscio",
      "nescio",
      "praescio",
      "rescio"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 79,
    "prompt": "scribo",
    "enunciado": "scribo, -ere, -psi, -ptum",
    "derivatives": [
      "ascribo",
      "circumscribo",
      "conscribo",
      "describo",
      "inscribo",
      "perscribo",
      "praescribo",
      "proscribo",
      "rescribo",
      "subscribo",
      "transcribo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 80,
    "prompt": "seco",
    "enunciado": "seco, -are, -cui, sectum",
    "derivatives": [
      "circumseco",
      "deseco",
      "disseco",
      "exseco",
      "perseco",
      "praeseco",
      "reseco",
      "subseco"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 81,
    "prompt": "sedeo",
    "enunciado": "sedeo, -ere, sedi, sessum",
    "derivatives": [
      "assideo",
      "circumsedeo",
      "desideo",
      "dissideo",
      "insideo",
      "obsideo",
      "possideo",
      "praesideo",
      "resideo",
      "supersedeo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 82,
    "prompt": "sentio",
    "enunciado": "sentio, -ire, sensi, sensum",
    "derivatives": [
      "assentio",
      "consentio",
      "dissentio",
      "persentio",
      "praesentio"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 83,
    "prompt": "sequor",
    "enunciado": "sequor, sequi, secutus sum",
    "derivatives": [
      "assequor",
      "consequor",
      "exsequor",
      "insequor",
      "obsequor",
      "persequor",
      "prosequor",
      "subsequor"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 84,
    "prompt": "sero",
    "enunciado": "sero, -ere, -rui, sertum",
    "derivatives": [
      "assero",
      "consero",
      "desero",
      "dissero",
      "exsero",
      "insero"
    ],
    "ambiguousPrompt": true
  },
  {
    "id": 85,
    "prompt": "sero",
    "enunciado": "sero, -ere, sevi, satum",
    "derivatives": [
      "consero",
      "dissero",
      "insero",
      "obsero"
    ],
    "ambiguousPrompt": true
  },
  {
    "id": 86,
    "prompt": "sino",
    "enunciado": "sino, -ere, sivi, situm",
    "derivatives": [
      "desino"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 87,
    "prompt": "sisto",
    "enunciado": "sisto, -ere, stiti, statum",
    "derivatives": [
      "absisto",
      "assisto",
      "circumsisto",
      "consisto",
      "desisto",
      "exsisto",
      "insisto",
      "obsisto",
      "persisto",
      "resisto",
      "subsisto"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 88,
    "prompt": "solvo",
    "enunciado": "solvo, -ere, solvi, solutum",
    "derivatives": [
      "absolvo",
      "dissolvo",
      "exsolvo",
      "persolvo",
      "resolvo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 89,
    "prompt": "specio",
    "enunciado": "specio (spicio), -ere, spexi, spectum",
    "derivatives": [
      "aspicio",
      "circumspicio",
      "conspicio",
      "despicio",
      "inspicio",
      "introspicio",
      "perspicio",
      "prospicio",
      "respicio",
      "suspicio"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 90,
    "prompt": "spiro",
    "enunciado": "spiro, -are, -avi, -atum",
    "derivatives": [
      "aspiro",
      "conspiro",
      "exspiro",
      "inspiro",
      "respiro",
      "suspiro"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 91,
    "prompt": "statuo",
    "enunciado": "statuo, -ere, -ui, -tutum",
    "derivatives": [
      "constituo",
      "destituo",
      "instituo",
      "prostituo",
      "restituo",
      "substituo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 92,
    "prompt": "sterno",
    "enunciado": "sterno, -ere, stravi, stratum",
    "derivatives": [
      "consterno",
      "insterno",
      "prosterno",
      "substerno"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 93,
    "prompt": "sto",
    "enunciado": "sto, -are, steti, staturus",
    "derivatives": [
      "asto",
      "antisto",
      "circumsto",
      "consto",
      "disto",
      "exsto",
      "insto",
      "obsto",
      "persto",
      "praesto",
      "prosto",
      "resto",
      "supersto"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 94,
    "prompt": "stringo",
    "enunciado": "stringo, -ere, -nxi, -ctum",
    "derivatives": [
      "astringo",
      "constringo",
      "destringo",
      "distringo",
      "obstringo",
      "perstringo",
      "praestringo",
      "restringo",
      "substringo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 95,
    "prompt": "struo",
    "enunciado": "struo, -ere, -uxi, -uctum",
    "derivatives": [
      "astruo",
      "circumstruo",
      "construo",
      "destruo",
      "exstruo",
      "instruo",
      "obstruo",
      "praestruo",
      "substruo",
      "superstruo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 96,
    "prompt": "sum",
    "enunciado": "sum, esse, fui",
    "derivatives": [
      "absum",
      "adsum",
      "desum",
      "insum",
      "intersum",
      "obsum",
      "possum",
      "praesum",
      "prosum",
      "subsum",
      "supersum"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 97,
    "prompt": "sumo",
    "enunciado": "sumo, -ere, sumpsi, sumptum",
    "derivatives": [
      "absumo",
      "assumo",
      "consumo",
      "desumo",
      "insumo",
      "praesumo",
      "resumo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 98,
    "prompt": "tango",
    "enunciado": "tango, -ere, tetigi, tactum",
    "derivatives": [
      "attingo",
      "contingo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 99,
    "prompt": "tego",
    "enunciado": "tego, -ere, texi, tectum",
    "derivatives": [
      "contego",
      "detego",
      "intego",
      "obtego",
      "protego",
      "retego"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 100,
    "prompt": "tendo",
    "enunciado": "tendo, -ere, tetendi, tensum",
    "derivatives": [
      "attendo",
      "contendo",
      "distendo",
      "extendo",
      "intendo",
      "obtendo",
      "ostendo",
      "portendo",
      "praetendo",
      "protendo",
      "retendo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 101,
    "prompt": "teneo",
    "enunciado": "teneo, -ere, tenui, tentum",
    "derivatives": [
      "abstineo",
      "attineo",
      "contineo",
      "detineo",
      "distineo",
      "obtineo",
      "pertineo",
      "retineo",
      "sustineo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 102,
    "prompt": "tollo",
    "enunciado": "tollo, -ere, sustuli, sublatum",
    "derivatives": [
      "attollo",
      "extollo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 103,
    "prompt": "torqueo",
    "enunciado": "torqueo, -ere, torsi, tortum",
    "derivatives": [
      "contorqueo",
      "detorqueo",
      "distorqueo",
      "extorqueo",
      "intorqueo",
      "obtorqueo",
      "retorqueo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 104,
    "prompt": "traho",
    "enunciado": "traho, -ere, traxi, tractum",
    "derivatives": [
      "abstraho",
      "attraho",
      "contraho",
      "detraho",
      "distraho",
      "extraho",
      "protraho",
      "retraho",
      "subtraho"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 105,
    "prompt": "tueor",
    "enunciado": "tueor, tueri, tutus sum",
    "derivatives": [
      "contueor",
      "intueor"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 106,
    "prompt": "turbo",
    "enunciado": "turbo, -are, -atum",
    "derivatives": [
      "conturbo",
      "disturbo",
      "exturbo",
      "interturbo",
      "perturbo",
      "proturbo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 107,
    "prompt": "tundo",
    "enunciado": "tundo, -ere, tutudi, tunsum",
    "derivatives": [
      "contundo",
      "extundo",
      "obtundo",
      "pertundo",
      "retundo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 108,
    "prompt": "vado",
    "enunciado": "vado, -ere, vasi, -vasum",
    "derivatives": [
      "evado",
      "invado",
      "pervado"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 109,
    "prompt": "vagor",
    "enunciado": "vagor, -ari, -atus sum",
    "derivatives": [
      "evagor",
      "pervagor"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 110,
    "prompt": "vasto",
    "enunciado": "vasto, -are, -avi, -atum",
    "derivatives": [
      "devasto",
      "pervasto"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 111,
    "prompt": "veho",
    "enunciado": "veho, -ere, vexi, vectum",
    "derivatives": [
      "adveho",
      "aveho",
      "circumvehor",
      "conveho",
      "deveho",
      "eveho",
      "inveho",
      "perveho",
      "praevehor",
      "proveho",
      "reveho",
      "subveho",
      "transveho"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 112,
    "prompt": "vello",
    "enunciado": "vello, -ere, velli, vulsum",
    "derivatives": [
      "avello",
      "convello",
      "divello",
      "evello",
      "revello"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 113,
    "prompt": "venio",
    "enunciado": "venio, -ire, veni, ventum",
    "derivatives": [
      "advenio",
      "antevenio",
      "circumvenio",
      "convenio",
      "devenio",
      "evenio",
      "intervenio",
      "invenio",
      "obvenio",
      "pervenio",
      "praevenio",
      "provenio",
      "revenio",
      "subvenio",
      "supervenio"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 114,
    "prompt": "verto",
    "enunciado": "verto, -ere, -rsi, -rsum",
    "derivatives": [
      "adverto",
      "animadverto",
      "averto",
      "circumverto",
      "converto",
      "deverto",
      "diverto",
      "everto",
      "inverto",
      "obverto",
      "perverto",
      "praeverto",
      "reverto",
      "subverto",
      "transverto"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 115,
    "prompt": "video",
    "enunciado": "video, -ere, vidi, visum",
    "derivatives": [
      "invideo",
      "praevideo",
      "provideo"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 116,
    "prompt": "vivo",
    "enunciado": "vivo, -ere, vixi, victum",
    "derivatives": [
      "convivo",
      "revivisco"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 117,
    "prompt": "voco",
    "enunciado": "voco, -are, -avi, -atum",
    "derivatives": [
      "advoco",
      "avoco",
      "convoco",
      "devoco",
      "evoco",
      "invoco",
      "provoco",
      "revoco"
    ],
    "ambiguousPrompt": false
  },
  {
    "id": 118,
    "prompt": "volo",
    "enunciado": "volo, -are, -avi, -atum",
    "derivatives": [
      "advolo",
      "avolo",
      "circumvolo",
      "convolo",
      "devolo",
      "evolo",
      "involo",
      "pervolo",
      "provolo",
      "revolo",
      "subvolo",
      "supervolo",
      "transvolo"
    ],
    "ambiguousPrompt": true
  },
  {
    "id": 119,
    "prompt": "volo",
    "enunciado": "volo, velle, volui",
    "derivatives": [
      "malo",
      "nolo"
    ],
    "ambiguousPrompt": true
  },
  {
    "id": 120,
    "prompt": "volvo",
    "enunciado": "volvo, -ere, volvi, volutum",
    "derivatives": [
      "circumvolvo",
      "convolvo",
      "devolvo",
      "evolvo",
      "involvo",
      "obvolvo",
      "provolvo",
      "revolvo"
    ],
    "ambiguousPrompt": false
  }
];
