// FP FIXED HEIGHT
let fpFixedHeightValue = window.innerHeight;
document.documentElement.style.setProperty("--fp-fixed-height", `${fpFixedHeightValue}px`);
window.addEventListener("resize", () => {
  const newHeight = window.innerHeight;
  if (newHeight > fpFixedHeightValue) {
    fpFixedHeightValue = newHeight;
    document.documentElement.style.setProperty("--fp-fixed-height", `${fpFixedHeightValue}px`);
  }
}, { passive: true });


// MÁSCARA GSAP HERO

let mm = gsap.matchMedia();

mm.add({
  isDesktop: "(min-width: 800px)",
  isMobile: "(max-width: 799px)",
}, (context) => {
  let { isDesktop, isMobile } = context.conditions;

  let tlmaskx = gsap.timeline({
    scrollTrigger: {
      trigger: ".parenteffectmask",
      start: "top top",
      end: "+=" + 2 * window.innerHeight + "px",
      scrub: 1,
      pin: true,
    }
  });

  tlmaskx.to(".fphero", {
    duration: 0.5,
    css: {
      "mask-size": isDesktop ? "200px" : "100px",
      "-webkit-mask-size": isDesktop ? "200px" : "100px",
    }
  });

tlmaskx.to(".fphero", {
  duration: 0.5,
  autoAlpha: 0,
});

  tlmaskx.to(".imgmask", {
    duration: 0.5,
    opacity: 1,
  }, 0.5);

  tlmaskx.to(".fphero", {
  duration: 0.1,
  display: "none",
});

  return () => {
    tlmaskx.kill();
  };
});

// FRASES

gsap.registerPlugin(ScrollTrigger);
document.querySelectorAll('.showfadeparent').forEach((section) => {
  const show1 = section.querySelector('.show1');
  const show2 = section.querySelector('.show2');
  const textgradientfade2 = section.querySelectorAll('.textgradientfade2');

  gsap.set(textgradientfade2, {
    "--grad-pos": "140vh",
    "--stop1": "0vh",
    "--stop2": "50vh",
    "--stop3": "90vh",
    "--stop4": "100vh"
  });

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: "top top",
      end: "+=" + 3 * window.innerHeight,
      scrub: 3,
      pin: true
    }
  });

  tl.to(show1, {
    "--mask-pos-r1": "-150vh",
    "--mask-inner-r1": "0vh",
    "--mask-outer-r1": "150vh",
    scale: 0.8,
    ease: "none"
  }, 0);

  tl.set(show2, { visibility: "visible" }, 0);
  tl.set(show1, { visibility: "hidden" }, 0.9);

  tl.to(textgradientfade2, {
    "--grad-pos": "-30vh",
    "--stop1": "0vh",
    "--stop2": "50vh",
    "--stop3": "90vh",
    "--stop4": "150vh",
    ease: "none"
  }, 0.4);

  tl.to(show2, {
    "--mask-pos-r2": "0vh",
    "--mask-inner-r2": "150vh",
    "--mask-outer-r2": "300vh",
    scale: 0.8,
    ease: "none"
  }, 0.4);
});

gsap.utils.toArray('.revelarelemento').forEach(el => {
  gsap.to(el, {
    "--mask-pos-r2": "0vh",
    "--mask-inner-r2": "50vh",
    "--mask-outer-r2": "150vh",
    scrollTrigger: {
      trigger: el,
      start: "top 40%",
      end: "bottom 80%",
      scrub: 2,
      ease: "power3.out",
    }
  });
});

gsap.utils.toArray(".textgradientfade1").forEach((el) => {
  gsap.set(el, {
    "--grad-pos": "140vh",
    "--stop1": "0vh",
    "--stop2": "50vh",
    "--stop3": "90vh",
    "--stop4": "100vh"
  });

  gsap.to(el, {
    "--grad-pos": "-30vh",
    "--stop1": "0vh",
    "--stop2": "50vh",
    "--stop3": "90vh",
    "--stop4": "150vh",
    ease: "none",
    scrollTrigger: {
      trigger: el,
      start: "top 90%",
      end: "+=1500",
      scrub: true,
    }
  });
});

// TEXTO REVEAL
 (function() {const originalWarn = console.warn;
console.warn = function(...args) {
if (args.join(' ').includes("SplitText called before fonts loaded")) return;
originalWarn.apply(console, args);};})(); 
gsap.registerPlugin(ScrollTrigger, SplitText);
 document.querySelectorAll(".fpbackgroundtext").forEach(sectionfptx => {
 const textofptx = sectionfptx.querySelector(".fptextopacity");
 const barrafptx = sectionfptx.querySelector(".progress-bar");
 if (!textofptx || !barrafptx) return;
 const splitfptx = new SplitText(textofptx, { type: "words", tag: "span" });
 const wordsfptx = splitfptx.words;
 wordsfptx.forEach(wordfptx => {
 wordfptx.style.opacity = 0.1;
 wordfptx.style.display = "inline-block";
 wordfptx.style.willChange = "opacity";
 });
 textofptx.style.opacity = 1;
 gsap.to(barrafptx, {
 width: "100%",
 ease: "none",
 scrollTrigger: {
 trigger: sectionfptx,
 start: "top top",
 end: "+=" + 2 * window.innerHeight + "px",
 scrub: 1,
 pin: true,
 onUpdate: (self) => {  
 if (self.progress > 0.01) barrafptx.classList.add("activebarfp");
 else barrafptx.classList.remove("activebarfp");
 }}});
 gsap.to(wordsfptx, {
 opacity: 1,
 ease: "none",
 stagger: {
 each: 1,
 from: "start"
 },
 scrollTrigger: {
 trigger: sectionfptx,
 start: "top top",
 end: "+=" + 2 * window.innerHeight + "px",
 scrub: true,
 }});});


