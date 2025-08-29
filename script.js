// SnapBridge - client-only demo
// Features:
// - sign in / sign out (localStorage)
// - admin tools (username === 'admin')
// - seeded learning videos (public sample URLs)
// - client-side upload using URL.createObjectURL
// - feed metadata for remote items persisted in localStorage

/* ---------- Helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function persistFeed(feed) {
  // store only items with remote URLs flagged as persistent
  const toStore = feed.filter(f => f.persistent).map(({ src, user, caption, persistent }) => ({ src, user, caption, persistent }));
  localStorage.setItem('snapbridge_feed', JSON.stringify(toStore));
}
function loadPersisted() {
  try {
    const raw = localStorage.getItem('snapbridge_feed');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) { return []; }
}

/* ---------- Seed learning videos (public samples) ---------- */
const LEARNING_SAMPLES = [
  {
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    user: 'Instructor A',
    caption: 'Intro to Animation — Basics (sample)',
    persistent: true
  },
  {
    src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm',
    user: 'Science 101',
    caption: 'Plant cells & photosynthesis (sample)',
    persistent: true
  },
  {
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    user: 'Instructor B',
    caption: 'Computer Graphics Overview (sample)',
    persistent: true
  }
];

/* ---------- App State ---------- */
let runtimeFeed = []; // full feed (includes runtime uploaded blobs)
let currentUser = localStorage.getItem('snapbridge_user') || null;

/* ---------- DOM refs ---------- */
const feedEl = $('#feed');
const signinBtn = $('#signinBtn');
const uploadBtn = $('#uploadBtn');
const signinModal = $('#signinModal');
const uploadModal = $('#uploadModal');
const doSign = $('#doSign');
const cancelSign = $('#cancelSign');
const usernameInput = $('#username');
const displayNameInput = $('#displayName');
const fileInput = $('#fileInput');
const captionInput = $('#captionInput');
const cancelUpload = $('#cancelUpload');
const doUpload = $('#doUpload');
const currentUserLabel = $('#currentUser');
const signoutBtn = $('#signoutBtn');
const seedBtn = $('#seedBtn');
const exportBtn = $('#exportBtn');
const clearBtn = $('#clearBtn');

/* ---------- Feed rendering ---------- */
function makePostItem(item) {
  // item: { src, user, caption, persistent? , localBlob?: boolean }
  const post = document.createElement('article');
  post.className = 'post';

  const top = document.createElement('div');
  top.className = 'post-top';
  top.innerHTML = `
    <div class="avatar">${(item.user && item.user[0]) ? item.user[0].toUpperCase() : 'S'}</div>
    <div class="meta">
      <div class="name">${escapeHtml(item.user || 'Guest')}</div>
      <div class="caption">${escapeHtml(item.caption || '')}</div>
    </div>
  `;

  const wrap = document.createElement('div');
  wrap.className = 'video-wrap';

  // create video element
  const video = document.createElement('video');
  video.src = item.src;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.controls = true;
  video.preload = 'metadata';
  video.style.display = 'block';

  // click toggles mute
  video.addEventListener('click', () => {
    video.muted = !video.muted;
  });

  wrap.appendChild(video);

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.innerHTML = `
    <div class="action">
      <button class="like-btn">❤️</button>
      <div class="small like-count">0</div>
    </div>
    <div class="action">
      <button class="comment-btn">💬</button>
      <div class="small comment-count">0</div>
    </div>
    <div style="margin-left:auto" class="small muted">${item.persistent ? 'Learning (sample)' : (item.user || 'u')}</div>
  `;

  // like handling
  actions.querySelector('.like-btn').addEventListener('click', () => {
    const el = actions.querySelector('.like-count');
    el.textContent = String(Number(el.textContent || 0) + 1);
  });

  // comment handling (demo)
  actions.querySelector('.comment-btn').addEventListener('click', () => {
    const txt = prompt('Add comment (demo-only):');
    if (txt) {
      const el = actions.querySelector('.comment-count');
      el.textContent = String(Number(el.textContent || 0) + 1);
    }
  });

  post.appendChild(top);
  post.appendChild(wrap);
  post.appendChild(actions);
  return post;
}

function renderFeed() {
  feedEl.innerHTML = '';
  runtimeFeed.forEach(item => {
    const el = makePostItem(item);
    feedEl.appendChild(el);
  });
  // autoplay best-visible video
  setTimeout(playVisibleVideo, 150);
}

/* ---------- utilities ---------- */
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

