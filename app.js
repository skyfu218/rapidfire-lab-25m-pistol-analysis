const $=id=>document.getElementById(id);
const els={video:$("video"),overlay:$("overlay"),stage:$("stage"),empty:$("empty"),guide:$("guide"),loading:$("loading"),quality:$("quality"),uploadBtn:$("uploadBtn"),fileInput:$("fileInput"),cameraBtn:$("cameraBtn"),demoBtn:$("demoBtn"),athleteBtn:$("athleteBtn"),gunBtn:$("gunBtn"),signalBtn:$("signalBtn"),resetBtn:$("resetBtn"),rangeBox:$("rangeBox"),rangeStart:$("rangeStart"),rangeEnd:$("rangeEnd"),startLabel:$("startLabel"),endLabel:$("endLabel"),previewBtn:$("previewBtn"),analyzeBtn:$("analyzeBtn"),armSide:$("armSide"),sampleRate:$("sampleRate"),skeletonToggle:$("skeletonToggle"),stateDot:$("stateDot"),stateText:$("stateText"),timeText:$("timeText"),score:$("score"),scoreNote:$("scoreNote"),shoulderAngle:$("shoulderAngle"),elbowAngle:$("elbowAngle"),trunkAngle:$("trunkAngle"),gunY:$("gunY"),chart:$("chart"),sampleCount:$("sampleCount"),resultEmpty:$("resultEmpty"),resultGrid:$("resultGrid"),rShoulder:$("rShoulder"),rElbow:$("rElbow"),rTrunk:$("rTrunk"),rGunY:$("rGunY"),rGunX:$("rGunX"),rShots:$("rShots"),csvBtn:$("csvBtn"),reportBtn:$("reportBtn"),eventQuality:$("eventQuality"),phaseTrack:$("phaseTrack"),rReaction:$("rReaction"),rRaise:$("rRaise"),rSettle:$("rSettle"),rHold:$("rHold"),rShotTime:$("rShotTime"),rBudget:$("rBudget"),budgetFill:$("budgetFill"),budgetNote:$("budgetNote"),coachTitle:$("coachTitle"),coachText:$("coachText")};
const ctx=els.overlay.getContext("2d"),chartCtx=els.chart.getContext("2d"),work=document.createElement("canvas"),wctx=work.getContext("2d",{willReadFrequently:true});
let landmarker=null,stream=null,source="idle",running=false,analyzing=false,raf=0,lastInfer=-1,lastSample=-1,athleteROI=null,gunROI=null,signalROI=null,gunTemplate=null,mode="none",dragStart=null,samples=[],lastPose=null,demoStart=0,lastSignalScore=0,selectedLimit=4,lastEvents=null;
Object.assign(els,{trial1Status:$("trial1Status"),trial2Status:$("trial2Status"),compareStatus:$("compareStatus"),syncState:$("syncState"),syncLiftBtn:$("syncLiftBtn"),syncShotBtn:$("syncShotBtn"),syncPlayBtn:$("syncPlayBtn"),syncSlider:$("syncSlider"),syncLabel:$("syncLabel"),compareVideo1:$("compareVideo1"),compareVideo2:$("compareVideo2"),compareName1:$("compareName1"),compareName2:$("compareName2"),cShoulder1:$("cShoulder1"),cShoulder2:$("cShoulder2"),dShoulder:$("dShoulder"),cElbow1:$("cElbow1"),cElbow2:$("cElbow2"),dElbow:$("dElbow"),cTrunk1:$("cTrunk1"),cTrunk2:$("cTrunk2"),dTrunk:$("dTrunk"),cGun1:$("cGun1"),cGun2:$("cGun2"),dGun:$("dGun")});
Object.assign(els,{cHeight1:$("cHeight1"),cHeight2:$("cHeight2"),dHeight:$("dHeight"),rHeight:$("rHeight"),rRecoil:$("rRecoil"),rRecovery:$("rRecovery")});
Object.assign(els,{cRecoil1:$("cRecoil1"),cRecoil2:$("cRecoil2"),dRecoil:$("dRecoil"),cRecovery1:$("cRecovery1"),cRecovery2:$("cRecovery2"),dRecovery:$("dRecovery")});
Object.assign(els,{roiSeekBox:$("roiSeekBox"),roiSeek:$("roiSeek"),roiSeekLabel:$("roiSeekLabel"),seekBackBtn:$("seekBackBtn"),seekForwardBtn:$("seekForwardBtn"),seekPlayBtn:$("seekPlayBtn")});
Object.assign(els,{syncLockBtn:$("syncLockBtn"),syncSpeed:$("syncSpeed"),comparePlay1:$("comparePlay1"),comparePlay2:$("comparePlay2"),compareSeek1:$("compareSeek1"),compareSeek2:$("compareSeek2"),compareTime1:$("compareTime1"),compareTime2:$("compareTime2"),compareSpeed1:$("compareSpeed1"),compareSpeed2:$("compareSpeed2"),phaseTrackA:$("phaseTrackA"),phaseTrackB:$("phaseTrackB"),journeyStatusA:$("journeyStatusA"),journeyStatusB:$("journeyStatusB")});
const trials=[null,null];let activeTrial=0,currentMediaUrl="",currentMediaName="",syncMode="lift",syncPlaying=false,syncLocked=false,manualSyncBase=[0,0];
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
function resetTrials(){trials.forEach(t=>{if(t?.url)URL.revokeObjectURL(t.url)});trials[0]=trials[1]=null;activeTrial=0;syncLocked=false;document.getElementById("comparison").classList.remove("locked");els.compareVideo1.removeAttribute("src");els.compareVideo2.removeAttribute("src");els.syncSlider.disabled=true;[els.syncLiftBtn,els.syncShotBtn,els.syncLockBtn,els.syncPlayBtn,els.comparePlay1,els.comparePlay2,els.compareSeek1,els.compareSeek2,els.compareSpeed1,els.compareSpeed2].forEach(x=>x.disabled=true);els.syncState.textContent="等待兩次分析";els.syncLockBtn.innerHTML="<span>🔓</span> 人工鎖定同步";updateTrialUI();renderTrialJourneys()}
els.uploadBtn.onclick=()=>{if(trials[0]&&trials[1])resetTrials();els.fileInput.value="";els.fileInput.click()};
els.fileInput.onchange=async()=>{const file=els.fileInput.files?.[0];if(!file)return;activeTrial=trials[0]?1:0;stop();source="video";currentMediaName=file.name;currentMediaUrl=URL.createObjectURL(file);els.video.srcObject=null;els.video.src=currentMediaUrl;els.video.controls=true;await new Promise((res,rej)=>{els.video.onloadedmetadata=res;els.video.onerror=rej});await loadModel();els.video.currentTime=0;const d=els.video.duration;els.rangeStart.max=els.rangeEnd.max=d;els.rangeStart.value=0;els.rangeEnd.value=Math.min(d,20);els.roiSeek.max=d;els.roiSeek.value=0;els.roiSeekLabel.textContent=fmt(0);els.roiSeekBox.classList.remove("hidden");updateRange();readySource();updateTrialUI()};
els.cameraBtn.onclick=async()=>{stop();els.roiSeekBox.classList.add("hidden");await loadModel();source="camera";stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:60}},audio:false});els.video.src=``;els.video.srcObject=stream;els.video.controls=false;await els.video.play();readySource()};
els.demoBtn.onclick=()=>{if(trials[0]&&trials[1])resetTrials();activeTrial=trials[0]?1:0;stop();els.roiSeekBox.classList.add("hidden");source="demo";currentMediaName=`示範試次 ${activeTrial?"B":"A"}`;currentMediaUrl="";els.video.removeAttribute("src");els.video.srcObject=null;els.video.style.visibility="hidden";demoStart=performance.now();athleteROI={x:.18,y:.12,w:.47,h:.8};gunROI={x:.68,y:.33,score:1,baseX:.68,baseY:.33};signalROI={x:.84,y:.16};els.rangeStart.max=els.rangeEnd.max=4;els.rangeStart.value=0;els.rangeEnd.value=4;updateRange();readySource();els.analyzeBtn.disabled=false;els.guide.textContent=`試次 ${activeTrial?"B":"A"} 示範：綠燈 → 舉槍 → 穩定 → 擊發`;updateTrialUI()};
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
function seekTo(value){if(source!=="video")return;els.video.pause();els.seekPlayBtn.textContent="播放";const t=clamp(value,0,els.video.duration||0);els.video.currentTime=t;els.roiSeek.value=t;els.roiSeekLabel.textContent=fmt(t);els.guide.textContent="已定位畫面；現在可框選射手或點選槍枝 ROI"}
els.roiSeek.oninput=()=>seekTo(+els.roiSeek.value);
els.seekBackBtn.onclick=()=>seekTo(els.video.currentTime-1/+els.sampleRate.value);
els.seekForwardBtn.onclick=()=>seekTo(els.video.currentTime+1/+els.sampleRate.value);
els.seekPlayBtn.onclick=async()=>{if(source!=="video")return;if(els.video.paused){await els.video.play();els.seekPlayBtn.textContent="暫停"}else{els.video.pause();els.seekPlayBtn.textContent="播放"}};
els.video.addEventListener("timeupdate",()=>{if(source!=="video")return;els.roiSeek.value=els.video.currentTime;els.roiSeekLabel.textContent=fmt(els.video.currentTime)});
els.video.addEventListener("pause",()=>{els.seekPlayBtn.textContent="播放"});
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

  // 使用者指定的顯示定義：肩抬舉為垂下 0°、水平 90°、頭上 180°；肘完全伸直為 0° flexion。
  const rawShoulder=Math.atan2(Math.abs(w.x-s.x),w.y-s.y)*180/Math.PI;
  const rawElbow=180-angle(s,e,w);
  const rawTrunk=Math.atan2(ms.x-mh.x,mh.y-ms.y)*180/Math.PI;
  const gx=gunROI?(gunROI.x-gunROI.baseX)/Math.max(.08,athleteROI?.w||1)*100:0;
  const gy=gunROI?-(gunROI.y-gunROI.baseY)/Math.max(.15,athleteROI?.h||1)*100:0;
  const gunHeight=gunROI?(mh.y-gunROI.y)/Math.max(.15,athleteROI?.h||1)*100:0;

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

  return{t,shoulder:smoothM.shoulder,elbow:smoothM.elbow,trunk:smoothM.trunk,gx:smoothM.gx,gy:smoothM.gy,gunHeight,q,roiScore:gunROI?.score||0,signal:lastSignalScore,sCoord:s,eCoord:e,trunkCoord:ms};
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
        drawAngleLabel(sPt.x + 15, sPt.y - 15, "肩抬舉角", isLowConfidence ? "信心不足" : `${currentMetrics.shoulder.toFixed(1)}°`, "#b8f35a");
      }

      // 2. 肘角標籤 (肘關節位置)
      if(currentMetrics.eCoord){
        const ePt = mapPoint(currentMetrics.eCoord);
        drawAngleLabel(ePt.x + 15, ePt.y, "肘屈曲角", isLowConfidence ? "信心不足" : `${currentMetrics.elbow.toFixed(1)}°`, "#60a5fa");
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
function drawChart(){const c=els.chart,w=c.width,h=c.height;chartCtx.clearRect(0,0,w,h);chartCtx.strokeStyle="#17332b";chartCtx.lineWidth=1;for(let i=1;i<6;i++){chartCtx.beginPath();chartCtx.moveTo(52,i*h/6);chartCtx.lineTo(w-10,i*h/6);chartCtx.stroke()}chartCtx.save();chartCtx.translate(13,h/2);chartCtx.rotate(-Math.PI/2);chartCtx.fillStyle="#8fa8a0";chartCtx.font="11px system-ui";chartCtx.textAlign="center";chartCtx.fillText("角度 (°) ／ 槍枝位移 (% ROI)",0,0);chartCtx.restore();if(samples.length<2){chartCtx.fillStyle="#6f8980";chartCtx.font="16px system-ui";chartCtx.textAlign="center";chartCtx.fillText("分析後顯示時間序列",w/2,h/2);return}const shown=new Set([...document.querySelectorAll(".chart-toggles input:checked")].map(x=>x.dataset.series)),keys=[{k:"shoulder",c:"#b8f35a"},{k:"elbow",c:"#60a5fa"},{k:"trunk",c:"#ffc857"},{k:"gy",c:"#fb7185"}].filter(o=>shown.has(o.k)),t0=samples[0].t,t1=samples.at(-1).t||t0+1;for(const o of keys){const vals=samples.map(v=>v[o.k]),lo=Math.min(...vals),hi=Math.max(...vals),span=Math.max(.5,hi-lo);chartCtx.strokeStyle=o.c;chartCtx.lineWidth=2;chartCtx.beginPath();samples.forEach((v,i)=>{const x=52+(v.t-t0)/(t1-t0||1)*(w-68),y=20+(1-(v[o.k]-lo)/span)*(h-40);i?chartCtx.lineTo(x,y):chartCtx.moveTo(x,y)});chartCtx.stroke()}if(lastEvents){const marks=[["綠燈",lastEvents.green,"#4be1af"],["啟動",lastEvents.lift,"#8fa8a0"],["舉槍完成",lastEvents.raised,"#60a5fa"],["穩定",lastEvents.stable,"#b8f35a"],["擊發",lastEvents.shot,"#fb7185"]];chartCtx.font="700 10px system-ui";chartCtx.textAlign="left";marks.forEach((m,i)=>{const x=52+(m[1]-t0)/(t1-t0||1)*(w-68);chartCtx.strokeStyle=m[2];chartCtx.setLineDash([4,4]);chartCtx.beginPath();chartCtx.moveTo(x,12);chartCtx.lineTo(x,h-8);chartCtx.stroke();chartCtx.setLineDash([]);chartCtx.fillStyle=m[2];chartCtx.fillText(m[0],x+3,16+i%2*14)})}}
document.querySelectorAll(".chart-toggles input").forEach(x=>x.onchange=drawChart);
function shotCandidates(){if(samples.length<5)return[];const speed=samples.map((v,i)=>i?Math.abs(v.gy-samples[i-1].gy)/Math.max(.01,v.t-samples[i-1].t):0),threshold=mean(speed)+sd(speed)*1.35,out=[];for(let i=2;i<speed.length-2;i++)if(speed[i]>threshold&&speed[i]>=speed[i-1]&&speed[i]>=speed[i+1]&&(!out.length||samples[i].t-out.at(-1).t>.35))out.push({t:samples[i].t,peak:speed[i]});return out}
function detectEvents(){if(samples.length<8)return null;const t0=samples[0].t,signals=samples.map(v=>v.signal||0),sMin=Math.min(...signals),sMax=Math.max(...signals);let green=t0,greenAuto=false;if(signalROI&&sMax-sMin>.18){const hit=samples.find(v=>v.signal>sMin+(sMax-sMin)*.5);if(hit){green=hit.t;greenAuto=true}}const after=samples.filter(v=>v.t>=green),base=mean(after.slice(0,Math.max(2,Math.round(after.length*.08))).map(v=>v.shoulder)),top=Math.max(...after.map(v=>v.shoulder)),range=Math.max(4,top-base);let lift=after[1]?.t||green;for(let i=1;i<after.length;i++){const vel=(after[i].shoulder-after[i-1].shoulder)/Math.max(.01,after[i].t-after[i-1].t);if(after[i].shoulder>base+2&&vel>10){lift=after[i-1].t;break}}let raised=after.find(v=>v.t>=lift&&v.shoulder>=base+range*.88)?.t||lift;const candidates=shotCandidates().filter(s=>s.t>raised),shot=(candidates.sort((a,b)=>b.peak-a.peak)[0]||shotCandidates().sort((a,b)=>b.peak-a.peak)[0])?.t||samples.at(-1).t;let stable=Math.min(shot,raised+.15);const minWindow=.25;for(let i=0;i<samples.length;i++){if(samples[i].t<raised+.15)continue;const win=samples.filter(v=>v.t>=samples[i].t&&v.t<=samples[i].t+minWindow);if(win.length>=4&&sd(win.map(v=>v.shoulder))<.55&&sd(win.map(v=>v.gy))<.4&&sd(win.map(v=>v.trunk))<.45){stable=samples[i].t;break}}return{green,lift,raised,stable,shot,greenAuto,shotFound:candidates.length>0}}
function duration(a,b){return Math.max(0,b-a)}
function renderEvents(e){const vals=[duration(e.green,e.lift),duration(e.lift,e.raised),duration(e.raised,e.stable),duration(e.stable,e.shot)],total=duration(e.green,e.shot),texts=["0.00 s",`${vals[0].toFixed(2)} s`,`${vals[1].toFixed(2)} s`,`${vals[2].toFixed(2)} s`,`${total.toFixed(2)} s`];els.phaseTrack.querySelectorAll(".phase span").forEach((x,i)=>x.textContent=texts[i]);els.rReaction.textContent=`${vals[0].toFixed(2)} s`;els.rRaise.textContent=`${vals[1].toFixed(2)} s`;els.rSettle.textContent=`${vals[2].toFixed(2)} s`;els.rHold.textContent=`${vals[3].toFixed(2)} s`;els.rShotTime.textContent=`${total.toFixed(2)} s`;const perShot=selectedLimit/5,ratio=total/perShot;els.rBudget.textContent=`${Math.round(ratio*100)}%`;els.budgetFill.style.width=`${Math.min(100,ratio*100)}%`;els.budgetNote.textContent=`${selectedLimit} 秒系列平均節奏 ${perShot.toFixed(1)} 秒／發（非單發規則上限）`;els.eventQuality.textContent=`${e.greenAuto?"綠燈自動偵測":"區間起點代替綠燈"}・${e.shotFound?"找到擊發峰值":"擊發時間待確認"}`;const max=Math.max(...vals),idx=vals.indexOf(max),names=["反應啟動","舉槍過程","穩定建立","穩定等待"];els.coachTitle.textContent=`這一發最長的階段：${names[idx]}`;els.coachText.textContent=idx===0?"可檢視綠燈辨識、注意力準備與動作啟動是否一致。":idx===1?"可檢視肩臂加速是否連續，是否在接近瞄準區時出現多餘減速或修正。":idx===2?"可檢視舉槍末段的煞停策略、軀幹代償與槍枝上下振盪。":"已建立穩定但等待較久；可搭配準星品質與扳機控制判斷是否過度停留。"}
function recoilMetrics(data,e){if(!e)return{height:0,jump:0,recovery:null};const stable=data.filter(v=>v.t>=e.stable&&v.t<=e.shot),height=mean(stable.map(v=>v.gunHeight)),pre=data.filter(v=>v.t>=e.shot-.25&&v.t<=e.shot),base=mean(pre.map(v=>v.gunHeight)),band=Math.max(.25,sd(pre.map(v=>v.gunHeight))*2),post=data.filter(v=>v.t>e.shot&&v.t<=e.shot+.8);if(!post.length)return{height,jump:0,recovery:null};const peak=post.reduce((a,b)=>b.gunHeight>a.gunHeight?b:a,post[0]),jump=Math.max(0,peak.gunHeight-base),recovered=post.find(v=>v.t>peak.t&&Math.abs(v.gunHeight-base)<=band);return{height,jump,recovery:recovered?recovered.t-e.shot:null}}
function nearest(data,t){return data.reduce((a,b)=>Math.abs(b.t-t)<Math.abs(a.t-t)?b:a,data[0])}
function updateTrialUI(){els.trial1Status.className=trials[0]?"done":activeTrial===0?"active":"";els.trial2Status.className=trials[1]?"done":activeTrial===1?"active":"";els.trial1Status.innerHTML=`<b>試次 A</b>${trials[0]?"分析完成":"等待第一部影片"}`;els.trial2Status.innerHTML=`<b>試次 B</b>${trials[1]?"分析完成":trials[0]?"等待第二部影片":"完成 A 後匯入"}`;els.compareStatus.className=trials[0]&&trials[1]?"done":"";els.compareStatus.innerHTML=`<b>同步比較</b>${trials[0]&&trials[1]?"可以開始":"等待兩次分析"}`;els.uploadBtn.textContent=trials[0]&&!trials[1]?"匯入第二部影片":"匯入第一部影片"}
function syncAnchor(trial){return syncMode==="shot"?trial.events.shot:trial.events.lift}
function setCompareValue(a,b,key,unit,n1,n2,d){const va=a[key],vb=b[key],delta=vb-va;els[n1].textContent=`${va.toFixed(1)}${unit}`;els[n2].textContent=`${vb.toFixed(1)}${unit}`;els[d].textContent=`${delta>=0?"+":""}${delta.toFixed(1)}${unit}`}
function journeyTexts(e){if(!e)return["—","—","—","—","—"];return["0.00 s",`${duration(e.green,e.lift).toFixed(2)} s`,`${duration(e.lift,e.raised).toFixed(2)} s`,`${duration(e.raised,e.stable).toFixed(2)} s`,`${duration(e.green,e.shot).toFixed(2)} s`]}
function renderTrialJourneys(){[[els.phaseTrackA,els.journeyStatusA,trials[0]],[els.phaseTrackB,els.journeyStatusB,trials[1]]].forEach(([track,status,trial])=>{track.querySelectorAll(".phase span").forEach((x,i)=>x.textContent=journeyTexts(trial?.events)[i]);status.textContent=trial?`${trial.name}・分析完成`:"等待分析"})}
function updateComparisonValues(t1,t2){if(!(trials[0]&&trials[1]))return;const a=nearest(trials[0].samples,t1),b=nearest(trials[1].samples,t2);setCompareValue(a,b,"shoulder","°","cShoulder1","cShoulder2","dShoulder");setCompareValue(a,b,"elbow","°","cElbow1","cElbow2","dElbow");setCompareValue(a,b,"trunk","°","cTrunk1","cTrunk2","dTrunk");setCompareValue(a,b,"gy","%","cGun1","cGun2","dGun");setCompareValue(a,b,"gunHeight","%","cHeight1","cHeight2","dHeight")}
function syncBase(i){return syncLocked?manualSyncBase[i]:syncAnchor(trials[i])}
function updateSync(){if(!(trials[0]&&trials[1]))return;const rel=+els.syncSlider.value,t1=syncBase(0)+rel,t2=syncBase(1)+rel;els.syncLabel.textContent=`${syncMode==="manual"?"人工鎖定":"自動對齊"} ${rel>=0?"+":""}${rel.toFixed(2)} s`;if(trials[0].url)els.compareVideo1.currentTime=clamp(t1,0,els.compareVideo1.duration||t1);if(trials[1].url)els.compareVideo2.currentTime=clamp(t2,0,els.compareVideo2.duration||t2);els.compareSeek1.value=t1;els.compareSeek2.value=t2;els.compareTime1.textContent=fmt(t1);els.compareTime2.textContent=fmt(t2);updateComparisonValues(t1,t2)}
function lockAt(base1,base2,mode="manual"){syncLocked=true;syncMode=mode;manualSyncBase=[base1,base2];document.getElementById("comparison").classList.add("locked");els.syncLockBtn.innerHTML="<span>🔒</span> 解除同步鎖定";const min=-Math.min(base1,base2),max=Math.min(trials[0].samples.at(-1).t-base1,trials[1].samples.at(-1).t-base2);els.syncSlider.min=min.toFixed(2);els.syncSlider.max=max.toFixed(2);els.syncSlider.value=0;els.syncSlider.disabled=false;els.syncPlayBtn.disabled=!(trials[0].url&&trials[1].url);updateSync()}
function unlockSync(){syncLocked=false;syncPlaying=false;document.getElementById("comparison").classList.remove("locked");els.syncLockBtn.innerHTML="<span>🔓</span> 人工鎖定同步";els.syncPlayBtn.textContent="同步播放";els.syncSlider.disabled=true;els.compareVideo1.pause();els.compareVideo2.pause();els.syncLabel.textContent="尚未鎖定";updateComparisonValues(+els.compareSeek1.value,+els.compareSeek2.value)}
function seekIndividual(i,value){const trial=trials[i],video=i?els.compareVideo2:els.compareVideo1,slider=i?els.compareSeek2:els.compareSeek1,label=i?els.compareTime2:els.compareTime1;if(!trial||syncLocked)return;const t=clamp(value,trial.samples[0].t,trial.samples.at(-1).t);slider.value=t;label.textContent=fmt(t);if(trial.url)video.currentTime=clamp(t,0,video.duration||t);updateComparisonValues(+els.compareSeek1.value,+els.compareSeek2.value)}
function prepareComparison(){renderTrialJourneys();if(!(trials[0]&&trials[1]))return;const hDiff=trials[1].recoil.height-trials[0].recoil.height;els.syncState.textContent=`兩次分析完成・舉槍高度差 ${Math.abs(hDiff).toFixed(2)}% ROI`;[els.syncLiftBtn,els.syncShotBtn,els.syncLockBtn].forEach(x=>x.disabled=false);els.compareName1.textContent=trials[0].name;els.compareName2.textContent=trials[1].name;[0,1].forEach(i=>{const t=trials[i],video=i?els.compareVideo2:els.compareVideo1,seek=i?els.compareSeek2:els.compareSeek1,time=i?els.compareTime2:els.compareTime1,play=i?els.comparePlay2:els.comparePlay1,speed=i?els.compareSpeed2:els.compareSpeed1;if(t.url)video.src=t.url;seek.min=t.samples[0].t;seek.max=t.samples.at(-1).t;seek.value=t.events.lift;time.textContent=fmt(t.events.lift);seek.disabled=false;speed.disabled=false;play.disabled=!t.url});els.cRecoil1.textContent=`${trials[0].recoil.jump.toFixed(2)}%`;els.cRecoil2.textContent=`${trials[1].recoil.jump.toFixed(2)}%`;els.dRecoil.textContent=`${(trials[1].recoil.jump-trials[0].recoil.jump).toFixed(2)}%`;const r1=trials[0].recoil.recovery,r2=trials[1].recoil.recovery;els.cRecovery1.textContent=r1==null?"未回復":`${r1.toFixed(2)} s`;els.cRecovery2.textContent=r2==null?"未回復":`${r2.toFixed(2)} s`;els.dRecovery.textContent=r1==null||r2==null?"—":`${(r2-r1).toFixed(2)} s`;unlockSync();updateComparisonValues(trials[0].events.lift,trials[1].events.lift)}
els.compareSeek1.oninput=()=>seekIndividual(0,+els.compareSeek1.value);els.compareSeek2.oninput=()=>seekIndividual(1,+els.compareSeek2.value);els.compareSpeed1.onchange=()=>els.compareVideo1.playbackRate=+els.compareSpeed1.value;els.compareSpeed2.onchange=()=>els.compareVideo2.playbackRate=+els.compareSpeed2.value;els.syncSlider.oninput=updateSync;els.syncLockBtn.onclick=()=>syncLocked?unlockSync():lockAt(+els.compareSeek1.value,+els.compareSeek2.value,"manual");els.syncLiftBtn.onclick=()=>{els.syncLiftBtn.classList.add("active");els.syncShotBtn.classList.remove("active");lockAt(trials[0].events.lift,trials[1].events.lift,"lift")};els.syncShotBtn.onclick=()=>{els.syncShotBtn.classList.add("active");els.syncLiftBtn.classList.remove("active");lockAt(trials[0].events.shot,trials[1].events.shot,"shot")};
function toggleIndividual(i){if(syncLocked)return;const video=i?els.compareVideo2:els.compareVideo1,button=i?els.comparePlay2:els.comparePlay1,speed=i?els.compareSpeed2:els.compareSpeed1;if(video.paused){video.playbackRate=+speed.value;video.play();button.textContent=`暫停 ${i?"B":"A"}`}else{video.pause();button.textContent=`播放 ${i?"B":"A"}`}}
els.comparePlay1.onclick=()=>toggleIndividual(0);els.comparePlay2.onclick=()=>toggleIndividual(1);[0,1].forEach(i=>{const video=i?els.compareVideo2:els.compareVideo1,seek=i?els.compareSeek2:els.compareSeek1,time=i?els.compareTime2:els.compareTime1,button=i?els.comparePlay2:els.comparePlay1;video.addEventListener("timeupdate",()=>{if(syncLocked)return;seek.value=video.currentTime;time.textContent=fmt(video.currentTime);updateComparisonValues(+els.compareSeek1.value,+els.compareSeek2.value)});video.addEventListener("pause",()=>button.textContent=`播放 ${i?"B":"A"}`)});
els.syncSpeed.onchange=()=>{els.compareVideo1.playbackRate=els.compareVideo2.playbackRate=+els.syncSpeed.value};els.syncPlayBtn.onclick=async()=>{if(!(syncLocked&&trials[0]?.url&&trials[1]?.url))return;syncPlaying=!syncPlaying;els.syncPlayBtn.textContent=syncPlaying?"同步暫停":"同步播放";if(syncPlaying){updateSync();els.compareVideo1.playbackRate=els.compareVideo2.playbackRate=+els.syncSpeed.value;await Promise.all([els.compareVideo1.play(),els.compareVideo2.play()]);const tick=()=>{if(!syncPlaying)return;const rel=els.compareVideo1.currentTime-manualSyncBase[0];els.syncSlider.value=clamp(rel,+els.syncSlider.min,+els.syncSlider.max);els.compareTime1.textContent=fmt(els.compareVideo1.currentTime);els.compareTime2.textContent=fmt(els.compareVideo2.currentTime);updateComparisonValues(els.compareVideo1.currentTime,els.compareVideo2.currentTime);if(rel>=+els.syncSlider.max){syncPlaying=false;els.syncPlayBtn.textContent="同步播放";els.compareVideo1.pause();els.compareVideo2.pause();return}requestAnimationFrame(tick)};tick()}else{els.compareVideo1.pause();els.compareVideo2.pause()}};
function finish(){analyzing=false;setState("分析完成","#b8f35a");lastEvents=detectEvents();if(lastEvents)renderEvents(lastEvents);const start=lastEvents?.stable??-Infinity,end=lastEvents?.shot??Infinity,valid=samples.filter(v=>v.q>.4&&v.roiScore>.3&&v.t>=start&&v.t<=end),shots=shotCandidates(),recoil=recoilMetrics(samples,lastEvents);els.rShoulder.textContent=`${sd(valid.map(v=>v.shoulder)).toFixed(2)}°`;els.rElbow.textContent=`${sd(valid.map(v=>v.elbow)).toFixed(2)}°`;els.rTrunk.textContent=`${sd(valid.map(v=>v.trunk)).toFixed(2)}°`;els.rGunY.textContent=`${sd(valid.map(v=>v.gy)).toFixed(2)}%`;els.rGunX.textContent=`${sd(valid.map(v=>v.gx)).toFixed(2)}%`;els.rShots.textContent=lastEvents?.shotFound?"1 個":"待確認";els.rHeight.textContent=`${recoil.height.toFixed(2)}%`;els.rRecoil.textContent=`${recoil.jump.toFixed(2)}%`;els.rRecovery.textContent=recoil.recovery==null?"未回復":`${recoil.recovery.toFixed(2)} s`;els.resultEmpty.classList.add("hidden");els.resultGrid.classList.remove("hidden");els.csvBtn.disabled=els.reportBtn.disabled=!samples.length;trials[activeTrial]={samples:samples.map(v=>({...v})),events:{...lastEvents},recoil,url:currentMediaUrl,name:currentMediaName||`試次 ${activeTrial?"B":"A"}`};updateTrialUI();prepareComparison();drawChart()}
function download(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
els.csvBtn.onclick=()=>{const shots=shotCandidates(),rows=[["time_s","shoulder_elevation_deg_0down_90horizontal_180overhead","elbow_flexion_deg_0straight","trunk_deg","gun_x_roi_pct","gun_y_roi_pct","gun_height_body_roi_pct","green_signal_score","pose_confidence","gun_roi_confidence","shot_candidate"],...samples.map(v=>[v.t.toFixed(4),v.shoulder.toFixed(4),v.elbow.toFixed(4),v.trunk.toFixed(4),v.gx.toFixed(4),v.gy.toFixed(4),v.gunHeight.toFixed(4),v.signal.toFixed(4),v.q.toFixed(4),v.roiScore.toFixed(4),shots.some(s=>Math.abs(s.t-v.t)<.03)?1:0])];download(new Blob(["\ufeff"+rows.map(r=>r.join(",")).join("\n")],{type:"text/csv;charset=utf-8"}),`RapidFireLab_SingleShot_${new Date().toISOString().slice(0,10)}.csv`)};
els.reportBtn.onclick=()=>{const c=document.createElement("canvas"),x=c.getContext("2d");c.width=1400;c.height=900;x.fillStyle="#07110f";x.fillRect(0,0,c.width,c.height);x.fillStyle="#b8f35a";x.font="700 28px system-ui";x.fillText("RAPIDFIRE LAB · 25M PISTOL MOTION ANALYSIS",70,70);x.fillStyle="#f2f7f5";x.font="800 54px system-ui";x.fillText("25 公尺快射影像分析報告",70,140);x.drawImage(els.chart,70,190,900,460);const lines=[["肩臂角變異",els.rShoulder.textContent],["肘角變異",els.rElbow.textContent],["軀幹傾角變異",els.rTrunk.textContent],["槍枝上下晃動",els.rGunY.textContent],["槍枝水平晃動",els.rGunX.textContent],["疑似擊發峰值",els.rShots.textContent]];lines.forEach((v,i)=>{const y=220+i*82;x.fillStyle="#8fa8a0";x.font="18px system-ui";x.fillText(v[0],1020,y);x.fillStyle="#fff";x.font="700 30px system-ui";x.fillText(v[1],1020,y+34)});x.fillStyle="#8fa8a0";x.font="16px system-ui";x.fillText("單鏡頭影像估算；疑似擊發峰值須由教練確認（單鏡頭姿態推估，受拍攝視角影響）。",70,725);x.fillText("發明人／製作人：臺北市立大學運動健康科學系 傅思凱教授",70,795);x.fillText("© 2026 臺北市立大學運動健康科學系 傅思凱教授。保留所有權利。",70,830);c.toBlob(b=>download(b,`RapidFireLab_Report_${new Date().toISOString().slice(0,10)}.png`),"image/png")};
window.addEventListener("resize",resize);document.addEventListener("visibilitychange",()=>{if(!document.hidden&&running)loop()});updateTrialUI();resize();drawChart();
