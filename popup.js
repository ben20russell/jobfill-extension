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