function playVisibleVideo() {
  const posts = $$('.post');
  let best = null, bestRatio = 0;
  const h = window.innerHeight || document.documentElement.clientHeight;
  posts.forEach(p => {
    const rect = p.getBoundingClientRect();
    const visible = Math.max(0, Math.min(rect.bottom, h) - Math.max(rect.top, 0));
    const ratio = visible / rect.height;
    if (ratio > bestRatio) { bestRatio = ratio; best = p; }
  });
  posts.forEach(p => {
    const v = p.querySelector('video');
    if (!v) return;
    if (p === best) v.play().catch(()=>{});
    else v.pause();
  });
}

/* ---------- user management ---------- */
function updateUserUI() {
  currentUserLabel.textContent = currentUser || 'Guest';
  if (currentUser) {
    signinBtn.classList.add('hidden');
    signoutBtn.classList.remove('hidden');
    $('#userArea').innerHTML = `<div class="small muted">Hi, ${currentUser}</div>`;
  } else {
    signinBtn.classList.remove('hidden');
    signoutBtn.classList.add('hidden');
    $('#userArea').innerHTML = `<button id="signinBtn" class="btn-outline">Sign in</button>`;
    // reattach signin click
    $('#signinBtn').addEventListener('click', openSign);
  }
}

/* ---------- actions ---------- */
function openSign() {
  signinModal.classList.remove('hidden');
  usernameInput.focus();
}
function closeSign() { signinModal.classList.add('hidden'); usernameInput.value = ''; displayNameInput.value = ''; }

function openUpload() {
  if (!currentUser) {
    // allow guest upload but warn
    if (!confirm('You are not signed in. Upload as Guest?')) return;
  }
  uploadModal.classList.remove('hidden');
}
function closeUpload() { uploadModal.classList.add('hidden'); fileInput.value = ''; captionInput.value = ''; }

function doSignIn() {
  const u = usernameInput.value.trim();
  const d = displayNameInput.value.trim();
  if (!u) { alert('Enter a username'); return; }
  currentUser = d || u;
  localStorage.setItem('snapbridge_user', currentUser);
  closeSign();
  updateUserUI();
  alert(`Signed in as ${currentUser}${u === 'admin' ? ' (admin)' : ''}`);
}

function doSignOut() {
  if (!confirm('Sign out?')) return;
  currentUser = null;
  localStorage.removeItem('snapbridge_user');
  updateUserUI();
}

/* ---------- feed persistence and manipulation ---------- */
function loadInitialFeed() {
  const persisted = loadPersisted();
  runtimeFeed = [];
  // load persisted remote items first
  persisted.forEach(it => runtimeFeed.push(it));
  // if no persisted items, seed learning
  if (runtimeFeed.length === 0) {
    runtimeFeed = LEARNING_SAMPLES.slice();
    persistFeed(runtimeFeed);
  }
  renderFeed();
}

function seedLearning() {
  // prepend learning samples
  runtimeFeed = LEARNING_SAMPLES.concat(runtimeFeed);
  persistFeed(runtimeFeed);
  renderFeed();
}

function doUploadFile() {
  const f = fileInput.files[0];
  const cap = captionInput.value.trim() || 'User upload';
  if (!f) { alert('Please pick a video file'); return; }
  const url = URL.createObjectURL(f);
  const user = currentUser || 'Guest';
  // local uploads are not persisted across reloads because blob URLs are session-only
  runtimeFeed.unshift({ src: url, user, caption: cap, persistent: false });
  renderFeed();
  closeUpload();
}

/* ---------- admin tools ---------- */
function exportFeedJSON() {
  const lightweight = runtimeFeed.map(it => ({ src: it.src, user: it.user, caption: it.caption, persistent: !!it.persistent }));
  const blob = new Blob([JSON.stringify(lightweight, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'snapbridge_feed.json';
  a.click();
}

function clearFeed() {
  if (!confirm('Clear the feed (this removes persisted remote items too)?')) return;
  runtimeFeed = [];
  persistFeed(runtimeFeed);
  renderFeed();
}

/* ---------- events wiring ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // initial load
  loadInitialFeed();
  updateUserUI();

  // buttons
  signinBtn.addEventListener('click', openSign);
  uploadBtn.addEventListener('click', openUpload);
  cancelSign.addEventListener('click', closeSign);
  doSign.addEventListener('click', doSignIn);
  signoutBtn.addEventListener('click', doSignOut);
  seedBtn.addEventListener('click', seedLearning);
  exportBtn.addEventListener('click', exportFeedJSON);
  clearBtn.addEventListener('click', clearFeed);

  cancelUpload.addEventListener('click', closeUpload);
  doUpload.addEventListener('click', doUploadFile);

  // autoplay on scroll
  let scrollTimer = null;
  feedEl.addEventListener('scroll', () => {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(playVisibleVideo, 120);
  });

  window.addEventListener('focus', playVisibleVideo);
  new ResizeObserver(playVisibleVideo).observe(document.body);
});
