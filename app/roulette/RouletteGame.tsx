"use client";

import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle, ReactNode } from "react";

/**
 * RouletteZeroToTen — V22
 *
 * - Expanded side bets to cover BLACK/RED, ODD/EVEN, and LOW/HIGH groupings.
 * - Unified number cell colors to use the **same palette** as the wheel/side-bet tiles:
 *   POCKET_RED / POCKET_BLACK with POCKET_ZERO for 0.
 * - Keeps settle behavior (no direction flip) and quicker end slow-down.
 */

type Bets = Record<number, number>;

type SideKey = 'black' | 'red' | 'odd' | 'even' | 'low' | 'high';

const createEmptySideBets = (): Record<SideKey, number> => ({
  black: 0,
  red: 0,
  odd: 0,
  even: 0,
  low: 0,
  high: 0,
});

const NUMBERS = [0,1,2,3,4,5,6,7,8,9,10];
const DESKTOP_ZERO_TILE = 0;
const DESKTOP_NUMBER_ROWS = [
  [1,2,3,4,5],
  [6,7,8,9,10],
] as const;
const WHEEL_ORDER = [0,5,10,3,8,1,6,9,2,7,4]; // clockwise
const CHIP_AMOUNTS = [1,10,50] as const;
const MOBILE_NUM_ORDER = [0,1,2,3,4,5,null,6,7,8,9,10];

// Palette
const RING_DEEP = "#063246";        // deep teal inner ring
const LIGHT_AQUA = "#3db8c3";      // hub disc + outer border glow
const POCKET_RED = "#e76a75";      // softened red for pockets
const POCKET_BLACK = "#101b2d";    // deep blue-black for pockets
const POCKET_ZERO = "#1b9ab4";     // mellow cyan for 0 pocket and table cell

const SIDE_CONFIG: Record<SideKey, { label: string; short: string; bg: string; subLabel?: string; text?: string }> = {
  black: { label: "BLACK", short: "BLK", bg: POCKET_BLACK },
  red: { label: "RED", short: "RED", bg: POCKET_RED },
  odd: { label: "ODD", short: "ODD", bg: "#1f7aa5" },
  even: { label: "EVEN", short: "EVN", bg: "#1a8f88" },
  low: { label: "LOW", short: "LOW", subLabel: "1-5", bg: "#1c3f91" },
  high: { label: "HIGH", short: "HIGH", subLabel: "6-10", bg: "#13655f" },
};

function chipStyle(amount:number){
  switch(amount){
    case 1:
      return { face: "#d6e4f4", text: "#102542", glowSoft: "rgba(148,163,184,0.18)", glowDrag: "rgba(148,163,184,0.32)" };
    case 10:
      return { face: "#c0e6e5", text: "#0f5b5a", glowSoft: "rgba(34,197,194,0.2)", glowDrag: "rgba(20,184,166,0.35)" };
    case 50:
      return { face: "#c7d5f6", text: "#1f3f87", glowSoft: "rgba(59,130,246,0.24)", glowDrag: "rgba(37,99,235,0.45)" };
    default:
      return { face: "#c0e6e5", text: "#0f5b5a", glowSoft: "rgba(34,197,194,0.2)", glowDrag: "rgba(20,184,166,0.35)" };
  }
}

function Chip({ amount, selected, dragging, draggingAny }: { amount: number; selected: boolean; dragging: boolean; draggingAny: boolean }) {
  const st = chipStyle(amount);
  const isSoft = selected && !draggingAny; // chip keeps subtle selection glow
  const glow = dragging ? st.glowDrag : isSoft ? st.glowSoft : null;
  return (
    <div className={`relative grid place-items-center w-12 h-12 md:w-14 md:h-14 rounded-full select-none ${dragging || isSoft ? "scale-[1.02]" : ""}`}>
      <div
        className={`absolute inset-0 rounded-full pointer-events-none transition-opacity duration-120 ${glow ? "opacity-100" : "opacity-0"}`}
        style={glow ? { boxShadow: `0 0 0 1px ${glow}, 0 0 14px 4px ${glow}, inset 0 0 6px ${glow}` } : {}}
      />
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="drop-shadow w-full h-full">
        <defs>
          <style>{`.chip{fill:#1b1e24}.light{fill:#ffffff}`}</style>
          <mask id={`insMask${amount}`} maskUnits="userSpaceOnUse">
            <rect width="512" height="512" fill="black" />
            <circle cx="256" cy="256" r="240" fill="white" />
          </mask>
        </defs>
        <circle className="chip" cx="256" cy="256" r="240" />
        <g className="light" mask={`url(#insMask${amount})`}>
          <path d="M190 10 L322 10 L300 88 L212 88 Z" />
          <path d="M190 10 L322 10 L300 88 L212 88 Z" transform="rotate(60 256 256)" />
          <path d="M190 10 L322 10 L300 88 L212 88 Z" transform="rotate(120 256 256)" />
          <path d="M190 10 L322 10 L300 88 L212 88 Z" transform="rotate(180 256 256)" />
          <path d="M190 10 L322 10 L300 88 L212 88 Z" transform="rotate(240 256 256)" />
          <path d="M190 10 L322 10 L300 88 L212 88 Z" transform="rotate(300 256 256)" />
        </g>
        <circle cx="256" cy="256" r="150" fill={st.face} />
        <text x="256" y="256" dominantBaseline="middle" textAnchor="middle" fontWeight="900" fontSize="120" fill={st.text}>
          {amount}
        </text>
      </svg>
    </div>
  );
}

