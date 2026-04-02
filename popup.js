// ============================================================
// JobFill — popup.js
// ============================================================

const PROFILE_FIELDS = [
  'firstName', 'lastName', 'email', 'phone',
  'city', 'state', 'country', 'zipCode',
  'linkedin', 'website', 'coverLetterText',
  'salary', 'hearAbout', 'referral',
  'nonCompeteExplanation',
  'gender', 'race', 'veteran', 'disability',
];

const RADIO_FIELDS = ['workAuthorized', 'requireSponsorship', 'hasNonCompete'];

const MAX_JOBS = 6;
const WORK_EXPERIENCE_SAVE_DEBOUNCE_MS = 250;
let workExperienceSaveTimer = null;
const RESUME_SOURCE_URL = 'https://benrussell.myportfolio.com/resume';
const RESUME_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MATCH_TEXT_SAVE_DEBOUNCE_MS = 350;
const MIN_JOB_DESCRIPTION_LENGTH = 120;
let matchTextSaveTimer = null;

const MATCH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'by', 'can', 'for', 'from', 'if',
  'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'our', 'that', 'the', 'their', 'there', 'this',
  'to', 'we', 'with', 'you', 'your', 'will', 'would', 'should', 'must', 'may', 'about', 'able',
  'across', 'after', 'all', 'also', 'any', 'both', 'each', 'etc', 'have', 'has', 'had', 'more',
  'most', 'other', 'such', 'than', 'then', 'these', 'those', 'were', 'when', 'where', 'who',
  'why', 'how', 'job', 'role', 'position', 'team', 'work', 'working', 'candidate', 'preferred',
  'required', 'requirements', 'qualification', 'qualifications', 'experience', 'years', 'year',
]);

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function storageSet(items) {
  return new Promise(resolve => chrome.storage.local.set(items, resolve));
}

// ── Work Experience Management ────────────────────────────
function renderWorkExperience() {
  chrome.storage.local.get('workExperience', ({ workExperience = [] }) => {
    const container = document.getElementById('experienceContainer');
    container.innerHTML = '';

    workExperience.forEach((job, index) => {
      container.appendChild(createJobEntry(job, index));
    });

    // Ensure we have space for more if under max
    if (workExperience.length < MAX_JOBS) {
      document.getElementById('btnAddExperience').style.display = 'block';
    } else {
      document.getElementById('btnAddExperience').style.display = 'none';
    }
  });
}

function createJobEntry(job = {}, index) {
  const entry = document.createElement('div');
  entry.className = 'job-entry';
  entry.dataset.index = index;

  entry.innerHTML = `
    <div class="job-entry-header">
      <div class="job-entry-num">JOB ${index + 1}</div>
      <button class="job-entry-delete" data-index="${index}">✕ Delete</button>
    </div>
    
    <div class="job-field-group">
      <div class="job-field">
        <label>JOB TITLE</label>
        <input type="text" class="job-field-input" data-field="jobTitle" value="${job.jobTitle || ''}" placeholder="Senior Software Engineer" />
      </div>
      <div class="job-field">
        <label>COMPANY</label>
        <input type="text" class="job-field-input" data-field="company" value="${job.company || ''}" placeholder="Acme Corporation" />
      </div>
    </div>
    
    <div class="job-field-group">
      <div class="job-field">
        <label>LOCATION</label>
        <input type="text" class="job-field-input" data-field="workLocation" value="${job.workLocation || job.location || ''}" placeholder="San Francisco, CA" />
      </div>
    </div>
    
    <div class="job-field-group">
      <div class="job-field">
        <label>FROM (MM/YYYY)</label>
        <input type="text" class="job-field-input" data-field="startDate" value="${job.startDate || ''}" placeholder="01/2020" />
      </div>
      <div class="job-field">
        <label>TO (MM/YYYY)</label>
        <input type="text" class="job-field-input" data-field="endDate" value="${job.endDate || ''}" placeholder="12/2023" />
      </div>
    </div>
    
    <div class="job-field-group full">
      <div class="job-field">
        <label>ROLE DESCRIPTION</label>
        <textarea class="job-field-input" data-field="description" placeholder="Brief description of your responsibilities and achievements..."></textarea>
      </div>
    </div>
  `;

  // Add event listener to delete button
  entry.querySelector('.job-entry-delete').addEventListener('click', (e) => {
    deleteJobEntry(parseInt(e.target.dataset.index));
  });

  // Set textarea value
  const textarea = entry.querySelector('textarea');
  if (textarea) textarea.value = job.description || '';

  return entry;
}

