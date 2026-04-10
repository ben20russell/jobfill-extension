// Keep a single JobFill window open and focus it on repeat clicks.
const JOBFILL_WINDOW_URL = 'popup.html';
const JOBFILL_WINDOW_WIDTH = 440;
const JOBFILL_WINDOW_HEIGHT = 700;

let jobfillWindowId = null;

function createJobfillWindow() {
  chrome.windows.create(
    {
      url: chrome.runtime.getURL(JOBFILL_WINDOW_URL),
      // Use a normal window so it stays open until the user explicitly closes it.
      type: 'normal',
      width: JOBFILL_WINDOW_WIDTH,
      height: JOBFILL_WINDOW_HEIGHT,
      focused: true,
    },
    (window) => {
      if (chrome.runtime.lastError || !window || typeof window.id !== 'number') {
        jobfillWindowId = null;
        return;
      }
      jobfillWindowId = window.id;
    }
  );
}

function focusOrCreateJobfillWindow() {
  if (typeof jobfillWindowId !== 'number') {
    createJobfillWindow();
    return;
  }

  chrome.windows.get(jobfillWindowId, {}, (window) => {
    if (chrome.runtime.lastError || !window) {
      jobfillWindowId = null;
      createJobfillWindow();
      return;
    }

    chrome.windows.update(jobfillWindowId, { focused: true }, () => {
      if (chrome.runtime.lastError) {
        jobfillWindowId = null;
        createJobfillWindow();
      }
    });
  });
}

if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(() => {
    focusOrCreateJobfillWindow();
  });
} else if (chrome.browserAction && chrome.browserAction.onClicked) {
  chrome.browserAction.onClicked.addListener(() => {
    focusOrCreateJobfillWindow();
  });
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === jobfillWindowId) {
    jobfillWindowId = null;
  }
});
