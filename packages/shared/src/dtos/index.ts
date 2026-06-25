/** Stable IDs used by the seed so the demo is repeatable across deploys (Vitaly §6.9). */
export const STABLE_TEMPLATE_IDS = [
  "tmpl_heritage_quarterly",
  "tmpl_garden_gazette",
  "tmpl_civic_record",
  "tmpl_sunset_chronicle",
  "tmpl_lakeview_dispatch",
  "tmpl_homestead_herald",
  "tmpl_postcard_press",
  "tmpl_evergreen_edition",
  "tmpl_bloomfield_broadside",
  "tmpl_compass_courier",
] as const;
export type StableTemplateId = (typeof STABLE_TEMPLATE_IDS)[number];

export const STABLE_CLIENT_IDS = [
  "client_willow_creek",
  "client_maple_ridge",
  "client_sunset_bay",
  "client_briar_glen",
  "client_juniper_hollow",
  "client_cedar_pointe",
  "client_lakeview_terrace",
  "client_aspen_grove",
  "client_silver_lake",
  "client_hawthorne_court",
  "client_orchard_view",
  "client_brookside_manor",
  "client_pinecrest_village",
  "client_blue_heron_landing",
  "client_magnolia_park",
  "client_riverstone_commons",
  "client_summit_house",
  "client_meadowbrook_estates",
  "client_evergreen_pointe",
  "client_starling_cove",
  "client_harborlight_residences",
  "client_chestnut_hill",
  "client_palm_meadows",
  "client_quail_run",
  "client_birchwood_gardens",
] as const;
export type StableClientId = (typeof STABLE_CLIENT_IDS)[number];