function collectWorkExperienceFromDom() {
  const entries = [];
  document.querySelectorAll('.job-entry').forEach((entry, index) => {
    const job = {};
    entry.querySelectorAll('.job-field-input').forEach(input => {
      job[input.dataset.field] = input.value.trim();
    });
    if (job.jobTitle || job.company) {
      entries.push(job);
    }
  });

  return entries;
}

function saveWorkExperience({ rerender = false } = {}) {
  const entries = collectWorkExperienceFromDom();
  chrome.storage.local.set({ workExperience: entries }, () => {
    if (rerender) renderWorkExperience();
  });
}

function addJobEntry() {
  chrome.storage.local.get('workExperience', ({ workExperience = [] }) => {
    if (workExperience.length >= MAX_JOBS) {
      showToast(`Maximum ${MAX_JOBS} job entries`, 'error');
      return;
    }
    workExperience.push({});
    chrome.storage.local.set({ workExperience }, () => {
      renderWorkExperience();
    });
  });
}

function deleteJobEntry(index) {
  chrome.storage.local.get('workExperience', ({ workExperience = [] }) => {
    workExperience.splice(index, 1);
    chrome.storage.local.set({ workExperience }, () => {
      renderWorkExperience();
    });
  });
}

// ── Tab switching ─────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
  });
});

// ── Radio group interactivity ─────────────────────────────
document.querySelectorAll('.radio-group').forEach(group => {
  group.querySelectorAll('.radio-option').forEach(option => {
    option.addEventListener('click', () => {
      group.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      const radio = option.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;

      // Show/hide non-compete explanation
      if (group.dataset.field === 'hasNonCompete') {
        const wrap = document.getElementById('nonCompeteExplainWrap');
        wrap.classList.toggle('visible', option.dataset.value === 'yes');
      }
    });
  });
});

// ── Load saved profile ────────────────────────────────────
function loadProfile() {
  chrome.storage.local.get('jobfillProfile', ({ jobfillProfile }) => {
    if (!jobfillProfile) return;

    // Text / select fields
    PROFILE_FIELDS.forEach(field => {
      const el = document.getElementById(field);
      if (el && jobfillProfile[field] !== undefined) {
        el.value = jobfillProfile[field];
      }
    });

    // Radio fields
    RADIO_FIELDS.forEach(field => {
      const val = jobfillProfile[field];
      if (!val) return;
      const group = document.querySelector(`.radio-group[data-field="${field}"]`);
      if (!group) return;
      group.querySelectorAll('.radio-option').forEach(option => {
        const isMatch = option.dataset.value === val;
        option.classList.toggle('selected', isMatch);
        const radio = option.querySelector('input[type="radio"]');
        if (radio) radio.checked = isMatch;
      });
    });

    // Non-compete explain visibility
    if (jobfillProfile.hasNonCompete === 'yes') {
      document.getElementById('nonCompeteExplainWrap').classList.add('visible');
    }

    document.getElementById('headerStatus').textContent = 'PROFILE SAVED';
  });
}

// ── Save profile ──────────────────────────────────────────
function saveProfile() {
  const profile = {};

  PROFILE_FIELDS.forEach(field => {
    const el = document.getElementById(field);
    if (el) profile[field] = el.value.trim();
  });

  RADIO_FIELDS.forEach(field => {
    const group = document.querySelector(`.radio-group[data-field="${field}"]`);
    if (!group) return;
    const selected = group.querySelector('.radio-option.selected');
    profile[field] = selected ? selected.dataset.value : '';
  });

  chrome.storage.local.set({ jobfillProfile: profile }, () => {
    document.getElementById('headerStatus').textContent = 'PROFILE SAVED';
    showToast('✓ Profile saved', 'success');
  });
}