// TEXTO DESFOQUE
document.addEventListener("DOMContentLoaded", function() {
  gsap.registerPlugin(ScrollTrigger, SplitText);

  function animarTexto(selector) {
    document.fonts.ready.then(() => {  
      document.querySelectorAll(selector).forEach(function(element) {
        let split = new SplitText(element, { type: "words, chars" });
        let chars = split.chars;
        let middle = Math.floor(chars.length / 2);

        let tl = gsap.timeline({
          scrollTrigger: {
            trigger: element,
            start: "top 90%",
            end: "bottom 60%",
            scrub: 2
          },
          defaults: { ease: "power3.out" }
        });

        chars.forEach((char, i) => {
          let offset = Math.abs(i - middle) * 0.1;

          tl.fromTo(char,
            { opacity: 0, filter: "blur(12px)", y: -20 },
            { opacity: 1, filter: "blur(0px)", y: 0, duration: 1.2 },
            offset
          );
        });
      });
    });
  }

  animarTexto(".textodesfoque");
});

// BOTÃO
document.addEventListener("DOMContentLoaded", () => {
 const brilho1Elements = document.querySelectorAll(".brilho1");
 const brilho2Buttons = document.querySelectorAll(".brilho2");
 brilho2Buttons.forEach((brilho2Button, index) => {
 const brilho1 = brilho1Elements[index];
 let timeoutId;
 if (brilho1 && brilho2Button) {
 brilho2Button.addEventListener("mousemove", (event) => {
 clearTimeout(timeoutId);
 brilho2Button.classList.add("hovering");
 const brilho1Rect = brilho1.getBoundingClientRect();
 const mouseX = event.clientX - brilho1Rect.left;
 const mousePercentage = Math.min(Math.max(mouseX / brilho1Rect.width, 0), 1);
 brilho1.style.setProperty("--before-opacity", mousePercentage.toFixed(2));
 brilho1.style.setProperty("--after-opacity", (1 - mousePercentage).toFixed(2));
 const buttonRect = brilho2Button.getBoundingClientRect();
 const relativeMouseX = event.clientX - buttonRect.left;
 const translateX = ((relativeMouseX / buttonRect.width) * 100) - 100;
 brilho2Button.style.setProperty("--button-translate-x", `${translateX}%`);
 });
 brilho2Button.addEventListener("mouseleave", () => {
 brilho2Button.classList.remove("hovering");
 timeoutId = setTimeout(() => {
 brilho1.style.setProperty("--before-opacity", "1");
 brilho1.style.setProperty("--after-opacity", "0");
 brilho2Button.style.setProperty("--button-translate-x", "-10%");
 }, 1200);});}});});


// MOUSE HERO
document.addEventListener("DOMContentLoaded", function () {
    if (window.innerWidth < 768) return;

    const containers = document.querySelectorAll(".fphero");

    document.addEventListener("mousemove", function (e) {
        containers.forEach(container => {
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const xPercent = (x / rect.width) * 100;
            const yPercent = (y / rect.height) * 100;

            container.style.setProperty("--mouse-x", `${xPercent}%`);
            container.style.setProperty("--mouse-y", `${yPercent}%`);
        });
    });
});

// FLEX MENU
document.addEventListener("DOMContentLoaded", function() {
  if (window.innerWidth < 800) return; 

  var lastScrollTop = 0;

  function handleScroll() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    var menuElements = document.querySelectorAll('.menux');
    menuElements.forEach(function(menu) {
      if (scrollTop > lastScrollTop) {
        menu.classList.add('menuativox');
      } else {
        menu.classList.remove('menuativox');
      }
    });
    var menu2Elements = document.querySelectorAll('.menux2');
    menu2Elements.forEach(function(menu2) {
      if (scrollTop > lastScrollTop) {
        menu2.classList.add('menux2ativo');
      } else {
        menu2.classList.remove('menux2ativo');
      }
    });
    lastScrollTop = scrollTop;
  }
  window.addEventListener('scroll', handleScroll);
});


// FAQ
document.addEventListener("DOMContentLoaded", () => {
 document.fonts.ready.then(() => {
 const faqItems = document.querySelectorAll(".faqfusion");
 const openFirst = true;
 faqItems.forEach((container, index) => {
const question = container.querySelector(".faq-question");
const answer = container.querySelector(".faq-answer");
const answerText = container.querySelector(".faq-text");
 const originalText = question.textContent;
 let isOpen = false;
 let splitAnswer = null;
 let answerTween = null;
 let charsTween = null;
 const startOpen = openFirst && index === 0;
 function openFAQ() {
 if (isOpen) return;
 if (answerTween) answerTween.kill();
 if (charsTween) charsTween.kill();
 question.setAttribute("aria-expanded", "true");
 faqItems.forEach((item) => {
 if (item !== container) {
 item.classList.remove("highlight");
 }});
 container.classList.add("highlight");
 container.classList.add("open");
 if (splitAnswer) {
 splitAnswer.revert();
 splitAnswer = null;}
 splitAnswer = new SplitText(answerText, { type: "words, chars" });
 gsap.set(splitAnswer.chars, {
 opacity: 0,
 y: -10,
 filter: "blur(15px)"
 });
 answerTween = gsap.to(answer, {
 duration: 1.2,
 maxHeight: answer.scrollHeight + 20,
 opacity: 1,
 marginTop: 20,
 ease: "power1.out"
 });
 charsTween = gsap.to(splitAnswer.chars, {
 duration: 1.2,
 opacity: 1,
 y: 0,
 filter: "blur(0px)",
 stagger: 0.01,
 ease: "power2.out"
 });
 isOpen = true;}
 function closeFAQ() {
 if (answerTween) answerTween.kill();
 if (charsTween) charsTween.kill();
 question.setAttribute("aria-expanded", "false");
 container.classList.remove("open");
 container.classList.remove("highlight");
 if (splitAnswer) {
 charsTween = gsap.to(splitAnswer.chars, {
 duration: 0.3,
 opacity: 0,
 filter: "blur(15px)",
 stagger: 0,
 ease: "power1.in"
 });}
 answerTween = gsap.to(answer, {
 duration: 0.3,
 maxHeight: 0,
 opacity: 0,
 marginTop: 0,
 ease: "power1.in"
 });
 isOpen = false;}
question.addEventListener("click", (e) => {
e.stopPropagation();
isOpen ? closeFAQ() : openFAQ();});
container.addEventListener("click", () => {
isOpen ? closeFAQ() : openFAQ();});
if (startOpen) {
openFAQ();
} else {
closeFAQ();
}});});});

// RODAPÉ
document.getElementById('anoAtual').textContent = new Date().getFullYear();


