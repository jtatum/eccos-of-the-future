const canvas = document.querySelector('#world');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let paused = reduced.matches, room = 'garden', time = 0, last = 0, plants = 7, stones = 9, blueprint = 0;
const scenes = {
  garden: ['01', 'What if a garden kept its own time?', 'A few brass flowers turn together, but never quite agree. Change the light and watch their geometry unfold.', 'CLOCKWORK BOTANY', 'A brass mechanical garden turning under a circular observatory window'],
  tide: ['02', 'A shore that never has to arrive.', 'An artificial moon draws water across the table. Small stones find temporary constellations in the current.', 'A STUDY IN RETURNING', 'Luminous tide lines moving around a constellation of stones'],
  desk: ['03', 'Leave something unfinished.', 'An animal factory, a greenhouse, a machine for doing nothing. There is room here for the next unreasonably small idea.', 'PLANS WITHOUT A DEADLINE', 'A lamplit drafting table with a changing architectural blueprint']
};
function motionLabel(){ $('motion').textContent = paused ? 'Resume motion' : 'Pause motion'; $('motion').setAttribute('aria-pressed', String(paused)); }
motionLabel();
$('motion').onclick = () => { paused = !paused; motionLabel(); };
reduced.addEventListener('change', (event) => { paused = event.matches; motionLabel(); });
document.querySelectorAll('[data-room]').forEach(button => button.onclick = () => {
  room = button.dataset.room;
  document.querySelectorAll('[data-room]').forEach(b => b.setAttribute('aria-pressed',String(b===button)));
  Object.keys(scenes).forEach(key => $(`${key}-controls`).hidden = key!==room);
  const [n,title,description,plate,label] = scenes[room];
  $('number').textContent=`EXPERIMENT ${n}`; $('bench-title').textContent=title; $('description').textContent=description;
  $('plate').textContent=`SPECIMEN ${n} / ${plate}`; canvas.setAttribute('aria-label',label); status();
});
function status(){ $('status').textContent = room==='garden' ? `${plants} possibilities, still growing.` : room==='tide' ? `${stones} stones. Nothing needs to settle.` : 'No one is waiting for a finished version.'; }
for (const id of ['light','pull']) $(id).oninput = () => { $(`${id}-value`).textContent = `${$(id).value}%`; };
$('seed').onclick = () => { plants = plants >= 14 ? 3 : plants+1; status(); };
$('stone').onclick = () => { stones = Math.min(24, stones+1); $('stone').disabled=stones===24; status(); };
$('sketch').onclick = () => { blueprint=(blueprint+1)%3; $('status').textContent=['An animal factory. Leave room for the animals.','A greenhouse for improbable weather.','A machine with no assigned purpose.'][blueprint]; };
function line(x,y,a,b,color='#54676a',width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.stroke();}
function circle(x,y,r,color,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();}
function text(value,x,y,size=13,color='#a9b6ac'){ctx.fillStyle=color;ctx.font=`${size}px monospace`;ctx.fillText(value,x,y);}
function background(){ctx.fillStyle='#0b151b';ctx.fillRect(0,0,1200,680);const glow=ctx.createRadialGradient(600,290,10,600,290,500);glow.addColorStop(0,'#263f43');glow.addColorStop(1,'#0b151b');ctx.fillStyle=glow;ctx.fillRect(0,0,1200,680);for(let x=40;x<1200;x+=40)line(x,0,x,680,'#24373c44');for(let y=0;y<680;y+=40)line(0,y,1200,y,'#24373c44');}
function garden(){const light=Number($('light').value)/100;circle(600,305,255,'#53635c');circle(600,305,242,'#53635c');for(let i=0;i<60;i++){const a=i*Math.PI/30;line(600+246*Math.cos(a),305+246*Math.sin(a),600+252*Math.cos(a),305+252*Math.sin(a),'#81907a');}line(600,48,600,557,'#405951');line(345,305,855,305,'#405951');for(let i=0;i<plants;i++){const x=180+i*(840/Math.max(plants-1,1)),y=300+Math.sin(i*2.1)*105,r=26+light*24+(i%3)*9;line(x,565,x,y,'#82917c',3);line(x,470,x-24,447,'#82917c',2);ctx.save();ctx.translate(x,y);ctx.rotate(time*(i%2?-.13:.1)+i);for(let j=0;j<9;j++){ctx.rotate(Math.PI*2/9);ctx.strokeStyle=i%2?'#c6ac72':'#8bb9b3';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(r*.6,0,r*.75,8+light*8,0,0,Math.PI*2);ctx.stroke();}circle(0,0,10,'#e5c37e',2);ctx.restore();circle(x,565,7,'#d8b67d');}line(110,581,1090,581,'#a29370',2);text('LIGHT / '+Math.round(light*100),90,90);text('TIME IS NOT A REQUIREMENT',830,600);}
function tide(){const strength=Number($('pull').value)/100;circle(960,130,42,'#d0c5a1',2);circle(960,130,55,'#6b817e');for(let j=0;j<22;j++){ctx.beginPath();for(let x=60;x<=1140;x+=8){const y=175+j*17+Math.sin(x*.009+time*.35+j*.23)*(14+strength*25);x===60?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.strokeStyle=j%4===0?'#b7ccb5':'#4d777b';ctx.lineWidth=j%4===0?1.5:1;ctx.stroke();}for(let i=0;i<stones;i++){const a=i*2.399+time*.009*strength,r=50+Math.sqrt(i)*64;const x=590+Math.cos(a)*r,y=370+Math.sin(a)*r*.52+Math.sin(time*.3+i)*strength*12;ctx.fillStyle='#17252b';ctx.strokeStyle='#cfb789';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y,14+i%4*3,10+i%3*3,i,0,Math.PI*2);ctx.fill();ctx.stroke();text(String(i+1).padStart(2,'0'),x+25,y+4,11);}text('LUNAR TABLE / NO DESTINATION',80,95);}
function desk(){ctx.save();ctx.translate(595,345);ctx.rotate(-.035);ctx.fillStyle='#173945';ctx.fillRect(-390,-230,780,460);ctx.strokeStyle='#718c8a';ctx.strokeRect(-380,-220,760,440);for(let x=-350;x<370;x+=25)line(x,-210,x,210,'#86a8a21a');for(let y=-210;y<220;y+=25)line(-370,y,370,y,'#86a8a21a');text(['ANIMAL FACTORY / STUDY 01','A HOUSE FOR WEATHER / STUDY 02','UNASSIGNED APPARATUS / STUDY 03'][blueprint],-340,-180,15,'#d1d5ba');if(blueprint===2){for(let i=0;i<5;i++){circle(-220+i*110,0,45+i%2*15,'#c4cbb3',2);line(-220+i*110,-70,-220+i*110,110,'#789e9d');}line(-300,120,300,120,'#c4cbb3');}else{for(let i=0;i<4;i++){const x=-280+i*145;ctx.strokeStyle='#c4cbb3';ctx.lineWidth=2;ctx.strokeRect(x,-65,120,165);line(x,-65,x+60,-125,'#c4cbb3',2);line(x+60,-125,x+120,-65,'#c4cbb3',2);ctx.strokeRect(x+40,35,40,65);if(blueprint===1)for(let j=1;j<4;j++)line(x+j*30,-65,x+j*30,100,'#759ea1');}line(-310,125,310,125,'#c4cbb3');}text('dimensions deliberately undecided',-325,170);ctx.restore();const glow=ctx.createRadialGradient(990,110,5,990,110,240);glow.addColorStop(0,'#efc77544');glow.addColorStop(1,'#efc77500');ctx.fillStyle=glow;ctx.fillRect(700,0,500,440);line(1040,500,1040,160,'#c5ae79',8);line(1040,160,970,100,'#c5ae79',8);ctx.fillStyle='#d8b673';ctx.beginPath();ctx.moveTo(920,145);ctx.lineTo(960,90);ctx.lineTo(1010,145);ctx.closePath();ctx.fill();text('COME BACK WHENEVER.',100,615,15,'#dbc292');}
function frame(now){if(!paused&&!document.hidden) time+=Math.min((now-last)/1000,.05);last=now;background();({garden,tide,desk})[room]();requestAnimationFrame(frame);}
requestAnimationFrame(frame);
