'use strict';
const path=require('node:path');
const config=require('../../config');
// The API and static server must describe the same published build. Reading
// work-in-progress public manifests can advertise images that are not served yet.
function petDistDirectory(){
 return !config.isProd&&process.env.PET_APP_DIST_DIR
  ?path.resolve(process.env.PET_APP_DIST_DIR)
  :path.join(__dirname,'..','dist');
}
module.exports={petDistDirectory};