// --- Small helpers & dev checks ---
const normalizeAngle = (a:number)=>{ while(a>Math.PI) a-=Math.PI*2; while(a<-Math.PI) a+=Math.PI*2; return a; };
const calcWinnings = (winning:number, bets:Bets, sides:Record<SideKey, number>)=>{
  let total=0;
  if(bets[winning]) total += bets[winning]*11; // 10:1 plus stake
  const color = winning===0 ? null : (winning %2===0 ? 'red' : 'black');
  if(color){ total += sides[color as 'red' | 'black']*2; }
  if(winning!==0){
    if(winning %2===0) total += sides.even*2; else total += sides.odd*2;
    if(winning>=1 && winning<=5) total += sides.low*2;
    if(winning>=6) total += sides.high*2;
  }
  return total;
};

// Simulate the settle update step (pure) — used by sanity tests below
function settleNext(ballOmega:number, pocketOmega:number, dt:number, settleLerp=4.5){
  let next = ballOmega + (pocketOmega - ballOmega) * (settleLerp * dt);
  const sign = Math.sign(ballOmega) || -1; // usually negative (ball vs wheel)
  // do not cross into the opposite sign unless essentially stopped
  if (Math.sign(next) !== sign && Math.abs(next) < 0.3) {
    next = sign * Math.max(0, Math.abs(next));
  }
  if (Math.abs(next) < 1.5) { next *= 0.985; }
  return next;
}

function runDevTests(){
  try{
    console.groupCollapsed('%cRoulette V22 – sanity tests','color:#6b46c1;font-weight:700');
    console.assert(WHEEL_ORDER.length===11, 'Wheel must have 11 pockets.');
    console.assert(new Set(WHEEL_ORDER).size===11, 'Wheel order must be unique.');
    // side mapping
    console.assert(SIDE_CONFIG.black.bg===POCKET_BLACK, 'BLACK should be black');
    console.assert(SIDE_CONFIG.red.bg===POCKET_RED, 'RED should be red');
    // settle should not visibly flip direction
    let omega=-12, flipped=false; const pocket=1; for(let i=0;i<300;i++){ const prev=omega; omega=settleNext(omega,pocket,0.016); if(Math.sign(omega)!==Math.sign(prev) && Math.abs(omega)>0.3){ flipped=true; break; } }
    console.assert(!flipped,'Settle should not reverse direction except near rest');
    console.groupEnd();
  }catch{ /* no-op */ }
}

export interface RouletteGameHandle {
  spin: () => void;
}