function isSupportedAutofillUrl(url = '') {
  return /^https?:\/\//i.test(url);
}

function requestFromActiveTab(message, errors = {}) {
  const {
    noTab = 'No active tab found',
    unsupported = 'Open a job page (http/https)',
    cannotRun = 'Cannot run on this page',
    failed = 'Request failed',
  } = errors;

  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || typeof tab.id !== 'number') {
        reject(new Error(noTab));
        return;
      }

      if (!isSupportedAutofillUrl(tab.url || '')) {
        reject(new Error(unsupported));
        return;
      }

      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          }, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(cannotRun));
              return;
            }

            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, message, (retryResponse) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(failed));
                  return;
                }
                resolve(retryResponse);
              });
            }, 300);
          });
          return;
        }

        resolve(response);
      });
    });
  });
}

// ── Trigger autofill on the active tab ───────────────────
function triggerAutofill() {
  chrome.storage.local.get('jobfillProfile', ({ jobfillProfile }) => {
    if (!jobfillProfile || !jobfillProfile.firstName) {
      showToast('Save your profile first', 'error');
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || typeof tab.id !== 'number') {
        showToast('No active tab found', 'error');
        return;
      }

      if (!isSupportedAutofillUrl(tab.url || '')) {
        showToast('Open a job page (http/https) to autofill', 'error');
        return;
      }

      chrome.tabs.sendMessage(tab.id, {
        action: 'autofill',
        profile: jobfillProfile,
      }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script might not be loaded yet — inject it
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          }, () => {
            if (chrome.runtime.lastError) {
              showToast('Cannot run on this page', 'error');
              return;
            }

            // Retry after injection
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, {
                action: 'autofill',
                profile: jobfillProfile,
              }, (res) => {
                if (chrome.runtime.lastError) {
                  showToast('Autofill failed to start', 'error');
                  return;
                }
                handleAutofillResponse(res);
              });
            }, 300);
          });
          return;
        }
        handleAutofillResponse(response);
      });
    });
  });
}

// ── Detect email format on the active tab ────────────────
function detectEmailFormat() {
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();

  if (!firstName || !lastName) {
    showToast('Enter first and last name to detect email', 'error');
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || typeof tab.id !== 'number') {
      showToast('No active tab found', 'error');
      return;
    }

    if (!isSupportedAutofillUrl(tab.url || '')) {
      showToast('Open a job page (http/https) to detect email', 'error');
      return;
    }

    chrome.tabs.sendMessage(tab.id, {
      action: 'detectEmail',
    }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script might not be loaded yet — inject it
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        }, () => {
          if (chrome.runtime.lastError) {
            showToast('Cannot run email detection on this page', 'error');
            return;
          }

          // Retry after injection
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, {
              action: 'detectEmail',
            }, (res) => {
              if (chrome.runtime.lastError) {
                showToast('Email detection failed', 'error');
                return;
              }
              handleEmailDetectionResponse(res, firstName, lastName);
            });
          }, 300);
        });
        return;
      }
      handleEmailDetectionResponse(response, firstName, lastName);
    });
  });
}

