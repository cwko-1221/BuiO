const world='/pokemon-rpg/assets/overhaul/world/';
export const NAVIGATION_ART={compass:world+'compass-bezel-v2.webp',atlas:world+'world-atlas-v2.webp'};
// Positions on the generated illustration, separate from playable coordinates.
export const ATLAS_LANDMARKS={dawnleaf:{x:46,y:47},meadow:{x:67,y:47},mosswood:{x:85,y:40},canyon:{x:20,y:46},twilight:{x:51,y:19},coast:{x:48,y:74},harbor:{x:24,y:80}};
export const SURVEY_ART={tree_oak:'oak-v1',tree_pine:'juniper-v1',tree_palm:'palm-v1',premium_oak:'oak-v1',woodland_ruin:'woodland-ruin-v1',woodland_shrubs:'woodland-shrubs-v1',premium_shrubs:'woodland-shrubs-v1',mosswood_log:'mosswood-log-v1-candidate',canyon_cliff:'canyon-cliff-v1',shore_rocks:'shore-rocks-v1',crystal_twilight:'crystal-v1',rock_canyon:'shore-rocks-v1',lab:'lab-v1',hospital:'hospital-v1',shop:'shop-v1',verdant_shrine:'shrine-v1',shrine_grass:'shrine-v1',lighthouse:'lighthouse-v1-padded',tidal_lighthouse:'lighthouse-v1-padded',fountain:'fountain-v1',dojo_fire:'dojo-v1',dojo:'dojo-v1',fire_dojo:'dojo-v1',altar:'altar-v1',star_altar:'altar-v1'};
export const surveyAsset=name=>world+name+'.webp';
// Inspected art content rectangles. Reprojecting only the illustration into
// the survey bounds keeps its parchment margins from shifting live markers.
export const REGIONAL_ATLAS_CROPS={
  dawnleaf:[.1667,.0723,.6667,.8535],meadow:[.1484,.0723,.7004,.8535],
  coast:[.1364,.0723,.7257,.8535],canyon:[.0563,.0823,.8861,.8336],
  twilight:[.2658,.0723,.4684,.8535],mosswood:[.2089,.0723,.5823,.8535],
};