// TEXTO RODAPÉ
document.addEventListener("DOMContentLoaded", function() {
 const headings = document.querySelectorAll(".lightb");
 let mouseX = 0;
 let mouseY = 0;
 document.addEventListener("mousemove", function(e) {
 mouseX = e.clientX;
 mouseY = e.clientY;
 headings.forEach(heading => {
 const rect = heading.getBoundingClientRect();
 const x = mouseX - rect.left;
 const y = mouseY - rect.top;
 const xPercent = (x / rect.width) * 100;
 const yPercent = (y / rect.height) * 100;
 heading.style.setProperty("--mouse-x", `${xPercent}%`);
 heading.style.setProperty("--mouse-y", `${yPercent}%`);
 });});});

// CARDS BENEFÍCIOS
 const cardsContainers = document.querySelectorAll(".cards");
cardsContainers.forEach(cardsContainer => {
 const cardsContents = cardsContainer.querySelectorAll(".card");
 cardsContainer.addEventListener("mousemove", e => {
 cardsContents.forEach(card => {
 const rect = card.getBoundingClientRect(),
 x = e.clientX - rect.left,
 y = e.clientY - rect.top;
 card.style.setProperty("--mouse-x", `${x}px`);
 card.style.setProperty("--mouse-y", `${y}px`);
 });});});

// ABAS
document.addEventListener("DOMContentLoaded",function(){
const widgets=document.querySelectorAll(".autoplay-tabs");
widgets.forEach((widget)=>{
const tabTitles=widget.querySelectorAll(".tab-title");
const tabContents=widget.querySelectorAll(".tab-content-container");
const visualArea=widget.querySelector(".tab-visual-area");
const fixedMode=false;
const intervalTime=8000;
let currentIndex=0;
let interval;
let lastIsMobile=isMobile();
function isMobile(){
return window.matchMedia("(max-width: 1024px)").matches;
}
function isDesktopMode(){
return fixedMode||!isMobile();
}
function preserveVideoState(container){
const videos=container.querySelectorAll('video');
return Array.from(videos).map(video=>({
element:video,
currentTime:video.currentTime,
paused:video.paused,
muted:video.muted,
volume:video.volume
}));
}
function restoreVideoState(states){
states.forEach(state=>{
try{
state.element.currentTime=state.currentTime;
state.element.muted=state.muted;
state.element.volume=state.volume;
if(!state.paused&&state.element.readyState>=2){
state.element.play().catch(()=>{});
}
}catch(error){
console.warn('Erro ao restaurar vídeo:',error);
}
});
}
function safeMove(el,target){
if(el.parentElement===target)return;
const videoStates=preserveVideoState(el);
target.appendChild(el);
restoreVideoState(videoStates);
}
function moveBackToVisualArea(){
widget.querySelectorAll('.tab-content-container').forEach(el=>{
safeMove(el,visualArea);
el.classList.remove("mobile-moved");
});
}
function applyDesktopLayout(){
moveBackToVisualArea();
visualArea.classList.remove("fixed-disabled");
visualArea.style.height="";
tabContents.forEach(content=>{
content.classList.toggle("active",Number(content.dataset.index)===currentIndex);
});
}
function applyMobileLayout(){
visualArea.classList.add("fixed-disabled");
visualArea.style.height="0px";
if(fixedMode)return;
const source=widget.querySelector(`.tab-content-container[data-index="${currentIndex}"]`);
if(!source)return;
source.classList.add("active","mobile-moved");
source.style.position="relative";
source.style.opacity="1";
source.style.transform="translateY(0)";
source.style.filter="none";
source.style.pointerEvents="auto";
source.style.visibility="visible";
source.style.display="flex";
safeMove(source,tabTitles[currentIndex]);
}
function switchTab(index){
if(index===currentIndex)return;
tabTitles.forEach((btn,i)=>btn.classList.toggle("active",i===index));
if(isDesktopMode()){
const current=widget.querySelector(`.tab-content-container[data-index="${currentIndex}"]`);
const next=widget.querySelector(`.tab-content-container[data-index="${index}"]`);
if(current&&next&&current!==next){
current.classList.remove("active");
current.classList.add("fading-out");
setTimeout(()=>{
current.classList.remove("fading-out");
next.classList.add("active");
},500);
}
}else{
moveBackToVisualArea();
const source=widget.querySelector(`.tab-content-container[data-index="${index}"]`);
if(!source)return;
tabContents.forEach(content=>content.classList.remove("active"));
source.classList.add("active","mobile-moved","fading-in");
source.style.position="relative";
source.style.opacity="0";
source.style.transform="translateY(80px)";
source.style.filter="blur(20px)";
source.style.pointerEvents="auto";
source.style.transition="all 1.5s ease";
source.style.visibility="visible";
source.style.display="flex";
safeMove(source,tabTitles[index]);
void source.offsetWidth;
requestAnimationFrame(()=>{
source.style.opacity="1";
source.style.transform="translateY(0)";
source.style.filter="none";
});
setTimeout(()=>{
source.classList.remove("fading-in");
},800);
}
currentIndex=index;
}
function autoplay(){
if(!tabTitles.length)return;
switchTab((currentIndex+1)%tabTitles.length);
}
function startAutoplay(){
clearInterval(interval);
interval=setInterval(autoplay,intervalTime);
}
function stopAutoplay(){
clearInterval(interval);
}
function handleVisibilityChange(){
if(document.hidden){
stopAutoplay();
}else{
startAutoplay();
}
}
document.addEventListener('visibilitychange',handleVisibilityChange);
window.addEventListener('blur',stopAutoplay);
window.addEventListener('focus',()=>{
if(!document.hidden){
startAutoplay();
}
});
requestAnimationFrame(()=>{
if(isDesktopMode()){
applyDesktopLayout();
}else{
applyMobileLayout();
}
startAutoplay();
});
window.addEventListener("resize",()=>{
const nowIsMobile=isMobile();
if(nowIsMobile!==lastIsMobile){
if(isDesktopMode()){
applyDesktopLayout();
}else{
applyMobileLayout();
}
lastIsMobile=nowIsMobile;
}
});
tabTitles.forEach((btn,index)=>{
btn.addEventListener("click",()=>{
clearInterval(interval);
switchTab(index);
startAutoplay();
});
});
window.addEventListener('beforeunload',()=>{
stopAutoplay();
document.removeEventListener('visibilitychange',handleVisibilityChange);
});
});
});


