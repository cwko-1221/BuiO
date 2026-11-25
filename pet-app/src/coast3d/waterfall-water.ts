import * as T from 'three';

// The GLB supplies the channel silhouette, shared edges and downstream UVs.
export function createWaterfallWater() {
  const clock={value:0};
  const fogUniforms=(impact=0)=>({
    ...T.UniformsUtils.clone(T.UniformsLib.fog),clock,impact:{value:impact},
  });

  const surface=(drop:boolean,impact:number)=>new T.ShaderMaterial({
    name:drop?'Aerated falling water':'Deep pools and shallows',
    defines:drop?{FALLING_WATER:1}:{},
    uniforms:fogUniforms(impact),
    side:T.DoubleSide,
    fog:true,
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 channel;
      varying vec3 worldPoint;
      varying vec3 surfaceNormal;
      void main() {
        channel=uv;
        worldPoint=(modelMatrix*vec4(position,1.)).xyz;
        surfaceNormal=inverseTransformDirection(normalMatrix*normal,viewMatrix);
        vec4 mvPosition=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float clock;
      uniform float impact;
      varying vec2 channel;
      varying vec3 worldPoint;
      varying vec3 surfaceNormal;

      float hash(vec2 p) {
        vec3 h=fract(vec3(p.xyx)*.1031);
        h+=dot(h,h.yzx+33.33);
        return fract((h.x+h.y)*h.z);
      }
      float field(vec2 p) {
        vec2 i=floor(p),f=fract(p);
        f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
                   mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
      }

      void main() {
        float across=channel.x;
        float down=channel.y;
        float bank=abs(2.*across-1.);
        float centre=1.-bank*bank;
        vec2 site=worldPoint.xz;
        vec3 n=normalize(surfaceNormal)*(gl_FrontFacing?1.:-1.);
        vec3 eye=normalize(cameraPosition-worldPoint);
        vec3 light=normalize(vec3(-.45,.81,.37));

        // Warped waves reflect the sky at grazing angles and reveal a
        // limestone bed through the thin water along the banks.
        float current=field(site*1.4+vec2(.23,-.40)*clock);
        float swell=dot(site,vec2(8.4,16.1))-3.7*clock+current*3.7;
        float capillary=dot(site,vec2(-18.3,10.7))+4.8*clock+current*4.1;
        vec2 waviness=.021*cos(swell)*vec2(.51,.87)+.012*cos(capillary)*vec2(-.87,.49);
        vec3 waveN=normalize(n+vec3(waviness.x,0.,waviness.y));
        float fresnel=.024+.77*pow(1.-clamp(dot(waveN,eye),0.,1.),4.8);
        vec3 sky=mix(vec3(.30,.49,.50),vec3(.51,.68,.72),
                     smoothstep(.025,.9,reflect(-eye,waveN).y));
        float sunGlint=pow(max(0.,dot(waveN,normalize(light+eye))),106.);
        sunGlint*=.32+.68*field(site*5.+vec2(.12,-.36)*clock);
        float lightBend=dot(site,vec2(23.,9.))-2.2*clock+
          6.*field(site*2.1+vec2(.21,-.32)*clock);
        float caustic=pow(.5+.5*sin(lightBend),8.)*
          smoothstep(.31,.68,field(site*4.7+vec2(-.16,.14)*clock));
        float shallows=smoothstep(.40,1.02,bank);
        vec3 bed=mix(vec3(.20,.20,.132),vec3(.31,.32,.221),field(site*4.));
        bed+=vec3(.11,.13,.093)*caustic;
        vec3 body=mix(vec3(.012,.082,.099),vec3(.020,.143,.143),.24+current*.58);
        vec3 pool=mix(body,bed,shallows*.57)*mix(.76,1.,smoothstep(.81,.99,bank));
        pool=mix(pool,sky,fresnel)+vec3(.88,.83,.71)*sunGlint*.25;

        // Broken rings and pockets of bubbles share world-space coordinates
        // across each impact seam, then dissipate into the receiving pool.
        float churn=field(vec2(site.x*9.+site.y*2.,site.y*12.-clock*3.2));
        float grains=field(vec2(site.x*34.,site.y*26.-clock*6.8));
        float lace=smoothstep(.39,.77,churn*.73+grains*.27);
        vec3 foam=vec3(.77,.86,.79);
        float strike=centre*lace;
        vec3 splash=mix(pool,foam,strike*.86);
        #ifdef FALLING_WATER
        // Travel time grows more slowly as the sheet accelerates. Fine
        // streaks outpace the wide ribs while darker ribbons separate them.
        float travel=6.2*sqrt(.16+down*1.27);
        float shift=clock*4.25;
        float wavering=field(vec2(across*9.+worldPoint.y*.21,travel*.37-shift*.33));
        float ribbons=field(vec2(across*27.+wavering*1.8,travel-shift));
        float threads=field(vec2(across*86.+wavering*3.2,travel*2.9-shift*3.4));
        float breaks=field(vec2(across*53.+ribbons,travel*4.4-shift*4.8));
        float aeration=smoothstep(.40,.82,ribbons*.49+threads*.27+breaks*.11+wavering*.15);
        float entrained=smoothstep(.18,.88,down)*.18;
        float whiteWater=aeration*(.62+entrained)+.08*entrained;
        vec3 glass=mix(vec3(.033,.175,.184),vec3(.119,.357,.337),.39*ribbons+.48*fresnel);
        float microGlint=pow(threads,5.)*smoothstep(.49,.79,ribbons);
        vec3 sheet=mix(glass,foam,whiteWater)+vec3(.15,.19,.18)*microGlint;
        vec3 color=mix(pool,sheet,smoothstep(.045,.25,down));
        color=mix(color,splash,smoothstep(.72,1.,down));
        #else
        float radial=length(vec2((across-.5)*1.24,down*.86));
        float rings=pow(.5+.5*sin(radial*47.-clock*8.2+churn*2.2),6.);
        float drift=exp(-down*4.6)*impact;
        float trailing=strike*.86+rings*centre*.12*sin(3.14159*down);
        vec3 color=mix(pool,foam,trailing*drift);
        #endif
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });

  // Each landing has a sparse spray that rises and falls under gravity.
  // Use one shared material and sample the authored bottom edge of each drop.
  const sprayMaterial=()=>new T.ShaderMaterial({
    name:'Sunlit cascade spray',
    uniforms:fogUniforms(),
    transparent:true,
    depthWrite:false,
    fog:true,
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float clock;
      attribute vec3 launch;
      varying float coverage;
      varying float seed;
      void main() {
        seed=launch.x;
        float life=.46+.32*launch.y;
        float age=fract(clock/life+launch.z)*life;
        vec3 p=position;
        p.x+=(seed-.5)*age*.86;
        p.y+=.035+age*(.63+.87*launch.y)-age*age*1.65;
        p.z+=age*(.13+.47*seed);
        vec4 mvPosition=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mvPosition;
        float size=.026+.048*seed+age*.10;
        gl_PointSize=clamp(760.*size/max(1.,-mvPosition.z),1.,18.);
        coverage=smoothstep(0.,.06,age)*(1.-smoothstep(life*.35,life,age));
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      varying float coverage;
      varying float seed;
      void main() {
        vec2 p=2.*gl_PointCoord-1.;
        float radius=length(p*vec2(1.15,1.));
        float opacity=exp(-4.4*radius*radius)*(1.-smoothstep(.64,1.,radius));
        gl_FragColor=vec4(.79,.89,.85,coverage*opacity*(.23+.33*seed));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });

  let falling:T.ShaderMaterial|undefined;
  let basins:T.ShaderMaterial|undefined;
  let source:T.ShaderMaterial|undefined;
  let mist:T.ShaderMaterial|undefined;

  function addSpray(drop:T.Mesh) {
    const uv=drop.geometry.getAttribute('uv'),position=drop.geometry.getAttribute('position');
    const edge:number[]=[];
    for(let i=0;i<uv.count;i++){
      const across=uv.getX(i);
      if(uv.getY(i)>.998&&across>.13&&across<.87)edge.push(i);
    }
    if(!edge.length)return;
    const positions:number[]=[],launch:number[]=[];
    for(const [i,at] of edge.entries()){
      positions.push(position.getX(at),position.getY(at),position.getZ(at));
      launch.push(((i*17)%31)/31,((i*11+7)%29)/29,((i*13+9)%23)/23);
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('launch',new T.Float32BufferAttribute(launch,3));
    geometry.computeBoundingSphere();
    geometry.boundingSphere!.radius+=1;
    const particles=new T.Points(geometry,mist??=sprayMaterial());
    particles.name='cascade-spray';
    drop.add(particles);
  }

  function dress(model:T.Object3D) {
    const drops:T.Mesh[]=[];
    model.traverse(node=>{
      if(!(node instanceof T.Mesh))return;
      if(node.name.startsWith('cascade-water-drop-')){
        node.material=falling??=surface(true,0);
        drops.push(node);
      }else if(node.name==='cascade-water-pool-source')node.material=source??=surface(false,0);
      else if(node.name.startsWith('cascade-water-pool-'))node.material=basins??=surface(false,1);
      else return;
      node.castShadow=false;
      node.receiveShadow=false;
    });
    for(const drop of drops)addSpray(drop);
  }
  return {clock,dress};
}
