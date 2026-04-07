const slides = {
  waiting: document.getElementById('slide-waiting'),
  title: document.getElementById('slide-title'),
  problem: document.getElementById('slide-problem'),
  answer: document.getElementById('slide-answer'),
};

function showSlide(name) {
  Object.values(slides).forEach(s => s.classList.remove('active'));
  if (slides[name]) slides[name].classList.add('active');
}

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'slide': {
      const { slide, roundName, problemSrc, answerSrc } = msg;

      document.getElementById('title-round-name').textContent = roundName || '';
      document.getElementById('problem-round-name').textContent = roundName || '';
      document.getElementById('answer-round-name').textContent = roundName || '';

      if (problemSrc) document.getElementById('problem-img').src = problemSrc;
      if (answerSrc) document.getElementById('answer-img').src = answerSrc;

      showSlide(slide);
      break;
    }

    case 'clear':
      showSlide('waiting');
      break;

    case 'timer': {
      const el = document.getElementById('display-timer');
      el.textContent = msg.display;
      el.classList.toggle('timer-warning', msg.warning);
      el.classList.toggle('timer-running', msg.running);
      break;
    }

    case 'scores': {
      document.getElementById('display-p1-name').textContent = msg.p1Name || 'Player 1';
      document.getElementById('display-p1-score').textContent = msg.p1Score;
      document.getElementById('display-p2-name').textContent = msg.p2Name || 'Player 2';
      document.getElementById('display-p2-score').textContent = msg.p2Score;
      break;
    }
  }
});

// Signal to the opener that we're ready
if (window.opener) {
  window.opener.postMessage({ type: 'display-ready' }, '*');
}
