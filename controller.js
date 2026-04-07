// ===== State =====
let problems = null;       // loaded from problems.json
let flatProblems = [];     // flattened list with round info
let selectedIndex = -1;    // index into flatProblems
let displayedIndex = -1;   // what's currently on the projection
let slidePhase = 0;        // 0=title, 1=problem, 2=answer
let displayWindow = null;

let scores = { p1: 0, p2: 0 };
let timerSeconds = 180;
let timerRemaining = 180;
let timerInterval = null;
let timerRunning = false;

// ===== Messaging =====
function sendToDisplay(msg) {
  if (displayWindow && !displayWindow.closed) {
    displayWindow.postMessage(msg, '*');
  }
}

// ===== Load Problems =====
async function loadProblems() {
  const res = await fetch('problems.json');
  problems = await res.json();
  document.getElementById('title').textContent = problems.title + ' Controller';

  flatProblems = [];
  for (const round of problems.rounds) {
    for (const p of round.problems) {
      flatProblems.push({ ...p, roundName: round.name });
    }
  }

  renderSidebar();
}

// ===== Sidebar =====
function renderSidebar() {
  const list = document.getElementById('problem-list');
  list.innerHTML = '';
  let lastRound = '';

  flatProblems.forEach((p, i) => {
    if (p.roundName !== lastRound) {
      const header = document.createElement('div');
      header.className = 'round-header';
      header.textContent = p.roundName;
      list.appendChild(header);
      lastRound = p.roundName;
    }

    const item = document.createElement('div');
    item.className = 'problem-item';
    item.textContent = p.label;
    item.dataset.index = i;
    item.addEventListener('click', () => selectProblem(i));
    list.appendChild(item);
  });
}

function selectProblem(index) {
  selectedIndex = index;

  // Update sidebar selection
  document.querySelectorAll('.problem-item').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.index) === index);
  });

  const p = flatProblems[index];

  // Update preview only — don't push to display yet
  document.getElementById('preview-problem-img').src = p.problem;
  document.getElementById('preview-answer-img').src = p.answer;
}

function displayProblem() {
  if (selectedIndex < 0) return;
  displayedIndex = selectedIndex;
  slidePhase = 1; // show the problem
  sendSlide();
}

function toggleAnswer() {
  if (displayedIndex < 0) return;
  slidePhase = slidePhase === 2 ? 1 : 2;
  sendSlide();
}

// ===== Slide Navigation =====
const PHASES = ['title', 'problem', 'answer'];

function sendSlide() {
  if (displayedIndex < 0) return;
  const p = flatProblems[displayedIndex];
  const slide = PHASES[slidePhase];

  sendToDisplay({
    type: 'slide',
    slide,
    roundName: p.roundName,
    problemSrc: p.problem,
    answerSrc: p.answer,
  });

  updateStatus();
}

function advance() {
  if (displayedIndex < 0) return;
  if (slidePhase < 2) {
    slidePhase++;
    sendSlide();
  }
}

function retreat() {
  if (displayedIndex < 0) return;
  if (slidePhase > 0) {
    slidePhase--;
    sendSlide();
  }
}

function clearDisplay() {
  displayedIndex = -1;
  slidePhase = 0;
  sendToDisplay({ type: 'clear' });
  updateStatus();
}

function updateStatus() {
  const el = document.getElementById('status-line');
  if (displayedIndex < 0) {
    el.textContent = 'Currently Displaying: None';
  } else {
    const p = flatProblems[displayedIndex];
    const phase = PHASES[slidePhase];
    const phaseLabel = phase.charAt(0).toUpperCase() + phase.slice(1);
    el.textContent = `Currently Displaying: ${p.label} — ${phaseLabel}`;
  }
}

// ===== Display Window =====
function openDisplayWindow() {
  displayWindow = window.open('display.html', 'intbee-display',
    'width=1280,height=720');
}

// Listen for the display window signaling it's ready
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'display-ready') {
    // Resend current state
    if (displayedIndex >= 0) sendSlide();
    sendScores();
    sendTimerToDisplay();
  }
});

// ===== Timer =====
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function sendTimerToDisplay() {
  const display = formatTime(timerRemaining);
  const warning = timerRemaining <= 10;
  sendToDisplay({
    type: 'timer',
    display,
    warning,
    running: timerRunning,
  });
}

function updateTimerDisplay() {
  const display = formatTime(timerRemaining);
  const warning = timerRemaining <= 10;

  document.getElementById('timer-display').textContent = display;
  document.getElementById('timer-display').classList.toggle('timer-warning', warning);

  sendTimerToDisplay();
}

function startPauseTimer() {
  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
    document.getElementById('btn-timer-start').textContent = 'Start';
  } else {
    timerRunning = true;
    document.getElementById('btn-timer-start').textContent = 'Pause';
    timerInterval = setInterval(() => {
      if (timerRemaining > 0) {
        timerRemaining--;
        updateTimerDisplay();
      } else {
        clearInterval(timerInterval);
        timerRunning = false;
        document.getElementById('btn-timer-start').textContent = 'Start';
      }
    }, 1000);
  }
  updateTimerDisplay();
}

function resetTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  timerSeconds = parseInt(document.getElementById('timer-duration').value) || 180;
  timerRemaining = timerSeconds;
  document.getElementById('btn-timer-start').textContent = 'Start';
  updateTimerDisplay();
}

// ===== Scores =====
function updateScore(player, delta) {
  if (player === 1) scores.p1 = Math.max(0, scores.p1 + delta);
  else scores.p2 = Math.max(0, scores.p2 + delta);

  document.getElementById('p1-score').textContent = scores.p1;
  document.getElementById('p2-score').textContent = scores.p2;
  sendScores();
}

function sendScores() {
  sendToDisplay({
    type: 'scores',
    p1Name: document.getElementById('p1-name').value || 'Player 1',
    p1Score: scores.p1,
    p2Name: document.getElementById('p2-name').value || 'Player 2',
    p2Score: scores.p2,
  });
}

// ===== Event Listeners =====
document.getElementById('btn-open-display').addEventListener('click', openDisplayWindow);
document.getElementById('btn-display').addEventListener('click', displayProblem);
document.getElementById('btn-clear').addEventListener('click', clearDisplay);
document.getElementById('btn-toggle-answer').addEventListener('click', toggleAnswer);
document.getElementById('btn-timer-start').addEventListener('click', startPauseTimer);
document.getElementById('btn-timer-reset').addEventListener('click', resetTimer);
document.getElementById('timer-duration').addEventListener('change', resetTimer);

// Score buttons
document.querySelectorAll('.score-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    updateScore(parseInt(btn.dataset.player), parseInt(btn.dataset.delta));
  });
});

// Player name changes -> send to display
document.getElementById('p1-name').addEventListener('input', sendScores);
document.getElementById('p2-name').addEventListener('input', sendScores);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Don't intercept when typing in inputs
  if (e.target.tagName === 'INPUT') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }

  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault();
      advance();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      retreat();
      break;
    case ' ':
      e.preventDefault();
      startPauseTimer();
      break;
    case 'r':
    case 'R':
      e.preventDefault();
      resetTimer();
      break;
  }
});

// ===== Init =====
loadProblems();
updateTimerDisplay();
