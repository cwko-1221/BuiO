// User approved the fixed-crop four-direction preview from frames98–122 of
// the six-second Seedance pilot. Preserve its 25 frames and shared source units.
export const EMERALD_VIDEO_WALK = {
  id:'emerald-video-walk-v1',avatarId:'emerald',direction:null,
  src:'/pokemon-rpg/assets/overhaul/trainers/emerald-video-walk-v1-fringe-v2.webp',
  idleSrc:'/pokemon-rpg/assets/overhaul/trainers/emerald-idle-turnaround-v1-candidate.webp',
  columns:25,frameCount:25,sequence:false,cellWidth:256,cellHeight:256,
  directions:['down','up','right'],mirrorLeft:true,
  fps:24,strideWorld:1.875,drawHeight:140,idleFrame:0,
  // Static idle art has different transparent padding from the video cells.
  // Uniform per-direction calibration matches median walking height and footline.
  idleCalibration:{down:{scale:.98058,y:3.009},up:{scale:.97073,y:.985},right:{scale:.97030,y:-.015}},
  userApprovedMotion:true,
  approvalSource:'User confirmed fixed-crop four-direction preview; rear source limited to4–6s',
};
export const AZURE_VIDEO_WALK={
  ...EMERALD_VIDEO_WALK,id:'azure-video-walk-v1',avatarId:'azure',
  src:'/pokemon-rpg/assets/overhaul/trainers/azure-video-walk-v1-fringe-v2.webp',
  idleSrc:'/pokemon-rpg/assets/overhaul/trainers/azure-idle-turnaround-v1-candidate.webp',
  columns:23,frameCount:23,strideWorld:1.8*23/24,
  idleCalibration:{down:{scale:.91304,y:2.042},up:{scale:.91304,y:2.955},right:{scale:.90821,y:1.044}},
  approvalSource:'User confirmed Azure four-direction preview; loopA frames109–131',
};
export const VIOLET_VIDEO_WALK={
  ...EMERALD_VIDEO_WALK,id:'violet-video-walk-v1',avatarId:'violet',
  src:'/pokemon-rpg/assets/overhaul/trainers/violet-video-walk-v1-fringe-v2.webp',
  idleSrc:'/pokemon-rpg/assets/overhaul/trainers/violet-idle-turnaround-v1-candidate.webp',
  columns:26,frameCount:26,strideWorld:1.8*26/24,
  idleCalibration:{down:{scale:.94059,y:-.971},up:{scale:.91667,y:-1.960},right:{scale:.91133,y:-5.046}},
  approvalSource:'User confirmed Violet four-direction preview after removal of side floor; loop A frames 51–76',
};
export const BLAZE_VIDEO_WALK={
  ...EMERALD_VIDEO_WALK,id:'blaze-video-walk-v2',avatarId:'blaze',
  src:'/pokemon-rpg/assets/overhaul/trainers/blaze-video-walk-v2-alpha.webp',
  idleSrc:'/pokemon-rpg/assets/overhaul/trainers/blaze-idle-turnaround-v1-candidate.webp',
  columns:24,frameCount:24,strideWorld:1.8,
  idleCalibration:{down:{scale:.95169082,y:-1.976812},up:{scale:.95631068,y:-.979029},right:{scale:.94202899,y:-1.972174}},
  approvalSource:'User requested the newer locked-camera video in game',
};
export const TRAINER_VIDEO_WALKS={emerald:EMERALD_VIDEO_WALK,azure:AZURE_VIDEO_WALK,violet:VIOLET_VIDEO_WALK,blaze:BLAZE_VIDEO_WALK};