// MOBILE IMG

const isMobile = window.matchMedia("(max-width: 1024px)").matches;

const img = document.querySelector('.telamobcomp');
img.src = isMobile ? img.dataset.srcMobile : img.dataset.srcDesktop;

const imgBasenote = document.querySelector('.basenote');
imgBasenote.src = isMobile ? imgBasenote.dataset.srcMobile : imgBasenote.dataset.srcDesktop;


// MOBILE VIDEO

if (window.matchMedia("(min-width: 1025px)").matches) {
  const video = document.querySelector(".videohome");
  const source = document.createElement("source");
  source.src = "Media/SMOKEHOME.html";
  source.type = "video/mp4";
  video.appendChild(source);
  video.load();
  video.play().catch(() => {});
}



// BENTO GRID ROAD
document.addEventListener('DOMContentLoaded', () => {
 const circles = document.querySelectorAll('.circlebento6');
 circles.forEach((circle, index) => {
 const delaySeconds = index * 0.5;
 const animation = circle.animate([
 { transform: 'translate(-50%, -50%) rotate(0deg)'},
 { transform: 'translate(-50%, -50%) rotate(360deg)' }], {
 duration: 2000,
 iterations: Infinity,
 easing: 'linear',
 delay: delaySeconds * 1000
 });
 animation.playbackRate = 1;
 let interval = null;
 function smoothSpeed(targetRate) {
 clearInterval(interval);
 interval = setInterval(() => {
 const current = animation.playbackRate;
 if (Math.abs(current - targetRate) < 0.01) {
 animation.playbackRate = targetRate;
 clearInterval(interval);
 } else {
 animation.playbackRate += (targetRate > current ? 0.15 : -0.15);
 }}, 30);}
 const wrapper = circle.closest('.fpbentov1');
 wrapper.addEventListener('mouseenter', () => smoothSpeed(7.5));
 wrapper.addEventListener('mouseleave', () => smoothSpeed(1));});});


 // BENTO ITEMS
 function heitorrfBouncingWidget({
 containerId,
 imageUrls,
 usarTeto = true,
 usarScrollMovement = true,
 fixedWidth = 200,
}) {
 let heitorrfLastScrollY = window.scrollY;
 let podeAplicarForca = true;
 let scrollTimeout = null;
 function heitorrfPreloadImages(callback) {
 const heitorrfLoadedImages = [];
 let heitorrfLoadedCount = 0;
 for (let url of imageUrls) {
 const img = new Image();
 img.src = url;
 img.onload = () => {
 heitorrfLoadedImages.push(img);
 heitorrfLoadedCount++;
 if (heitorrfLoadedCount === imageUrls.length) callback(heitorrfLoadedImages);
 };}}
 heitorrfPreloadImages((heitorrfImages) => {
 const heitorrfContainer = document.getElementById(containerId);
 const heitorrfCanvas = document.createElement("canvas");
 heitorrfContainer.appendChild(heitorrfCanvas);
 heitorrfCanvas.width = heitorrfContainer.clientWidth;
 heitorrfCanvas.height = heitorrfContainer.clientHeight;
 heitorrfCanvas.style.position = "absolute";
 heitorrfCanvas.style.top = "0";
 heitorrfCanvas.style.left = "0";
 heitorrfCanvas.style.zIndex = "2";
 const heitorrfCtx = heitorrfCanvas.getContext("2d");
 const heitorrfEngine = Matter.Engine.create();
 const heitorrfWorld = heitorrfEngine.world;
 heitorrfEngine.gravity.y = 0.6;
 heitorrfEngine.positionIterations = 10;
 function criarParedes() {
 const ground = Matter.Bodies.rectangle(
 heitorrfCanvas.width / 2,
 heitorrfCanvas.height + 50,
 heitorrfCanvas.width,
 100,
 { isStatic: true }
 );
 const leftWall = Matter.Bodies.rectangle(
 -50,
 heitorrfCanvas.height / 2,
 100,
 heitorrfCanvas.height,
 { isStatic: true }
 );
 const rightWall = Matter.Bodies.rectangle(
 heitorrfCanvas.width + 50,
 heitorrfCanvas.height / 2,
 100,
 heitorrfCanvas.height,
 { isStatic: true }
 );
 const ceiling = usarTeto
 ? Matter.Bodies.rectangle(heitorrfCanvas.width / 2, -50, heitorrfCanvas.width, 100, {
 isStatic: true,
 })
 : null;
 return { ground, leftWall, rightWall, ceiling };
 }
 let {
 ground: heitorrfGround,
 leftWall: heitorrfLeftWall,
 rightWall: heitorrfRightWall,
 ceiling: heitorrfCeiling,
 } = criarParedes();
 Matter.World.add(heitorrfWorld, [heitorrfGround, heitorrfLeftWall, heitorrfRightWall]);
 if (usarTeto && heitorrfCeiling) Matter.World.add(heitorrfWorld, heitorrfCeiling);
 function removerParedes() {
 Matter.World.remove(heitorrfWorld, [heitorrfGround, heitorrfLeftWall, heitorrfRightWall]);
 if (usarTeto && heitorrfCeiling) Matter.World.remove(heitorrfWorld, heitorrfCeiling);
 }
 const heitorrfObjects = [];
 for (let img of heitorrfImages) {
 const ratio = img.height / img.width;
 const h = fixedWidth * ratio;
 const x = Math.random() * (heitorrfCanvas.width - 200) + 100;
 const y = usarTeto ? Math.random() * 100 + 50 : Math.random() * -50 - 50;
 const body = Matter.Bodies.rectangle(x, y, fixedWidth, h, {
 restitution: 0.5,
 frictionAir: 0.001,
 density: 0.0004,
 angle: Math.random() * Math.PI,
 });
 Matter.Body.setAngularVelocity(body, Math.random() * 0.1 - 0.05);
 Matter.World.add(heitorrfWorld, body);
 heitorrfObjects.push({ body, img, w: fixedWidth, h, opacity: 0 });
 }
 function heitorrfDraw() {
 heitorrfCtx.clearRect(0, 0, heitorrfCanvas.width, heitorrfCanvas.height);
 Matter.Engine.update(heitorrfEngine);
 for (let obj of heitorrfObjects) {
 const { body, img, w, h } = obj;
 const halfWidth = w / 2;
 const halfHeight = h / 2;
 if (body.position.x < halfWidth) {
 Matter.Body.setPosition(body, { x: halfWidth, y: body.position.y });
 Matter.Body.setVelocity(body, { x: 0, y: body.velocity.y });
 } else if (body.position.x > heitorrfCanvas.width - halfWidth) {
 Matter.Body.setPosition(body, { x: heitorrfCanvas.width - halfWidth, y: body.position.y });
 Matter.Body.setVelocity(body, { x: 0, y: body.velocity.y });
 }
 if (body.position.y < halfHeight) {
 Matter.Body.setPosition(body, { x: body.position.x, y: halfHeight });
 Matter.Body.setVelocity(body, { x: body.velocity.x, y: 0 });
 } else if (body.position.y > heitorrfCanvas.height - halfHeight) {
 Matter.Body.setPosition(body, { x: body.position.x, y: heitorrfCanvas.height - halfHeight });
 Matter.Body.setVelocity(body, { x: body.velocity.x, y: 0 });
 }
 obj.opacity += (255 - obj.opacity) * 0.02;
 heitorrfCtx.save();
 heitorrfCtx.translate(body.position.x, body.position.y);
 heitorrfCtx.rotate(body.angle);
 heitorrfCtx.globalAlpha = obj.opacity / 255;
 heitorrfCtx.drawImage(img, -w / 2, -h / 2, w, h);
 heitorrfCtx.restore();
 }
 requestAnimationFrame(heitorrfDraw);
 }
 heitorrfDraw();
 function heitorrfScrollMoved() {
 if (!usarScrollMovement) return;
 const delta = window.scrollY - heitorrfLastScrollY;
 if (delta === 0) return;
 if (!podeAplicarForca) {
 clearTimeout(scrollTimeout);
 scrollTimeout = setTimeout(() => {
 podeAplicarForca = true;
 }, 100); 
 heitorrfLastScrollY = window.scrollY;
 return;
 }
 const maxForce = 0.4; 
 const forceY = delta > 0 ? -maxForce : maxForce;
 for (let obj of heitorrfObjects) {
 const body = obj.body;
 const halfHeight = obj.h / 2;
 if (
 (forceY < 0 && body.position.y > halfHeight + 5) ||
 (forceY > 0 && body.position.y < heitorrfCanvas.height - halfHeight)
 ) {
 Matter.Body.applyForce(body, body.position, {
 x: (Math.random() * 0.2 - 0.1) * 0.5,
 y: forceY * 0.5,
 });
 Matter.Body.setAngularVelocity(body, Math.random() * 0.04 - 0.02);
 }}
 podeAplicarForca = false;
 clearTimeout(scrollTimeout);
 scrollTimeout = setTimeout(() => {
 podeAplicarForca = true;
 }, 100);
 heitorrfLastScrollY = window.scrollY;
 }
 window.addEventListener("scroll", heitorrfScrollMoved);
 window.addEventListener("resize", () => {
 heitorrfCanvas.width = heitorrfContainer.clientWidth;
 heitorrfCanvas.height = heitorrfContainer.clientHeight;
 removerParedes();
 const paredesNovas = criarParedes();
 heitorrfGround = paredesNovas.ground;
 heitorrfLeftWall = paredesNovas.leftWall;
 heitorrfRightWall = paredesNovas.rightWall;
 heitorrfCeiling = paredesNovas.ceiling;
 Matter.World.add(heitorrfWorld, [heitorrfGround, heitorrfLeftWall, heitorrfRightWall]);
 if (usarTeto && heitorrfCeiling) Matter.World.add(heitorrfWorld, heitorrfCeiling);
 });
 heitorrfCanvas.addEventListener("mousemove", (e) => {
 const rect = heitorrfCanvas.getBoundingClientRect();
 const mouseX = e.clientX - rect.left;
 const mouseY = e.clientY - rect.top;
 for (let obj of heitorrfObjects) {
 let d = Math.hypot(mouseX - obj.body.position.x, mouseY - obj.body.position.y);
 if (d < 100) {
 Matter.Body.applyForce(obj.body, obj.body.position, {
 x: (obj.body.position.x - mouseX) * 0.0015,
 y: (obj.body.position.y - mouseY) * 0.0015,
 });
 Matter.Body.setAngularVelocity(obj.body, Math.random() * 0.2 - 0.1);
 }}});});}
