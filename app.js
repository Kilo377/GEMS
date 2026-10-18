(() => {
  const config = window.GEMS;
  if (!config) return;
  const projectTitle = document.getElementById('project-title');
  if (projectTitle.textContent.replace(/\s+/g, ' ').trim() !== config.title) projectTitle.textContent = config.title;
  const authors = document.getElementById('authors'); authors.replaceChildren();
  config.authors.forEach((author, i) => {
    if (i) authors.append(document.createTextNode(', '));
    const name = document.createElement('span'); name.textContent = author.name;
    const sup = document.createElement('sup'); sup.textContent = author.affiliations + (author.equal ? ',*' : '');
    name.className = 'author-name';
    name.append(sup);
    authors.append(name);
  });
  const resources = document.getElementById('resources');
  for (const [key, label] of [['arxiv', 'arXiv'], ['github', 'GitHub'], ['demo', 'Demo']]) {
    const item = document.createElement(config.links[key] ? 'a' : 'span');
    item.className = 'pill';
    const icon = document.createElement('img');
    icon.src = `./assets/icons/${key}.svg`; icon.className = 'resource-icon';
    icon.alt = ''; icon.width = 18; icon.height = 18; icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span'); text.textContent = label;
    item.append(icon, text);
    if (config.links[key]) {
      item.href = config.links[key];
      item.target = '_blank'; item.rel = 'noopener noreferrer';
    } else {
      item.setAttribute('aria-disabled', 'true');
    }
    resources.append(item);
  }
  function videoElement(data) {
    const video = document.createElement('video');
    video.controls = true; video.playsInline = true; video.preload = 'none';
    video.src = data.src; if (data.poster) video.poster = data.poster;
    video.setAttribute('aria-label', data.title);
    return video;
  }
  document.querySelectorAll('[data-media]').forEach(container => {
    const data = config.media[container.dataset.media]; if (!data?.src) return;
    const video = videoElement(data); container.replaceChildren(video);
    video.addEventListener('error', () => {
      const message = document.createElement('p'); message.className = 'media-error';
      message.textContent = 'This recording could not be loaded. Please try opening the video file directly.';
      const link = document.createElement('a'); link.href = data.src; link.textContent = 'Open recording';
      container.replaceChildren(message, link);
    }, { once: true });
  });

  const grid = document.getElementById('comparison-grid');
  const status = document.getElementById('comparison-status');
  const videos = [];
  let operation = 0;
  function pauseAll() { operation++; videos.forEach(video => video.pause()); }

  ['Use the coffee machine', 'Sit down on the sofa'].forEach((action, rowIndex) => {
    const goal = document.createElement('div');
    goal.className = 'comparison-goal';
    goal.setAttribute('role', 'group'); goal.setAttribute('aria-label', `Goal ${rowIndex + 1} input`);
    const goalLabel = document.createElement('span'); goalLabel.className = 'goal-label';
    goalLabel.textContent = `Goal ${rowIndex + 1}`;
    const prompt = document.createElement('span'); prompt.className = 'goal-prompt';
    const inputLabel = document.createElement('span'); inputLabel.className = 'goal-input-label'; inputLabel.textContent = 'Input: ';
    const instruction = document.createElement('q'); instruction.textContent = action;
    prompt.append(inputLabel, instruction); goal.append(goalLabel, prompt); grid.append(goal);
    config.comparisonPlatforms.filter(platform => platform.clips[rowIndex]).forEach((platform, platformIndex) => {
      const clip = platform.clips[rowIndex];
      const card = document.createElement('article');
      card.className = 'comparison-card' + (platform.ours ? ' is-ours' : '');
      const title = document.createElement('h3');
      title.id = `platform-${rowIndex}-${platformIndex}`;
      title.textContent = platform.name + (platform.ours ? ' (ours)' : '');
      if (platform.venue) {
        const venue = document.createElement('small');
        venue.className = 'platform-venue';
        venue.textContent = platform.venue;
        title.append(venue);
      }
      card.setAttribute('aria-labelledby', title.id);
      card.append(title);
      const frame = document.createElement('div');
      frame.className = 'comparison-frame';
      const video = videoElement({ src: config.comparisonBase + clip.file + '.mp4', poster: config.comparisonBase + clip.file + '.jpg', title: `${platform.name}: ${action}` });
      video.muted = true;
      video.addEventListener('error', () => { status.textContent = `${platform.name} recording could not be loaded.`; });
      frame.append(video);
      card.append(frame);
      videos.push(video);
      grid.append(card);
    });
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAll(); });
})();
