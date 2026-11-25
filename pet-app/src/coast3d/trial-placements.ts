export interface TrialPlacement {
  source: string;
  area: string;
  x: number;
  z: number;
  yaw: number;
  metres: number;
  measure?: 'width';
  ground?: 'deck';
  above?: string;
  collider?: 'box' | 'round';
}

// These imported models are staged in the internal island preview in metres.
// Positive model Z faces towards its viewing side.
export const TRIAL_MODELS = {
  'wooden-bell': {source:'play_done/wooden bell 3d model.glb',area:'garden',x:46.5,z:93.0,yaw:-.45,metres:1.65,collider:'box'},
  'wooden-signpost': {source:'play_done/wooden signpost 3d model.glb',area:'market',x:62,z:55,yaw:.55,metres:1.32,collider:'box'},
  'arcade-machine': {source:'play_done/arcade machine 3d model.glb',area:'market',x:83.1,z:52.0,yaw:-.52,metres:1.7,collider:'box'},
  'stone-platform': {source:'play_done/circular stone platform 3d model.glb',area:'market',x:72.6,z:49.1,yaw:.13,metres:3.7,measure:'width',collider:'round'},
  'stone-fountain': {source:'play_done/ornate stone fountain 3d model.glb',area:'garden',x:37.5,z:88.0,yaw:.14,metres:3.35,measure:'width',collider:'round'},
  'traditional-drum': {source:'play_done/traditional drum 3d model.glb',area:'market',x:72.6,z:49.1,yaw:.15,metres:1.65,measure:'width',above:'stone-platform'},
  'dock-otter': {source:'npc_done/otter character 3d model.glb',area:'marina',x:224.2,z:96.1,yaw:.69,metres:1.14,ground:'deck',collider:'round'},
  'rabbit-mailman': {source:'npc_done/rabbit mailman 3d model.glb',area:'village',x:139.4,z:149.1,yaw:1.15,metres:1.23,collider:'round'},
  'squirrel-scout': {source:'npc_done/squirrel scout 3d model.glb',area:'market',x:64.1,z:48.8,yaw:.36,metres:1.12,collider:'round'},
  'bear-explorer': {source:'npc_done/bear explorer 3d model.glb',area:'square',x:126.3,z:105.5,yaw:-.60,metres:1.4,collider:'round'},
  'garden-deer': {source:'npc_done/cute deer 3d model.glb',area:'garden',x:40.8,z:89.6,yaw:.52,metres:1.23,collider:'round'},
  'hedgehog-scout': {source:'npc_done/hedgehog scout 3d model.glb',area:'observatory',x:185.4,z:46.7,yaw:-.95,metres:1.12,collider:'round'},
} as const satisfies Record<string,TrialPlacement>;

export type TrialModelId=keyof typeof TRIAL_MODELS;