let mobileWidth = window.innerWidth <= 767 ? 110 : 140;
heitorrfBouncingWidget({
 containerId: "bouncing-container-1",
 imageUrls: [
 "Media/BENTOLOGO1.svg",
 "Media/BENTOLOGO2.html",
 "Media/BENTOLOGO3.html",
 "Media/BENTOLOGO4.html",
 "Media/BENTOLOGO5.html",
 ],
 fixedWidth: mobileWidth,
});

// BENTO STARS
  document.querySelectorAll('.black-hole .stars').forEach(starsContainer => {
    const container = starsContainer.parentElement;
    function getCenter() {
      return container.offsetWidth / 2;
    }

    function createStar() {
      const center = getCenter();
      const star = document.createElement('div');
      star.className = 'star';

      const angle = Math.random() * 2 * Math.PI;
      const distance = center + Math.random() * 100;

      const x = center + distance * Math.cos(angle);
      const y = center + distance * Math.sin(angle);

      star.style.left = `${x}px`;
      star.style.top = `${y}px`;

      const dx = `${center - x}px`;
      const dy = `${center - y}px`;

      star.style.setProperty('--dx', dx);
      star.style.setProperty('--dy', dy);

      starsContainer.appendChild(star);
      setTimeout(() => star.remove(), 8000);
    }

    setInterval(() => {
      for (let i = 0; i < 4; i++) {
        createStar();
      }
    }, 200);
  });

// PREVIEW 
const checkbox = document.getElementById('switch1');
const overlay = document.getElementById('overlay');

