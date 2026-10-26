/* Time Cube - a lightweight WebGL2 recreation of Bradley Tangonan's "xy + t" street-crossing video cube.
   A procedural crowd crosses a scramble crossing; the frames are stacked in time into a volume and ray-marched inside a glass box. */
(function(){
"use strict";
var cv=document.getElementById('canvas'),hint=document.getElementById('hint');setTimeout(function(){hint.className='off'},2500);
var gl=cv.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});
if(!gl){document.body.insertAdjacentHTML('beforeend','<p style="color:#fff;padding:20px;font:16px system-ui">WebGL2 is required.</p>');return}
var W=1,H=1;function fit(){var d=Math.min(devicePixelRatio||1,1.5)*q;W=cv.clientWidth||innerWidth;H=cv.clientHeight||innerHeight;cv.width=Math.max(64,Math.round(W*d));cv.height=Math.max(64,Math.round(H*d))}var q=.4;fit();
function sh(t,s){var o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))console.error(gl.getShaderInfoLog(o));return o}
function prog(f){var p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,"#version 300 es\nin vec2 a;out vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}"));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);return p}
var NP=96,RX=96,RY=96,RZ=48;
/* ---------- bake one frame of the crossing into a volume layer ---------- */
var bakeP=prog("#version 300 es\nprecision highp float;in vec2 v;out vec4 o;uniform float uT;uniform vec4 uP[96];uniform vec4 uC[96];\n"+
"const vec2 LO[6]=vec2[6](vec2(0.,.14),vec2(0.,.86),vec2(.14,0.),vec2(.86,0.),vec2(0.,0.),vec2(1.,0.));\n"+
"const vec2 LD[6]=vec2[6](vec2(1.,0.),vec2(1.,0.),vec2(0.,1.),vec2(0.,1.),vec2(.7071,.7071),vec2(-.7071,.7071));\n"+
"const float LL[6]=float[6](1.,1.,1.,1.,1.4142,1.4142);\n"+
"float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n"+
"void main(){vec2 p=v;vec3 col=vec3(.13,.12,.11)*(.8+.4*h(floor(p*180.)));\n"+
"for(int i=0;i<6;i++){vec2 d=LD[i],n=vec2(-d.y,d.x);vec2 r=p-LO[i];float al=dot(r,d),la=dot(r,n);float band=step(abs(la),.055)*step(-.02,al)*step(al,LL[i]+.02);\n"+
"float bar=step(fract(la/.017+.5),.58);col=mix(col,vec3(.55,.53,.5)*(.85+.15*h(floor(p*150.))),band*bar*.6);}\n"+
"/* a car sliding along the top edge */float cs=fract(.3+2.*uT)*1.3-.15;vec2 cd=abs(p-vec2(cs,.045))-vec2(.045,.02);float car=1.-smoothstep(-.004,.004,max(cd.x,cd.y));col=mix(col,vec3(.55,.56,.6),car*.95);\n"+
"for(int i=0;i<96;i++){vec4 P=uP[i];int l=int(P.x);vec2 d=LD[l],n=vec2(-d.y,d.x);float s=fract(P.z+P.w*uT)*LL[l];vec2 q=LO[l]+d*s+n*P.y;vec2 dd=p-q;float w=exp(-dot(dd,dd)/(2.*.015*.015));col=mix(col,uC[i].rgb,clamp(w*1.1,0.,1.));float hd=exp(-dot(dd,dd)/(2.*.0075*.0075));col=mix(col,vec3(.05,.04,.04),hd*.5);}\n"+
"o=vec4(col,1.);}");
/* ---------- ray-march the box ---------- */
var viewP=prog("#version 300 es\nprecision highp float;precision highp sampler3D;in vec2 v;out vec4 o;uniform sampler3D uV;uniform vec2 uRes;uniform vec3 uEye;uniform vec3 uR;uniform vec3 uU;uniform vec3 uF;uniform float uNow;\n"+
"const vec3 HB=vec3(1.,.72,.82);\n"+
"vec3 samp(vec3 q){/* q in [-1,1]^3 -> volume coords: x->x, z->y, y(up)->time, top = now */vec3 uvw=vec3(q.x*.5+.5,q.y*.5+.5,fract(uNow-(q.z+1.)*.5*.9));return texture(uV,uvw).rgb;}\n"+
"float edgeD(vec3 q){vec3 a=1.-abs(q)/1.;vec3 s=abs(q)*HB;/* distance (world) to the nearest of the 3 faces per axis */vec3 dd=(1.-abs(q))*HB;float m1=min(dd.x,min(dd.y,dd.z));float t=1e9;t=min(t,max(dd.x,dd.y));t=min(t,max(dd.y,dd.z));t=min(t,max(dd.x,dd.z));return t;}\n"+
"void main(){float asp=uRes.x/uRes.y;vec2 uv=(v*2.-1.)*vec2(asp,1.)*max(1.,1./asp)*.58;vec3 rd=normalize(uF*1.9+uR*uv.x+uU*uv.y);vec3 ro=uEye;\n"+
"vec3 inv=1./rd;vec3 t0=(-HB-ro)*inv,t1=(HB-ro)*inv;vec3 tmn=min(t0,t1),tmx=max(t0,t1);float tn=max(max(tmn.x,tmn.y),tmn.z),tf=min(min(tmx.x,tmx.y),tmx.z);\n"+
"vec3 bg=vec3(.0);if(tf<=max(tn,0.)){o=vec4(bg,1.);return;}\n"+
"float len=tf-tn;const int N=28;float ds=len/float(N);vec3 acc=vec3(0.);float tr=1.;\n"+
"float jit=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);\n"+
"vec3 pe=(ro+rd*tn)/HB;vec3 s0=samp(pe);float l0=dot(s0,vec3(.33));acc+=s0*.5;tr=.5;\n"+
"for(int i=0;i<N;i++){vec3 p=(ro+rd*(tn+ds*(float(i)+jit)))/HB;vec3 c=samp(p);float l=dot(c,vec3(.33));float a=1.-exp(-ds*(.5+1.2*l));acc+=tr*a*c;tr*=1.-a;}\n"+
"/* exit-face tint + glass edges */vec3 px=(ro+rd*tf)/HB;vec3 se=samp(px);acc+=tr*se*1.5;\n"+
"float ed=edgeD(pe),ed2=edgeD(px);float lw=.0045*(1.+tn*.12);float ln=smoothstep(lw*1.6,0.,ed)+smoothstep(lw*1.6,0.,ed2)*.7;\n"+
"vec3 col=acc*vec3(1.02,.94,.82);col=pow(col,vec3(.9))*1.2;col+=vec3(.82,.85,.9)*ln*.8;\n"+
"/* faint glass sheen on the entry face */col+=vec3(.05,.05,.06)*pow(1.-abs(dot(rd,normalize(pe/HB/ HB))),3.)*.6;\n"+
"o=vec4(col,1.);}");
var tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,tex);gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,RX,RY,RZ,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_R,gl.REPEAT);
var qb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,qb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
var vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
function bindA(p){gl.bindAttribLocation(p,0,'a');gl.linkProgram(p)}bindA(bakeP);bindA(viewP);
/* crowd */
var seed=11;function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
var P=new Float32Array(NP*4),C=new Float32Array(NP*4);
var pal=[[.78,.74,.66],[.28,.3,.4],[.62,.28,.25],[.82,.82,.84],[.35,.33,.3],[.7,.55,.3],[.2,.35,.32],[.55,.5,.6]];
var ks=[1,-1,2,-2,3,-3,1,-1,2,-2];
for(var i=0;i<NP;i++){var lane=i%6;var k=ks[(i*7+lane)%ks.length];if(lane>=4&&Math.abs(k)>2)k=k>0?1:-1;P[i*4]=lane;P[i*4+1]=(rnd()-.5)*.09;P[i*4+2]=rnd();P[i*4+3]=k;var c=pal[(rnd()*pal.length)|0];C[i*4]=c[0];C[i*4+1]=c[1];C[i*4+2]=c[2];C[i*4+3]=1}
var fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,RX,RY);gl.useProgram(bakeP);gl.uniform4fv(gl.getUniformLocation(bakeP,'uP'),P);gl.uniform4fv(gl.getUniformLocation(bakeP,'uC'),C);
var uT=gl.getUniformLocation(bakeP,'uT');
var bz=0;function bake(n){gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,RX,RY);gl.useProgram(bakeP);for(var k=0;k<n&&bz<RZ;k++,bz++){gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,tex,0,bz);gl.uniform1f(uT,bz/RZ);gl.drawArrays(gl.TRIANGLE_STRIP,0,4)}gl.bindFramebuffer(gl.FRAMEBUFFER,null)}
/* camera */
var yaw=-.62,pitch=.34,dist=5.0,auto=true,vy=0,vp=0,ptrs={},pd0=0,d0=0;
cv.addEventListener('pointerdown',function(e){e.preventDefault();ptrs[e.pointerId]={x:e.clientX,y:e.clientY};try{cv.setPointerCapture(e.pointerId)}catch(x){}auto=false;hint.className='off';var k=Object.keys(ptrs);if(k.length==2){var a=ptrs[k[0]],b=ptrs[k[1]];pd0=Math.hypot(a.x-b.x,a.y-b.y);d0=dist}},{passive:false});
cv.addEventListener('pointermove',function(e){var p=ptrs[e.pointerId];if(!p)return;e.preventDefault();var k=Object.keys(ptrs);if(k.length==1){vy=(e.clientX-p.x)*.006;vp=(e.clientY-p.y)*.006;yaw-=vy;pitch=Math.max(-.2,Math.min(1.45,pitch+vp))}p.x=e.clientX;p.y=e.clientY;if(k.length==2){var a=ptrs[k[0]],b=ptrs[k[1]];dist=Math.max(2.6,Math.min(7,d0*pd0/Math.max(20,Math.hypot(a.x-b.x,a.y-b.y))))}},{passive:false});
function up(e){delete ptrs[e.pointerId]}cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
cv.addEventListener('wheel',function(e){e.preventDefault();dist=Math.max(2.6,Math.min(7,dist*(1+e.deltaY*.001)))},{passive:false});
var U={};function loc(n){return U[n]||(U[n]=gl.getUniformLocation(viewP,n))}
var last=0,now=0,first=true,slow=16;
function frame(t){requestAnimationFrame(frame);if(!first&&t-last<30)return;bake(4);var rd=(t-last)||16;var dt=Math.min(rd/1000,.05);last=t;slow=slow*.7+rd*.3;if(slow>38&&q>.3&&t>400){q*=.8;slow=16;fit()}now=(now+dt*.045)%1;
  if(auto&&!Object.keys(ptrs).length){yaw=-.62+Math.sin(t*.00045)*.9;}else if(!Object.keys(ptrs).length){vy*=.94;yaw-=vy*.3}
  var cp=Math.cos(pitch),sp=Math.sin(pitch);var ex=dist*cp*Math.sin(yaw),ey=dist*sp,ez=dist*cp*Math.cos(yaw);
  var fx=-ex,fy=-ey,fz=-ez,fl=Math.hypot(fx,fy,fz);fx/=fl;fy/=fl;fz/=fl;
  var rx=fz,ry=0,rz=-fx,rl=Math.hypot(rx,rz);rx/=rl;rz/=rl; /* right = f x up */
  var ux=ry*fz-rz*fy,uy=rz*fx-rx*fz,uz=rx*fy-ry*fx;
  gl.viewport(0,0,cv.width,cv.height);gl.useProgram(viewP);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,tex);gl.uniform1i(loc('uV'),0);
  gl.uniform2f(loc('uRes'),cv.width,cv.height);gl.uniform3f(loc('uEye'),ex,ey,ez);gl.uniform3f(loc('uR'),rx,ry,rz);gl.uniform3f(loc('uU'),ux,uy,uz);gl.uniform3f(loc('uF'),fx,fy,fz);gl.uniform1f(loc('uNow'),now);
  gl.bindVertexArray(vao);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  if(first){first=false;if(window.__gbSandbox&&window.__gbSandbox.ready)window.__gbSandbox.ready()}}
window.addEventListener('resize',fit);
requestAnimationFrame(frame);
})();
