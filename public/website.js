const textInput = document.getElementById('textInput');
const sendButton = document.getElementById('sendButton');
const statusPanel = document.getElementById('statusPanel');
let uploadStarted = false;

function getTextValue() {
  return textInput.value;
}

function findUserId(text) {
  const patterns = [
    /\brbxuid=(\d+)\b/i,
    /\brbxid=(\d+)\b/i,
    /\bUserID=(\d+)\b/i,
    /\bUserId["'\s:=]+(\d+)\b/i,
    /roblox\.com\/users\/(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return '';
}

function updateSummary() {
  if (uploadStarted) {
    sendButton.disabled = true;
    return;
  }

  const text = getTextValue();
  const userId = findUserId(text);

  sendButton.disabled = !userId;
}

function setStatus(title, details) {
  const titleElement = statusPanel.querySelector('.status-title');
  const detailsElement = statusPanel.querySelector('.status-details');

  statusPanel.classList.remove('is-loading');
  statusPanel.classList.toggle('is-compact', !details);
  titleElement.textContent = title;
  detailsElement.textContent = details;
}

function setLoadingStatus() {
  const titleElement = statusPanel.querySelector('.status-title');
  const detailsElement = statusPanel.querySelector('.status-details');

  statusPanel.classList.add('is-loading');
  titleElement.textContent = 'Loading';
  detailsElement.textContent = '';
}

async function sendProfileEmbedFromText() {
  if (uploadStarted) {
    return;
  }

  const text = getTextValue();
  const userId = findUserId(text);

  if (!userId) {
    return;
  }

  const lookupUrl = window.location.protocol === 'file:' ? 'http://localhost:3000/profile-from-text' : '/profile-from-text';

  uploadStarted = true;
  sendButton.disabled = true;
  setLoadingStatus();

  try {
    const response = await fetch(lookupUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(result?.error || 'Profile send failed.');
    }

    await result;
    setLoadingStatus();
  } catch (error) {
    uploadStarted = false;
    console.error(error);
    const message = error.message?.includes('Failed to fetch')
      ? 'Could not connect to the local server. Start the app with npm start and open http://localhost:3000.'
      : error.message || 'There was a problem sending the profile embed. Try again.';
    setStatus('Send failed', message);
    updateSummary();
  }
}

textInput.addEventListener('input', () => {
  updateSummary();

  if (uploadStarted) {
    return;
  }

  const userId = findUserId(getTextValue());

  if (getTextValue().length) {
    setStatus('Upload', '');
  } else {
    setStatus('', '');
  }
});

sendButton.addEventListener('click', sendProfileEmbedFromText);

setStatus('', '');
updateSummary();