checkbox.addEventListener('change', () => {
  if (checkbox.checked) {
    const iframe = document.createElement('iframe');
    iframe.src = 'fppropreview/index.html';
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('frameborder', '0');
    overlay.appendChild(iframe);
    requestAnimationFrame(() => {
      iframe.classList.add('show');
    });
  } else {
    const iframe = overlay.querySelector('iframe');
    if (iframe) {
      iframe.classList.remove('show');
      iframe.addEventListener('transitionend', () => {
        iframe.remove();
      }, { once: true });
    }
  }
});

// NOTE PREVIEW
const elementos = document.querySelectorAll(".screen7s");
function fadeScroll() {
 const alturaJanela = window.innerHeight;
 elementos.forEach(elemento => {
 const elementoTop = elemento.getBoundingClientRect().top;
 if (elementoTop < alturaJanela * 0.80) {
 elemento.classList.add("ativo7s");
 } else {
 elemento.classList.remove("ativo7s");
 }});}
fadeScroll();
window.addEventListener("scroll", fadeScroll);

// LOADING SCREEN
document.addEventListener('DOMContentLoaded', function () {
 setTimeout(function () {
 const elemento1 = document.querySelector('.iniciar');
 const container = document.querySelector('.loadingcontainer1');
 if (elemento1) {
 elemento1.classList.add('iniciarativo');
 setTimeout(() => {
 if (container) {
 container.classList.add('iniciarativo');
 }}, 500);
 setTimeout(function () {
 elemento1.classList.add('iniciarativo2');
 const elemento2 = document.querySelector('.iniciar2');
 if (elemento2) {
 setTimeout(function () {
 elemento2.classList.add('iniciarativocontainer');
 setTimeout(function () {
 elemento2.classList.add('iniciarativocontainer2');
 }, 600);}, 280);}}, 200);}}, 50);});

// ADVANCED POP-UP
document.addEventListener("DOMContentLoaded", () => {
 const parents = document.querySelectorAll(".contentmoreparentfp");
 const triggerPoint = window.innerHeight * 0.5;
 parents.forEach((parent) => {
 const title = parent.querySelector(".headcontentmorefp");
 const iconmore = parent.querySelector(".contentmoreiconfp");
 const container = parent.closest(".contentmorehere");
 const border = parent.querySelector(".contentborder");
 if (!title || !iconmore || !container || !border) return;
 parent.style.transform = "scale(0) translateY(40px)";
 parent.style.transition = "transform 0.4s ease";
 border.style.transition = "all 0.4s ease";
 iconmore.style.opacity = "0";
 iconmore.style.transform = "scale(0)";
 iconmore.style.transition = "all 0.2s ease";
 title.style.width = "0px";
 title.style.opacity = "0";
 title.style.margin = "0";
 title.style.display = "inline-block";
 title.style.overflow = "hidden";
 title.style.transition = "all 0.2s ease";
 let isOpen = false;
 let isAnimating = false;
 function openTimeline() {
 if (isOpen || isAnimating) return;
 isAnimating = true;
 const fullWidth = title.scrollWidth;
 const stretched = fullWidth * 1.2 + "px";
 parent.style.transform = "scale(1) translateY(0px)";
 setTimeout(() => {
 iconmore.style.opacity = "1";
 iconmore.style.transform = "scale(1)";
 }, 500);
 setTimeout(() => {
 border.style.transform = "scale(0)";
 }, 600);
 setTimeout(() => {
 title.style.transition = "width 0.6s ease";
 title.style.width = stretched;
 title.style.opacity = "0";
 title.style.marginRight = "15px";
 title.style.marginLeft = "15px";
}, 800);
setTimeout(() => {
 title.style.transition = "width 0.6s ease";
 title.style.width = fullWidth + "px";
}, 1400);
setTimeout(() => {
 title.style.transition = "width 0.4s ease, opacity 0.3s ease";
 title.style.opacity = "1";
}, 1500);
 setTimeout(() => {
 isOpen = true;
 isAnimating = false;
 }, 1050);}
 function closeTimeline() {
 if (!isOpen || isAnimating) return;
 isAnimating = true;
 const fullWidth = title.scrollWidth;
setTimeout(() => {
 title.style.transition = "all 0.4s ease";
 title.style.opacity = "0";
 iconmore.style.transition = "all 0.4s ease";
 iconmore.style.opacity = "0";
 iconmore.style.transform = "scale(0)";
 }, 400);
 setTimeout(() => {
 title.style.width = "0px";
 title.style.transition = "all 0.2s ease";
 title.style.marginRight = "0px";
 title.style.marginLeft = "0px";
 }, 900);
 setTimeout(() => {
 parent.style.transform = "scale(0) translateY(40px)";
 }, 1200);
 setTimeout(() => {
 border.style.transform = "scale(1)";
 }, 1500);
 setTimeout(() => {
 isOpen = false;
 isAnimating = false;
 }, 1500);}
 function checkScroll() {
 const rect = container.getBoundingClientRect();
 if (rect.top < triggerPoint && rect.bottom > triggerPoint) {
 openTimeline();
 } else {
 closeTimeline();}}
 window.addEventListener("scroll", checkScroll);
 window.addEventListener("load", checkScroll);
 });});


 

