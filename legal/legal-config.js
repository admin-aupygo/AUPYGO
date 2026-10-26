/* ==========================================================================
 * AUPYGO — legal-config.js
 * UNIQUE endroit à remplir pour toutes les pages juridiques.
 * Chaque valeur « [À COMPLÉTER …] » apparaît en jaune sur les pages tant
 * qu'elle n'est pas remplacée, et un bandeau "BROUILLON" s'affiche en haut.
 * Quand tout est rempli, le bandeau disparaît tout seul.
 * ========================================================================== */
window.AUPYGO_LEGAL = {
  /* ---------- Version des documents (à incrémenter à chaque modification de fond) ---------- */
  version: '1.1',
  date_maj: '26 octobre 2026',

  /* ---------- Éditeur / vendeur ---------- */
  site_url: 'https://aupygo.com',
  editeur_nom: 'Svarodina & CO — EI',
  editeur_forme: 'entrepreneur individuel, micro-entreprise',
  editeur_adresse: '47 rue Vivienne, 75002 Paris, France (siège domicilié)',
  editeur_pays: 'France',
  editeur_immatriculation: 'SIREN 789 564 648 — SIRET 789 564 648 00028 — inscrite au Registre national des entreprises (RNE)',
  editeur_tva: 'TVA non applicable, art. 293 B du CGI',
  directeur_publication: 'Svarodina & CO (représentant légal de l’entreprise)',
  contact_email: 'contact@aupygo.com',
  contact_telephone: '',

  /* ---------- Prix : mention fiscale ---------- */
  mention_tva_prix: 'nets et définitifs : TVA non applicable, art. 293 B du CGI',

  /* ---------- Droit applicable et litiges ---------- */
  droit_applicable: 'le droit français',
  tribunaux: 'les tribunaux compétents de Paris',
  mediateur_nom: 'Médiateur-Consommation-Smp Alteritae',
  mediateur_adresse: '5 rue Salvaing 12 000 Rodez',
  mediateur_site: 'https://www.mediateur-consommation-smp.fr/',

  /* ---------- Données personnelles ---------- */
  autorite_controle: 'la CNIL (France, www.cnil.fr)',
  representant_ue: 'Sans objet (éditeur établi dans l’Union européenne)',
  supabase_region: 'eu-central-1',
  email_provider: 'l’infrastructure d’envoi d’e-mails de Supabase',

  /* ---------- Résiliation en ligne ---------- */
  chemin_resiliation: 'Gérer / résilier mon abonnement (lien en bas de chaque page, une fois connecté)'
};
