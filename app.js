const $=id=>document.getElementById(id);
const els={video:$("video"),overlay:$("overlay"),stage:$("stage"),empty:$("empty"),guide:$("guide"),loading:$("loading"),quality:$("quality"),uploadBtn:$("uploadBtn"),fileInput:$("fileInput"),cameraBtn:$("cameraBtn"),demoBtn:$("demoBtn"),athleteBtn:$("athleteBtn"),gunBtn:$("gunBtn"),signalBtn:$("signalBtn"),resetBtn:$("resetBtn"),rangeBox:$("rangeBox"),rangeStart:$("rangeStart"),rangeEnd:$("rangeEnd"),startLabel:$("startLabel"),endLabel:$("endLabel"),previewBtn:$("previewBtn"),analyzeBtn:$("analyzeBtn"),armSide:$("armSide"),sampleRate:$("sampleRate"),skeletonToggle:$("skeletonToggle"),stateDot:$("stateDot"),stateText:$("stateText"),timeText:$("timeText"),score:$("score"),scoreNote:$("scoreNote"),shoulderAngle:$("shoulderAngle"),elbowAngle:$("elbowAngle"),trunkAngle:$("trunkAngle"),gunY:$("gunY"),chart:$("chart"),sampleCount:$("sampleCount"),resultEmpty:$("resultEmpty"),resultGrid:$("resultGrid"),rShoulder:$("rShoulder"),rElbow:$("rElbow"),rTrunk:$("rTrunk"),rGunY:$("rGunY"),rGunX:$("rGunX"),rShots:$("rShots"),csvBtn:$("csvBtn"),reportBtn:$("reportBtn"),eventQuality:$("eventQuality"),phaseTrack:$("phaseTrack"),rReaction:$("rReaction"),rRaise:$("rRaise"),rSettle:$("rSettle"),rHold:$("rHold"),rShotTime:$("rShotTime"),rBudget:$("rBudget"),budgetFill:$("budgetFill"),budgetNote:$("budgetNote"),coachTitle:$("coachTitle"),coachText:$("coachText")};
const ctx=els.overlay.getContext("2d"),chartCtx=els.chart.getContext("2d"),work=document.createElement("canvas"),wctx=work.getContext("2d",{willReadFrequently:true});
let landmarker=null,stream=null,source="idle",running=false,analyzing=false,raf=0,lastInfer=-1,lastSample=-1,athleteROI=null,gunROI=null,signalROI=null,gunTemplate=null,mode="none",dragStart=null,samples=[],lastPose=null,demoStart=0,lastSignalScore=0,selectedLimit=4,lastEvents=null;
let smoothM=null; // EMA 平滑緩存
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0,sd=a=>{if(a.length<2)return 0;const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)**2)))};
const fmt=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}.${Math.floor((s%1)*10)}`;
const angle=(a,b,c)=>{const u={x:a.x-b.x,y:a.y-b.y},v={x:c.x-b.x,y:c.y-b.y};return Math.acos(clamp((u.x*v.x+u.y*v.y)/(Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y)||1),-1,1))*180/Math.PI};

function setState(text,color="#64746f"){els.stateText.textContent=text;els.stateDot.style.background=color;els.stateDot.style.boxShadow=`0 0 10px ${color}`}
function videoRect(){const sw=els.stage.clientWidth,sh=els.stage.clientHeight,vw=els.video.videoWidth||sw,vh=els.video.videoHeight||sh,scale=Math.min(sw/vw,sh/vh),w=vw*scale,h=vh*scale;return{x:(sw-w)/2,y:(sh-h)/2,w,h}}
function resize(){const r=els.stage.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);els.overlay.width=Math.round(r.width*dpr);els.overlay.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);els.overlay.style.width=`${r.width}px`;els.overlay.style.height=`${r.height}px`;drawChart()}
function pointFromEvent(e){const b=els.overlay.getBoundingClientRect(),vr=videoRect(),x=e.clientX-b.left,y=e.clientY-b.top;return{x:clamp((x-vr.x)/vr.w,0,1),y:clamp((y-vr.y)/vr.h,0,1)}}
function mapPoint(p){const vr=videoRect();return{x:vr.x+p.x*vr.w,y:vr.y+p.y*vr.h}}
document.querySelectorAll(".rule-pill").forEach(btn=>btn.onclick=()=>{document.querySelectorAll(".rule-pill").forEach(x=>x.classList.remove("active"));btn.classList.add("active");selectedLimit=+btn.dataset.limit;if(lastEvents)renderEvents(lastEvents)});

async function loadModel(){if(landmarker)return;els.loading.classList.remove("hidden");try{const{PoseLandmarker,FilesetResolver}=await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/+esm"),vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm");const options={baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",delegate:"GPU"},runningMode:"VIDEO",numPoses:3,minPoseDetectionConfidence:.45,minPosePresenceConfidence:.45,minTrackingConfidence:.45};try{landmarker=await PoseLandmarker.createFromOptions(vision,options)}catch{options.baseOptions.delegate="CPU";landmarker=await PoseLandmarker.createFromOptions(vision,options)}}finally{els.loading.classList.add("hidden")}}

function readySource(){els.empty.classList.add("hidden");els.athleteBtn.disabled=false;els.gunBtn.disabled=false;els.signalBtn.disabled=false;els.resetBtn.disabled=false;els.rangeBox.classList.toggle("hidden",source==="camera");els.quality.textContent="等待雙 ROI";els.guide.textContent="先框選射手 ROI，再點選槍枝 ROI；若畫面有綠燈可加選";setState("設定分析區域","#ffc857");running=true;cancelAnimationFrame(raf);loop()}
els.uploadBtn.onclick=()=>els.fileInput.click();
els.fileInput.onchange=async()=>{const file=els.fileInput.files?.[0];if(!file)return;stop();source="video";els.video.srcObject=null;els.video.src=URL.createObjectURL(file);els.video.controls=true;await new Promise((res,rej)=>{els.video.onloadedmetadata=res;els.video.onerror=rej});await loadModel();els.video.currentTime=0;const d=els.video.duration;els.rangeStart.max=els.rangeEnd.max=d;els.rangeStart.value=0;els.rangeEnd.value=Math.min(d,20);updateRange();readySource()};
els.cameraBtn.onclick=async()=>{stop();await loadModel();source="camera";stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:60}},audio:false});els.video.src=``;els.video.srcObject=stream;els.video.controls=false;await els.video.play();readySource()};
els.demoBtn.onclick=()=>{stop();source="demo";els.video.removeAttribute("src");els.video.srcObject=null;els.video.style.visibility="hidden";demoStart=performance.now();athleteROI={x:.18,y:.12,w:.47,h:.8};gunROI={x:.68,y:.33,score:1,baseX:.68,baseY:.33};signalROI={x:.84,y:.16};els.rangeStart.max=els.rangeEnd.max=4;els.rangeStart.value=0;els.rangeEnd.value=4;updateRange();readySource();els.analyzeBtn.disabled=false;els.guide.textContent="單發示範：綠燈 → 舉槍 → 穩定 → 擊發"};
function stop(){running=false;analyzing=false;cancelAnimationFrame(raf);if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}els.video.pause();els.video.style.visibility="visible";samples=[];athleteROI=null;gunROI=null;signalROI=null;gunTemplate=null;lastInfer=-1;lastSample=-1;smoothM=null;lastSignalScore=0;lastEvents=null}

els.athleteBtn.onclick=()=>{mode="athlete";dragStart=null;els.guide.textContent="在畫面上拖曳框選目標射手全身"};
els.gunBtn.onclick=()=>{mode="gun";els.guide.textContent="在槍身或準星附近點一下"};
els.signalBtn.onclick=()=>{mode="signal";els.guide.textContent="在綠色訊號燈中央點一下；若畫面沒有綠燈可略過"};
els.resetBtn.onclick=()=>{athleteROI=null;gunROI=null;signalROI=null;gunTemplate=null;mode="none";els.analyzeBtn.disabled=true;els.guide.textContent="先框選射手 ROI，再點選槍枝 ROI"};
els.overlay.addEventListener("pointerdown",e=>{if(mode==="athlete"){dragStart=pointFromEvent(e);els.overlay.setPointerCapture(e.pointerId)}else if(mode==="gun"){const p=pointFromEvent(e);gunROI={...p,baseX:p.x,baseY:p.y,score:1};gunTemplate=null;mode="none";els.guide.textContent=athleteROI?"雙 ROI 已完成，可選取單發區間":"槍枝 ROI 已設定，請再框選射手";els.analyzeBtn.disabled=!athleteROI}else if(mode==="signal"){signalROI=pointFromEvent(e);mode="none";els.guide.textContent="綠燈 ROI 已設定；亮燈時間將自動偵測"}});
els.overlay.addEventListener("pointermove",e=>{if(mode==="athlete"&&dragStart){const p=pointFromEvent(e);athleteROI={x:Math.min(p.x,dragStart.x),y:Math.min(p.y,dragStart.y),w:Math.abs(p.x-dragStart.x),h:Math.abs(p.y-dragStart.y)}}});
els.overlay.addEventListener("pointerup",()=>{if(mode==="athlete"&&dragStart){dragStart=null;mode="none";if(athleteROI.w<.08||athleteROI.h<.15)athleteROI=null;els.guide.textContent=athleteROI?(gunROI?"雙 ROI 已完成，可開始分析":"射手 ROI 已設定, 接著點選槍枝 ROI"):"框選範圍太小，請重新框選";els.analyzeBtn.disabled=!(athleteROI&&gunROI)}});

function updateRange(){let a=+els.rangeStart.value,b=+els.rangeEnd.value;if(a>b-.2){if(document.activeElement===els.rangeStart)a=Math.max(0,b-.2);else b=Math.min(+els.rangeEnd.max,a+.2)}els.rangeStart.value=a;els.rangeEnd.value=b;els.startLabel.textContent=fmt(a);els.endLabel.textContent=fmt(b)}
els.rangeStart.oninput=els.rangeEnd.oninput=updateRange;
els.previewBtn.onclick=async()=>{els.video.currentTime=+els.rangeStart.value;await els.video.play();const end=+els.rangeEnd.value,watch=()=>{if(els.video.currentTime>=end)els.video.pause();else requestAnimationFrame(watch)};watch()};
els.analyzeBtn.onclick=async()=>{if(!(athleteROI&&gunROI))return;samples=[];gunTemplate=null;lastSample=-1;analyzing=true;els.resultGrid.classList.add("hidden");els.resultEmpty.classList.remove("hidden");setState("分析進行中","#4be1af");if(source==="video"){els.video.currentTime=+els.rangeStart.value;await els.video.play()}else if(source==="demo")demoStart=performance.now();};

function selectPose(poses){if(!poses?.length)return null;if(!athleteROI)return poses[0];const cx=athleteROI.x+athleteROI.w/2,cy=athleteROI.y+athleteROI.h/2;return poses.map(p=>({p,d:Math.hypot(((p[23]?.x||p[11]?.x||0)-cx)/Math.max(.1,athleteROI.w),((p[23]?.y||p[11]?.y||0)-cy)/Math.max(.1,athleteROI.h))})).sort((a,b)=>a.d-b.d)[0].p}
function grayPatch(frame,cx,cy,size=17){const half=Math.floor(size/2),out=new Uint8Array(size*size);let k=0;for(let y=-half;y<=half;y++)for(let x=-half;x<=half;x++){const px=clamp(Math.round(cx+x),0,work.width-1),py=clamp(Math.round(cy+y),0,work.height-1),i=(py*work.width+px)*4;out[k++]=(frame[i]*3+frame[i+1]*6+frame[i+2])/10}return out}
function trackGun(){if(!gunROI||source==="demo"||!els.video.videoWidth)return;work.width=480;work.height=Math.max(270,Math.round(480*els.video.videoHeight/els.video.videoWidth));wctx.drawImage(els.video,0,0,work.width,work.height);const frame=wctx.getImageData(0,0,work.width,work.height).data;if(signalROI){let green=0,count=0,cxS=Math.round(signalROI.x*work.width),cyS=Math.round(signalROI.y*work.height);for(let y=-5;y<=5;y++)for(let x=-5;x<=5;x++){const px=clamp(cxS+x,0,work.width-1),py=clamp(cyS+y,0,work.height-1),i=(py*work.width+px)*4;green+=clamp((frame[i+1]-(frame[i]+frame[i+2])/2)/180,0,1);count++}lastSignalScore=green/count}const cx=gunROI.x*work.width,cy=gunROI.y*work.height;if(!gunTemplate){gunTemplate=grayPatch(frame,cx,cy);return}let best={sad:Infinity,x:cx,y:cy};for(let dy=-10;dy<=10;dy+=2)for(let dx=-10;dx<=10;dx+=2){const p=grayPatch(frame,cx+dx,cy+dy);let sad=0;for(let i=0;i<p.length;i++)sad+=Math.abs(p[i]-gunTemplate[i]);if(sad<best.sad)best={sad,x:cx+dx,y:cy+dy,p}}gunROI.x=clamp(best.x/work.width,0,1);gunROI.y=clamp(best.y/work.height,0,1);gunROI.score=clamp(1-best.sad/(gunTemplate.length*55),0,1);if(gunROI.score>.72)for(let i=0;i<gunTemplate.length;i++)gunTemplate[i]=Math.round(gunTemplate[i]*.97+best.p[i]*.03)}

function metrics(p,t){
  const idx=els.armSide.value==="right"?{s:12,e:14,w:16}:{s:11,e:13,w:15};
  const s=p[idx.s],e=p[idx.e],w=p[idx.w];
  const ms={x:(p[11].x+p[12].x)/2,y:(p[11].y+p[12].y)/2};
  const mh={x:(p[23].x+p[24].x)/2,y:(p[23].y+p[24].y)/2};
  const q=mean([s,e,w,p[11],p[12],p[23],p[24]].map(v=>v?.visibility||0));
  if(!s||!e||!w)return null;

  const rawShoulder=Math.atan2(-(w.y-s.y),Math.abs(w.x-s.x))*180/Math.PI;
  const rawElbow=angle(s,e,w);
  const rawTrunk=Math.atan2(ms.x-mh.x,mh.y-ms.y)*180/Math.PI;
  const gx=gunROI?(gunROI.x-gunROI.baseX)/Math.max(.08,athleteROI?.w||1)*100:0;
  const gy=gunROI?-(gunROI.y-gunROI.baseY)/Math.max(.15,athleteROI?.h||1)*100:0;

  // EMA 平滑濾波 (alpha = 0.6)
  const alpha=0.6;
  if(!smoothM){
    smoothM={shoulder:rawShoulder,elbow:rawElbow,trunk:rawTrunk,gx,gy};
  }else{
    smoothM.shoulder=alpha*rawShoulder+(1-alpha)*smoothM.shoulder;
    smoothM.elbow=alpha*rawElbow+(1-alpha)*smoothM.elbow;
    smoothM.trunk=alpha*rawTrunk+(1-alpha)*smoothM.trunk;
    smoothM.gx=alpha*gx+(1-alpha)*smoothM.gx;
    smoothM.gy=alpha*gy+(1-alpha)*smoothM.gy;
  }

  return{t,shoulder:smoothM.shoulder,elbow:smoothM.elbow,trunk:smoothM.trunk,gx:smoothM.gx,gy:smoothM.gy,q,roiScore:gunROI?.score||0,signal:lastSignalScore,sCoord:s,eCoord:e,trunkCoord:ms};
}

function demoPose(ts){const t=(ts-demoStart)/1000,green=.35,liftStart=.62,liftEnd=1.38,shot=2.48,p=clamp((t-liftStart)/(liftEnd-liftStart),0,1),ease=p*p*(3-2*p),settle=t>liftEnd?Math.sin((t-liftEnd)*17)*.008*Math.exp(-(t-liftEnd)*3.2):0,recoil=t>shot?Math.max(0,1-(t-shot)/.28)*.035:0,handY=.62-(.31*ease)+settle-recoil;lastSignalScore=t>=green?.92:.04;const lm=Array.from({length:33},()=>({x:.42,y:.5,visibility:.99}));Object.assign(lm[11],{x:.37,y:.3});Object.assign(lm[12],{x:.43,y:.3});Object.assign(lm[13],{x:.5,y:.42-.11*ease});Object.assign(lm[14],{x:.56,y:.48-.17*ease+settle});Object.assign(lm[15],{x:.62,y:.56-.25*ease});Object.assign(lm[16],{x:.68,y:handY});Object.assign(lm[23],{x:.38,y:.57});Object.assign(lm[24],{x:.44,y:.57});Object.assign(lm[27],{x:.37,y:.93});Object.assign(lm[28],{x:.45,y:.93});gunROI.x=.7;gunROI.y=handY;gunROI.score=.98;return lm}

const bones=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];

function draw(p, currentMetrics){
  const w=els.stage.clientWidth,h=els.stage.clientHeight;
  ctx.clearRect(0,0,w,h);
  ctx.save();
  const vr=videoRect();

  if(athleteROI){
    ctx.strokeStyle="#b8f35a";ctx.lineWidth=2;ctx.setLineDash([9,6]);
    ctx.strokeRect(vr.x+athleteROI.x*vr.w,vr.y+athleteROI.y*vr.h,athleteROI.w*vr.w,athleteROI.h*vr.h);
    ctx.setLineDash([]);ctx.fillStyle="#b8f35a";ctx.font="700 11px system-ui";
    ctx.fillText("射手 ROI",vr.x+athleteROI.x*vr.w+7,vr.y+athleteROI.y*vr.h+17);
  }

  if(p&&els.skeletonToggle.checked){
    ctx.strokeStyle="#4be1af";ctx.lineWidth=2;
    for(const[a,b]of bones){
      if(!p[a]||!p[b])continue;
      const ptA=mapPoint(p[a]),ptB=mapPoint(p[b]);
      ctx.beginPath();ctx.moveTo(ptA.x,ptA.y);ctx.lineTo(ptB.x,ptB.y);ctx.stroke();
    }
    ctx.fillStyle="#eaffc7";
    p.forEach(v=>{
      if((v.visibility||0)<.35)return;
      const pt=mapPoint(v);
      ctx.beginPath();ctx.arc(pt.x,pt.y,2.5,0,Math.PI*2);ctx.fill();
    });

    // 繪製動態角度標籤與半透明圓弧
    if(currentMetrics){
      const isLowConfidence = currentMetrics.q < 0.45;
      
      // 1. 肩臂投影角標籤 (肩膀位置)
      if(currentMetrics.sCoord){
        const sPt = mapPoint(currentMetrics.sCoord);
        drawAngleLabel(sPt.x + 15, sPt.y - 15, "肩臂投影角", isLowConfidence ? "信心不足" : `${currentMetrics.shoulder.toFixed(1)}°`, "#b8f35a");
      }

      // 2. 肘角標籤 (肘關節位置)
      if(currentMetrics.eCoord){
        const ePt = mapPoint(currentMetrics.eCoord);
        drawAngleLabel(ePt.x + 15, ePt.y, "持槍肘角", isLowConfidence ? "信心不足" : `${currentMetrics.elbow.toFixed(1)}°`, "#60a5fa");
      }

      // 3. 軀幹側傾角標籤 (軀幹中央)
      if(currentMetrics.trunkCoord){
        const tPt = mapPoint(currentMetrics.trunkCoord);
        drawAngleLabel(tPt.x - 70, tPt.y, "軀幹側傾", isLowConfidence ? "信心不足" : `${Math.abs(currentMetrics.trunk).toFixed(1)}°`, "#ffc857");
      }
    }
  }

  if(gunROI){
    const g=mapPoint(gunROI);
    ctx.strokeStyle=gunROI.score>.55?"#fb7185":"#ffc857";ctx.lineWidth=2;
    ctx.strokeRect(g.x-14,g.y-14,28,28);
    ctx.beginPath();ctx.moveTo(g.x-22,g.y);ctx.lineTo(g.x+22,g.y);ctx.moveTo(g.x,g.y-22);ctx.lineTo(g.x,g.y+22);ctx.stroke();
  }
  if(signalROI){const s=mapPoint(signalROI);ctx.strokeStyle=lastSignalScore>.35?"#4be1af":"#8fa8a0";ctx.lineWidth=2;ctx.beginPath();ctx.arc(s.x,s.y,11,0,Math.PI*2);ctx.stroke();ctx.fillStyle=lastSignalScore>.35?"#4be1af":"#8fa8a0";ctx.font="700 10px system-ui";ctx.fillText(lastSignalScore>.35?"綠燈 ON":"綠燈 ROI",s.x+15,s.y+4)}
  ctx.restore();
}

function drawAngleLabel(x, y, title, valStr, color){
  ctx.save();
  ctx.font = "700 11px system-ui";
  const pad = 6;
  const subText = `${title}: ${valStr}`;
  const textW = ctx.measureText(subText).width;
  
  // 半透明背景
  ctx.fillStyle = "rgba(7, 17, 15, 0.82)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y - 14, textW + pad * 2, 24, 6);
  ctx.fill();
  ctx.stroke();

  // 文字顏色
  ctx.fillStyle = "#f2f7f5";
  ctx.fillText(subText, x + pad, y + 2);
  ctx.restore();
}

function updateLive(m){
  if(!m)return;
  els.shoulderAngle.textContent=`${m.shoulder.toFixed(1)}°`;
  els.elbowAngle.textContent=`${m.elbow.toFixed(1)}°`;
  els.trunkAngle.textContent=`${Math.abs(m.trunk).toFixed(1)}°`;
  els.gunY.textContent=`${m.gy>=0?"+":""}${m.gy.toFixed(2)}%`;
  const recent=samples.slice(-60),stability=clamp(100-sd(recent.map(v=>v.shoulder))*4-sd(recent.map(v=>v.gy))*9-sd(recent.map(v=>v.trunk))*4,0,100);
  els.score.textContent=athleteROI&&gunROI?Math.round(stability):"—";
  els.scoreNote.textContent=m.q<.5?"骨架信心偏低，請確認遮擋與射手 ROI。":m.roiScore<.45?"槍枝 ROI 可能失鎖，建議重新點選。":"數值為同機位下的相對趨勢估算（單鏡頭推估，受拍攝視角影響）。";
  els.quality.textContent=`骨架 ${Math.round(m.q*100)}%・槍枝 ${Math.round(m.roiScore*100)}%`;
}

async function loop(ts=performance.now()){
  if(!running)return;
  resizeIfNeeded();
  let pose=null,t=0,m=null;
  if(source==="demo"){
    pose=demoPose(ts);t=Math.min(4,(ts-demoStart)/1000);
  }else if(els.video.readyState>=2){
    t=source==="video"?els.video.currentTime:ts/1000;
    if(t!==lastInfer){
      try{pose=selectPose(landmarker.detectForVideo(els.video,Math.max(lastInfer+1,performance.now())).landmarks);lastInfer=t;lastPose=pose||lastPose;trackGun()}catch(e){console.warn(e)}
    }
    pose=pose||lastPose;
  }
  if(pose){
    m=metrics(pose,t);const interval=1/+els.sampleRate.value;
    if(m&&(!analyzing||lastSample<0||t-lastSample>=interval)){
      updateLive(m);
      if(analyzing){samples.push(m);lastSample=t;els.sampleCount.textContent=`${samples.length} 格`;drawChart()}
    }
  }
  draw(pose, m);
  els.timeText.textContent=fmt(t);
  if(analyzing){
    if(source==="video"&&t>=+els.rangeEnd.value-.03){els.video.pause();finish()}
    else if(source==="demo"&&t>=4)finish();
  }
  raf=requestAnimationFrame(loop);
}

function resizeIfNeeded(){const r=els.stage.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);if(Math.abs(els.overlay.width-r.width*dpr)>2||Math.abs(els.overlay.height-r.height*dpr)>2)resize()}
function drawChart(){const c=els.chart,w=c.width,h=c.height;chartCtx.clearRect(0,0,w,h);chartCtx.strokeStyle="#17332b";chartCtx.lineWidth=1;for(let i=1;i<6;i++){chartCtx.beginPath();chartCtx.moveTo(36,i*h/6);chartCtx.lineTo(w-10,i*h/6);chartCtx.stroke()}if(samples.length<2){chartCtx.fillStyle="#6f8980";chartCtx.font="16px system-ui";chartCtx.textAlign="center";chartCtx.fillText("分析後顯示時間序列",w/2,h/2);return}const keys=[{k:"shoulder",c:"#b8f35a"},{k:"elbow",c:"#60a5fa"},{k:"trunk",c:"#ffc857"},{k:"gy",c:"#fb7185"}],t0=samples[0].t,t1=samples.at(-1).t||t0+1;for(const o of keys){const vals=samples.map(v=>v[o.k]),lo=Math.min(...vals),hi=Math.max(...vals),span=Math.max(.5,hi-lo);chartCtx.strokeStyle=o.c;chartCtx.lineWidth=2;chartCtx.beginPath();samples.forEach((v,i)=>{const x=36+(v.t-t0)/(t1-t0||1)*(w-52),y=20+(1-(v[o.k]-lo)/span)*(h-40);i?chartCtx.lineTo(x,y):chartCtx.moveTo(x,y)});chartCtx.stroke()}if(lastEvents){const marks=[["綠燈",lastEvents.green,"#4be1af"],["啟動",lastEvents.lift,"#8fa8a0"],["舉槍完成",lastEvents.raised,"#60a5fa"],["穩定",lastEvents.stable,"#b8f35a"],["擊發",lastEvents.shot,"#fb7185"]];chartCtx.font="700 10px system-ui";chartCtx.textAlign="left";marks.forEach((m,i)=>{const x=36+(m[1]-t0)/(t1-t0||1)*(w-52);chartCtx.strokeStyle=m[2];chartCtx.setLineDash([4,4]);chartCtx.beginPath();chartCtx.moveTo(x,12);chartCtx.lineTo(x,h-8);chartCtx.stroke();chartCtx.setLineDash([]);chartCtx.fillStyle=m[2];chartCtx.save();chartCtx.translate(x+3,16+i%2*14);chartCtx.fillText(m[0],0,0);chartCtx.restore()})}}
function shotCandidates(){if(samples.length<5)return[];const speed=samples.map((v,i)=>i?Math.abs(v.gy-samples[i-1].gy)/Math.max(.01,v.t-samples[i-1].t):0),threshold=mean(speed)+sd(speed)*1.35,out=[];for(let i=2;i<speed.length-2;i++)if(speed[i]>threshold&&speed[i]>=speed[i-1]&&speed[i]>=speed[i+1]&&(!out.length||samples[i].t-out.at(-1).t>.35))out.push({t:samples[i].t,peak:speed[i]});return out}
function detectEvents(){if(samples.length<8)return null;const t0=samples[0].t,signals=samples.map(v=>v.signal||0),sMin=Math.min(...signals),sMax=Math.max(...signals);let green=t0,greenAuto=false;if(signalROI&&sMax-sMin>.18){const hit=samples.find(v=>v.signal>sMin+(sMax-sMin)*.5);if(hit){green=hit.t;greenAuto=true}}const after=samples.filter(v=>v.t>=green),base=mean(after.slice(0,Math.max(2,Math.round(after.length*.08))).map(v=>v.shoulder)),top=Math.max(...after.map(v=>v.shoulder)),range=Math.max(4,top-base);let lift=after[1]?.t||green;for(let i=1;i<after.length;i++){const vel=(after[i].shoulder-after[i-1].shoulder)/Math.max(.01,after[i].t-after[i-1].t);if(after[i].shoulder>base+2&&vel>10){lift=after[i-1].t;break}}let raised=after.find(v=>v.t>=lift&&v.shoulder>=base+range*.88)?.t||lift;const candidates=shotCandidates().filter(s=>s.t>raised),shot=(candidates.sort((a,b)=>b.peak-a.peak)[0]||shotCandidates().sort((a,b)=>b.peak-a.peak)[0])?.t||samples.at(-1).t;let stable=Math.min(shot,raised+.15);const minWindow=.25;for(let i=0;i<samples.length;i++){if(samples[i].t<raised+.15)continue;const win=samples.filter(v=>v.t>=samples[i].t&&v.t<=samples[i].t+minWindow);if(win.length>=4&&sd(win.map(v=>v.shoulder))<.55&&sd(win.map(v=>v.gy))<.4&&sd(win.map(v=>v.trunk))<.45){stable=samples[i].t;break}}return{green,lift,raised,stable,shot,greenAuto,shotFound:candidates.length>0}}
function duration(a,b){return Math.max(0,b-a)}
function renderEvents(e){const vals=[duration(e.green,e.lift),duration(e.lift,e.raised),duration(e.raised,e.stable),duration(e.stable,e.shot)],total=duration(e.green,e.shot),texts=["0.00 s",`${vals[0].toFixed(2)} s`,`${vals[1].toFixed(2)} s`,`${vals[2].toFixed(2)} s`,`${total.toFixed(2)} s`];els.phaseTrack.querySelectorAll(".phase span").forEach((x,i)=>x.textContent=texts[i]);els.rReaction.textContent=`${vals[0].toFixed(2)} s`;els.rRaise.textContent=`${vals[1].toFixed(2)} s`;els.rSettle.textContent=`${vals[2].toFixed(2)} s`;els.rHold.textContent=`${vals[3].toFixed(2)} s`;els.rShotTime.textContent=`${total.toFixed(2)} s`;const perShot=selectedLimit/5,ratio=total/perShot;els.rBudget.textContent=`${Math.round(ratio*100)}%`;els.budgetFill.style.width=`${Math.min(100,ratio*100)}%`;els.budgetNote.textContent=`${selectedLimit} 秒系列平均節奏 ${perShot.toFixed(1)} 秒／發（非單發規則上限）`;els.eventQuality.textContent=`${e.greenAuto?"綠燈自動偵測":"區間起點代替綠燈"}・${e.shotFound?"找到擊發峰值":"擊發時間待確認"}`;const max=Math.max(...vals),idx=vals.indexOf(max),names=["反應啟動","舉槍過程","穩定建立","穩定等待"];els.coachTitle.textContent=`這一發最長的階段：${names[idx]}`;els.coachText.textContent=idx===0?"可檢視綠燈辨識、注意力準備與動作啟動是否一致。":idx===1?"可檢視肩臂加速是否連續，是否在接近瞄準區時出現多餘減速或修正。":idx===2?"可檢視舉槍末段的煞停策略、軀幹代償與槍枝上下振盪。":"已建立穩定但等待較久；可搭配準星品質與扳機控制判斷是否過度停留。"}
function finish(){analyzing=false;setState("分析完成","#b8f35a");lastEvents=detectEvents();if(lastEvents)renderEvents(lastEvents);const start=lastEvents?.stable??-Infinity,end=lastEvents?.shot??Infinity,valid=samples.filter(v=>v.q>.4&&v.roiScore>.3&&v.t>=start&&v.t<=end),shots=shotCandidates();els.rShoulder.textContent=`${sd(valid.map(v=>v.shoulder)).toFixed(2)}°`;els.rElbow.textContent=`${sd(valid.map(v=>v.elbow)).toFixed(2)}°`;els.rTrunk.textContent=`${sd(valid.map(v=>v.trunk)).toFixed(2)}°`;els.rGunY.textContent=`${sd(valid.map(v=>v.gy)).toFixed(2)}%`;els.rGunX.textContent=`${sd(valid.map(v=>v.gx)).toFixed(2)}%`;els.rShots.textContent=lastEvents?.shotFound?"1 個":"待確認";els.resultEmpty.classList.add("hidden");els.resultGrid.classList.remove("hidden");els.csvBtn.disabled=els.reportBtn.disabled=!samples.length;drawChart()}
function download(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
els.csvBtn.onclick=()=>{const shots=shotCandidates(),rows=[["time_s","shoulder_projection_deg","elbow_deg","trunk_deg","gun_x_roi_pct","gun_y_roi_pct","green_signal_score","pose_confidence","gun_roi_confidence","shot_candidate"],...samples.map(v=>[v.t.toFixed(4),v.shoulder.toFixed(4),v.elbow.toFixed(4),v.trunk.toFixed(4),v.gx.toFixed(4),v.gy.toFixed(4),v.signal.toFixed(4),v.q.toFixed(4),v.roiScore.toFixed(4),shots.some(s=>Math.abs(s.t-v.t)<.03)?1:0])];download(new Blob(["\ufeff"+rows.map(r=>r.join(",")).join("\n")],{type:"text/csv;charset=utf-8"}),`RapidFireLab_SingleShot_${new Date().toISOString().slice(0,10)}.csv`)};
els.reportBtn.onclick=()=>{const c=document.createElement("canvas"),x=c.getContext("2d");c.width=1400;c.height=900;x.fillStyle="#07110f";x.fillRect(0,0,c.width,c.height);x.fillStyle="#b8f35a";x.font="700 28px system-ui";x.fillText("RAPIDFIRE LAB · 25M PISTOL MOTION ANALYSIS",70,70);x.fillStyle="#f2f7f5";x.font="800 54px system-ui";x.fillText("25 公尺快射影像分析報告",70,140);x.drawImage(els.chart,70,190,900,460);const lines=[["肩臂角變異",els.rShoulder.textContent],["肘角變異",els.rElbow.textContent],["軀幹傾角變異",els.rTrunk.textContent],["槍枝上下晃動",els.rGunY.textContent],["槍枝水平晃動",els.rGunX.textContent],["疑似擊發峰值",els.rShots.textContent]];lines.forEach((v,i)=>{const y=220+i*82;x.fillStyle="#8fa8a0";x.font="18px system-ui";x.fillText(v[0],1020,y);x.fillStyle="#fff";x.font="700 30px system-ui";x.fillText(v[1],1020,y+34)});x.fillStyle="#8fa8a0";x.font="16px system-ui";x.fillText("單鏡頭影像估算；疑似擊發峰值須由教練確認（單鏡頭姿態推估，受拍攝視角影響）。",70,725);x.fillText("發明人／製作人：臺北市立大學運動健康科學系 傅思凱教授",70,795);x.fillText("© 2026 臺北市立大學運動健康科學系 傅思凱教授。保留所有權利。",70,830);c.toBlob(b=>download(b,`RapidFireLab_Report_${new Date().toISOString().slice(0,10)}.png`),"image/png")};
window.addEventListener("resize",resize);document.addEventListener("visibilitychange",()=>{if(!document.hidden&&running)loop()});resize();drawChart();