// POP-UP
document.addEventListener("DOMContentLoaded", () => {
  const popup   = document.querySelector(".popupfp");
  const abrir   = document.querySelector(".abrirpopfp");
  const fechar  = document.querySelector(".closepopfp");
  const wrapper = popup.querySelector(".video-wrapper");

  const initialPh = wrapper.querySelector(".video-placeholder");
  const VIDEO_ID  = initialPh?.dataset.videoId || "";
  const THUMB_SRC = initialPh?.querySelector(".video-thumb")?.getAttribute("src") || "";
  function buildPlaceholder() {
    const ph = document.createElement("div");
    ph.className = "video-placeholder";
    ph.dataset.videoId = VIDEO_ID;

    const img = document.createElement("img");
    img.className = "video-thumb";
    img.src = THUMB_SRC;
    img.alt = "Vídeo";

    const btn = document.createElement("button");
    btn.className = "play-button";
    btn.setAttribute("aria-label", "Play Video");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("fill", "white");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M35,25 C35,22 38,20 41,22 L75,47 C77,49 77,51 75,53 L41,78 C38,80 35,78 35,75 Z");

    svg.appendChild(path);
    btn.appendChild(svg);
    ph.appendChild(img);
    ph.appendChild(btn);

    ph.addEventListener("click", () => loadVideo(ph));

    return ph;
  }
  window.loadVideo = function(placeholderEl) {
    const id = placeholderEl.getAttribute("data-video-id") || VIDEO_ID;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("src",
      `https://www.youtube.com/embed/${id}?autoplay=1&controls=1&modestbranding=1&rel=0&playsinline=1`
    );
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    );
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("loading", "lazy");
    iframe.classList.add("video-iframe");

    placeholderEl.replaceWith(iframe);
  };
  function restoreThumb() {
    wrapper.replaceChildren(buildPlaceholder());
  }
  abrir?.addEventListener("click", () => {
    popup.classList.add("popupfpativo");
    document.documentElement.classList.add("no-scroll");
    setTimeout(() => {
      popup.classList.add("popupfpativo2");
      restoreThumb();
    }, 50);
  });
  fechar?.addEventListener("click", () => {
    popup.classList.remove("popupfpativo2");
    setTimeout(() => {
      popup.classList.remove("popupfpativo");
      document.documentElement.classList.remove("no-scroll");
      restoreThumb();
    }, 300);
  });
});

// ENTERANCE ANIMATIONS
gsap.registerPlugin(ScrollTrigger);

gsap.set(".scrollmem, .scroll-bottom, .scroll-bottom2", { autoAlpha: 0 });

gsap.utils.toArray(".scrollmem").forEach(el => {
  gsap.fromTo(el,
    { autoAlpha: 0,},   
    {
      autoAlpha: 1, y: 0, duration: 0.6, ease: "power2.out",
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        end: "bottom 0%",
        toggleActions: "play reverse play reverse",
        onLeave: () => gsap.set(el, { autoAlpha: 0 }),   
        onLeaveBack: () => gsap.set(el, { autoAlpha: 0 }) 
      }
    }
  );
});



gsap.utils.toArray(".scroll-bottom").forEach(el => {
  gsap.fromTo(el,
    { y: -30, filter: "blur(10px)" },
    {
      autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 1, ease: "power2.out",
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        toggleActions: "play none none reverse"
      }
    }
  );
});


gsap.utils.toArray(".scroll-bottom2").forEach(el => {
  gsap.fromTo(el,
    { y: -30 },
    {
      autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out",
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        toggleActions: "play none none reverse"
      }
    }
  );
});




class TextScramble {
  constructor(el, duration = 30) {
    this.el = el;
    this.chars = "!<>-_\\/[]{}—=+*^?#";
    this.update = this.update.bind(this);
    this.duration = duration;
  }

  setText(newText) {
    const oldText = this.el.textContent;
    const length = Math.max(oldText.length, newText.length);
    this.queue = [];

    for (let i = 0; i < length; i++) {
      const from = oldText[i] || "";
      const to = newText[i] || "";
      const start = Math.floor(Math.random() * this.duration);
      const end = start + Math.floor(Math.random() * (this.duration / 2));
      this.queue.push({ from, to, start, end });
    }

    cancelAnimationFrame(this.frameRequest);
    this.frame = 0;

    return new Promise(resolve => {
      this.resolve = resolve;
      this.update();
    });
  }

  update() {
    this.el.textContent = "";
    let complete = 0;

    for (let i = 0; i < this.queue.length; i++) {
      let { from, to, start, end, char } = this.queue[i];
      const span = document.createElement("span");

      if (this.frame >= end) {
        complete++;
        span.textContent = to;
      } else if (this.frame >= start) {
        if (!char || Math.random() < 0.28) {
          char = this.randomChar();
          this.queue[i].char = char;
        }
        span.textContent = char;
        span.className = "dud";
      } else {
        span.textContent = from;
      }

      this.el.appendChild(span);
    }

    if (complete === this.queue.length) {
      this.resolve();
    } else {
      this.frameRequest = requestAnimationFrame(this.update);
      this.frame++;
    }
  }

  randomChar() {
    return this.chars[Math.floor(Math.random() * this.chars.length)];
  }
}