function handleEmailDetectionResponse(emailInfo, firstName, lastName) {
  if (!emailInfo) {
    showToast('No emails found on this page', 'error');
    return;
  }

  const infoEl = document.getElementById('emailFormatInfo');
  const labelEl = document.getElementById('emailFormatLabel');
  const examplesEl = document.getElementById('emailExamples');

  const format = emailInfo.detectedFormat || 'unknown';
  labelEl.textContent = format;

  if (emailInfo.examples && emailInfo.examples.length > 0) {
    examplesEl.innerHTML = `<strong>Examples:</strong> ${emailInfo.examples.join(', ')}`;
  } else {
    examplesEl.textContent = '—';
  }

  infoEl.style.display = 'block';

  // Generate and fill email if format detected
  if (emailInfo.detectedFormat && emailInfo.domain) {
    const generatedEmail = generateEmailFromFormat(firstName, lastName, emailInfo.detectedFormat, emailInfo.domain);
    if (generatedEmail) {
      document.getElementById('email').value = generatedEmail;
      showToast(`✓ Email generated: ${generatedEmail}`, 'success');
    }
  }
}

function generateEmailFromFormat(firstName, lastName, format, domain) {
  if (!firstName || !lastName || !format) return null;

  const fn = firstName.toLowerCase().trim();
  const ln = lastName.toLowerCase().trim();

  let localPart = '';
  if (format.includes('first.last') || format.includes('f.last')) {
    localPart = `${fn[0]}.${ln}`;
  } else if (format === 'firstname.lastname') {
    localPart = `${fn}.${ln}`;
  } else if (format === 'first_last') {
    localPart = `${fn}_${ln}`;
  } else if (format === 'firstlast') {
    localPart = `${fn}${ln}`;
  } else {
    // Fallback to firstname.lastname
    localPart = `${fn}.${ln}`;
  }

  return domain ? `${localPart}@${domain}` : null;
}

function handleAutofillResponse(response) {
  if (!response) {
    showToast('Could not reach page', 'error');
    return;
  }
  const { filled, fileHighlights } = response;
  let msg = `◆ ${filled} field${filled !== 1 ? 's' : ''} filled`;
  if (fileHighlights > 0) msg += ` · ${fileHighlights} file field${fileHighlights !== 1 ? 's' : ''} highlighted`;
  showToast(msg, 'info');
}

