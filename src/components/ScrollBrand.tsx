import { useEffect, useRef } from 'react'
const W=87, H=92, DISTANCE=850
export function ScrollBrand() {
 const ref=useRef<HTMLCanvasElement>(null)
 useEffect(()=>{
  const canvas=ref.current, ctx=canvas?.getContext('2d')
  if(!canvas||!ctx)return
  const source=new Image()
  let active=true, frame=0
  let dots:{x:number;y:number;color:string}[]=[]
  let clock:[number,number][]=[], agenda:[number,number][]=[]
  let clockLayer:HTMLCanvasElement, agendaLayer:HTMLCanvasElement
  const ease=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t)}
  const shape=(draw:(c:CanvasRenderingContext2D)=>void)=>{
   const layer=document.createElement('canvas');layer.width=W;layer.height=H
   const c=layer.getContext('2d',{willReadFrequently:true})!
   c.strokeStyle='#e4e4e7';c.lineWidth=3.2;c.lineCap='round';c.lineJoin='round';draw(c)
   const data=c.getImageData(0,0,W,H).data, pts:[number,number][]=[]
   for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(data[(y*W+x)*4+3]>70)pts.push([x,y])
   return {layer,pts}
  }
  const paint=(p:number)=>{
   if(!active||!dots.length)return
   ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height)
   ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0)
   if(p<=0){ctx.drawImage(source,0,0,W,H);return}
   let from:[number,number][]|null,to:[number,number][],t:number,d:number,layer:HTMLCanvasElement
   if(p<.4){from=null;to=clock;t=ease(p/.4);d=ease((p-.3)/.1);layer=clockLayer}
   else if(p<.55){from=clock;to=clock;t=1;d=1;layer=clockLayer}
   else{from=clock;to=agenda;t=ease((p-.55)/.37);d=ease((p-.82)/.1);layer=agendaLayer}
   ctx.globalAlpha=1-d
   dots.forEach((dot,i)=>{const a=from?.[i]??[dot.x,dot.y],b=to[i];ctx.fillStyle=dot.color;ctx.fillRect(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,1.05,1.05)})
   if(d>0){ctx.globalAlpha=d;ctx.drawImage(layer,0,0)}
   ctx.globalAlpha=1
  }
  const update=()=>{frame=0;paint(window.scrollY/DISTANCE)}
  const onScroll=()=>{if(!frame)frame=requestAnimationFrame(update)}
  source.onload=()=>{
   if(!active)return
   const c=shape(s=>{s.beginPath();s.arc(43.5,46,27,0,Math.PI*2);s.stroke();s.beginPath()
    s.moveTo(43.5,14);s.lineTo(43.5,20);s.moveTo(43.5,72);s.lineTo(43.5,78)
    s.moveTo(11.5,46);s.lineTo(17.5,46);s.moveTo(69.5,46);s.lineTo(75.5,46)
    s.moveTo(43.5,46);s.lineTo(43.5,29);s.moveTo(43.5,46);s.lineTo(57,55);s.stroke()})
   const a=shape(s=>{s.beginPath();s.roundRect(20,17,47,59,5);s.stroke();s.beginPath()
    s.moveTo(20,32);s.lineTo(67,32);s.moveTo(32,12);s.lineTo(32,23);s.moveTo(55,12);s.lineTo(55,23);s.stroke()
    for(const y of [43,54,65]){s.beginPath();s.moveTo(29,y);s.lineTo(34,y);s.moveTo(40,y);s.lineTo(59,y);s.stroke()}})
   clockLayer=c.layer;agendaLayer=a.layer
   const sample=document.createElement('canvas');sample.width=W;sample.height=H
   const sc=sample.getContext('2d',{willReadFrequently:true})!;sc.drawImage(source,0,0,W,H)
   const px=sc.getImageData(0,0,W,H).data
   for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(px[i+3]>25)dots.push({x,y,color:'rgba('+px[i]+','+px[i+1]+','+px[i+2]+','+(px[i+3]/255).toFixed(3)+')'})}
   const fit=(pts:[number,number][])=>dots.map((_,i)=>pts[Math.floor(i*pts.length/dots.length)]??[43.5,46])
   clock=fit(c.pts);agenda=fit(a.pts)
   canvas.width=W*2;canvas.height=H*2;paint(window.scrollY/DISTANCE)
   addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll)
  }
  source.src='/brand/reser-scroll-mark.png'
  return()=>{active=false;source.onload=null;removeEventListener('scroll',onScroll);removeEventListener('resize',onScroll);if(frame)cancelAnimationFrame(frame)}
 },[])
 return <a className="scroll-brand" href="/" aria-label="RESER, sistema de reservas"><canvas ref={ref} className="scroll-brand__mark" aria-hidden="true"/><span className="scroll-brand__copy"><strong>RESER</strong><small>SISTEMA DE RESERVAS</small></span></a>
}