document.addEventListener("DOMContentLoaded", () => {

  const codigo = `
<!-- FPPRO - HEITOR FERREIRA © COMPONENTS -->

<div class="card-efeitoxpaix">
<div class="card-efeitoxpai">

<!-- CARD -->    
<div class="card-efeitox">
<div class="card-efeitoxcontent">  
<div class="fp-iconcardwrapperx"><div class="fp-icon-fax">
<i class="fa-regular fa-circle-user"></i>
</div></div>
<h3 class="headcard2">Lorem Ipsum</h3>
<p class="descriptioncard">Lorem Ipsum is simply dummy<br> text of the printing and<br> typesetting industry. Lorem<br> Ipsum has been the industry's<br> standard dummy text<br> ever since the 1500s</p>
</div></div>
<!-- CARD --> 


<!-- CARD -->    
<div class="card-efeitox">
<div class="card-efeitoxcontent">  
<div class="fp-iconcardwrapperx"><div class="fp-icon-fax">
<i class="fa-solid fa-rocket"></i>
</div></div>
<h3 class="headcard2">Lorem Ipsum</h3>
<p class="descriptioncard">Lorem Ipsum is simply dummy<br> text of the printing and<br> typesetting industry. Lorem<br> Ipsum has been the industry's<br> standard dummy text<br> ever since the 1500s</p>
</div></div>
<!-- CARD -->  


<!-- CARD -->    
<div class="card-efeitox">
<div class="card-efeitoxcontent">  
<div class="fp-iconcardwrapperx"><div class="fp-icon-fax">
<i class="fa-solid fa-code"></i>
</div></div>
<h3 class="headcard2">Lorem Ipsum</h3>
<p class="descriptioncard">Lorem Ipsum is simply dummy<br> text of the printing and<br> typesetting industry. Lorem<br> Ipsum has been the industry's<br> standard dummy text<br> ever since the 1500s</p>
</div></div>
<!-- CARD --> 


<!-- CARD -->    
<div class="card-efeitox x">
<div class="card-efeitoxcontent">  
<div class="fp-iconcardwrapperx"><div class="fp-icon-fax">
<i class="fa-solid fa-laptop-code"></i>
</div></div>
<h3 class="headcard2">Lorem Ipsum</h3>
<p class="descriptioncard">Lorem Ipsum is simply dummy<br> text of the printing and<br> typesetting industry. Lorem<br> Ipsum has been the industry's<br> standard dummy text<br> ever since the 1500s</p>
</div></div>
<!-- CARD --> 

</div></div>

<style>
:root{
--fpcardinteractionebordercolor: #333381; 
--fpcardinteractioneblurcolor: #8789ff; 
--fpcardinteractioneheadfont: "Questrial", sans-serif;
--fpcardinteractioneheadcolor: #ffffff; 
--fpcardinteractionedescriptionfont: "Inter Tight", sans-serif;
--fpcardinteractionedescriptioncolor: #ffffffa2; 
--fpcardinteractioneiconsbackground: linear-gradient(to bottom, #020024, #01000d);
}

.fp-iconcardwrapperx {
 width: 90px;
 height: 90px;
 display: flex;
 justify-content: center;
 align-items: center;
 border-radius: 30px;
 background: var(--fpcardinteractioneiconsbackground);
 border: 2px solid var(--fpcardinteractionebordercolor);
 filter: drop-shadow(0px 0px 30px var(--fpcardinteractionebordercolor));
 margin-bottom: 20px;
}
.fp-icon-fax {
 font-size: 32px;
 color: var(--fpcardinteractioneheadcolor);
}

.headcard2 {
 display: inline-block;
 font-family: var(--fpcardinteractioneheadfont);
 font-weight: 600;
 line-height: 1.2em;
 font-size: 36px;
 text-align: start;
 color: var(--fpcardinteractioneheadcolor);
 margin: 0;
 user-select: none;
 word-break: break-word;
}
.descriptioncard {
 display: inline-block;
 font-family: var(--fpcardinteractionedescriptionfont);
 font-weight: 400;
 line-height: 1.2em;
 font-size: 16px;
 text-align: start;
 color: var(--fpcardinteractionedescriptioncolor);
 margin: 0;
 user-select: none;
 word-break: break-word;
}
.card-efeitoxpai{
 position: relative;
 display: flex;
 flex-direction: row;
 box-sizing: border-box;
 width: 100%;
 height: auto;
 padding: 0px;
 justify-content: center;
 align-items: stretch;
 gap: 0px;
 transition: 0.5s;
 align-self: center;
}
.card-efeitoxpaix{
 position: relative;
 display: flex;
 flex-direction: column;
 box-sizing: border-box;
 width: 100%;
 height: auto;
 padding: 0px;
 margin: 40px 0px;
 justify-content: center;
 align-items: center;
 gap: 0px;
 padding: 0px 0px;
 z-index: 99999;
 -webkit-tap-highlight-color: transparent;
 will-change: filter, box-shadow;
}
.x{
 margin-right: 0px !important;
}
.card-efeitox{
 margin-right: -200px;
 width: 400px !important;
 overflow: hidden;
 border-radius: 40px;
 background: var(--fpcardinteractioneiconsbackground);
 box-shadow: -20px 20px 35px 20px rgba(0,0,0,0.85);
 transition: 0.5s !important;
 will-change: filter, box-shadow;
 display: flex;
 flex-direction: column;
 gap: 10px;
}
.card-efeitoxcontent{
 overflow: hidden;
 padding: 80px 40px;
 will-change: filter, box-shadow;
 display: flex;
 flex-direction: column;
 gap: 10px;
}
.card-efeitox:hover{
 margin-right: -20px;
 transform: rotate(-5deg) translatey(-50px);
}
.card-efeitoxcontent::after {
content: "";
position: absolute;
top: 0%;
left: 50%;
opacity: 0.5;
width: 300px;
height: 200px;
transform: translate(-50%, -50%);
background: var(--fpcardinteractioneblurcolor);
border-radius: 100%;
filter: blur(40px);
transition: 1s;
will-change: filter, opacity;
}
.card-efeitoxcontent:hover:after {
opacity: 1;
}
.card-efeitox::before {
 content: "";
 position: absolute;
 top: 0;
 left: 0;
 right: 0;
 bottom: 0;
 padding: 2px;
 border-radius: inherit;
 background: linear-gradient(to bottom, var(--fpcardinteractionebordercolor), #000000);
 -webkit-mask: linear-gradient(var(--fpcardinteractionebordercolor) 0 0) content-box, linear-gradient(var(--fpcardinteractionebordercolor) 0 0);
 mask: linear-gradient(var(--fpcardinteractionebordercolor) 0 0) content-box, linear-gradient(var(--fpcardinteractionebordercolor) 0 0);
 -webkit-mask-composite: xor;
 mask-composite: exclude;
}
@media(max-width: 1024px){
 .card-efeitox{
 width: 300px !important;
 margin-right: 0px;
 margin-bottom: -230px;
}
.x{
 margin-bottom: 0px !important;
}
 .card-efeitoxcontent{
 padding: 60px 30px;
 padding-top: 40px;
}
.card-efeitox:hover{
 margin-right: 0px;
 transform: rotate(0deg) translatey(-250px)
}
.x:hover{
 margin-right: 0px;
 transform: rotate(0deg) translatey(0px);
}
.card-efeitoxpai{
 flex-direction: column;
 align-items: center;
}
.fp-iconcardwrapperx {
 width: 80px;
 height: 80px;
 border-radius: 30px;
 margin-bottom: 20px;
}
.fp-icon-fax {
 font-size: 32px;
}}
</style>
<link rel="stylesheet" href="../cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
`.trim();

  const btn = document.querySelector(".copiar");
  const txt = btn?.querySelector(".txtbtn");
  if (!btn || !txt) return;

  const fx = new TextScramble(txt, 30);

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, 999999);
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  function copyWithFeedback() {
    fx.setText("Copiado!").then(() => {
      setTimeout(() => fx.setText("Clique aqui para copiar"), 1200);
    });
  }

  btn.addEventListener("click", () => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(codigo)
        .then(copyWithFeedback)
        .catch(() => {
          fallbackCopy(codigo);
          copyWithFeedback();
        });
    } else {
      fallbackCopy(codigo);
      copyWithFeedback();
    }
  });

});