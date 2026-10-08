const TOTAL_FRAMES = 300;
const frames = [];

let targetFrame = 0;
let renderedFrame = -1;
let ticking = false;

const canvas = document.getElementById('animationCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const scrollContainer = document.querySelector('.scroll-container');

// Text Chapters Configuration
const CHAPTERS = [
  { start: 0.00, end: 0.16, label: "CRAFTED FOR", title: "MODERN LIVING", pos: "left" },
  { start: 0.16, end: 0.33, label: "FORM", title: "MEETS FUNCTION", pos: "right" },
  { start: 0.33, end: 0.50, label: "DESIGNED", title: "AROUND YOU", pos: "left" },
  { start: 0.50, end: 0.67, label: "ARCHITECTURAL", title: "FURNITURE", pos: "right" },
  { start: 0.67, end: 0.84, label: "MADE TO", title: "DEFINE SPACE", pos: "left" },
  { start: 0.84, end: 1.00, label: "BUILT FOR", title: "THE EXTRAORDINARY", pos: "center" },
];
let activeChapterIndex = -1;

function getFramePath(index) {
  const paddedIndex = String(index).padStart(3, '0');
  return `/frames/ezgif-frame-${paddedIndex}.jpg`;
}

// 1. Populate Frames Array (0-indexed: 0 to 299)
for (let i = 0; i < TOTAL_FRAMES; i++) {
  const frameNum = i + 1;
  const img = new Image();
  img.src = getFramePath(frameNum);
  img.onerror = () => {
    console.error(`Failed to load image: ${img.src}`);
  };
  frames.push(img);
}

// 2. Render Frame 1 Immediately on First Frame Load
if (frames[0]) {
  frames[0].onload = () => {
    resizeCanvas();
    renderFrame(0);
    renderedFrame = 0;
  };
}

// 3. Fallback to Nearest Loaded Frame during Fast Scroll
function getNearestLoadedFrame(index) {
  if (frames[index] && frames[index].complete && frames[index].naturalWidth > 0) {
    return frames[index];
  }
  for (let offset = 1; offset < frames.length; offset++) {
    const prev = index - offset;
    if (prev >= 0 && frames[prev] && frames[prev].complete && frames[prev].naturalWidth > 0) {
      return frames[prev];
    }
    const next = index + offset;
    if (next < frames.length && frames[next] && frames[next].complete && frames[next].naturalWidth > 0) {
      return frames[next];
    }
  }
  return null;
}

// 4. Render Current Frame to Fullscreen Canvas
function renderFrame(index) {
  if (!canvas || !ctx) return;

  const safeIndex = Math.max(0, Math.min(frames.length - 1, index));
  let img = frames[safeIndex];

  if (!img || !img.complete || !img.naturalWidth) {
    img = getNearestLoadedFrame(safeIndex);
  }
  if (!img) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  ctx.clearRect(0, 0, cw, ch);

  // Proportional contain scaling to preserve 9:16 aspect ratio across viewport
  const scale = Math.min(cw / iw, ch / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  const offsetX = (cw - drawW) / 2;
  const offsetY = (ch - drawH) / 2;

  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
}

// 5. Responsive Canvas Sizing (Supports Retina/High-DPI)
function resizeCanvas() {
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (targetFrame >= 0) {
    renderFrame(targetFrame);
  }
}

window.addEventListener('resize', resizeCanvas);

// 6. Calculate Target Frame from Scroll Position (-rect.top / scrollableDistance)
function calculateFrameFromScroll() {
  if (!scrollContainer) return 0;

  const rect = scrollContainer.getBoundingClientRect();
  const scrollableDistance = scrollContainer.offsetHeight - window.innerHeight;

  if (scrollableDistance <= 0) return 0;

  const progress = Math.max(0, Math.min(1, -rect.top / scrollableDistance));
  
  // Non-intrusive text overlay updater (reads progress only)
  updateTextOverlay(progress);

  const frameIndex = Math.round(progress * (frames.length - 1));
  return Math.max(0, Math.min(frames.length - 1, frameIndex));
}

// 7. Non-Intrusive Editorial Text Overlay Function (Only reads progress)
function updateTextOverlay(progress) {
  const editorialCard = document.getElementById('editorialCard');
  const editorialLabel = document.getElementById('editorialLabel');
  const editorialTitle = document.getElementById('editorialTitle');
  if (!editorialCard || !editorialLabel || !editorialTitle) return;

  let activeIndex = CHAPTERS.findIndex(chap => progress >= chap.start && progress <= chap.end);
  if (activeIndex === -1) {
    if (progress < CHAPTERS[0].start) activeIndex = 0;
    if (progress > CHAPTERS[CHAPTERS.length - 1].end) activeIndex = CHAPTERS.length - 1;
  }

  const chap = CHAPTERS[activeIndex];

  if (activeChapterIndex !== activeIndex) {
    activeChapterIndex = activeIndex;
    editorialLabel.textContent = chap.label;
    editorialTitle.textContent = chap.title;

    if (chap.pos === 'right') {
      editorialCard.style.left = 'auto';
      editorialCard.style.right = 'clamp(4%, 8vw, 12%)';
      editorialCard.style.transform = 'none';
      editorialCard.style.textAlign = 'right';
    } else if (chap.pos === 'center') {
      editorialCard.style.left = '50%';
      editorialCard.style.right = 'auto';
      editorialCard.style.transform = 'translateX(-50%)';
      editorialCard.style.textAlign = 'center';
    } else {
      editorialCard.style.left = 'clamp(4%, 8vw, 12%)';
      editorialCard.style.right = 'auto';
      editorialCard.style.transform = 'none';
      editorialCard.style.textAlign = 'left';
    }
  }

  const chapProgress = (progress - chap.start) / (chap.end - chap.start);
  const clampedT = Math.max(0, Math.min(1, chapProgress));

  let opacity = 1;
  if (clampedT <= 0.25) {
    opacity = clampedT / 0.25;
  } else if (clampedT >= 0.75) {
    opacity = (1 - clampedT) / 0.25;
  }

  editorialCard.style.opacity = opacity.toFixed(2);
}

// 8. Passive Scroll Listener with requestAnimationFrame Ticking
window.addEventListener('scroll', () => {
  targetFrame = calculateFrameFromScroll();

  if (!ticking) {
    requestAnimationFrame(() => {
      if (targetFrame !== renderedFrame) {
        renderFrame(targetFrame);
        renderedFrame = targetFrame;
      }
      ticking = false;
    });
    ticking = true;
  }
}, { passive: true });

// Initialize on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  resizeCanvas();
  targetFrame = calculateFrameFromScroll();
  renderFrame(targetFrame);
  renderedFrame = targetFrame;
});