const RouletteGame = forwardRef<RouletteGameHandle, {
  wallet: number;
  setWallet: React.Dispatch<React.SetStateAction<number>>;
  onStateChange?: (data: { bets: Bets; sideBets: Record<SideKey, number> }) => void;
  controlsDesktop?: ReactNode;
  controlsMobile?: ReactNode;
}>(({ wallet, setWallet, onStateChange, controlsDesktop, controlsMobile }, ref) => {
  const [bets, setBets] = useState<Bets>({});
  const [sideBets, setSideBets] = useState<Record<SideKey, number>>(() => createEmptySideBets());
  const [spinning, setSpinning] = useState(false);
  const [activeChipAmount, setActiveChipAmount] = useState<number>(10);
  const [draggingAmount, setDraggingAmount] = useState<number | null>(null);
  const draggingAny = draggingAmount !== null;
  // kept hover states but no longer used for styling
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverSide, setHoverSide] = useState<SideKey | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    onStateChange?.({ bets, sideBets });
  }, [bets, sideBets, onStateChange]);

  // Canvas state
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const rafRef = useRef<number|null>(null);
  const lastRef = useRef<number>(performance.now());

  const wheelAngleRef = useRef(0);  const wheelOmegaRef = useRef(0);
  const ballAngleRef  = useRef(0);  const ballOmegaRef  = useRef(0);
  const ballRadRef    = useRef(0);
  const targetPocketIdxRef = useRef<number|null>(null);
  const settleJumpsRef = useRef(0);

  const dimsRef = useRef({ W:820,H:820,CX:410,CY:410, OUTER:377, POCKET:309, INNER:208, HUB:83, BALL_R:14 });

  // Spin-phase state machine
  type Phase = 'idle' | 'spinning' | 'settle' | 'locked' | 'payout';
  const phaseRef = useRef<Phase>('idle');
  const prevBallAngleRef = useRef<number>(0);
  const ballRevsRef = useRef<number>(0); // accumulated revolutions
  const ballSignRef = useRef<number>(-1); // initial ball direction sign at spin start

  // Tunables
  const MIN_REVS_BEFORE_CAPTURE = 2.25;            // ≥2x before result
  const WHEEL_FRICTION = 0.997;                    // base decay
  const BALL_FRICTION  = 0.992;                    // base decay while free spinning
  const CATCH_SPEED_THRESHOLD = 0.55;              // when |ballΩ| < this AND min revs -> start settle
  const END_FRICTION_BOOST_1 = 1.0;                // rad/s thresholds for extra damping
  const END_FRICTION_BOOST_2 = 0.5;
  const WHEEL_END_FACTOR_1 = 0.995;                // mild extra damping when slow
  const WHEEL_END_FACTOR_2 = 0.990;                // stronger when very slow
  const BALL_END_FACTOR    = 0.985;                // ball extra damping near end
  const SETTLE_LERP        = 4.5;                  // how quickly ballΩ approaches pocketΩ during settle (s^-1)

  useEffect(()=>{
    runDevTests();
    const count = WHEEL_ORDER.length; const step = (2*Math.PI)/count;
    console.assert(count === 11, 'Wheel should have 11 pockets (0..10)');
    console.assert(NUMBERS.length === 11 && NUMBERS[0]===0 && NUMBERS[10]===10, 'NUMBERS should be 0..10');
    console.assert(Math.abs(step*count - 2*Math.PI) < 1e-9, 'Angle step should tile 2π');
    const uniq = new Set(WHEEL_ORDER); console.assert(uniq.size === count, 'WHEEL_ORDER unique');
  },[]);

  // Fit canvas
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current; if (!c) return;
      const parent = c.parentElement as HTMLElement;
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
      const maxSize = mobile ? 640 : 1000;
      const size = Math.min(parent.clientWidth - 2, maxSize);
      c.width = 820; c.height = 820; c.style.width = `${size}px`; c.style.height = `${size}px`;
      const W = c.width, H = c.height; const OUTER = Math.min(W, H) * 0.46;
      dimsRef.current = { W, H, CX: W / 2, CY: H / 2, OUTER, POCKET: OUTER * 0.82, INNER: OUTER * 0.55, HUB: OUTER * 0.22, BALL_R: OUTER * 0.034 };
      ballRadRef.current = OUTER * 0.92;
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement);
    return () => ro.disconnect();
  }, []);

  const pocketAngleForIndex = (idx:number, stepAng:number)=> (wheelAngleRef.current + (idx+0.5)*stepAng);

  // Draw wheel — thicker outer rim, pockets extended under it; numbers outward; ring/hub flush
  const drawWheel = (ctx:CanvasRenderingContext2D)=>{
    const {CX,CY,OUTER,INNER,BALL_R,W,H} = dimsRef.current;
    ctx.clearRect(0,0,W,H); ctx.save(); ctx.translate(CX,CY);

    const numCount = WHEEL_ORDER.length;
    const angleStep = (Math.PI*2)/numCount;

    // set thicker border and pocket extent to avoid white gap
    const OUTER_BORDER_R = OUTER + 14;   // radius at which we stroke the outer border
    const OUTER_BORDER_W = 14;           // thicker ring
    const pocketOuterR   = OUTER_BORDER_R - (OUTER_BORDER_W/2 - 2); // extend wedges up under the border

    // Pockets (CW)
    ctx.save(); ctx.rotate(wheelAngleRef.current);
    for(let i=0;i<numCount;i++){
      const num=WHEEL_ORDER[i];
      const isRed = (num!==0) && (i%2===0);
      const fill = (num===0) ? POCKET_ZERO : (isRed ? POCKET_RED : POCKET_BLACK);
      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0, pocketOuterR, i*angleStep, (i+1)*angleStep); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      // subtle divider
      ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0,0, pocketOuterR, i*angleStep, (i+1)*angleStep); ctx.stroke();
    }
    ctx.restore();

    // Ring (shadow + fill)
    const ringOuter = INNER*0.96, ringInner = INNER*0.62;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 24; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 6;
    ctx.fillStyle = RING_DEEP;
    ctx.beginPath(); ctx.arc(0,0, ringOuter, 0, Math.PI*2); ctx.arc(0,0, ringInner, 0, Math.PI*2, true); ctx.fill('evenodd');
    ctx.restore();

    // Numbers on the ring — matched to pockets, outward facing
    ctx.save(); ctx.rotate(wheelAngleRef.current); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font=`800 ${OUTER*(isMobile?0.10:0.082)}px system-ui`;
    for(let i=0;i<numCount;i++){
      const num=WHEEL_ORDER[i]; const a=(i+0.5)*angleStep; const r=INNER*0.78;
      const isRed = (num!==0) && (i%2===0);
      ctx.save(); ctx.rotate(a); ctx.translate(r, 0); ctx.rotate(Math.PI/2);
      ctx.fillStyle = (num===0) ? '#a5f3fc' : (isRed ? '#fecaca' : '#e2e8f0');
      ctx.fillText(String(num), 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // Hub disc — flush with ringInner (no gap) + aqua fill
    const hubR = ringInner;
    ctx.save();
    ctx.strokeStyle = LIGHT_AQUA; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0,0, hubR, 0, Math.PI*2); ctx.stroke();
    ctx.shadowColor = 'rgba(0,0,0,0.16)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
    ctx.fillStyle = LIGHT_AQUA; ctx.beginPath(); ctx.arc(0,0, hubR-0.5, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Outer border on top (under ball)
    ctx.save(); ctx.strokeStyle = LIGHT_AQUA; ctx.lineWidth = OUTER_BORDER_W; ctx.beginPath(); ctx.arc(0,0, OUTER_BORDER_R, 0, Math.PI*2); ctx.stroke(); ctx.restore();

    // Ball on top
    const bx=Math.cos(ballAngleRef.current)*ballRadRef.current, by=Math.sin(ballAngleRef.current)*ballRadRef.current;
    ctx.save(); ctx.globalAlpha=0.25; ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(bx, by + BALL_R*0.45, BALL_R*1.1, BALL_R*0.5, 0,0,Math.PI*2); ctx.fill(); ctx.restore();
    const g = ctx.createRadialGradient(bx - BALL_R*0.4, by - BALL_R*0.4, BALL_R*0.2, bx, by, BALL_R);
    g.addColorStop(0,'#ffffff'); g.addColorStop(0.4,'#f3f3f3'); g.addColorStop(1,'#dedede');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(bx,by,BALL_R,0,Math.PI*2); ctx.fill();

    ctx.restore();
  };

  // Animation loop with proper states
  useEffect(()=>{
    const c=canvasRef.current; if(!c) return; const ctx=c.getContext('2d'); if(!ctx) return;
    ballRadRef.current = dimsRef.current.OUTER*0.92;

    const step=(now:number)=>{
      const dt=Math.min(0.032,(now-lastRef.current)/1000); lastRef.current=now;
      const stepAng=(Math.PI*2)/WHEEL_ORDER.length;

      // wheel always coasts
      wheelAngleRef.current += wheelOmegaRef.current * dt; wheelOmegaRef.current *= WHEEL_FRICTION;

      // extra end-of-spin damping for a quicker final slow-down
      const absW = Math.abs(wheelOmegaRef.current);
      if(absW < END_FRICTION_BOOST_2){ wheelOmegaRef.current *= WHEEL_END_FACTOR_2; }
      else if(absW < END_FRICTION_BOOST_1){ wheelOmegaRef.current *= WHEEL_END_FACTOR_1; }

      if(phaseRef.current === 'spinning'){
        // free ball
        ballAngleRef.current += ballOmegaRef.current * dt; ballOmegaRef.current *= BALL_FRICTION;

        // count revolutions (absolute)
        const d = Math.abs(normalizeAngle(ballAngleRef.current - prevBallAngleRef.current));
        ballRevsRef.current += d / (Math.PI*2);
        prevBallAngleRef.current = ballAngleRef.current;

        // radius stays near rim until we're slower
        const OUTER=dimsRef.current.OUTER; const pocketTrackR = OUTER*0.84;
        if(Math.abs(ballOmegaRef.current) < 6.0){ ballRadRef.current += (pocketTrackR - ballRadRef.current) * Math.min(1, dt*3.2); }
        else { ballRadRef.current = OUTER*0.92; }

        // start settle after min revs and speed small enough
        if(spinning && ballRevsRef.current >= MIN_REVS_BEFORE_CAPTURE && Math.abs(ballOmegaRef.current) < CATCH_SPEED_THRESHOLD){
          phaseRef.current = 'settle';
          settleJumpsRef.current = 25;
        }
      }
      else if(phaseRef.current === 'settle'){
        const idx = targetPocketIdxRef.current ?? 0;
        const targetAng = pocketAngleForIndex(idx, stepAng); // pocket angle moves with wheel
        const pocketOmega = wheelOmegaRef.current;           // pocket angular velocity

        if(settleJumpsRef.current > 0){
          ballAngleRef.current += (Math.random()-0.5) * 0.5;
          settleJumpsRef.current--;
        }

        // Gently pull ballΩ toward pocketΩ without reversing direction abruptly
        const next = settleNext(ballOmegaRef.current, pocketOmega, dt, SETTLE_LERP);
        // clamp sign to the original spin direction (avoid visible reversal)
        const sign0 = ballSignRef.current || -1;
        const nextSign = Math.sign(next) || (next===0 ? sign0 : 0);
        ballOmegaRef.current = (nextSign !== sign0 && Math.abs(next) >= 0.3) ? (sign0 * Math.abs(next)) : next;

        // Advance by its own angular velocity (keeps perceived direction consistent)
        ballAngleRef.current += ballOmegaRef.current * dt;

        // Pull the ball angle toward the target pocket
        const angErr = normalizeAngle(targetAng - ballAngleRef.current);
        ballAngleRef.current += angErr * Math.min(1, dt*6);

        // Ease radius onto the pocket track
        const OUTER=dimsRef.current.OUTER; const pocketTrackR = OUTER*0.84;
        ballRadRef.current += (pocketTrackR - ballRadRef.current) * Math.min(1, dt*3.0);

        const angDiff = Math.abs(normalizeAngle(targetAng - ballAngleRef.current));
        if(angDiff < 0.015 && Math.abs(ballOmegaRef.current) < 0.03){
          phaseRef.current = 'locked';
        }
      }
      else if(phaseRef.current === 'locked'){
        // KEEP BALL ALIGNED TO THE POCKET while wheel spins down
        const idx = targetPocketIdxRef.current ?? 0;
        ballAngleRef.current = pocketAngleForIndex(idx, stepAng);
        const OUTER=dimsRef.current.OUTER; const pocketTrackR = OUTER*0.84; ballRadRef.current = pocketTrackR;

        // end spin when wheel nearly stopped
        if(Math.abs(wheelOmegaRef.current) < 0.02){
          const winning = WHEEL_ORDER[targetPocketIdxRef.current ?? 0];
          const winAmt = calcWinnings(winning, bets, sideBets);
          phaseRef.current = 'payout';
          // allow just a breath to see it resting
          setTimeout(()=>{
            if(winAmt) setWallet(w=>w+winAmt);
            setBets({}); setSideBets(createEmptySideBets()); setSpinning(false); phaseRef.current='idle';
          }, 1000);
        }
      }
      else if(phaseRef.current === 'payout'){
        const idx = targetPocketIdxRef.current ?? 0;
        ballAngleRef.current = pocketAngleForIndex(idx, stepAng);
        const OUTER=dimsRef.current.OUTER; const pocketTrackR = OUTER*0.84; ballRadRef.current = pocketTrackR;
      }

      drawWheel(ctx); rafRef.current=requestAnimationFrame(step);
    };

    rafRef.current=requestAnimationFrame(step); return ()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current); };
  },[spinning,isMobile]);

  const pulse=(id:string)=>{ const el=document.getElementById(id); if(!el) return; el.animate([{transform:'scale(1)'},{transform:'scale(1.05)'},{transform:'scale(1)'}], {duration:140,easing:'ease-out'}); };
  const applyBet=(n:number, amt:number)=>{
    if(spinning || wallet < amt) return;
    setWallet(w=>w-amt);
    setBets(prev=>({...prev,[n]:(prev[n]||0)+amt}));
  };
  const applySide=(k:SideKey, amt:number)=>{
    if(spinning || wallet < amt) return;
    setWallet(w=>w-amt);
    setSideBets(prev=>({...prev,[k]: (prev[k]||0) + amt}));
  };

  // Spin
  const spin = ()=>{
    if(spinning) return; const total=Object.values(bets).reduce((a,b)=>a+b,0) + Object.values(sideBets).reduce((a,b)=>a+b,0);
    if(total<=0){ pulse('sidegrid'); return; }
    targetPocketIdxRef.current = Math.floor(Math.random()*WHEEL_ORDER.length);

    // Reset phases + counters
    phaseRef.current = 'spinning';
    ballRevsRef.current = 0; prevBallAngleRef.current = ballAngleRef.current;

    // Start with good energy so we easily exceed 2+ revs before capture
    wheelOmegaRef.current = 4.4 + Math.random()*1.4;   // CW (wheel)
    ballOmegaRef.current  = -(18 + Math.random()*6);   // CCW (ball)
    ballSignRef.current   = Math.sign(ballOmegaRef.current) || -1;

    ballRadRef.current = dimsRef.current.OUTER*0.92; setSpinning(true);
  };

  useImperativeHandle(ref, () => ({ spin }));

  // Drag & drop helpers
  const onChipDragStart = (e:React.DragEvent<HTMLDivElement>, amt:number)=>{
    e.dataTransfer.setData('text/plain', String(amt)); setDraggingAmount(amt);
    const st = chipStyle(amt); const ghost=document.createElement('canvas'); ghost.width=60; ghost.height=60; const g=ghost.getContext('2d');
    if(g){ g.fillStyle=st.face; g.beginPath(); g.arc(30,30,24,0,Math.PI*2); g.fill(); g.strokeStyle='#777'; g.lineWidth=2; g.stroke(); g.fillStyle=st.text; g.font='900 16px system-ui'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(String(amt),30,30); }
    e.dataTransfer.setDragImage(ghost, 30, 30);
  };
  const onChipDragEnd = ()=> setDraggingAmount(null);

  const onCellDragOver = (e:React.DragEvent<HTMLDivElement>, idx:number)=>{ if(spinning) return; e.preventDefault(); setHoverIndex(idx); };
  const onCellDragLeave = ()=> setHoverIndex(null);
  const onCellDrop = (e:React.DragEvent<HTMLDivElement>, n:number)=>{ if(spinning) return; e.preventDefault(); const data=e.dataTransfer.getData('text/plain'); const amt=parseInt(data||'0',10); if(!amt) return; setHoverIndex(null); setDraggingAmount(null); applyBet(n, amt); };

  const onSideDragOver = (e:React.DragEvent<HTMLDivElement>, k:SideKey)=>{ if(spinning) return; e.preventDefault(); setHoverSide(k); };
  const onSideDragLeave = ()=> setHoverSide(null);
  const onSideDrop = (e:React.DragEvent<HTMLDivElement>, k:SideKey)=>{ if(spinning) return; e.preventDefault(); const data=e.dataTransfer.getData('text/plain'); const amt=parseInt(data||'0',10); if(!amt) return; setHoverSide(null); setDraggingAmount(null); applySide(k, amt); };

  const onCellClick=(n:number)=> applyBet(n, activeChipAmount);
  const onCellContext=(e:React.MouseEvent<HTMLDivElement>, n:number)=>{ if(spinning){ e.preventDefault(); return; } e.preventDefault(); setBets(prev=>{ const cur=prev[n]||0; const next=Math.max(0, cur - activeChipAmount); const diff=cur-next; if(diff>0) setWallet(w=>w+diff); const nx={...prev} as Bets; if(next===0) delete (nx as any)[n]; else nx[n]=next; return nx; }); };

  const onSideClick=(k:SideKey)=> applySide(k, activeChipAmount);
  const onSideContext=(e:React.MouseEvent<HTMLDivElement>, k:SideKey)=>{ if(spinning){ e.preventDefault(); return; } e.preventDefault(); setSideBets(prev=>{ const cur=prev[k]||0; const next=Math.max(0, cur - activeChipAmount); const diff=cur-next; if(diff>0) setWallet(w=>w+diff); return { ...prev, [k]: next }; }); };

  const handleClearBets = ()=>{
    if(spinning) return;
    const refund = Object.values(bets).reduce((a, b) => a + b, 0) + Object.values(sideBets).reduce((a, b) => a + b, 0);
    if(refund) setWallet((w) => w + refund);
    setBets({});
    setSideBets(createEmptySideBets());
  };

  const renderSideTile = (k: SideKey, className?: string, showShort?: boolean)=>{
    const cfg = SIDE_CONFIG[k];
    const amt = sideBets[k] || 0;
    const label = showShort ? cfg.short : cfg.label;
    return (
      <div
        key={k}
        onClick={()=> onSideClick(k)} onContextMenu={(e)=> onSideContext(e,k)}
        onDragOver={(e)=> onSideDragOver(e,k)} onDragLeave={onSideDragLeave} onDrop={(e)=> onSideDrop(e,k)}
        className={`relative select-none cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-[inset_0_0_0_1px_rgba(16,18,34,0.04)] transition-transform duration-200 ${amt>0?'-translate-x-1':''} ${className||''}`}
        style={{ backgroundColor: cfg.bg, color: cfg.text || '#fff' }}
        title={`Bet on ${cfg.label}${cfg.subLabel ? ` (${cfg.subLabel})` : ''}`}
      >
        <div className="flex flex-col gap-0.5 leading-tight">
          <span className="text-[0.7rem] md:text-[0.75rem]">{label}</span>
          {cfg.subLabel && !showShort && (
            <span className="text-[0.6rem] font-medium opacity-80 md:text-[0.65rem]">{cfg.subLabel}</span>
          )}
          {cfg.subLabel && showShort && (
            <span className="text-[0.58rem] font-medium opacity-80 md:hidden">{cfg.subLabel}</span>
          )}
        </div>
        {amt>0 && (
          <span className="absolute top-1.5 right-2 text-[0.6rem] font-bold">${amt}</span>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1700px] px-4 pb-10 pt-4 text-white md:px-8 md:pb-14">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:items-stretch lg:gap-10 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        {/* WHEEL */}
        <div className="gmbl-card h-full rounded-3xl p-4 md:p-6">
          <div className="mx-auto max-w-[1080px]">
            <canvas ref={canvasRef} className="h-auto w-full rounded-2xl border-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_26px_rgba(16,18,34,0.18)]" />
          </div>
        </div>

        {/* BETTING TABLE */}
        <div className="flex flex-col gap-4 md:h-full md:gap-5">
          <div className="gmbl-card rounded-3xl p-3 md:flex-none md:p-5">
            <div className="relative overflow-hidden rounded-2xl p-4 md:p-5">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_-10%,rgba(162,120,255,0.16),transparent_60%)]" />
              <div className="relative flex flex-col gap-4 md:gap-5">
                <div className={`${isMobile ? 'flex items-center justify-between gap-3' : 'flex items-start gap-6'}`}>
                  <div className={`${isMobile ? 'flex flex-1 items-center gap-3 overflow-x-auto pr-2 [-webkit-overflow-scrolling:touch]' : 'flex flex-1 flex-wrap items-center gap-5'}`}>
                    {CHIP_AMOUNTS.map((amt)=>{
                      const isSelected = activeChipAmount===amt; const isDragging = draggingAmount===amt;
                      return (
                        <div
                          key={amt}
                          draggable
                          onDragStart={(e)=>onChipDragStart(e as unknown as React.DragEvent<HTMLDivElement>, amt)}
                          onDragEnd={onChipDragEnd}
                          onClick={()=> setActiveChipAmount(amt)}
                          className="cursor-grab active:cursor-grabbing"
                          title={`${amt} chip (click to select, drag to bet)`}
                        >
                          <Chip amount={amt} selected={isSelected} dragging={isDragging} draggingAny={draggingAny} />
                        </div>
                      );
                    })}
                  </div>
                  {!isMobile && (
                    <div className="grid grid-cols-2 gap-3 flex-none basis-[240px]">
                      {(['black','red'] as SideKey[]).map((k)=>
                        renderSideTile(k, 'grid place-content-center text-center text-[0.85rem] md:text-base aspect-[2.3/1] min-w-[110px]')
                      )}
                    </div>
                  )}
                  {isMobile && (
                    <button
                      onClick={handleClearBets}
                      disabled={spinning}
                      className="flex-shrink-0 rounded-lg border border-[#d7daf0] bg-white/90 px-3 py-2 text-[0.68rem] font-extrabold uppercase tracking-wide text-[#0f1222] disabled:opacity-50"
                    >
                      Clear Bets
                    </button>
                  )}
                </div>

                {!isMobile && (
                  <div id="sidegrid" className="grid gap-3 md:grid-cols-4">
                    {(['odd','even','low','high'] as SideKey[]).map((k)=>
                      renderSideTile(k, 'grid place-content-center text-center text-[0.85rem] md:text-base aspect-[2.3/1]')
                    )}
                  </div>
                )}

                <div id="betgrid" className="mx-auto w-full overflow-hidden rounded-xl border-2 border-[#e0e3ef] shadow-[inset_0_0_0_1px_rgba(16,18,34,0.04)]">
                  {isMobile ? (
                    <div className="grid grid-cols-6">
                      {MOBILE_NUM_ORDER.map((n, idx) => {
                        if (n === null) {
                          return <div key={idx} className="relative aspect-[1.35/1] border-b border-r border-black/10" />;
                        }
                        const amt = bets[n] || 0;
                        const isZero = n === 0;
                        const bgColor = isZero ? POCKET_ZERO : (n % 2 === 0 ? POCKET_RED : POCKET_BLACK);
                        const numberIndex = NUMBERS.indexOf(n);
                        return (
                          <div
                            key={n}
                            onClick={() => onCellClick(n)}
                            onContextMenu={(e) => onCellContext(e, n)}
                            onDragOver={(e) => onCellDragOver(e, numberIndex)}
                            onDragLeave={onCellDragLeave}
                            onDrop={(e) => onCellDrop(e, n)}
                            className={`relative aspect-[1.35/1] select-none cursor-pointer grid place-items-center font-extrabold tracking-wide text-white border-b border-r border-black/10`}
                            style={{ backgroundColor: bgColor }}
                          >
                            <span className={`drop-shadow transition-transform duration-200 ${amt > 0 ? '-translate-x-2' : ''}`}>{n}</span>
                            {amt > 0 && (
                              <span className="absolute top-1.5 right-1.5 text-[10px] font-bold text-white">${amt}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-5 auto-rows-[minmax(0,1fr)]">
                      {(() => {
                        const n = DESKTOP_ZERO_TILE;
                        const amt = bets[n] || 0;
                        const numberIndex = NUMBERS.indexOf(n);
                        return (
                          <div
                            key={n}
                            onClick={() => onCellClick(n)}
                            onContextMenu={(e) => onCellContext(e, n)}
                            onDragOver={(e) => onCellDragOver(e, numberIndex)}
                            onDragLeave={onCellDragLeave}
                            onDrop={(e) => onCellDrop(e, n)}
                            className="relative col-span-5 flex min-h-[74px] select-none cursor-pointer items-center justify-center border-b border-black/10 text-3xl font-extrabold tracking-wide text-[#0f1222]"
                            style={{ backgroundColor: POCKET_ZERO }}
                          >
                            <span className={`drop-shadow transition-transform duration-200 ${amt > 0 ? '-translate-x-2' : ''}`}>
                              {n}
                            </span>
                            {amt > 0 && (
                              <span className="absolute top-2 right-5 text-xs font-bold text-[#0f1222]">${amt}</span>
                            )}
                          </div>
                        );
                      })()}
                      {DESKTOP_NUMBER_ROWS.map((row, rowIdx) =>
                        row.map((n, colIdx) => {
                          const amt = bets[n] || 0;
                          const bgColor = n % 2 === 0 ? POCKET_RED : POCKET_BLACK;
                          const numberIndex = NUMBERS.indexOf(n);
                          const isRowEnd = colIdx === row.length - 1;
                          return (
                            <div
                              key={n}
                              onClick={() => onCellClick(n)}
                              onContextMenu={(e) => onCellContext(e, n)}
                              onDragOver={(e) => onCellDragOver(e, numberIndex)}
                              onDragLeave={onCellDragLeave}
                              onDrop={(e) => onCellDrop(e, n)}
                              className={`relative grid min-h-[74px] select-none cursor-pointer place-items-center border-b border-r border-black/10 text-3xl font-extrabold tracking-wide text-white ${isRowEnd ? 'border-r-0' : ''}`}
                              style={{ backgroundColor: bgColor }}
                            >
                              <span className={`drop-shadow transition-transform duration-200 ${amt > 0 ? '-translate-x-2' : ''}`}>
                                {n}
                              </span>
                              {amt > 0 && (
                                <span className="absolute top-2 right-2 text-xs font-bold text-white">${amt}</span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {isMobile ? (
                  <div id="sidegrid" className="grid gap-3">
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        ['black','red'],
                        ['odd','even'],
                        ['low','high'],
                      ] as SideKey[][]).map((group, idx) => (
                        <div key={idx} className="grid gap-2">
                          {group.map((k)=>
                            renderSideTile(k, 'aspect-[2.3/1] flex items-center justify-center text-center', true)
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <button
                      onClick={handleClearBets}
                      disabled={spinning}
                      className="rounded-lg border border-[#d7daf0] bg-white/90 px-4 py-2 text-sm font-extrabold uppercase tracking-wide text-[#0f1222] disabled:opacity-50"
                    >
                      Clear Bets
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {controlsDesktop && (
            <div className="hidden md:flex md:flex-1">
              {controlsDesktop}
            </div>
          )}
        </div>
      </div>
      {controlsMobile && (
        <div className="mt-4 w-full md:hidden">
          {controlsMobile}
        </div>
      )}
    </div>
  );
});

RouletteGame.displayName = "RouletteGame";

export default RouletteGame;