// ── Match analysis ───────────────────────────────────────
function normalizeSpace(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

function tokenizeMatchText(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9+.#\-/\s]/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 2 && !MATCH_STOP_WORDS.has(token));
}

function extractTopKeywords(text, limit = 18) {
  const counts = new Map();
  tokenizeMatchText(text).forEach(token => {
    counts.set(token, (counts.get(token) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
}

function formatKeyword(token = '') {
  return token
    .split(/[._-]/)
    .map(chunk => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function extractRoleNeeds(jobDescription) {
  const lines = String(jobDescription)
    .split(/\n+/)
    .map(line => normalizeSpace(line))
    .filter(Boolean);

  const signalRegex = /(must|required|need|seeking|looking for|experience with|proficient|responsible for|knowledge of|hands-on)/i;
  const matched = [];
  const seen = new Set();

  lines.forEach(line => {
    if (!signalRegex.test(line)) return;
    const clean = line.replace(/^[-*\d.)\s]+/, '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    matched.push(clean);
  });

  if (matched.length >= 3) {
    return matched.slice(0, 6);
  }

  const fallback = extractTopKeywords(jobDescription, 8).map(token => `Strong signal around ${formatKeyword(token)}`);
  return fallback;
}

function buildCandidateCorpus(profile = {}, workExperience = [], resumeText = '') {
  const profileValues = PROFILE_FIELDS
    .map(field => profile[field] || '')
    .join(' ');

  const experienceValues = (workExperience || [])
    .map(job => [job.jobTitle, job.company, job.workLocation, job.description].filter(Boolean).join(' '))
    .join(' ');

  return normalizeSpace(`${profileValues} ${experienceValues} ${resumeText}`);
}

function renderMatchList(id, items, emptyText) {
  const list = document.getElementById(id);
  list.innerHTML = '';

  const safeItems = items && items.length ? items : [emptyText];
  safeItems.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });
}

function updateResumeMeta(cache) {
  const meta = document.getElementById('matchResumeMeta');
  if (!cache || !cache.text || !cache.fetchedAt) {
    meta.textContent = 'Resume status: not fetched yet.';
    return;
  }

  const fetched = new Date(cache.fetchedAt).toLocaleString();
  const from = cache.source || RESUME_SOURCE_URL;
  meta.textContent = `Resume status: loaded from ${from} on ${fetched}.`;
}

async function fetchResumeText({ forceRefresh = false } = {}) {
  const { resumeCache } = await storageGet('resumeCache');
  const cacheIsFresh = !!(resumeCache && resumeCache.text && resumeCache.fetchedAt && (Date.now() - resumeCache.fetchedAt < RESUME_CACHE_TTL_MS));

  if (!forceRefresh && cacheIsFresh) {
    return { text: resumeCache.text, cache: resumeCache, fromCache: true };
  }

  const response = await fetch(RESUME_SOURCE_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Resume fetch failed (${response.status})`);
  }

  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  doc.querySelectorAll('script, style, noscript').forEach(node => node.remove());
  const extracted = normalizeSpace((doc.body && doc.body.innerText) || doc.documentElement.textContent || '');

  if (extracted.length < 80) {
    throw new Error('Resume text was too short to analyze');
  }

  const resumeCacheNext = {
    text: extracted,
    fetchedAt: Date.now(),
    source: RESUME_SOURCE_URL,
  };
  await storageSet({ resumeCache: resumeCacheNext });
  return { text: extracted, cache: resumeCacheNext, fromCache: false };
}

function runMatchAnalysis(jobDescription, candidateCorpus) {
  const jobKeywords = extractTopKeywords(jobDescription, 20);
  const candidateTokenSet = new Set(tokenizeMatchText(candidateCorpus));

  const strengths = jobKeywords
    .filter(token => candidateTokenSet.has(token))
    .slice(0, 8)
    .map(token => `${formatKeyword(token)} is represented in your resume/profile.`);

  const gaps = jobKeywords
    .filter(token => !candidateTokenSet.has(token))
    .slice(0, 8)
    .map(token => `${formatKeyword(token)} appears in the job description but not clearly in your stored resume/profile.`);

  const scoreBase = Math.max(jobKeywords.length, 1);
  const score = Math.round((strengths.length / scoreBase) * 100);

  return {
    score,
    strengths,
    gaps,
    lookingFor: extractRoleNeeds(jobDescription).slice(0, 8),
  };
}

async function loadMatchTabState() {
  const { jobMatchState, resumeCache } = await storageGet(['jobMatchState', 'resumeCache']);
  const textarea = document.getElementById('matchJobDescription');
  textarea.value = (jobMatchState && jobMatchState.jobDescription) || '';
  updateResumeMeta(resumeCache);

  if (!textarea.value.trim()) {
    extractJobDescriptionFromPage({ silent: true });
  }
}

async function extractJobDescriptionFromPage({ force = false, silent = false } = {}) {
  const textarea = document.getElementById('matchJobDescription');
  if (!textarea) return;

  const existing = textarea.value.trim();
  if (!force && existing.length >= MIN_JOB_DESCRIPTION_LENGTH) {
    return;
  }

  try {
    const response = await requestFromActiveTab(
      { action: 'extractJobDescription' },
      {
        unsupported: 'Open the job posting page (http/https) to load details',
        cannotRun: 'Cannot read job description on this page',
        failed: 'Could not read job description from this page',
      }
    );

    const text = normalizeSpace(response && response.jobDescription);
    if (!text || text.length < MIN_JOB_DESCRIPTION_LENGTH) {
      if (!silent) showToast('No substantial job description found on this page', 'error');
      return;
    }

    textarea.value = text;
    await storageSet({ jobMatchState: { jobDescription: text } });

    if (!silent) {
      showToast('✓ Job description loaded from page', 'success');
    }
  } catch (err) {
    if (!silent) {
      showToast(err.message || 'Could not load job description', 'error');
    }
  }
}

async function refreshResumeCache() {
  const button = document.getElementById('btnRefreshResume');
  const oldText = button.textContent;
  button.textContent = 'REFRESHING...';
  button.disabled = true;

  try {
    const { cache } = await fetchResumeText({ forceRefresh: true });
    updateResumeMeta(cache);
    showToast('✓ Resume refreshed', 'success');
  } catch (err) {
    showToast(`Resume refresh failed: ${err.message}`, 'error');
  } finally {
    button.textContent = oldText;
    button.disabled = false;
  }
}

async function analyzeMatch() {
  const descriptionEl = document.getElementById('matchJobDescription');
  const jobDescription = descriptionEl.value.trim();

  if (jobDescription.length < 80) {
    showToast('Open a job posting page to auto-load details first', 'error');
    return;
  }

  await storageSet({ jobMatchState: { jobDescription } });

  const analyzeBtn = document.getElementById('btnAnalyzeMatch');
  const oldButtonText = analyzeBtn.textContent;
  analyzeBtn.textContent = 'ANALYZING...';
  analyzeBtn.disabled = true;

  try {
    const [{ jobfillProfile = {} }, { workExperience = [] }, resumeResult] = await Promise.all([
      storageGet('jobfillProfile'),
      storageGet('workExperience'),
      fetchResumeText(),
    ]);

    updateResumeMeta(resumeResult.cache);

    const candidateCorpus = buildCandidateCorpus(jobfillProfile, workExperience, resumeResult.text);
    if (candidateCorpus.length < 60) {
      showToast('Save profile and experience details for a better match', 'error');
      return;
    }

    const result = runMatchAnalysis(jobDescription, candidateCorpus);
    document.getElementById('matchScoreValue').textContent = `${result.score}%`;
    document.getElementById('matchScoreFill').style.width = `${result.score}%`;

    renderMatchList('matchStrengths', result.strengths, 'No clear strengths detected yet. Add more specifics to your profile/experience.');
    renderMatchList('matchGaps', result.gaps, 'No major gap signals found from the extracted keywords.');
    renderMatchList('matchLookingFor', result.lookingFor, 'Could not extract requirement statements from this description.');

    document.getElementById('matchResults').classList.add('visible');
    showToast('✓ Match analysis ready', 'success');
  } catch (err) {
    showToast(`Match analysis failed: ${err.message}`, 'error');
  } finally {
    analyzeBtn.textContent = oldButtonText;
    analyzeBtn.disabled = false;
  }
}

// ── Toast utility ─────────────────────────────────────────
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `visible ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.className = '';
  }, 2800);
}

// ── Event listeners ───────────────────────────────────────
document.getElementById('btnSave').addEventListener('click', () => {
  saveProfile();
  saveWorkExperience({ rerender: true });
});
document.getElementById('btnAutofill').addEventListener('click', triggerAutofill);
document.getElementById('btnDetectEmail').addEventListener('click', detectEmailFormat);
document.getElementById('btnAddExperience').addEventListener('click', addJobEntry);
document.getElementById('btnAnalyzeMatch').addEventListener('click', analyzeMatch);
document.getElementById('btnRefreshResume').addEventListener('click', refreshResumeCache);
document.getElementById('matchJobDescription').addEventListener('input', (e) => {
  clearTimeout(matchTextSaveTimer);
  matchTextSaveTimer = setTimeout(() => {
    storageSet({ jobMatchState: { jobDescription: e.target.value.trim() } });
  }, MATCH_TEXT_SAVE_DEBOUNCE_MS);
});

// Add event listeners to dynamically track work experience changes
document.addEventListener('input', (e) => {
  if (e.target.classList.contains('job-field-input')) {
    clearTimeout(workExperienceSaveTimer);
    workExperienceSaveTimer = setTimeout(() => {
      saveWorkExperience();
    }, WORK_EXPERIENCE_SAVE_DEBOUNCE_MS);
  }
});

// ── Init ──────────────────────────────────────────────────
loadProfile();
renderWorkExperience();
loadMatchTabState();

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'match') {
      extractJobDescriptionFromPage({ silent: true });
    }
  });
});
